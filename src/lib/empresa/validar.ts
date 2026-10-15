// Validaciones de los datos de la empresa que van impresos en los
// formularios oficiales (F.042, F.034, membretes). Lógica pura, probada.
//
// Por qué existe: el 15-10-2026 el perfil tenía el RPE como «sn» (sin
// número) y salió así en el F.042, en el membrete de la oferta técnica y
// de las cartas de TSS-DAF-CM-2026-0065. El cron de resultados, además,
// buscaba nuestras ofertas por el RPE «sn» y no encontraba ninguna.

/** El RPE es un número de la DGCP (hoy, de 1 a 7 cifras). */
export function rpeValido(rpe: string | null | undefined): boolean {
  return typeof rpe === "string" && /^\d{1,7}$/.test(rpe.trim());
}

/** "RPE 116764" o " 116764 " → "116764"; lo que no sea un número queda igual. */
export function normalizarRpe(rpe: string): string {
  const solo = rpe.replace(/^\s*rpe[\s:.-]*/i, "").trim();
  return /^\d+$/.test(solo) ? String(Number(solo)) : rpe.trim();
}

/** RNC (9 dígitos) o cédula (11), con o sin guiones. */
export function rncValido(rnc: string | null | undefined): boolean {
  const d = (rnc ?? "").replace(/[\s-]/g, "");
  return /^\d{9}$/.test(d) || /^\d{11}$/.test(d);
}

export function cedulaValida(c: string | null | undefined): boolean {
  return /^\d{11}$/.test((c ?? "").replace(/[\s-]/g, ""));
}

export interface PerfilParaAlertas {
  nombre_legal?: string | null;
  rnc?: string | null;
  rpe?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
}

/**
 * Lo que está mal o falta en el perfil y saldría impreso en un formulario.
 * Cada alerta dice qué y dónde se arregla.
 */
export function alertasPerfil(
  p: PerfilParaAlertas | null,
  firmantes: { rol: string; nombre: string; cedula: string | null }[] = [],
): string[] {
  if (!p) return ["No hay perfil de empresa: complétalo en Configuración → Empresa."];
  const a: string[] = [];
  if (!p.nombre_legal?.trim()) a.push("Falta la razón social (Configuración → Empresa).");
  if (!rncValido(p.rnc)) a.push(`El RNC «${p.rnc ?? ""}» no es válido: deben ser 9 dígitos (Configuración → Empresa).`);
  if (!p.rpe?.trim()) a.push("Falta el RPE: sale en el F.042 y en los membretes (Configuración → Empresa).");
  else if (!rpeValido(p.rpe)) {
    a.push(`El RPE es «${p.rpe}» y debe ser el número de la DGCP (p. ej. 116764): saldría así en el F.042 y en los membretes (Configuración → Empresa).`);
  }
  if (!p.direccion?.trim()) a.push("Falta la dirección (Configuración → Empresa).");
  if (!p.telefono?.trim()) a.push("Falta el teléfono (Configuración → Empresa).");
  if (!p.email?.trim()) a.push("Falta el correo (Configuración → Empresa).");
  const gg = firmantes.find((f) => f.rol === "gerente_general");
  if (!gg) a.push("Falta el firmante Gerente General (Configuración → Empresa).");
  else if (!cedulaValida(gg.cedula)) {
    a.push(`Falta la cédula del Gerente General (${gg.nombre}): la piden varios formularios (Configuración → Empresa).`);
  }
  return a;
}

// ===== Campos en blanco en un documento =====

/**
 * Cuántos huecos sin rellenar trae el cuerpo de un documento: líneas de
 * guiones bajos («____») y celdas de tabla vacías. Un formulario con huecos
 * no está «listo»: el 15-10-2026 salió un ADM-FO-031 con domicilio,
 * accionistas y beneficiario final en blanco marcado como listo.
 */
export function camposEnBlanco(html: string): number {
  const lineas = html.match(/_{4,}/g)?.length ?? 0;
  const celdas = html.match(/<td[^>]*>(?:\s|&nbsp;|&#160;|<br\s*\/?>)*<\/td>/gi)?.length ?? 0;
  return lineas + celdas;
}
