import { describe, expect, it } from "vitest";
import {
  abierto,
  avisoAProceso,
  fechaPortal,
  modalidadPortal,
  montoPortal,
  parsearDetalle,
  parsearListado,
  texto,
} from "./portal";

// Fragmentos del HTML real del portal (7-oct-2026), recortados.
const G = "tblMainTable_trRowMiddle_tdCell1_tblForm_trGridRow_tdCell1_grdResultList";
const FILA = `<tr id="${G}_tr75" class="gridLineDark"><td><span id="${G}_tdAuthorityNameCol_spnMatchingResultAuthorityName_75" class="VortalSpan">Ministerio de Hacienda</span></td><td><span id="${G}_tdUniqueIdentifierCol_spnMatchingResultReference_75" class="VortalSpan">MINISTERIO HACIENDA-DAF-CM-2026-0098</span></td><td><span id="${G}_tdDescriptionCol_spnMatchingResultDescription_75" class="VortalSpan">Adquisición de lectores de tarjeta magnética y controladores de puertas para uso del MHE</span></td><td><span id="${G}_tdCurrentPhaseCol_spnMatchingResultPhaseCode_75" class="VortalSpan">ProcedureProfile_DGCP-01-ComprasMenores_Phase_TenderingPhase_Label</span></td><td><div id="dtmbNationalOfficialPublishingDate_75" class="VortalDateBox"><span id="dtmbNationalOfficialPublishingDate_75_txt" name="x"><span title="(UTC-04:00) Georgetown">07/10/2026 11:30 <font class="DateTimeDetail">(UTC -4 hours)</font></span></span></div></td><td><div id="dtmbDueDateForReceivingReplies_75" class="VortalDateBox"><span id="dtmbDueDateForReceivingReplies_75_txt" name="x"><span title="(UTC-04:00) Georgetown">13/10/2026 11:30 <font class="DateTimeDetail">(UTC -4 hours)</font></span></span></div></td><td><div class="ContractNoticePrice"><span id="cbxBasePriceValue_75" class="VortalNumericSpan DecimalValue">436,000 Dominican Pesos</span></div></td><td><span id="${G}_tdContractNoticeStateCol_spnMatchingResultContractNoticeState_75" class="VortalSpan">Published</span></td><td><a id="${G}_tdDetailColumn_lnkDetailLink_75" onclick="javascript:createAndOpenSupportModal({supportOptions: {windowURL: '/Public/Tendering/OpportunityDetail/Index' + '?' + 'noticeUID=' + 'DO1.NTC.1781614' + '&' + 'isModal=' + 'true'}});" href="javascript:void(0);">Detail</a></td></tr>`;
const CERRADO = FILA.replaceAll("_75", "_76")
  .replace("MINISTERIO HACIENDA-DAF-CM-2026-0098", "MITUR-DAF-CM-2026-0106")
  .replace(">Published<", ">ClosedForReplies<")
  .replace("DO1.NTC.1781614", "DO1.NTC.1770000");

const DETALLE = `
<span id="cbxBasePriceValue" class="VortalNumericSpan">436,000 Dominican Pesos</span>
<span id="fdsRequestSummaryInfo_tblDetail_trRowName_tdCell2_spnRequestName" class="VortalSpan">Adquisición de lectores de tarjeta magnética y controladores de puertas para uso del MHE</span>
<span id="fdsRequestSummaryInfo_tblDetail_trRowDescription_tdCell2_spnDescription" class="VortalSpan">Adquisición de lectores</span>
<span id="fdsRequestSummaryInfo_tblDetail_trRowProcedureType_tdCell2_spnProcedureType" class="VortalSpan">Contratación Menor</span>
<tr id="trScheduleDateRow_49"><td><label id="lblScheduleDateTimeLabel_49" class="VortalSpan">Presentación de Oferta Economica</label></td><td><div><span id="dtmbScheduleDateTime_49_txt">5 days left <font class="DateTimeDetail">(13/10/2026 11:30:00(UTC-04:00) Georgetown, La Paz)</font></span></div></td></tr>
<tr id="trScheduleDateRow_50"><td><label id="lblScheduleDateTimeLabel_50" class="VortalSpan">Apertura del Sobre Economico</label></td><td><div><span id="dtmbScheduleDateTime_50_txt">5 days left <font class="DateTimeDetail">(13/10/2026 11:40:00(UTC-04:00) Georgetown, La Paz)</font></span></div></td></tr>
<tr id="grdGridDocumentList_tr6" class="gridLineLight"><td><span id="tdColumnDocumentNameP2Gen_spnDocumentName_6" class="VortalSpan">Ficha tecnica Lector y controles.pdf</span></td><td><span id="spnDocumentTypeSpan_6" class="VortalSpan">Bases de la Contratación (Especificaciones / Fichas Técnicas / Pliego de Condiciones) </span></td><td><a id="lnkDownloadLinkP3Gen_6" onclick="javascript:getAction('/Public/Tendering/OpportunityDetail/DownloadFile' + '?' + 'documentFileId=' + '13775210' + '&mkey=94192f77',true);">Download</a></td></tr>
<span id="incQuestionnaireDO1_BILN_317340750_CeilingPriceTotal">436,000.00</span>
<span id="incQuestionnaireDO1_BILN_357810312_CategoryCode_LookupText_fullMessage">43211702 - Lectores y codificadores de banda magnética</span>
<span id="incQuestionnaireDO1_BILN_357810312_Description">Lectores de tarjetas magn&#233;ticas para control de acceso.</span>
<span id="incQuestionnaireDO1_BILN_357810312_Quantity">4</span>
<span id="incQuestionnaireDO1_BILN_357810312_Unit">UD</span>
<span id="incQuestionnaireDO1_BILN_357810312_CeilingPrice">29,000</span>
<span id="incQuestionnaireDO1_BILN_357810312_CeilingPriceTotal">116,000.00</span>`;

describe("valores del portal", () => {
  it("fecha en hora de RD → UTC", () => {
    expect(fechaPortal("07/10/2026 11:30 (UTC -4 hours)")).toBe("2026-10-07T15:30:00.000Z");
    expect(fechaPortal("13/10/2026 23:15")).toBe("2026-10-14T03:15:00.000Z");
    expect(fechaPortal("hace 1 hora")).toBeNull();
  });
  it("monto y divisa", () => {
    expect(montoPortal("436,000 Dominican Pesos")).toEqual({ monto: 436000, divisa: "DOP" });
    expect(montoPortal("12,500.75 US Dollar")).toEqual({ monto: 12500.75, divisa: "USD" });
  });
  it("entidades HTML", () => {
    expect(texto("magn&#233;ticas &amp; <b>más</b>")).toBe("magnéticas & más");
  });
  it("modalidad por el segmento del código", () => {
    expect(modalidadPortal("MINISTERIO HACIENDA-DAF-CM-2026-0098", null)).toBe("Contratación Menor");
    expect(modalidadPortal("INAPA-CCC-LPN-2026-0025", null)).toBe("Licitación Pública Nacional");
  });
});

describe("listado", () => {
  const avisos = parsearListado(`<table>${FILA}${CERRADO}</table>`);
  it("lee cada fila", () => {
    expect(avisos).toHaveLength(2);
    expect(avisos[0]).toEqual({
      codigo: "MINISTERIO HACIENDA-DAF-CM-2026-0098",
      entidad: "Ministerio de Hacienda",
      titulo: "Adquisición de lectores de tarjeta magnética y controladores de puertas para uso del MHE",
      fase: "ProcedureProfile_DGCP-01-ComprasMenores_Phase_TenderingPhase_Label",
      publicado: "2026-10-07T15:30:00.000Z",
      cierre: "2026-10-13T15:30:00.000Z",
      monto: 436000,
      divisa: "DOP",
      estado: "Published",
      noticeUID: "DO1.NTC.1781614",
    });
  });
  it("solo «Published» está abierto, y así lo ve el radar", () => {
    expect(avisos.map(abierto)).toEqual([true, false]);
    expect(avisoAProceso(avisos[0]).estado_proceso).toBe("Proceso publicado");
    expect(avisoAProceso(avisos[1]).estado_proceso).toBe("ClosedForReplies");
  });
});

describe("detalle", () => {
  const [aviso] = parsearListado(FILA);
  const d = parsearDetalle(DETALLE, aviso);
  it("proceso con modalidad, monto, cierre y apertura", () => {
    expect(d.proceso.modalidad).toBe("Contratación Menor");
    expect(d.proceso.monto_estimado).toBe(436000);
    expect(d.proceso.fecha_fin_recepcion_ofertas).toBe("2026-10-13T15:30:00.000Z");
    expect(d.proceso.fecha_apertura_ofertas).toBe("2026-10-13T15:40:00.000Z");
    expect(d.proceso.url).toContain("noticeUID=DO1.NTC.1781614");
  });
  it("documentos con el enlace público de descarga", () => {
    expect(d.documentos).toHaveLength(1);
    expect(d.documentos[0].nombre_documento).toBe("Ficha tecnica Lector y controles.pdf");
    expect(d.documentos[0].url_documento).toContain("RetrieveFile/Index?DocumentId=13775210");
  });
  it("artículos (sin la línea del total)", () => {
    expect(d.articulos).toEqual([
      {
        descripcion_articulo: "Lectores y codificadores de banda magnética",
        descripcion_usuario: "Lectores de tarjetas magnéticas para control de acceso.",
        cantidad: 4,
        unidad_medida: "UD",
        precio_unitario_estimado: 29000,
        precio_total_estimado: 116000,
        subclase_unspsc: "43211702",
      },
    ]);
  });
  it("cronograma", () => {
    expect(d.cronograma.map((c) => c.actividad)).toEqual(["Presentación de Oferta Economica", "Apertura del Sobre Economico"]);
  });
});
