// El checklist estándar de requisitos de un pliego SNCC, calcado de pliegos
// reales (SNCC.P.004, ej. CNSS-CCC-CP-2026): Sobre A (legal/financiera/
// técnica) y Sobre B (económica). En vez de teclear requisito por requisito,
// se marca lo que ESTE pliego pide y se agregan de un golpe.
//
// `docEmpresa` enlaza el requisito con la documentación base de la empresa
// (Configuración → Empresa): si el documento está vigente, el requisito nace
// enlazado y listo. `sinArchivo` = la entidad lo verifica en línea, no se
// deposita (DGII/TSS/RPE) — igual conviene tener el certificado al día.
//
// Sin imports de servidor.

export type GrupoRequisito = "legal" | "financiera" | "tecnica" | "economica";

export const GRUPO_LABEL: Record<GrupoRequisito, string> = {
  legal: "Sobre A · Documentación legal",
  financiera: "Sobre A · Documentación financiera",
  tecnica: "Sobre A · Documentación técnica",
  economica: "Sobre B · Oferta económica",
};

export interface RequisitoEstandar {
  codigo: string;
  nombre: string;
  grupo: GrupoRequisito;
  subsanable: boolean;
  /** La entidad lo verifica en línea; no se deposita archivo. */
  sinArchivo?: boolean;
  /** Tipo de documento_empresa que lo satisface (enlace automático). */
  docEmpresa?: string;
  /** No viene en todos los pliegos: nace desmarcado en el picker. */
  opcional?: boolean;
}

export const REQUISITOS_ESTANDAR: RequisitoEstandar[] = [
  // ---- Sobre A · Legal (los pliegos suelen marcarla [Subsanable]) ----
  { codigo: "SNCC.F.034", nombre: "Formulario de Presentación de Oferta", grupo: "legal", subsanable: true },
  { codigo: "SNCC.F.042", nombre: "Formulario de Información sobre el Oferente", grupo: "legal", subsanable: true },
  { codigo: "DGII", nombre: "Al día con obligaciones fiscales (DGII)", grupo: "legal", subsanable: true, sinArchivo: true, docEmpresa: "dgii" },
  { codigo: "TSS", nombre: "Al día con la Seguridad Social (TSS)", grupo: "legal", subsanable: true, sinArchivo: true, docEmpresa: "tss" },
  { codigo: "RPE", nombre: "Registro de Proveedores del Estado (rubro inscrito)", grupo: "legal", subsanable: true, sinArchivo: true, docEmpresa: "rpe" },
  { codigo: "REG-MERC", nombre: "Registro Mercantil vigente (copia)", grupo: "legal", subsanable: true, docEmpresa: "mercantil" },
  { codigo: "ESTATUTOS", nombre: "Estatutos sociales registrados (copia)", grupo: "legal", subsanable: true, docEmpresa: "acta" },
  { codigo: "NOMINA-ACC", nombre: "Nómina de accionistas y acta de última asamblea", grupo: "legal", subsanable: true },
  { codigo: "ACTA-GERENTE", nombre: "Acta de designación del gerente/consejo con poder de firma", grupo: "legal", subsanable: true },
  { codigo: "COMP-ETICO", nombre: "Compromiso Ético de Proveedores del Estado (firmado y sellado)", grupo: "legal", subsanable: true },
  { codigo: "DJ-ART38", nombre: "Declaración jurada simple — prohibiciones art. 38 Ley 47-25", grupo: "legal", subsanable: true },
  { codigo: "CEDULA-REP", nombre: "Cédula del representante autorizado a firmar (copia)", grupo: "legal", subsanable: true, docEmpresa: "cedula" },
  { codigo: "CARTA-COND", nombre: "Carta de aceptación de condiciones de pago y entrega", grupo: "legal", subsanable: true },
  { codigo: "PODER-REP", nombre: "Poder de representación notarizado (si aplica)", grupo: "legal", subsanable: true, opcional: true },
  { codigo: "FORM-ENTIDAD", nombre: "Formularios internos de la entidad (código de ética, debida diligencia…)", grupo: "legal", subsanable: true, opcional: true },

  // ---- Sobre A · Financiera ----
  { codigo: "IR2", nombre: "Declaraciones juradas ISR (IR-1/IR-2) ante la DGII (copia)", grupo: "financiera", subsanable: true },
  { codigo: "EEFF", nombre: "Estados financieros certificados (últimos 2 ejercicios)", grupo: "financiera", subsanable: true, docEmpresa: "financieros" },

  // ---- Sobre A · Técnica (aquí vive lo que descalifica) ----
  { codigo: "PROP-TEC", nombre: "Propuesta técnica conforme a las especificaciones", grupo: "tecnica", subsanable: false },
  { codigo: "SNCC.F.047", nombre: "Autorización del fabricante (o carta del fabricante)", grupo: "tecnica", subsanable: false },
  { codigo: "CERT-FICHA", nombre: "Certificaciones requeridas por las fichas técnicas", grupo: "tecnica", subsanable: false, opcional: true },
  { codigo: "CONSORCIO", nombre: "Acuerdo/promesa de consorcio (si aplica)", grupo: "tecnica", subsanable: true, opcional: true },

  // ---- Sobre B · Económica ----
  { codigo: "SNCC.F.033", nombre: "Formulario de Presentación de Oferta Económica", grupo: "economica", subsanable: false },
  { codigo: "GARANTIA", nombre: "Garantía de seriedad de la oferta (póliza ~1%)", grupo: "economica", subsanable: true },
  { codigo: "DJ-COLUSION", nombre: "Declaración jurada de oferta libre de colusión", grupo: "economica", subsanable: true, opcional: true },
];

export function requisitoEstandar(codigo: string): RequisitoEstandar | undefined {
  return REQUISITOS_ESTANDAR.find((r) => r.codigo === codigo);
}

export function grupoDeRequisito(codigo: string): GrupoRequisito | "otros" {
  return requisitoEstandar(codigo)?.grupo ?? "otros";
}
