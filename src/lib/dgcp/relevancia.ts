// El radar: qué procesos publicados le interesan a ESTA empresa y en qué
// orden atenderlos. Lógica pura (sin red ni base), para poder probarla.
//
// Nada atado a una empresa concreta: los socios salen de lic_capability de
// cada organización; aquí solo vive el vocabulario genérico del rubro TI, que
// cada llamada puede ampliar con sus propias palabras.
//
// Puntaje = urgencia×3 + relevancia×2 + valor (el del pipeline diario):
//   urgencia: cierra hoy 10, mañana 8, ≤7 días 5, ≤14 días 2, después 0
//   relevancia: socio de la empresa 10, marca/producto TI 7, TI genérico 4
//   valor: >1M 3, >500K 2, >100K 1, sin monto 0  (en DOP)

import type { DgcpProceso } from "./api";

export type Nivel = "alta" | "media" | "explorar";

// Productos y marcas del rubro TI: relevancia 7.
export const PALABRAS_TI = [
  // software y licencias
  "microsoft", "office 365", "microsoft 365", "azure", "windows", "adobe", "creative cloud",
  "acrobat", "veeam", "backup", "respaldo", "fortinet", "fortigate", "fortiap", "fortiswitch",
  "firewall", "zoom", "webex", "manageengine", "zoho", "servicedesk", "nitro", "autocad",
  "autodesk", "revit", "kaspersky", "antivirus", "endpoint", "edr", "google workspace",
  "licenci", "suscripcion", "software", "saas", "nube", "cloud", "hosting",
  // hardware
  "switch", "access point", "router", "wifi", "wireless", "cisco", "aruba", "ubiquiti",
  "servidor", "server", "rack", "ups", "datacenter", "data center", "computador", "computadora",
  "laptop", "desktop", "workstation", "tablet", "ipad", "impresora", "multifuncional", "toner",
  "cartucho", "scanner", "escaner", "disco duro", "ssd", "memoria usb", "pendrive",
  // audiovisual
  "camara fotografic", "fotografic", "videocamara", "drone", "dji", "proyector", "pantalla",
  "monitor", "videoconferencia", "video conferencia", "webcam", "microfono", "tripode", "gimbal",
  // seguridad electrónica (CCTV y control de acceso)
  "control de acceso", "controles de acceso", "lector de tarjeta", "lectores de tarjeta", "cctv",
  "videovigilancia", "video vigilancia", "camara de seguridad", "camaras de seguridad", "camara ip",
  "camaras ip", "nvr", "dvr", "biometric", "hikvision", "dahua",
  // telecom y redes
  "telefonia ip", "central telefonica", "pbx", "grandstream", "yealink", "cableado estructurado",
  "fibra optica", "red lan", "conectividad", "internet",
  // servicios TI
  "soporte tecnico", "mantenimiento de red", "mantenimiento de sistema", "desarrollo de software",
  "sistema de gestion", "erp", "crm",
];

// TI genérico: relevancia 4.
export const PALABRAS_TI_GENERICO = [
  "tecnolog", "informatic", "digital", "electronic", "equipo de computo", "equipos de computo",
  "equipo tecnologico", "equipos tecnologicos", "sistema de informacion", "plataforma",
];

// Falsos positivos frecuentes: si el título los trae, se descarta aunque
// coincida otra palabra ("cartuchos para gases" no son de impresora).
export const PALABRAS_EXCLUIR = [
  "catering", "refrigerio", "desayuno", "almuerzo", "comida", "alimento", "uniforme", "ropa",
  "combustible", "gasoil", "gasolina", "ticket de", "reactivo", "laboratorio clinico", "farmacia",
  "medicamento", "oxigeno", "suero", "material gastable medico", "construccion", "pintura",
  "plomeria", "jardineria", "limpieza", "higiene", "desinfect", "monitor de signos",
  "equipo medico", "equipos medicos", "camara hiperbarica", "cartuchos para gases", "succionador",
  "camion", "cloro",
];

// Productos que delatan a un fabricante sin nombrarlo: los pliegos dicen
// «licencias FortiAIOps» o «laptops ThinkPad», no «Fortinet» ni «Lenovo».
// Se aplican solo a los vendors que la empresa marcó como socios.
export const ALIAS_VENDOR: Record<string, string[]> = {
  // Los productos, no el prefijo «forti» (saltaría con «fortificación»).
  fortinet: [
    "fortigate", "fortiap", "fortiswitch", "fortianalyzer", "fortimanager", "fortiaiops", "forticlient",
    "fortimail", "fortiweb", "fortiedr", "fortitoken", "fortisiem", "fortinac", "fortisandbox", "forticare",
    "fortiguard", "fortiwifi", "fortisase", "fortiextender", "fortiauthenticator", "fortiproxy",
  ],
  microsoft: ["office 365", "microsoft 365", "m365", "windows", "azure", "sharepoint", "exchange online", "sql server", "dynamics 365", "power bi"],
  adobe: ["acrobat", "creative cloud", "photoshop", "illustrator", "indesign", "premiere"],
  veeam: ["backup & replication", "veeam"],
  kaspersky: ["kaspersky"],
  lenovo: ["thinkpad", "thinkcentre", "thinksystem", "thinkstation", "ideapad"],
  zoom: ["zoom"],
  manageengine: ["servicedesk plus", "adselfservice", "endpoint central", "opmanager", "adaudit"],
  sophos: ["intercept x", "sophos"],
  autodesk: ["autocad", "revit", "civil 3d", "3ds max", "navisworks"],
  cisco: ["meraki", "webex", "catalyst"],
  dell: ["latitude", "optiplex", "poweredge", "precision"],
  hp: ["elitebook", "probook", "elitedesk", "prodesk", "laserjet"],
  apple: ["macbook", "imac", "ipad", "iphone", "mac mini", "mac studio"],
};

export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Coincidencia al INICIO de palabra: "ups" no debe saltar con "grupos", pero
// "licenci" sí con "licencias".
function contiene(texto: string, palabra: string): boolean {
  const p = normalizar(palabra).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${p}`).test(texto);
}

export interface OpcionesRadar {
  /** Vendors de lic_capability en estado partner/canal (minúsculas). */
  socios: string[];
  /** Vendors marcados blocker: se avisa, no se descarta. */
  bloqueados?: string[];
  /** Palabras extra de la empresa o de la búsqueda (relevancia 7). */
  palabrasExtra?: string[];
  /** Si se da, solo pasan los procesos que contengan este texto. */
  texto?: string;
  ahora?: Date;
}

export interface Oportunidad {
  codigo: string;
  institucion: string;
  titulo: string;
  modalidad: string;
  monto: number | null;
  divisa: string;
  cierre: string | null;
  /** Cierre en hora de RD, "AAAA-MM-DD HH:MM". */
  cierre_rd: string | null;
  dias_restantes: number | null;
  mipyme: boolean;
  coincidencias: string[];
  socios: string[];
  bloqueados: string[];
  nivel: Nivel;
  puntaje: number;
  url: string | null;
}

// República Dominicana: UTC−4 todo el año (sin horario de verano).
const RD_MS = -4 * 3_600_000;

// Días de CALENDARIO en hora de RD: 0 = cierra hoy, 1 = mañana. Antes eran
// bloques de 24 h desde «ahora», y un cierre de mañana a las 9:00 visto hoy
// a las 10:00 salía como «hoy». Ya pasado (aunque sea hoy) → negativo.
export function diasHasta(fechaIso: string | null, ahora: Date): number | null {
  if (!fechaIso) return null;
  const t = new Date(fechaIso).getTime();
  if (Number.isNaN(t)) return null;
  if (t < ahora.getTime()) return -1;
  const dia = (ms: number) => Math.floor((ms + RD_MS) / 86_400_000);
  return dia(t) - dia(ahora.getTime());
}

// "2026-10-06 13:50" en hora de RD, para que nadie tenga que convertir UTC.
export function horaRd(fechaIso: string | null): string | null {
  if (!fechaIso) return null;
  const t = new Date(fechaIso).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + RD_MS).toISOString().slice(0, 16).replace("T", " ");
}

function puntosUrgencia(dias: number | null): number {
  if (dias === null || dias < 0) return 0;
  if (dias === 0) return 10;
  if (dias === 1) return 8;
  if (dias <= 7) return 5;
  if (dias <= 14) return 2;
  return 0;
}

function puntosValor(monto: number | null, divisa: string): number {
  if (!monto) return 0;
  const dop = divisa === "USD" ? monto * 60 : monto; // orden de magnitud basta
  if (dop > 1_000_000) return 3;
  if (dop > 500_000) return 2;
  if (dop > 100_000) return 1;
  return 0;
}

// Evalúa UN proceso. Devuelve null si no es relevante (o si ya cerró).
export function evaluar(p: DgcpProceso, op: OpcionesRadar): Oportunidad | null {
  const ahora = op.ahora ?? new Date();
  const texto = normalizar(`${p.titulo ?? ""} ${p.descripcion ?? ""}`);
  if (op.texto && !normalizar(op.texto).split(/\s+/).filter(Boolean).every((t) => texto.includes(t))) {
    return null;
  }
  const dias = diasHasta(p.fecha_fin_recepcion_ofertas, ahora);
  if (dias !== null && dias < 0) return null;

  const socios = op.socios.filter(
    (v) => contiene(texto, v) || (ALIAS_VENDOR[v] ?? []).some((a) => contiene(texto, a)),
  );
  const bloqueados = (op.bloqueados ?? []).filter((v) => contiene(texto, v));
  const ti = [...PALABRAS_TI, ...(op.palabrasExtra ?? [])].filter((k) => contiene(texto, k));
  const generico = PALABRAS_TI_GENERICO.filter((k) => contiene(texto, k));

  // Con búsqueda explícita, todo lo que coincide con el texto pasa: el
  // usuario ya dijo qué le interesa. Sin ella, manda el vocabulario.
  if (!op.texto) {
    if (socios.length + ti.length + generico.length === 0) return null;
    if (socios.length === 0 && PALABRAS_EXCLUIR.some((k) => contiene(texto, k))) return null;
  }

  const relevancia = socios.length ? 10 : ti.length ? 7 : generico.length ? 4 : 2;
  const nivel: Nivel = relevancia >= 10 ? "alta" : relevancia >= 7 ? "media" : "explorar";
  const divisa = p.divisa || "DOP";

  return {
    codigo: p.codigo_proceso,
    institucion: p.unidad_compra,
    titulo: p.titulo,
    modalidad: p.modalidad,
    monto: p.monto_estimado ?? null,
    divisa,
    cierre: p.fecha_fin_recepcion_ofertas,
    cierre_rd: horaRd(p.fecha_fin_recepcion_ofertas),
    dias_restantes: dias,
    mipyme: p.dirigido_mipymes === "Si" || p.dirigido_mipymes_mujeres === "Si",
    coincidencias: [...new Set([...ti, ...generico])],
    socios,
    bloqueados,
    nivel,
    puntaje: puntosUrgencia(dias) * 3 + relevancia * 2 + puntosValor(p.monto_estimado, divisa),
    url: p.url,
  };
}

// Solo los publicados (abiertos), evaluados y ordenados por puntaje; a
// igualdad, el que cierra antes primero.
export function radar(procesos: DgcpProceso[], op: OpcionesRadar): Oportunidad[] {
  return procesos
    .filter((p) => p.estado_proceso === "Proceso publicado")
    .map((p) => evaluar(p, op))
    .filter((o): o is Oportunidad => o !== null)
    .sort(
      (a, b) =>
        b.puntaje - a.puntaje ||
        (a.dias_restantes ?? 999) - (b.dias_restantes ?? 999),
    );
}

// Código del proceso → modalidad de la app. El segmento del código manda
// (INAPA-CCC-LPN-2026-0025 → LPN); el texto de la DGCP es el respaldo.
export function modalidadDesdeDgcp(codigo: string, modalidad: string | null): string {
  const seg = codigo.toUpperCase().split("-");
  for (const m of ["LPN", "CP", "CM", "CD", "SB"]) if (seg.includes(m)) return m;
  if (seg.includes("LPI") || seg.includes("LR")) return "LPN";
  const t = normalizar(modalidad ?? "");
  if (t.includes("licitacion publica")) return "LPN";
  if (t.includes("comparacion de precios")) return "CP";
  if (t.includes("compras menores") || t.includes("compra menor")) return "CM";
  if (t.includes("directa")) return "CD";
  if (t.includes("subasta")) return "SB";
  return "OTRO";
}

// Siglas de la entidad desde el código ("MICM-DAF-CM-2026-0009" → "MICM").
export function siglasDesdeCodigo(codigo: string): string | null {
  const s = codigo.split("-")[0]?.trim().toUpperCase();
  return s && /^[A-Z0-9]{2,}$/.test(s) ? s : null;
}
