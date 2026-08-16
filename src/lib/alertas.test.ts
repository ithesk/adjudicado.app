import { describe, it, expect } from "vitest";
import {
  alertasDeDocumentos,
  alertasDeLicitaciones,
  alertasDeOrdenes,
  construirAlertas,
  ordenarAlertas,
  plazoEnPalabras,
  resumirAlertas,
  type Alerta,
} from "./alertas";
import type { DocumentoEmpresa } from "./empresa/documentos";
import type { Orden } from "./types";

// Fecha a N días de hoy, en el mismo formato local que usa diasRestantes.
function enDias(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function doc(tipo: string, vence: string | null, id = tipo): DocumentoEmpresa {
  return {
    id,
    org_id: "o1",
    tipo,
    nombre: `${tipo}.pdf`,
    archivo_url: `x/${id}.pdf`,
    fecha_emision: null,
    fecha_vencimiento: vence,
    notas: null,
    subido_por: null,
    created_at: new Date().toISOString(),
  };
}

// Los cinco tipos que vencen, todos cargados y lejos de vencer: así una
// prueba concreta no arrastra la alerta agrupada de «faltan documentos».
function documentacionCompleta(): DocumentoEmpresa[] {
  return [
    doc("rpe", enDias(300)),
    doc("dgii", enDias(300)),
    doc("tss", enDias(300)),
    doc("mercantil", enDias(300)),
    doc("cedula", enDias(300)),
  ];
}

function orden(p: Partial<Orden>): Orden {
  return {
    id: "ord1",
    org_id: "o1",
    numero_oc: "OC-001",
    institucion: "INABIE",
    codigo_expediente: null,
    monto: 1000,
    moneda: "DOP",
    fecha_oc: null,
    plazo_entrega: null,
    estado: "en_coordinacion",
    suplidor: null,
    suplidor_estado: null,
    suplidor_fecha_estim: null,
    metodo_pago: null,
    plazo_pago_dias: null,
    responsable_id: null,
    etiquetas: [],
    oc_archivo_url: null,
    ocr_raw: null,
    creado_por: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...p,
  };
}

describe("alertasDeDocumentos", () => {
  it("clasifica por cuánto falta: vencido, ≤15 días urgente, ≤30 aviso", () => {
    const docs = documentacionCompleta();
    docs[0] = doc("rpe", enDias(-3));
    docs[1] = doc("dgii", enDias(10));
    docs[2] = doc("tss", enDias(25));
    const a = alertasDeDocumentos(docs);
    const porTipo = (t: string) => a.find((x) => x.id === `doc:${t}`);
    expect(porTipo("rpe")?.nivel).toBe("vencido");
    expect(porTipo("dgii")?.nivel).toBe("urgente");
    expect(porTipo("tss")?.nivel).toBe("aviso");
  });

  it("lo que vence a más de 30 días todavía no es noticia", () => {
    expect(alertasDeDocumentos(documentacionCompleta())).toHaveLength(0);
  });

  it("los documentos que no vencen nunca alertan", () => {
    const docs = [...documentacionCompleta(), doc("acta", null), doc("logo", null)];
    expect(alertasDeDocumentos(docs)).toHaveLength(0);
  });

  it("los que faltan van en UNA sola alerta, no una por cada uno", () => {
    const a = alertasDeDocumentos([doc("rpe", enDias(300))]);
    const faltantes = a.filter((x) => x.id === "doc:faltantes");
    expect(faltantes).toHaveLength(1);
    // Quedan fuera los otros cuatro que vencen (dgii, tss, mercantil, cédula).
    expect(faltantes[0].titulo).toContain("4 documentos");
    expect(faltantes[0].nivel).toBe("aviso");
  });

  it("con un solo faltante lo nombra en vez de contar", () => {
    const docs = documentacionCompleta().slice(0, 4); // falta la cédula
    const a = alertasDeDocumentos(docs).find((x) => x.id === "doc:faltantes");
    expect(a?.titulo).toContain("Cédula del representante legal");
  });

  it("apunta a Configuración → Empresa, que es donde se resuelve", () => {
    const docs = documentacionCompleta();
    docs[0] = doc("rpe", enDias(-1));
    expect(alertasDeDocumentos(docs)[0].href).toBe("/configuracion/empresa");
  });
});

describe("alertasDeOrdenes", () => {
  it("una orden viva con el plazo pasado sale como vencida", () => {
    const a = alertasDeOrdenes([
      orden({ estado: "en_coordinacion", plazo_entrega: enDias(-2) }),
    ]);
    expect(a).toHaveLength(1);
    expect(a[0].nivel).toBe("vencido");
    expect(a[0].titulo).toContain("OC-001");
    expect(a[0].href).toBe("/orden/ord1");
  });

  it("≤2 días es urgente y ≤5 es aviso", () => {
    const urgente = alertasDeOrdenes([orden({ plazo_entrega: enDias(1) })]);
    expect(urgente[0].nivel).toBe("urgente");
    const aviso = alertasDeOrdenes([orden({ plazo_entrega: enDias(4) })]);
    expect(aviso[0].nivel).toBe("aviso");
  });

  it("una orden ya cobrada o cerrada no alerta aunque el plazo pasara", () => {
    expect(
      alertasDeOrdenes([
        orden({ estado: "cobrado", plazo_entrega: enDias(-30) }),
        orden({ estado: "cerrado", plazo_entrega: enDias(-30) }),
      ]),
    ).toHaveLength(0);
  });

  it("entregada sin facturar hace más de 15 días: trabajo hecho sin cobrar", () => {
    const hace20 = new Date();
    hace20.setDate(hace20.getDate() - 20);
    const a = alertasDeOrdenes([
      orden({ estado: "entregado", updated_at: hace20.toISOString() }),
    ]);
    expect(a).toHaveLength(1);
    expect(a[0].id).toBe("orden:atasco:ord1");
    expect(a[0].detalle).toContain("sin facturar");
  });

  it("recién entregada todavía no es un atasco", () => {
    expect(alertasDeOrdenes([orden({ estado: "entregado" })])).toHaveLength(0);
  });
});

describe("alertasDeLicitaciones", () => {
  const base = {
    id: "p1",
    codigo: "ISFODOSU-CCC-CP-2026-0012",
    institucion: "ISFODOSU",
    cierre: null,
    subsanacionLimite: null,
  };

  it("el cierre encima mientras la oferta se arma", () => {
    const a = alertasDeLicitaciones([
      { ...base, estado: "armado", cierre: enDias(1) },
    ]);
    expect(a).toHaveLength(1);
    expect(a[0].nivel).toBe("urgente");
    expect(a[0].href).toBe("/licitaciones/p1");
  });

  it("ya sometida, el cierre deja de correr contra reloj", () => {
    expect(
      alertasDeLicitaciones([{ ...base, estado: "sometido", cierre: enDias(-1) }]),
    ).toHaveLength(0);
    expect(
      alertasDeLicitaciones([{ ...base, estado: "adjudicado", cierre: enDias(-1) }]),
    ).toHaveLength(0);
  });

  it("un cierre lejano no alerta todavía", () => {
    expect(
      alertasDeLicitaciones([{ ...base, estado: "costeo", cierre: enDias(20) }]),
    ).toHaveLength(0);
  });

  it("la subsanación abierta alerta aunque falte una semana", () => {
    const a = alertasDeLicitaciones([
      { ...base, estado: "subsanacion", subsanacionLimite: enDias(7) },
    ]);
    expect(a).toHaveLength(1);
    expect(a[0].fuente).toBe("subsanacion");
    expect(a[0].nivel).toBe("aviso");
  });

  it("la subsanación para mañana o vencida es lo más grave", () => {
    const manana = alertasDeLicitaciones([
      { ...base, estado: "subsanacion", subsanacionLimite: enDias(1) },
    ]);
    expect(manana[0].nivel).toBe("urgente");
    const pasada = alertasDeLicitaciones([
      { ...base, estado: "subsanacion", subsanacionLimite: enDias(-1) },
    ]);
    expect(pasada[0].nivel).toBe("vencido");
  });

  it("la fecha límite con hora se cuenta por día, no por reloj", () => {
    const a = alertasDeLicitaciones([
      { ...base, estado: "subsanacion", subsanacionLimite: `${enDias(3)}T15:00:00` },
    ]);
    expect(a[0].detalle).toContain("3 días");
  });
});

describe("ordenarAlertas", () => {
  const de = (nivel: Alerta["nivel"], dias: number | null, id: string): Alerta => ({
    id,
    nivel,
    fuente: "orden",
    titulo: id,
    detalle: "",
    href: "/",
    dias,
  });

  it("lo más grave primero y, dentro del nivel, lo que menos tiempo tiene", () => {
    const orden = ordenarAlertas([
      de("aviso", 4, "a"),
      de("vencido", -1, "b"),
      de("urgente", 2, "c"),
      de("vencido", -9, "d"),
      de("urgente", 0, "e"),
    ]).map((x) => x.id);
    expect(orden).toEqual(["d", "b", "e", "c", "a"]);
  });

  it("lo que no es cuestión de plazo va al final de su grupo", () => {
    const orden = ordenarAlertas([
      de("aviso", null, "sin-fecha"),
      de("aviso", 3, "con-fecha"),
    ]).map((x) => x.id);
    expect(orden).toEqual(["con-fecha", "sin-fecha"]);
  });
});

describe("resumirAlertas", () => {
  it("cuenta los graves y marca cuándo la campanita va en rojo", () => {
    const docs = documentacionCompleta();
    docs[0] = doc("rpe", enDias(-1)); // vencido
    docs[1] = doc("dgii", enDias(25)); // aviso
    const r = resumirAlertas(alertasDeDocumentos(docs));
    expect(r.total).toBe(2);
    expect(r.vencidas).toBe(1);
    expect(r.grave).toBe(true);
  });

  it("sin nada que corra prisa, la campanita no grita", () => {
    const docs = documentacionCompleta();
    docs[0] = doc("rpe", enDias(25));
    const r = resumirAlertas(alertasDeDocumentos(docs));
    expect(r.total).toBe(1);
    expect(r.grave).toBe(false);
  });

  it("todo al día: cero alertas", () => {
    expect(resumirAlertas(construirAlertas({ docs: documentacionCompleta() })).total).toBe(0);
  });
});

describe("construirAlertas", () => {
  it("junta las tres fuentes ya ordenadas", () => {
    const docs = documentacionCompleta();
    docs[0] = doc("rpe", enDias(20)); // aviso
    const a = construirAlertas({
      docs,
      ordenes: [orden({ plazo_entrega: enDias(-5) })], // vencido
      procesos: [
        {
          id: "p1",
          codigo: "X-2026-1",
          estado: "armado",
          cierre: enDias(2),
          institucion: null,
          subsanacionLimite: null,
        }, // urgente
      ],
    });
    expect(a.map((x) => x.nivel)).toEqual(["vencido", "urgente", "aviso"]);
    expect(a.map((x) => x.fuente)).toEqual(["orden", "licitacion", "documento"]);
  });

  it("empresa recién montada: una sola alerta que dice qué cargar", () => {
    // Sin ningún documento, lo correcto NO es callar: es decir qué falta.
    // Agrupado, para que estrenar la cuenta no sea una pared de rojos.
    const a = construirAlertas({});
    expect(a).toHaveLength(1);
    expect(a[0].id).toBe("doc:faltantes");
    expect(a[0].nivel).toBe("aviso");
  });
});

describe("plazoEnPalabras", () => {
  it("habla como una persona, no como una base de datos", () => {
    expect(plazoEnPalabras(0)).toBe("vence HOY");
    expect(plazoEnPalabras(1)).toBe("vence mañana");
    expect(plazoEnPalabras(-1)).toBe("venció ayer");
    expect(plazoEnPalabras(-5)).toBe("venció hace 5 días");
    expect(plazoEnPalabras(4)).toBe("vencen 4 días");
  });
});
