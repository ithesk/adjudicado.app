import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  articulosDe,
  avisoAProceso,
  diaRd,
  documentosDe,
  fechaPortal,
  fichaAProceso,
  limpiar,
  modalidadDesdeFase,
  montoPortal,
  parsearFicha,
  parsearListado,
  uidDe,
  urlDocumento,
} from "./portal-busqueda";

// Fragmentos REALES del portal (15-10-2026), recortados: ver fixtures/.
const fixture = (n: string) => readFileSync(path.join(__dirname, "fixtures", n), "utf8");

describe("lectura de HTML", () => {
  it("limpia etiquetas y entidades", () => {
    expect(limpiar(" <b>Adquisici&oacute;n</b>&nbsp;de &quot;licencias&quot; &amp; m&#225;s ")).toBe(
      'Adquisición de "licencias" & más',
    );
  });

  it("lee las fechas del portal como hora de RD", () => {
    expect(fechaPortal("15/10/2026 08:11 (UTC -4 hours)")).toBe("2026-10-15T08:11:00-04:00");
    expect(fechaPortal("21/10/2026 08:00:00")).toBe("2026-10-21T08:00:00-04:00");
    expect(fechaPortal("mañana")).toBeNull();
    expect(fechaPortal(null)).toBeNull();
  });

  it("lee montos y divisas", () => {
    expect(montoPortal("1,942,500 Dominican Pesos")).toEqual({ monto: 1942500, divisa: "DOP" });
    expect(montoPortal("10,160,251.92 US Dollar")).toEqual({ monto: 10160251.92, divisa: "USD" });
    expect(montoPortal("")).toEqual({ monto: null, divisa: null });
  });

  it("saca el noticeUID de un enlace", () => {
    expect(uidDe("https://comunidad.comprasdominicana.gob.do//Public/Tendering/OpportunityDetail/Index?noticeUID=DO1.NTC.1784801")).toBe(
      "DO1.NTC.1784801",
    );
    expect(uidDe("do1.ntc.5")).toBe("DO1.NTC.5");
    expect(uidDe("MIMARENA-DAF-CM-2026-0125")).toBeNull();
  });

  it("el día de RD para los filtros del buscador", () => {
    // 15-10 a las 02:00 UTC es todavía el 14-10 a las 22:00 en RD.
    expect(diaRd(new Date("2026-10-15T02:00:00Z"))).toBe("14/10/2026");
    expect(diaRd(new Date("2026-10-15T12:00:00Z"))).toBe("15/10/2026");
  });
});

describe("parsearListado", () => {
  const l = parsearListado(fixture("portal-listado.html"));

  it("lee cada fila con su referencia, entidad, fechas, monto, estado y uid", () => {
    expect(l.avisos).toHaveLength(2);
    const [a, b] = l.avisos;
    expect(a.codigo).toBe("FAD-DAF-CM-2026-0068");
    expect(a.institucion).toBe("Fuerza Aérea Dominicana");
    expect(a.estado).toBe("Published");
    expect(a.uid).toMatch(/^DO1\.NTC\.\d+$/);
    expect(a.publicado).toMatch(/^2026-10-14T\d{2}:\d{2}:00-04:00$/);
    expect(a.cierre).toMatch(/^2026-10-\d{2}T/);
    expect(a.monto).toBeGreaterThan(0);
    expect(a.divisa).toBe("DOP");
    expect(b.codigo).toBe("EDESUR-CCC-LPN-2026-0031");
    expect(b.fase).toContain("LicitacionPublicaNacional");
  });

  it("lee las páginas siguientes, cuyas filas van numeradas desde 100", () => {
    const pagina2 = fixture("portal-listado.html").replace(/(spnMatchingResultReference|spnMatchingResultAuthorityName|spnMatchingResultDescription|spnMatchingResultPhaseCode|spnMatchingResultContractNoticeState|cbxBasePriceValue|lnkDetailLink|dtmbNationalOfficialPublishingDate|dtmbDueDateForReceivingReplies)_(\d+)/g, (_m, id, n) => `${id}_${Number(n) + 100}`);
    const p = parsearListado(pagina2);
    expect(p.avisos.map((a) => a.codigo)).toEqual(["FAD-DAF-CM-2026-0068", "EDESUR-CCC-LPN-2026-0031"]);
    expect(p.avisos[0].uid).toMatch(/^DO1\.NTC\.\d+$/);
    expect(p.avisos[0].publicado).toMatch(/^2026-10-14T/);
  });

  it("sabe si hay más páginas y si la sesión caducó", () => {
    expect(l.hayMas).toBe(true);
    expect(l.caducado).toBe(false);
    const c = parsearListado(
      "<script>window.location.href = '/Public/Common/ErrorPage/Index?ErrorMessage=The+content+of+this+page+has+expired+due+to+a+long+period+of+inactivity'</script>",
    );
    expect(c.caducado).toBe(true);
    expect(c.avisos).toEqual([]);
  });

  it("convierte un aviso a la forma de la API", () => {
    const p = avisoAProceso(l.avisos[1]);
    expect(p.codigo_proceso).toBe("EDESUR-CCC-LPN-2026-0031");
    expect(p.estado_proceso).toBe("Proceso publicado");
    expect(p.modalidad).toBe("Licitación Pública Nacional");
    expect(p.url).toContain("noticeUID=DO1.NTC.");
  });
});

describe("parsearFicha", () => {
  const f = parsearFicha(fixture("portal-ficha.html"), "DO1.NTC.1784801")!;

  it("lee el resumen del proceso", () => {
    expect(f.codigo).toBe("MIMARENA-DAF-CM-2026-0125");
    expect(f.titulo).toMatch(/^Contratación de Servicios para Adquisición y Renovación de Licencias/);
    // La entidad la pinta JavaScript (tarjeta de empresa): no está en el HTML.
    // Sale del listado del buscador (fichaAProceso la toma del aviso).
    expect(f.institucion).toBeNull();
    expect(f.modalidad).toBe("Contratación Menor");
    expect(f.estado).toBe("Published");
    expect(f.monto).toBe(1942500);
    expect(f.divisa).toBe("DOP");
    expect(f.lugar).toContain("Cayetano Germosen");
    expect(f.mkey).toMatch(/^[a-z0-9_]{30,}$/);
  });

  it("lee el cronograma y saca publicación, cierre, apertura y adjudicación", () => {
    expect(f.cronograma.length).toBeGreaterThan(5);
    expect(f.publicado).toBe("2026-10-15T08:00:15-04:00");
    expect(f.cierre).toBe("2026-10-21T08:00:00-04:00");
    expect(f.apertura).toBe("2026-10-21T08:05:00-04:00");
    expect(f.adjudicacion).toBe("2026-10-29T12:00:00-04:00");
  });

  it("lee lotes y artículos con cantidad, unidad y precios", () => {
    expect(f.lotes.map((l) => l.numero)).toEqual([1, 2]);
    expect(f.lotes[0].nombre).toBe("Renovación de Licencias y Suscripciones");
    const wp = f.articulos.find((a) => a.descripcion.startsWith("WordPress Premium"))!;
    expect(wp).toMatchObject({
      lote: 1,
      referencia: 1,
      unspsc: "81112501",
      unspsc_descripcion: "Servicio de licencias de programas informáticos",
      cuenta: "2.2.5.9.01",
      cantidad: 3,
      unidad: "UD",
      precio_unitario: 10400,
      precio_total: 31200,
    });
    // El subtotal del lote no es un artículo.
    expect(f.articulos.every((a) => a.descripcion && !/subtotal/i.test(a.descripcion))).toBe(true);
    expect(f.articulos.some((a) => a.lote === 2)).toBe(true);
  });

  it("lee los documentos con su id de descarga", () => {
    expect(f.documentos.length).toBeGreaterThanOrEqual(3);
    expect(f.documentos[0]).toEqual({
      nombre: "1_1-_Solicitud_de_Compras_0125.pdf",
      tipo: "Solicitud Compra o Contratación",
      fileId: "13832018",
    });
    expect(urlDocumento("13832018")).toBe(
      "https://comunidad.comprasdominicana.gob.do/Public/Archive/RetrieveFile/Index?DocumentId=13832018&InCommunity=False&InPaymentGateway=False&DocUniqueIdentifier=",
    );
    expect(documentosDe(f)[0].url_documento).toContain("DocumentId=13832018");
  });

  it("convierte la ficha a la forma de la API", () => {
    const p = fichaAProceso(f);
    expect(p).toMatchObject({
      codigo_proceso: "MIMARENA-DAF-CM-2026-0125",
      estado_proceso: "Proceso publicado",
      modalidad: "Contratación Menor",
      monto_estimado: 1942500,
      divisa: "DOP",
      fecha_publicacion: "2026-10-15T08:00:15-04:00",
      fecha_fin_recepcion_ofertas: "2026-10-21T08:00:00-04:00",
      dirigido_mipymes: "Si",
      proceso_lotificado: "Si",
    });
    const arts = articulosDe(f);
    expect(arts[0]).toMatchObject({ descripcion_usuario: "WordPress Premium (12 meses)", cantidad: 3, lote: 1 });
  });

  it("devuelve null si la página no es una ficha", () => {
    expect(parsearFicha("<html>An error has occurred</html>", "DO1.NTC.1")).toBeNull();
  });

  it("traduce la fase de Vortal a modalidad", () => {
    expect(modalidadDesdeFase("ProcedureProfile_DGCP-02-ComprasDebajoUmbral_Phase_TenderingPhase_Label")).toBe(
      "Compras por Debajo del Umbral",
    );
    expect(modalidadDesdeFase(null)).toBeNull();
  });
});
