"use client";

// El editor del constructor: el documento a la izquierda con los huecos
// resaltados como zonas de soltar; las variables como fichas arrastrables a
// la derecha. Arrastrar (o clic en hueco + clic en ficha) crea la
// asignación. Vista previa en PDF con datos de ejemplo. Autosave.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Eye, Loader2, Rocket, X } from "lucide-react";
import { Panel, SectionTitle, btnGhost, btnPrimary } from "@/components/ui";
import {
  guardarAsignacionesAction,
  publicarPlantillaAction,
} from "@/lib/actions/plantillas";
import type { LicPlantilla } from "@/lib/licitaciones/queries-plantillas";
import type { Hueco, ParrafoAnalizado } from "@/lib/licitaciones/plantillas";
import {
  GRUPO_VARIABLE_LABEL,
  VARIABLES_PLANTILLA,
  variablePorClave,
  type Asignacion,
  type GrupoVariable,
} from "@/lib/licitaciones/variables";

type Analisis = { parrafos: ParrafoAnalizado[]; huecos: Hueco[] };

export default function Editor({ plantilla }: { plantilla: LicPlantilla }) {
  const router = useRouter();
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>(plantilla.asignaciones);
  const [huecoElegido, setHuecoElegido] = useState<Hueco | null>(null);
  const [guardado, setGuardado] = useState<"idle" | "guardando" | "ok">("idle");
  const [pendiente, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cargar el análisis (párrafos + huecos) del documento original.
  useEffect(() => {
    fetch(`/api/plantillas/${plantilla.id}/analizar`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "No se pudo analizar");
        setAnalisis(await r.json());
      })
      .catch((e) => setError(e.message));
  }, [plantilla.id]);

  // Autosave con debounce.
  const autosave = useCallback(
    (nuevas: Asignacion[]) => {
      setAsignaciones(nuevas);
      setGuardado("guardando");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(async () => {
        const err = await guardarAsignacionesAction(plantilla.id, nuevas);
        setGuardado(err ? "idle" : "ok");
        if (err) setError(err);
        else setTimeout(() => setGuardado("idle"), 1500);
      }, 600);
    },
    [plantilla.id],
  );

  function asignar(hueco: Hueco, variable: string) {
    // Un hueco, una variable (reemplaza si ya tenía).
    const sinEste = asignaciones.filter(
      (a) => !(a.parrafo === hueco.parrafo && a.inicio === hueco.inicio),
    );
    autosave([...sinEste, { parrafo: hueco.parrafo, inicio: hueco.inicio, fin: hueco.fin, variable }]);
    setHuecoElegido(null);
  }

  function quitar(a: Asignacion) {
    autosave(
      asignaciones.filter(
        (x) => !(x.parrafo === a.parrafo && x.inicio === a.inicio && x.variable === a.variable),
      ),
    );
  }

  function vistaPrevia() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/plantillas/${plantilla.id}/vista-previa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asignaciones }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? "No se pudo generar la vista previa.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  }

  function publicar() {
    setError(null);
    startTransition(async () => {
      const err = await publicarPlantillaAction(plantilla.id);
      if (err) setError(err);
      router.refresh();
    });
  }

  const asignacionDe = (h: Hueco) =>
    asignaciones.find((a) => a.parrafo === h.parrafo && a.inicio === h.inicio);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/configuracion/plantillas" className={btnGhost("!px-2 !py-1 !text-[12.5px]")}>
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Plantillas
        </Link>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-ink">{plantilla.nombre}</p>
          <p className="font-mono text-[11px] text-muted">
            {plantilla.codigo} · {plantilla.estado === "lista" ? "lista" : "borrador"}
          </p>
        </div>
        <span className="ml-auto flex items-center gap-2">
          {guardado === "guardando" && (
            <span className="flex items-center gap-1 text-[11.5px] text-muted">
              <Loader2 className="h-3 w-3 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
              Guardando…
            </span>
          )}
          {guardado === "ok" && (
            <span className="flex items-center gap-1 text-[11.5px] text-ok">
              <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden /> Guardado
            </span>
          )}
          <button type="button" onClick={vistaPrevia} disabled={pendiente} className={btnGhost("!px-2.5 !py-1.5 !text-[12.5px]")}>
            <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {pendiente ? "Generando…" : "Vista previa"}
          </button>
          <button
            type="button"
            onClick={publicar}
            disabled={pendiente || asignaciones.length === 0}
            className={btnPrimary("!px-2.5 !py-1.5 !text-[12.5px]")}
            title={asignaciones.length === 0 ? "Asigna al menos una variable" : "La plantilla queda lista para usarse en la generación"}
          >
            <Rocket className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Guardar y publicar
          </button>
        </span>
      </div>

      {error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_290px]">
        {/* El documento con sus huecos */}
        <Panel className="max-h-[70vh] overflow-y-auto p-4">
          {!analisis && !error && (
            <p className="flex items-center gap-2 py-8 text-sm text-muted">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
              Analizando el documento…
            </p>
          )}
          {analisis?.parrafos
            .filter((p) => p.texto.trim())
            .map((p) => (
              <Parrafo
                key={p.indice}
                parrafo={p}
                huecos={analisis.huecos.filter((h) => h.parrafo === p.indice)}
                asignacionDe={asignacionDe}
                huecoElegido={huecoElegido}
                onElegir={setHuecoElegido}
                onSoltar={asignar}
                onQuitar={quitar}
              />
            ))}
          {analisis && analisis.huecos.length === 0 && (
            <p className="mt-4 rounded bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
              No se detectaron huecos (subrayados, [instrucciones], líneas de
              puntos). También puedes escribir los tags directo en Word:{" "}
              <code className="font-mono">{"{empresa_nombre}"}</code>…
            </p>
          )}
        </Panel>

        {/* Las fichas de variables */}
        <Panel className="max-h-[70vh] self-start overflow-y-auto">
          <SectionTitle icon={Rocket}>Variables</SectionTitle>
          <div className="space-y-3 p-3">
            <p className="text-[11.5px] text-muted">
              Arrastra una ficha al hueco resaltado — o haz clic en el hueco y
              luego en la ficha.
            </p>
            {(Object.keys(GRUPO_VARIABLE_LABEL) as GrupoVariable[]).map((g) => (
              <div key={g}>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                  {GRUPO_VARIABLE_LABEL[g]}
                </p>
                <div className="flex flex-wrap gap-1">
                  {VARIABLES_PLANTILLA.filter((v) => v.grupo === g).map((v) => (
                    <button
                      key={v.clave}
                      type="button"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("variable", v.clave)}
                      onClick={() => huecoElegido && asignar(huecoElegido, v.clave)}
                      title={`Ejemplo: ${v.ejemplo}${huecoElegido ? " — clic para asignar al hueco elegido" : ""}`}
                      className={`cursor-grab rounded-full border px-2 py-0.5 text-[11.5px] transition-colors active:cursor-grabbing ${
                        huecoElegido
                          ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
                          : "border-line text-ink-soft hover:border-line-strong"
                      }`}
                    >
                      {v.etiqueta}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {huecoElegido && (
              <p className="rounded bg-primary/10 px-2 py-1.5 text-[11.5px] text-primary">
                Hueco elegido: «{huecoElegido.texto.slice(0, 30)}…» — haz clic
                en una variable para asignarla.
              </p>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// Un párrafo: texto plano + huecos (zonas de soltar) + asignaciones (chips).
function Parrafo({
  parrafo,
  huecos,
  asignacionDe,
  huecoElegido,
  onElegir,
  onSoltar,
  onQuitar,
}: {
  parrafo: ParrafoAnalizado;
  huecos: Hueco[];
  asignacionDe: (h: Hueco) => Asignacion | undefined;
  huecoElegido: Hueco | null;
  onElegir: (h: Hueco | null) => void;
  onSoltar: (h: Hueco, variable: string) => void;
  onQuitar: (a: Asignacion) => void;
}) {
  const segmentos: React.ReactNode[] = [];
  let pos = 0;
  for (const h of huecos) {
    if (h.inicio > pos) {
      segmentos.push(<span key={`t${pos}`}>{parrafo.texto.slice(pos, h.inicio)}</span>);
    }
    const asig = asignacionDe(h);
    const elegido = huecoElegido?.parrafo === h.parrafo && huecoElegido?.inicio === h.inicio;
    segmentos.push(
      asig ? (
        <span
          key={`h${h.inicio}`}
          className="mx-0.5 inline-flex items-center gap-1 rounded bg-ok-soft px-1.5 py-0.5 text-[11.5px] font-medium text-ok"
        >
          {variablePorClave(asig.variable)?.etiqueta ?? asig.variable}
          <button
            type="button"
            onClick={() => onQuitar(asig)}
            className="opacity-60 hover:opacity-100"
            aria-label="Quitar asignación"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </span>
      ) : (
        <span
          key={`h${h.inicio}`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const v = e.dataTransfer.getData("variable");
            if (v) onSoltar(h, v);
          }}
          onClick={() => onElegir(elegido ? null : h)}
          title="Suelta una variable aquí (o haz clic y elige una ficha)"
          className={`mx-0.5 inline-block max-w-64 cursor-pointer truncate rounded border border-dashed px-1.5 py-0.5 align-bottom text-[11.5px] transition-colors ${
            elegido
              ? "border-primary bg-primary/15 text-primary"
              : "border-warn bg-warn-soft text-warn hover:bg-warn-soft/70"
          }`}
        >
          {h.texto.length > 34 ? `${h.texto.slice(0, 34)}…` : h.texto}
        </span>
      ),
    );
    pos = h.fin;
  }
  if (pos < parrafo.texto.length) {
    segmentos.push(<span key={`t${pos}`}>{parrafo.texto.slice(pos)}</span>);
  }

  return (
    <p className="mb-2 text-[13px] leading-relaxed text-ink" data-parrafo={parrafo.indice}>
      {segmentos}
    </p>
  );
}
