// Documentación base de la empresa: el catálogo de lo que hay que tener al día
// para presentarse a una licitación, y el cálculo de qué está por vencer.
//
// Sin imports de servidor: se usa desde componentes cliente y servidor.

import { diasRestantes, type NivelUrgencia } from "@/lib/types";

export interface DocumentoEmpresa {
  id: string;
  org_id: string;
  tipo: string;
  nombre: string;
  archivo_url: string;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  notas: string | null;
  subido_por: string | null;
  created_at: string;
}

export interface TipoDocEmpresa {
  codigo: string;
  label: string;
  descripcion: string;
  /** Si vence, el formulario pide la fecha de vencimiento. */
  vence: boolean;
}

// El catálogo es fijo para poder decir qué FALTA, no solo qué hay cargado.
// "otro" es la válvula de escape para lo que no está en la lista.
export const TIPOS_DOC_EMPRESA: TipoDocEmpresa[] = [
  {
    codigo: "rpe",
    label: "Registro de Proveedores del Estado (RPE)",
    descripcion: "Certificado del RPE. Sin él no se puede contratar con el Estado.",
    vence: true,
  },
  {
    codigo: "dgii",
    label: "Certificación DGII",
    descripcion: "Estar al día con los impuestos. Se tramita en la DGII.",
    vence: true,
  },
  {
    codigo: "tss",
    label: "Certificación TSS",
    descripcion: "Estar al día con la seguridad social. Se tramita en la TSS.",
    vence: true,
  },
  {
    codigo: "mercantil",
    label: "Registro Mercantil",
    descripcion: "Emitido por la Cámara de Comercio. Se renueva periódicamente.",
    vence: true,
  },
  {
    codigo: "acta",
    label: "Acta constitutiva / Estatutos",
    descripcion: "Documento de constitución de la empresa. No vence.",
    vence: false,
  },
  {
    codigo: "cedula",
    label: "Cédula del representante legal",
    descripcion: "Documento de identidad de quien firma por la empresa.",
    vence: true,
  },
  {
    codigo: "financieros",
    label: "Estados financieros",
    descripcion: "Últimos estados financieros de la empresa.",
    vence: false,
  },
  {
    codigo: "otro",
    label: "Otro",
    descripcion: "Cualquier documento que no esté en la lista.",
    vence: false,
  },
];

export function tipoDoc(codigo: string): TipoDocEmpresa {
  return (
    TIPOS_DOC_EMPRESA.find((t) => t.codigo === codigo) ??
    TIPOS_DOC_EMPRESA[TIPOS_DOC_EMPRESA.length - 1]
  );
}

// Umbrales PROPIOS, distintos a los de las órdenes (2 y 5 días): una
// certificación de la DGII o la TSS se tramita con semanas de antelación, así
// que avisar dos días antes no sirve de nada.
export function nivelVencimiento(dias: number | null): NivelUrgencia {
  if (dias === null) return "neutro"; // no vence
  if (dias < 0) return "vencido";
  if (dias <= 15) return "rojo";
  if (dias <= 30) return "ambar";
  return "verde";
}

export interface FilaDocumentacion {
  tipo: TipoDocEmpresa;
  /** El documento que cuenta hoy. null = no cargado. */
  vigente: DocumentoEmpresa | null;
  dias: number | null;
  nivel: NivelUrgencia;
  /** Versiones anteriores del mismo tipo (renovaciones pasadas). */
  historial: DocumentoEmpresa[];
}

// De varios documentos del mismo tipo, el vigente es el de vencimiento más
// lejano. Si ninguno tiene fecha, el más reciente.
function elegirVigente(docs: DocumentoEmpresa[]): DocumentoEmpresa {
  return [...docs].sort((a, b) => {
    if (a.fecha_vencimiento && b.fecha_vencimiento) {
      return b.fecha_vencimiento.localeCompare(a.fecha_vencimiento);
    }
    if (a.fecha_vencimiento) return -1;
    if (b.fecha_vencimiento) return 1;
    return b.created_at.localeCompare(a.created_at);
  })[0];
}

function fila(tipo: TipoDocEmpresa, docs: DocumentoEmpresa[]): FilaDocumentacion {
  if (docs.length === 0) {
    return { tipo, vigente: null, dias: null, nivel: "neutro", historial: [] };
  }
  const vigente = elegirVigente(docs);
  const dias = diasRestantes(vigente.fecha_vencimiento);
  return {
    tipo,
    vigente,
    dias,
    nivel: nivelVencimiento(dias),
    historial: docs.filter((d) => d.id !== vigente.id),
  };
}

// Una fila por tipo del catálogo (incluidos los NO cargados, que es justo lo
// que hay que ver), más una fila suelta por cada documento de tipo "otro".
export function estadoDocumentacion(
  docs: DocumentoEmpresa[],
): FilaDocumentacion[] {
  const filas: FilaDocumentacion[] = [];

  for (const tipo of TIPOS_DOC_EMPRESA) {
    const delTipo = docs.filter((d) => d.tipo === tipo.codigo);
    if (tipo.codigo === "otro") {
      // Los "otro" no se agrupan: cada uno es un documento distinto.
      for (const doc of delTipo) filas.push(fila(tipo, [doc]));
      continue;
    }
    filas.push(fila(tipo, delTipo));
  }

  return filas;
}

// Lo que alimenta la insignia del menú: cuántos documentos piden atención.
export function alertasDocumentacion(docs: DocumentoEmpresa[]): {
  total: number;
  urgente: boolean;
} {
  const niveles = estadoDocumentacion(docs)
    .filter((f) => f.vigente)
    .map((f) => f.nivel);
  const cuenta = niveles.filter(
    (n) => n === "vencido" || n === "rojo" || n === "ambar",
  ).length;
  return {
    total: cuenta,
    urgente: niveles.some((n) => n === "vencido" || n === "rojo"),
  };
}
