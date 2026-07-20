"use client";

// SUBSANACIÓN: tras presentar, la entidad pide por correo documentos
// faltantes o corregidos con fecha límite corta. Aquí se registra el pedido
// (fecha + correo pegado), se ve qué requisitos están marcados como pedidos
// (se marcan en 2 · Requisitos) y se genera el paquete CHICO solo con eso.
// abierta → enviada → cerrada; cerrada desaparece de la Bid Room.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  MailWarning,
  PackageOpen,
  Send,
} from "lucide-react";
import { Panel, SectionTitle, btnGhost, btnPrimary } from "@/components/ui";
import { diasRestantes, nivelUrgencia } from "@/lib/types";
import { textoDias, urgenciaChip } from "@/lib/ui";
import type { LicRequisito, LicSubsanacion } from "@/lib/licitaciones/tipos";
import {
  cambiarEstadoSubsanacionAction,
  crearSubsanacionAction,
} from "@/lib/actions/licitaciones";

const inputSm =
  "rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink outline-none focus:border-primary";

// dd/mm/aaaa hh:mm desde el ISO guardado, sin new Date (hidratación segura).
function fechaLegible(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

export default function SubsanacionPanel({
  procesoId,
  subsanacion,
  pedidos,
  bloqueantes,
  generando,
  errores = null,
  pdfListo = false,
  onGenerar,
  onIrARequisitos,
}: {
  procesoId: string;
  subsanacion: LicSubsanacion | null;
  pedidos: LicRequisito[];
  // Pedidos aún pendientes que la generación no produce sola (hay que
  // subirlos): con esto > 0 la subsanación no sale.
  bloqueantes: number;
  generando: boolean;
  // Lo que la generación devolvió como faltante/bloqueado.
  errores?: string[] | null;
  // Con convertidor: el PDF es lo principal (es lo que se envía).
  pdfListo?: boolean;
  onGenerar: (formato: "docx" | "pdf") => void;
  onIrARequisitos: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function correr(fn: () => Promise<string | null>) {
    setError(null);
    startTransition(async () => {
      const err = await fn();
      if (err) setError(err);
      router.refresh();
    });
  }

  if (!subsanacion) {
    return (
      <Panel>
        <SectionTitle icon={MailWarning}>Subsanación</SectionTitle>
        <form
          action={(fd) =>
            correr(() =>
              crearSubsanacionAction(
                procesoId,
                String(fd.get("fecha_limite") || ""),
                String(fd.get("texto") || ""),
              ),
            )
          }
          className="space-y-2 p-4"
        >
          <p className="text-[12.5px] text-muted">
            ¿La entidad pidió documentos después de presentar? Regístralo aquí:
            la fecha límite manda el reloj, y el correo queda guardado tal cual.
            Después marca en <strong>2 · Requisitos</strong> qué pidieron.
          </p>
          {error && (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="text-[11px] text-muted">Fecha límite (del correo)</span>
              <input type="datetime-local" name="fecha_limite" required className={`${inputSm} block`} />
            </label>
          </div>
          <textarea
            name="texto"
            rows={4}
            placeholder="Pega aquí el correo de la entidad — qué piden, tal cual lo escribieron."
            className={`${inputSm} w-full`}
          />
          <button type="submit" disabled={pendiente} className={btnPrimary("!px-3 !py-1.5 !text-[12.5px]")}>
            <MailWarning className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {pendiente ? "Registrando…" : "Registrar subsanación"}
          </button>
        </form>
      </Panel>
    );
  }

  const dias = diasRestantes(subsanacion.fecha_limite.slice(0, 10));
  const abierta = subsanacion.estado === "abierta";

  return (
    <Panel>
      <SectionTitle icon={MailWarning}>Subsanación</SectionTitle>
      <div className="space-y-3 p-4">
        {error && (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {abierta ? (
            <span className={`rounded px-2 py-1 font-mono text-[12.5px] font-semibold ${urgenciaChip(nivelUrgencia(dias))}`}>
              {textoDias(dias)}
            </span>
          ) : (
            <span className="flex items-center gap-1.5 rounded bg-ok-soft px-2 py-1 text-[12.5px] font-medium text-ok">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Enviada{subsanacion.enviada_at ? ` el ${fechaLegible(subsanacion.enviada_at)}` : ""}
            </span>
          )}
          <span className="text-[12.5px] text-muted">
            Vence: {fechaLegible(subsanacion.fecha_limite)}
          </span>
        </div>

        {subsanacion.texto && (
          <details className="rounded-md border border-line bg-surface-2/50 px-3 py-2">
            <summary className="cursor-pointer text-[12.5px] font-medium text-ink-soft">
              El correo de la entidad
            </summary>
            <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] text-muted">{subsanacion.texto}</p>
          </details>
        )}

        {/* Lo pedido: se marca en 2 · Requisitos con el botón «Subsanar». */}
        {pedidos.length === 0 ? (
          <p className="flex flex-wrap items-center gap-1.5 rounded bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            <AlertTriangle className="h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
            Aún no marcaste qué pidieron.
            <button type="button" onClick={onIrARequisitos} className="font-medium underline">
              Ir a Requisitos y marcar con «Subsanar»
            </button>
          </p>
        ) : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {pedidos.map((q) => (
              <li key={q.id} className="flex items-center gap-2.5 px-3 py-1.5">
                <span
                  className={`h-2 w-2 flex-none rounded-full ${q.estado === "pendiente" ? "bg-warn" : "bg-ok"}`}
                  title={q.estado === "pendiente" ? "Pendiente" : "Listo"}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{q.nombre}</span>
                <span className="font-mono text-[11px] text-muted">{q.codigo}</span>
              </li>
            ))}
          </ul>
        )}

        {errores && errores.length > 0 && (
          <div className="rounded bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            <p className="font-medium">La subsanación no salió:</p>
            <ul className="ml-4 list-disc">
              {errores.map((e, i) => (
                <li key={i} className="font-mono text-[11.5px]">{e}</li>
              ))}
            </ul>
          </div>
        )}

        {bloqueantes > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 rounded bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            <AlertTriangle className="h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
            {bloqueantes} pedido{bloqueantes === 1 ? "" : "s"} sin archivo — en una
            subsanación TODO lo pedido es obligatorio.
            <button type="button" onClick={onIrARequisitos} className="font-medium underline">
              Resolver en Requisitos
            </button>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onGenerar(pdfListo ? "pdf" : "docx")}
            disabled={generando || pendiente || pedidos.length === 0 || bloqueantes > 0}
            title={
              pdfListo
                ? "Arma el ZIP solo con lo pedido, EN PDF listo para enviar"
                : "Arma el ZIP solo con lo pedido, con su índice"
            }
            className={btnPrimary("!px-3 !py-1.5 !text-[12.5px]")}
          >
            <PackageOpen className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Generar subsanación{pdfListo ? " PDF" : ""}
          </button>
          <button
            type="button"
            onClick={() => onGenerar(pdfListo ? "docx" : "pdf")}
            disabled={generando || pendiente || pedidos.length === 0 || bloqueantes > 0}
            title={
              pdfListo
                ? "Los mismos documentos en Word, por si hay que retocar algo"
                : "Los mismos documentos, convertidos a PDF"
            }
            className={btnGhost("!px-2.5 !py-1.5 !text-[12.5px]")}
          >
            {pdfListo ? "Word" : "PDF"}
          </button>
          {abierta && (
            <button
              type="button"
              onClick={() => correr(() => cambiarEstadoSubsanacionAction(subsanacion.id, "enviada"))}
              disabled={pendiente}
              title="Ya se le envió a la entidad — queda registrado con fecha"
              className={btnGhost("!px-2.5 !py-1.5 !text-[12.5px]")}
            >
              <Send className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Marcar enviada
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (confirm("¿Cerrar esta subsanación? Desaparece de la Bid Room (las marcas de los requisitos se conservan)."))
                correr(() => cambiarEstadoSubsanacionAction(subsanacion.id, "cerrada"));
            }}
            disabled={pendiente}
            className="ml-auto flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink"
          >
            <ListChecks className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Cerrar
          </button>
        </div>
      </div>
    </Panel>
  );
}
