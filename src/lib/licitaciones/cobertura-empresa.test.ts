import { describe, expect, it } from "vitest";
import type { DocumentoEmpresa } from "@/lib/empresa/documentos";
import {
  coberturaDeRequisito,
  coberturaPorTipo,
  estaCubierto,
  rutaDeEmpresa,
  tipoQueCubre,
} from "./cobertura-empresa";

function enDias(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

let seq = 0;
function doc(
  tipo: string,
  vence: string | null,
  extra: Partial<DocumentoEmpresa> = {},
): DocumentoEmpresa {
  seq += 1;
  return {
    id: `doc-${seq}`,
    org_id: "org",
    tipo,
    nombre: `${tipo} ${seq}`,
    archivo_url: `org/empresa/${tipo}-${seq}.pdf`,
    fecha_emision: null,
    fecha_vencimiento: vence,
    notas: null,
    subido_por: null,
    created_at: new Date(2026, 0, seq).toISOString(),
    ...extra,
  };
}

describe("tipoQueCubre", () => {
  it("conoce el documento de empresa detrás de cada requisito estándar", () => {
    expect(tipoQueCubre("MIPYME")).toBe("mipyme");
    expect(tipoQueCubre("REG-MERC")).toBe("mercantil");
    expect(tipoQueCubre("CEDULA-REP")).toBe("cedula");
  });

  it("devuelve undefined para lo que no sale de Empresa", () => {
    expect(tipoQueCubre("GARANTIA")).toBeUndefined();
    expect(tipoQueCubre("SNCC.F.033")).toBeUndefined();
    expect(tipoQueCubre("CODIGO-INVENTADO")).toBeUndefined();
  });
});

describe("coberturaPorTipo", () => {
  it("elige el de vencimiento más lejano cuando hay renovaciones", () => {
    const viejo = doc("mipyme", enDias(-10));
    const nuevo = doc("mipyme", enDias(300));
    const mapa = coberturaPorTipo([viejo, nuevo]);
    expect(mapa.mipyme.id).toBe(nuevo.id);
    expect(mapa.mipyme.vencido).toBe(false);
  });

  it("marca vencido cuando el único documento se pasó de fecha", () => {
    const mapa = coberturaPorTipo([doc("mipyme", enDias(-1))]);
    expect(mapa.mipyme.vencido).toBe(true);
  });

  it("no incluye los tipos sin documento cargado", () => {
    const mapa = coberturaPorTipo([doc("mipyme", enDias(90))]);
    expect(mapa.mercantil).toBeUndefined();
  });

  it("deja fuera los «otro»: comparten código y no cubren requisitos", () => {
    const mapa = coberturaPorTipo([doc("otro", null), doc("otro", null)]);
    expect(mapa.otro).toBeUndefined();
  });
});

describe("estaCubierto", () => {
  it("cubre el requisito cuando el documento de su tipo está vigente", () => {
    const mapa = coberturaPorTipo([doc("mipyme", enDias(200))]);
    expect(estaCubierto("MIPYME", mapa)).toBe(true);
  });

  // El defecto que motivó todo esto: el certificado subido DESPUÉS de cargar
  // el checklist tiene que contar igual, porque el vínculo es el tipo.
  it("cuenta el documento aunque el requisito naciera sin él", () => {
    expect(estaCubierto("MIPYME", {})).toBe(false);
    expect(estaCubierto("MIPYME", coberturaPorTipo([doc("mipyme", enDias(30))]))).toBe(true);
  });

  it("NO cubre con un documento vencido", () => {
    const mapa = coberturaPorTipo([doc("mipyme", enDias(-1))]);
    expect(estaCubierto("MIPYME", mapa)).toBe(false);
    expect(coberturaDeRequisito("MIPYME", mapa)?.vencido).toBe(true);
  });

  it("no cubre lo que no sale de Empresa, haya lo que haya cargado", () => {
    const mapa = coberturaPorTipo([doc("mipyme", enDias(200))]);
    expect(estaCubierto("GARANTIA", mapa)).toBe(false);
  });
});

describe("rutaDeEmpresa", () => {
  // Renovar es subir una fila NUEVA. El paquete tiene que llevar esa, no la
  // anterior: antes se quedaba con la del día en que se agregó el requisito.
  it("da la ruta del documento renovado, no la del anterior", () => {
    const viejo = doc("mercantil", enDias(-5));
    const nuevo = doc("mercantil", enDias(365));
    expect(rutaDeEmpresa("REG-MERC", coberturaPorTipo([viejo, nuevo]))).toBe(
      nuevo.archivo_url,
    );
  });

  it("no anexa nada si lo único que hay está vencido", () => {
    expect(rutaDeEmpresa("REG-MERC", coberturaPorTipo([doc("mercantil", enDias(-1))]))).toBeNull();
  });

  it("devuelve null para un requisito que no sale de Empresa", () => {
    expect(rutaDeEmpresa("GARANTIA", coberturaPorTipo([doc("mipyme", enDias(90))]))).toBeNull();
  });
});
