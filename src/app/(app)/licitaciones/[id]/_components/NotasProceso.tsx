"use client";

// Las notas del proceso, en la columna derecha debajo del Expediente: ahí
// hay espacio vertical y se leen de corrido. Antes vivían como un textarea
// de 2 líneas dentro de Datos del proceso — el resumen que deja el análisis
// (varios párrafos) obligaba a hacer scroll dentro de una cajita.
//
// Dos modos: LECTURA (párrafos, viñetas y enlaces, como lo deja Claude al
// importar) y EDICIÓN (textarea que crece con el texto). Se edita con el
// botón o con doble clic sobre el texto; al salir del campo se guarda y
// vuelve a lectura. Tope de 40 % de la ventana: el riel es sticky y no debe
// salirse de la pantalla; pasado eso, scroll.

import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { NotebookPen, Pencil } from "lucide-react";
import { IndicadorGuardado, Panel } from "@/components/ui";
import { useAccion } from "@/lib/use-accion";
import { actualizarProcesoAction } from "@/lib/actions/licitaciones";

type Bloque = { tipo: "p"; lineas: string[] } | { tipo: "ul"; items: string[] };

// Texto plano → bloques: las líneas que empiezan con -, •, * o ✓ son
// viñetas; una línea en blanco separa párrafos.
export function bloquesDeNotas(texto: string): Bloque[] {
  const bloques: Bloque[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    const t = linea.trim();
    const ultimo = bloques.at(-1);
    if (!t) {
      bloques.push({ tipo: "p", lineas: [] });
      continue;
    }
    const viñeta = t.match(/^[-•*✓]\s+(.*)$/);
    if (viñeta) {
      if (ultimo?.tipo === "ul") ultimo.items.push(viñeta[1]);
      else bloques.push({ tipo: "ul", items: [viñeta[1]] });
    } else if (ultimo?.tipo === "p") {
      ultimo.lineas.push(t);
    } else {
      bloques.push({ tipo: "p", lineas: [t] });
    }
  }
  return bloques.filter((b) => (b.tipo === "p" ? b.lineas.length > 0 : true));
}

// Enlaces clicables (el «Portal DGCP: https://…» que deja el importador) y
// **negrita**. Nada de HTML crudo: todo pasa por React.
function enLinea(texto: string) {
  return texto.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*)/g).map((parte, i) => {
    if (/^https?:\/\//.test(parte)) {
      return (
        <a
          key={i}
          href={parte}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all font-medium text-primary hover:underline"
        >
          {parte.includes("comprasdominicana") ? "ver en el portal ↗" : parte}
        </a>
      );
    }
    if (/^\*\*[^*]+\*\*$/.test(parte)) {
      return <strong key={i} className="font-semibold">{parte.slice(2, -2)}</strong>;
    }
    return <Fragment key={i}>{parte}</Fragment>;
  });
}

export default function NotasProceso({
  procesoId,
  notas,
}: {
  procesoId: string;
  notas: string | null;
}) {
  const { correr, estado } = useAccion();
  // El texto vigente en pantalla (lo guardado puede tardar en volver del
  // servidor; la lectura no debe mostrar la versión vieja mientras tanto).
  const [texto, setTexto] = useState(notas ?? "");
  const [editando, setEditando] = useState(!notas?.trim());
  const ref = useRef<HTMLTextAreaElement>(null);

  function ajustarAlto() {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 2}px`;
  }

  useLayoutEffect(() => {
    if (!editando) return;
    ajustarAlto();
    ref.current?.focus();
  }, [editando]);

  function guardar(v: string) {
    const limpio = v.trim();
    setTexto(limpio);
    if (limpio !== texto.trim()) {
      correr("notas", () => actualizarProcesoAction(procesoId, { notas: limpio || null }));
    }
    // Vacío se queda en edición: no hay nada que leer.
    if (limpio) setEditando(false);
  }

  return (
    <Panel className="space-y-1.5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          <NotebookPen className="h-3 w-3" strokeWidth={2} aria-hidden />
          Notas
        </p>
        <div className="flex items-center gap-2">
          <IndicadorGuardado estado={estado} />
          {!editando && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="flex items-center gap-1 text-[11.5px] font-medium text-muted hover:text-ink"
            >
              <Pencil className="h-3 w-3" strokeWidth={2} aria-hidden />
              Editar
            </button>
          )}
        </div>
      </div>

      {editando ? (
        <textarea
          ref={ref}
          rows={4}
          defaultValue={texto}
          placeholder="Resumen del análisis, alertas, acuerdos con la entidad… (líneas con - son viñetas)"
          onInput={ajustarAlto}
          onBlur={(e) => guardar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") (e.target as HTMLTextAreaElement).blur();
          }}
          className="block max-h-[40vh] w-full resize-none overflow-y-auto rounded-md border border-line bg-surface px-2.5 py-2 text-[12.5px] leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-primary"
        />
      ) : (
        <div
          onDoubleClick={() => setEditando(true)}
          title="Doble clic para editar"
          className="max-h-[40vh] space-y-2 overflow-y-auto text-[12.5px] leading-relaxed text-ink"
        >
          {bloquesDeNotas(texto).map((b, i) =>
            b.tipo === "ul" ? (
              <ul key={i} className="list-disc space-y-0.5 pl-4 marker:text-muted">
                {b.items.map((it, j) => (
                  <li key={j}>{enLinea(it)}</li>
                ))}
              </ul>
            ) : (
              <p key={i}>
                {b.lineas.map((l, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {enLinea(l)}
                  </Fragment>
                ))}
              </p>
            ),
          )}
        </div>
      )}
    </Panel>
  );
}
