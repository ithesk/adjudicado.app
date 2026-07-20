// El catálogo de variables del constructor de plantillas: las fichas que el
// usuario arrastra sobre su documento. Cada clave es un campo que
// construirDatos() (generador.ts) ya sabe rellenar — esta es la fuente única
// para el editor, la vista previa y la validación.
//
// Sin imports de servidor.

export type GrupoVariable = "proceso" | "empresa" | "firmante" | "economico" | "imagenes";

export const GRUPO_VARIABLE_LABEL: Record<GrupoVariable, string> = {
  proceso: "Del proceso",
  empresa: "De la empresa",
  firmante: "Del firmante",
  economico: "Económicas",
  imagenes: "Imágenes",
};

export interface VariablePlantilla {
  clave: string;
  etiqueta: string;
  ejemplo: string;
  grupo: GrupoVariable;
  /** Las imágenes usan el tag {%clave} (módulo de imágenes). */
  imagen?: boolean;
}

export const VARIABLES_PLANTILLA: VariablePlantilla[] = [
  // Del proceso
  { clave: "expediente", etiqueta: "N° de expediente", ejemplo: "OGTIC-CCC-CP-2026-0011", grupo: "proceso" },
  { clave: "entidad_nombre", etiqueta: "Entidad convocante", ejemplo: "Oficina Gubernamental de Tecnologías", grupo: "proceso" },
  { clave: "objeto", etiqueta: "Objeto de la contratación", ejemplo: "Adquisición de licencias informáticas", grupo: "proceso" },
  { clave: "fecha", etiqueta: "Fecha (larga)", ejemplo: "16 de julio de 2026", grupo: "proceso" },
  { clave: "dia_letras", etiqueta: "Día en letras", ejemplo: "dieciséis", grupo: "proceso" },
  { clave: "dia_numero", etiqueta: "Día en número", ejemplo: "16", grupo: "proceso" },
  { clave: "mes_letras", etiqueta: "Mes en letras", ejemplo: "julio", grupo: "proceso" },
  { clave: "ano_letras", etiqueta: "Año en letras", ejemplo: "dos mil veintiséis", grupo: "proceso" },
  { clave: "ano_numero", etiqueta: "Año en número", ejemplo: "2026", grupo: "proceso" },
  // De la empresa
  { clave: "empresa_nombre", etiqueta: "Razón social", ejemplo: "Innovación Tecnológica SK, SRL", grupo: "empresa" },
  { clave: "rnc", etiqueta: "RNC", ejemplo: "1-31-12345-6", grupo: "empresa" },
  { clave: "rpe", etiqueta: "RPE", ejemplo: "12345", grupo: "empresa" },
  { clave: "empresa_direccion", etiqueta: "Dirección", ejemplo: "Av. Winston Churchill, Santo Domingo", grupo: "empresa" },
  { clave: "empresa_telefono", etiqueta: "Teléfono", ejemplo: "809-555-0100", grupo: "empresa" },
  { clave: "empresa_email", etiqueta: "Email", ejemplo: "licitaciones@empresa.do", grupo: "empresa" },
  { clave: "ciudad", etiqueta: "Ciudad", ejemplo: "Santo Domingo", grupo: "empresa" },
  { clave: "provincia", etiqueta: "Provincia", ejemplo: "Distrito Nacional", grupo: "empresa" },
  // Del firmante
  { clave: "rep_nombre", etiqueta: "Nombre del firmante", ejemplo: "Pablo Holguín", grupo: "firmante" },
  { clave: "rep_cargo", etiqueta: "Cargo del firmante", ejemplo: "Gerente General", grupo: "firmante" },
  { clave: "rep_cedula", etiqueta: "Cédula del firmante", ejemplo: "001-1234567-8", grupo: "firmante" },
  // Económicas
  { clave: "total_oferta", etiqueta: "Total de la oferta (RD$)", ejemplo: "329,376.00", grupo: "economico" },
  { clave: "total_letras", etiqueta: "Total en letras", ejemplo: "TRESCIENTOS VEINTINUEVE MIL…", grupo: "economico" },
  // Imágenes
  { clave: "logo", etiqueta: "Logo de la empresa (imagen)", ejemplo: "🏢", grupo: "imagenes", imagen: true },
  { clave: "firma", etiqueta: "Firma (imagen)", ejemplo: "✍️", grupo: "imagenes", imagen: true },
  { clave: "sello", etiqueta: "Sello (imagen)", ejemplo: "🔵", grupo: "imagenes", imagen: true },
];

export function variablePorClave(clave: string): VariablePlantilla | undefined {
  return VARIABLES_PLANTILLA.find((v) => v.clave === clave);
}

/** El tag que se escribe en el documento. */
export function tagDeVariable(clave: string): string {
  const v = variablePorClave(clave);
  return v?.imagen ? `{%${clave}}` : `{${clave}}`;
}

// Una asignación del editor: qué tramo del documento se convierte en qué tag.
export interface Asignacion {
  parrafo: number; // índice del párrafo en el documento
  inicio: number;  // rango [inicio, fin) sobre el texto del párrafo
  fin: number;
  variable: string;
}

/** Los datos de muestra para la vista previa del editor. */
export function datosEjemplo(): Record<string, string> {
  const datos: Record<string, string> = {};
  for (const v of VARIABLES_PLANTILLA) {
    if (!v.imagen) datos[v.clave] = v.ejemplo;
  }
  return datos;
}

// ---------- variables personalizadas (por plantilla) ----------

export interface VariablePersonalizada {
  clave: string;    // slug: "fecha_de_nacimiento"
  etiqueta: string; // "Fecha de nacimiento"
  /** Valor FIJO ("dominicano"). Vacío = se pregunta al generar, por proceso. */
  valor: string;
}

// "Fecha de nacimiento" → "fecha_de_nacimiento" (sin chocar con las del sistema).
export function claveDesdeEtiqueta(etiqueta: string): string {
  const slug = etiqueta
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return variablePorClave(slug) ? `x_${slug}` : slug;
}
