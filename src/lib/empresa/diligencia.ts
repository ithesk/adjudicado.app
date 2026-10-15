// Debida diligencia de la empresa: lo que piden los formularios de
// «conozca a su proveedor» (TSS ADM-FO-031, SNCCP-PROV-F-040, beneficiarios
// finales). Se carga una vez en Configuración → Empresa y se reutiliza en
// cada proceso. Lógica pura (sin red ni base), probada.

export const ROLES_PERSONA = ["accionista", "beneficiario_final", "directivo", "tecnico"] as const;
export type RolPersona = (typeof ROLES_PERSONA)[number];

export const ROL_PERSONA_LABEL: Record<RolPersona, string> = {
  accionista: "Accionista",
  beneficiario_final: "Beneficiario final",
  directivo: "Directivo",
  tecnico: "Personal técnico",
};

export interface PersonaEmpresa {
  nombre: string;
  documento: string | null;
  nacionalidad: string | null;
  cargo: string | null;
  formacion: string | null;
  /** % accionario (0-100); solo para accionistas y beneficiarios. */
  porcentaje: number | null;
  roles: RolPersona[];
}

export interface EmpresaRelacionada {
  empresa: string;
  pais: string | null;
  rnc: string | null;
  servicio: string | null;
}

export interface DatosDiligencia {
  registro_mercantil: string | null;
  fecha_constitucion: string | null;
  financiamiento_principal: string | null;
  financiamiento_secundario: string | null;
  relacion_pep: string | null;
  personas: PersonaEmpresa[];
  empresas_relacionadas: EmpresaRelacionada[];
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Normaliza lo que llegue (jsonb de la base o del MCP) a la forma buena. */
export function limpiarPersonas(v: unknown): PersonaEmpresa[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((p) => {
      const o = (p ?? {}) as Record<string, unknown>;
      const pct = o.porcentaje === null || o.porcentaje === undefined || o.porcentaje === "" ? null : Number(o.porcentaje);
      return {
        nombre: texto(o.nombre) ?? "",
        documento: texto(o.documento),
        nacionalidad: texto(o.nacionalidad),
        cargo: texto(o.cargo),
        formacion: texto(o.formacion),
        porcentaje: pct !== null && Number.isFinite(pct) && pct >= 0 && pct <= 100 ? pct : null,
        roles: Array.isArray(o.roles)
          ? (o.roles.filter((r) => (ROLES_PERSONA as readonly string[]).includes(String(r))) as RolPersona[])
          : [],
      };
    })
    .filter((p) => p.nombre);
}

export function limpiarRelacionadas(v: unknown): EmpresaRelacionada[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      return { empresa: texto(o.empresa) ?? "", pais: texto(o.pais), rnc: texto(o.rnc), servicio: texto(o.servicio) };
    })
    .filter((e) => e.empresa);
}

/** Años completos desde la constitución (para «años operando»). */
export function anosOperando(fechaConstitucion: string | null, hoy = new Date()): number | null {
  if (!fechaConstitucion) return null;
  const f = new Date(`${fechaConstitucion.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(f.getTime())) return null;
  let anos = hoy.getFullYear() - f.getFullYear();
  if (hoy.getMonth() < f.getMonth() || (hoy.getMonth() === f.getMonth() && hoy.getDate() < f.getDate())) anos--;
  return Math.max(0, anos);
}

/**
 * Lo que falta para poder llenar un formulario de debida diligencia sin
 * huecos. No bloquea nada: lo dice, para pedirlo una vez y no en cada proceso.
 */
export function faltantesDiligencia(d: DatosDiligencia): string[] {
  const f: string[] = [];
  if (!d.registro_mercantil) f.push("número de registro mercantil");
  if (!d.fecha_constitucion) f.push("fecha de constitución (para los años operando)");
  if (!d.financiamiento_principal) f.push("fuente principal de financiamiento");
  if (!d.relacion_pep) f.push("declaración sobre personas políticamente expuestas");
  const con = (r: RolPersona) => d.personas.filter((p) => p.roles.includes(r));
  if (!con("accionista").length) f.push("accionistas (nombre, documento y %)");
  if (!con("beneficiario_final").length) f.push("beneficiario final");
  if (!con("directivo").length) f.push("puestos directivos");
  if (!con("tecnico").length) f.push("personal técnico que ejecuta los proyectos");
  const sinDoc = d.personas.filter((p) => !p.documento).map((p) => p.nombre);
  if (sinDoc.length) f.push(`documento de identidad de ${sinDoc.join(", ")}`);
  const pct = con("accionista").reduce((s, p) => s + (p.porcentaje ?? 0), 0);
  if (con("accionista").length && Math.abs(pct - 100) > 0.5) f.push(`los porcentajes accionarios suman ${pct}%, no 100%`);
  return f;
}

/** Los datos de diligencia de una fila de empresa_perfil (tolera columnas ausentes). */
export function diligenciaDe(fila: Record<string, unknown> | null): DatosDiligencia {
  const r = fila ?? {};
  return {
    registro_mercantil: texto(r.registro_mercantil),
    fecha_constitucion: texto(r.fecha_constitucion),
    financiamiento_principal: texto(r.financiamiento_principal),
    financiamiento_secundario: texto(r.financiamiento_secundario),
    relacion_pep: texto(r.relacion_pep),
    personas: limpiarPersonas(r.personas),
    empresas_relacionadas: limpiarRelacionadas(r.empresas_relacionadas),
  };
}
