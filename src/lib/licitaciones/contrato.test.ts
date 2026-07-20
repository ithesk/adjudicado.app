import { describe, it, expect } from "vitest";
import { ProcesoCanonico } from "./contrato";
import { construirDatos } from "./generador";

// Caso realista, calcado de un proceso del tipo que la empresa trabaja
// (equipos de red para una OGTIC): dos ítems, uno cotizado desde el catálogo
// de Precios y uno manual, un requisito no-subsanable y uno subsanable.
function procesoValido() {
  return {
    meta: {
      id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      org_id: "1ae66d63-f4e6-4463-8e6d-dc4035a8b554",
      version: 1,
      generado_en: "2026-07-14T18:30:00",
    },
    proceso: {
      codigo: "OGTIC-CCC-CP-2026-0011",
      modalidad: "CP" as const,
      objeto: "Adquisición de herramientas de certificación de redes",
      entidad: {
        nombre: "Oficina Gubernamental de Tecnologías de la Información",
        siglas: "OGTIC",
      },
      cronograma: {
        publicacion: "2026-07-01",
        cierre: "2026-08-01T10:00",
        apertura_tecnica: "2026-08-01T10:30",
      },
      moneda: "DOP" as const,
      plazo_pago_dias: 90,
      adjudicacion: "total" as const,
      criterio: "menor_precio" as const,
    },
    oferente: {
      razon_social: "Innovación Tecnología SK, SRL",
      rnc: "1-31-12345-6",
      rpe: "12345",
      direccion: "Av. Winston Churchill, Santo Domingo",
      telefono: "809-555-0100",
      email: "licitaciones@sk.com.do",
    },
    firmantes: [
      {
        rol: "gerente_general" as const,
        nombre: "Pablo Holguín",
        cargo: "Gerente General",
      },
      {
        rol: "gerente_ventas" as const,
        nombre: "Alejandra García",
        cargo: "Gerente de Ventas",
      },
    ],
    lotes: [
      {
        numero: 1,
        items: [
          {
            numero: 1,
            spec_cruda:
              "Verificador de cableado de red con capacidad de prueba PoE   (VER FICHA TECNICA)",
            cantidad: 2,
            unidad: "UD",
            producto: {
              marca: "Fluke Networks",
              modelo: "LinkIQ",
              descripcion:
                "El equipo verifica cableado hasta 10G BASE-T e incluye prueba PoE clase 0-8.",
            },
            ofertamos: true,
          },
          {
            numero: 2,
            spec_cruda: "Analizador de espectro portátil banda 6 GHz",
            cantidad: 1,
            unidad: "UD",
            ofertamos: false,
            motivo_descarte: "Sin canal de distribución para el fabricante exigido.",
          },
        ],
      },
    ],
    requisitos: [
      {
        codigo: "SNCC.F.042",
        nombre: "Formulario de Información sobre el Oferente",
        subsanable: false,
        fuente: "Pliego §3.1.a",
        firmante_rol: "gerente_general" as const,
        origen: "plantilla_oficial" as const,
        estado: "listo" as const,
      },
      {
        codigo: "CERT-DGII",
        nombre: "Certificación DGII al día",
        subsanable: true,
        firmante_rol: "ninguno" as const,
        origen: "documento_empresa" as const,
        documento_empresa_id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      },
    ],
    economico: {
      itbis_pct: 18,
      lineas: [
        {
          item: 1,
          lote: 1,
          // Cotizada desde el catálogo: el snapshot congela costo/tasa/margen.
          suplidor_id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
          sku: "LIQ-100",
          costo_usd: 1_195,
          tasa: 61.5,
          margen_pct: 30,
          margen_modo: "markup" as const,
          precio_unitario: 95_540.25,
          itbis_aplica: true,
        },
      ],
    },
  };
}

describe("ProcesoCanonico", () => {
  it("valida un proceso real completo", () => {
    const r = ProcesoCanonico.safeParse(procesoValido());
    expect(r.success, JSON.stringify(r.success ? null : r.error.issues, null, 2)).toBe(true);
  });

  it("rechaza un cierre sin hora", () => {
    const p = procesoValido();
    p.proceso.cronograma.cierre = "2026-08-01"; // solo fecha
    expect(ProcesoCanonico.safeParse(p).success).toBe(false);
  });

  it("rechaza un requisito sin firmante_rol", () => {
    const p = procesoValido();
    // @ts-expect-error — a propósito: el contrato obliga a decidir quién firma
    delete p.requisitos[0].firmante_rol;
    expect(ProcesoCanonico.safeParse(p).success).toBe(false);
  });

  it("rechaza un ítem sin spec_cruda", () => {
    const p = procesoValido();
    p.lotes[0].items[0].spec_cruda = "";
    expect(ProcesoCanonico.safeParse(p).success).toBe(false);
  });

  it("rechaza una línea económica con precio negativo", () => {
    const p = procesoValido();
    p.economico.lineas[0].precio_unitario = -1;
    expect(ProcesoCanonico.safeParse(p).success).toBe(false);
  });

  it("rechaza una línea económica que apunta a un ítem no ofertado", () => {
    const p = procesoValido();
    p.economico.lineas[0].item = 2; // el ítem 2 tiene ofertamos = false
    const r = ProcesoCanonico.safeParse(p);
    expect(r.success).toBe(false);
  });

  it("rechaza un ítem descartado sin motivo", () => {
    const p = procesoValido();
    delete p.lotes[0].items[1].motivo_descarte;
    expect(ProcesoCanonico.safeParse(p).success).toBe(false);
  });

  it("subsanable ausente cae a false (fail-safe: ante la duda, crítico)", () => {
    const p = procesoValido();
    // @ts-expect-error — a propósito: probamos el default
    delete p.requisitos[1].subsanable;
    const r = ProcesoCanonico.safeParse(p);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.requisitos[1].subsanable).toBe(false);
  });

  it("no normaliza spec_cruda (espacios dobles del pliego se conservan)", () => {
    const r = ProcesoCanonico.safeParse(procesoValido());
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.lotes[0].items[0].spec_cruda).toContain("PoE   (VER");
    }
  });
});

// La línea de la oferta económica imprime LO OFERTADO (marca + modelo —
// descripción); solo sin producto completo cae a la spec del pliego.
describe("construirDatos — descripción de la línea económica", () => {
  it("con producto completo sale lo ofertado, no el pliego", () => {
    const datos = construirDatos(ProcesoCanonico.parse(procesoValido())) as {
      lineas: { descripcion: string }[];
    };
    expect(datos.lineas[0].descripcion).toBe(
      "Fluke Networks LinkIQ — El equipo verifica cableado hasta 10G BASE-T e incluye prueba PoE clase 0-8.",
    );
  });

  it("sin producto completo cae a la spec del pliego tal cual", () => {
    const crudo = procesoValido();
    delete (crudo.lotes[0].items[0] as { producto?: object }).producto;
    const datos = construirDatos(ProcesoCanonico.parse(crudo)) as {
      lineas: { descripcion: string }[];
    };
    expect(datos.lineas[0].descripcion).toContain("Verificador de cableado");
  });
});
