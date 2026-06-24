import type { NivelUrgencia } from "@/lib/types";

// Clases del contador de días según urgencia (chip). El color de alarma
// está reservado SOLO para urgencia de plazo real.
export function urgenciaChip(nivel: NivelUrgencia): string {
  switch (nivel) {
    case "vencido":
    case "rojo":
      return "bg-danger-soft text-danger";
    case "ambar":
      return "bg-warn-soft text-warn";
    case "verde":
      return "bg-ok-soft text-ok";
    default:
      return "bg-surface-2 text-muted";
  }
}

// Punto/indicador sólido del semáforo (para la tabla densa).
export function urgenciaDot(nivel: NivelUrgencia): string {
  switch (nivel) {
    case "vencido":
    case "rojo":
      return "bg-danger";
    case "ambar":
      return "bg-warn";
    case "verde":
      return "bg-ok";
    default:
      return "bg-line";
  }
}

// Texto del contador de días.
export function textoDias(dias: number | null): string {
  if (dias === null) return "Sin plazo";
  if (dias < 0) return `Vencido ${Math.abs(dias)}d`;
  if (dias === 0) return "Hoy";
  if (dias === 1) return "Mañana";
  return `${dias}d`;
}

// Chip de estado (neutro; el color fuerte se reserva a la urgencia).
export function estadoChip(estado: string): string {
  if (estado === "cobrado") return "bg-ok-soft text-ok";
  if (estado === "libramiento") return "bg-primary/10 text-primary";
  if (estado === "cerrado") return "bg-surface-2 text-muted";
  return "bg-surface-2 text-ink";
}
