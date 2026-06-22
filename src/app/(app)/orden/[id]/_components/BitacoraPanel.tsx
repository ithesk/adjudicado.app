"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Phone,
  Mail,
  StickyNote,
  Package,
  Activity,
  MessageSquarePlus,
  MessageCircle,
  SmilePlus,
  Paperclip,
  FileText,
  X,
  Search,
  type LucideIcon,
} from "lucide-react";
import {
  tiempoRelativo,
  type Bitacora,
  type Persona,
  type TipoBitacora,
} from "@/lib/types";
import { Avatar, Panel, SectionTitle } from "@/components/ui";
import { agregarBitacora } from "../actions";
import { useActividad } from "./Actividad";

const COMPONER: { valor: TipoBitacora; label: string; icon: LucideIcon }[] = [
  { valor: "llamada", label: "Llamada", icon: Phone },
  { valor: "correo", label: "Correo", icon: Mail },
  { valor: "nota", label: "Nota", icon: StickyNote },
  { valor: "suplidor", label: "Suplidor", icon: Package },
];

const META: Record<TipoBitacora, { icon: LucideIcon; label: string; tono: string }> =
  {
    llamada: { icon: Phone, label: "Llamada", tono: "text-primary" },
    correo: { icon: Mail, label: "Correo", tono: "text-ink-soft" },
    nota: { icon: StickyNote, label: "Nota", tono: "text-ink-soft" },
    suplidor: { icon: Package, label: "Suplidor", tono: "text-warn" },
    evento: { icon: Activity, label: "Evento", tono: "text-muted" },
  };

const PLACEHOLDER: Record<string, string> = {
  llamada: "¿Con quién hablaste y qué acordaron?",
  correo: "Asunto y resumen del correo…",
  nota: "Nota interna sobre esta orden…",
  suplidor: "Novedad del suplidor (despacho, atraso, confirmación)…",
};

const REACCIONES = ["👍", "✅", "👀", "❗", "🎉"];

interface Adjunto {
  nombre: string;
}
interface Reaccion {
  emoji: string;
  usuarios: string[];
}
interface Comentario {
  id: string;
  autor: Persona;
  texto: string;
  created_at: string;
}
type Entrada = Bitacora & {
  adjuntos?: Adjunto[];
  reacciones?: Reaccion[];
  comentarios?: Comentario[];
};

function nowISO(offsetMs = 0) {
  return new Date(Date.now() - offsetMs).toISOString();
}

function diaLabel(iso: string): string {
  const d = new Date(iso);
  const norm = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((norm(new Date()) - norm(d)) / 86_400_000);
  if (diff <= 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return new Intl.DateTimeFormat("es-DO", { day: "2-digit", month: "long" }).format(
    d,
  );
}

function sembrar(items: Entrada[]): Entrada[] {
  const i = items.findIndex((b) => b.tipo !== "evento");
  if (i === -1) return items;
  const copia = [...items];
  copia[i] = {
    ...copia[i],
    reacciones: [{ emoji: "👍", usuarios: ["María Reyes"] }],
    comentarios: [
      {
        id: "seed-c1",
        autor: { id: "demo-user-3", nombre: "Luis Domínguez" },
        texto: "Anotado. Yo le doy seguimiento al acta con la institución.",
        created_at: nowISO(3 * 3600_000),
      },
    ],
  };
  return copia;
}

export default function BitacoraPanel({
  ordenId,
  entradas,
  currentUser,
}: {
  ordenId: string;
  entradas: Bitacora[];
  currentUser: Persona;
}) {
  const [items, setItems] = useState<Entrada[]>(() =>
    sembrar(entradas as Entrada[]),
  );
  const { eventos } = useActividad();
  const [tipo, setTipo] = useState<TipoBitacora>("llamada");
  const [texto, setTexto] = useState("");
  const [adjuntos, setAdjuntos] = useState<Adjunto[]>([]);
  const [filtro, setFiltro] = useState<"todo" | TipoBitacora>("todo");
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  function nuevoId(p: string) {
    seq.current += 1;
    return `local-${p}-${Date.now()}-${seq.current}`;
  }

  function scrollAbajo() {
    requestAnimationFrame(() => {
      const el = feedRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // Arranca mostrando lo más reciente (abajo).
  useEffect(() => {
    scrollAbajo();
  }, []);

  function registrar() {
    if (!texto.trim() && adjuntos.length === 0) return;
    const entrada: Entrada = {
      id: nuevoId("e"),
      orden_id: ordenId,
      autor_id: currentUser.id,
      autor: currentUser,
      tipo,
      texto: texto.trim(),
      created_at: nowISO(),
      adjuntos: adjuntos.length ? adjuntos : undefined,
    };
    setItems((prev) => [entrada, ...prev]);
    setTexto("");
    setAdjuntos([]);
    scrollAbajo();
    startTransition(() =>
      agregarBitacora(ordenId, tipo, entrada.texto || "(adjunto)"),
    );
  }

  function toggleReaccion(id: string, emoji: string) {
    setItems((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const reacciones = [...(b.reacciones ?? [])];
        const idx = reacciones.findIndex((r) => r.emoji === emoji);
        const yo = currentUser.nombre;
        if (idx === -1) reacciones.push({ emoji, usuarios: [yo] });
        else {
          const u = reacciones[idx].usuarios;
          reacciones[idx] = u.includes(yo)
            ? { emoji, usuarios: u.filter((x) => x !== yo) }
            : { emoji, usuarios: [...u, yo] };
        }
        return { ...b, reacciones: reacciones.filter((r) => r.usuarios.length) };
      }),
    );
  }

  function comentar(id: string, t: string) {
    if (!t.trim()) return;
    setItems((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              comentarios: [
                ...(b.comentarios ?? []),
                {
                  id: nuevoId("c"),
                  autor: currentUser,
                  texto: t.trim(),
                  created_at: nowISO(),
                },
              ],
            }
          : b,
      ),
    );
  }

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...items, ...(eventos as Entrada[])]
      .filter((b) => {
        if (filtro !== "todo" && b.tipo !== filtro) return false;
        if (!q) return true;
        const enComentarios = (b.comentarios ?? []).some((c) =>
          c.texto.toLowerCase().includes(q),
        );
        return (
          b.texto.toLowerCase().includes(q) ||
          (b.autor?.nombre ?? "").toLowerCase().includes(q) ||
          enComentarios
        );
      })
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
  }, [items, eventos, filtro, query]);

  const manual = items.filter((b) => b.tipo !== "evento").length;
  const totalEventos = items.length - manual + eventos.length;

  return (
    <Panel className="flex flex-col">
      <SectionTitle
        icon={MessageSquarePlus}
        right={
          <span className="font-mono text-xs text-muted">
            {manual} registros · {totalEventos} eventos
          </span>
        }
      >
        Bitácora de coordinación
      </SectionTitle>

      {/* Toolbar: búsqueda + filtros (encabezado del feed) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-3 py-2">
        <label className="relative flex min-w-[11rem] flex-1 items-center">
          <Search
            className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted"
            strokeWidth={2}
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en la bitácora…"
            className="w-full rounded-md border border-line bg-surface py-1.5 pl-8 pr-2 text-[12px] text-ink outline-none placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-[var(--ring)]"
          />
        </label>
        <div className="flex items-center gap-0.5">
          {(["todo", "llamada", "correo", "nota", "evento"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                filtro === f ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {f === "todo"
                ? "Todo"
                : f === "evento"
                  ? "Eventos"
                  : META[f].label + "s"}
            </button>
          ))}
        </div>
      </div>

      {/* Feed cronológico (scrollable) */}
      <div
        ref={feedRef}
        className="max-h-[30rem] min-h-[8rem] flex-1 overflow-y-auto px-4 py-1"
      >
        {visibles.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted">
            {query ? `Nada coincide con “${query}”.` : "Sin actividad todavía."}
          </p>
        ) : (
          <Timeline
            entradas={visibles}
            currentUser={currentUser}
            onReact={toggleReaccion}
            onComment={comentar}
          />
        )}
      </div>

      {/* Composer (fijo abajo, como los grandes) */}
      <div className="border-t border-line p-3">
        <div className="rounded-md border border-line focus-within:border-primary focus-within:ring-2 focus-within:ring-[var(--ring)]">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") registrar();
            }}
            placeholder={PLACEHOLDER[tipo]}
            rows={2}
            className="w-full resize-none rounded-t-md bg-surface px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-muted/70"
          />
          {adjuntos.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2">
              {adjuntos.map((a, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink-soft"
                >
                  <FileText className="h-3 w-3" strokeWidth={2} aria-hidden />
                  {a.nombre}
                  <button
                    type="button"
                    onClick={() => setAdjuntos((p) => p.filter((_, j) => j !== i))}
                    className="text-muted hover:text-danger"
                    aria-label="Quitar adjunto"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-0.5">
              {COMPONER.map((t) => {
                const Icon = t.icon;
                const activo = tipo === t.valor;
                return (
                  <button
                    key={t.valor}
                    type="button"
                    onClick={() => setTipo(t.valor)}
                    aria-pressed={activo}
                    className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors ${
                      activo ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
                    }`}
                  >
                    <Icon
                      className={`h-3.5 w-3.5 ${activo ? META[t.valor].tono : ""}`}
                      strokeWidth={2}
                      aria-hidden
                    />
                    {t.label}
                  </button>
                );
              })}
              <span className="mx-1 h-4 w-px bg-line" />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-ink"
                title="Adjuntar documento"
              >
                <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Adjuntar
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  const fs = Array.from(e.target.files ?? []).map((f) => ({
                    nombre: f.name,
                  }));
                  setAdjuntos((p) => [...p, ...fs]);
                  e.target.value = "";
                }}
              />
            </div>
            <button
              type="button"
              onClick={registrar}
              disabled={!texto.trim() && adjuntos.length === 0}
              className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink transition-colors hover:bg-primary-hover disabled:opacity-45"
              title="Cmd/Ctrl + Enter"
            >
              Registrar
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

function Timeline({
  entradas,
  currentUser,
  onReact,
  onComment,
}: {
  entradas: Entrada[];
  currentUser: Persona;
  onReact: (id: string, emoji: string) => void;
  onComment: (id: string, texto: string) => void;
}) {
  let ultimoDia = "";
  return (
    <ol>
      {entradas.map((b) => {
        const dia = diaLabel(b.created_at);
        const nuevoDia = dia !== ultimoDia;
        ultimoDia = dia;
        return (
          <li key={b.id}>
            {nuevoDia && (
              <p className="px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {dia}
              </p>
            )}
            {b.tipo === "evento" ? (
              <Evento b={b} />
            ) : (
              <Registro
                b={b}
                currentUser={currentUser}
                onReact={onReact}
                onComment={onComment}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Registro({
  b,
  currentUser,
  onReact,
  onComment,
}: {
  b: Entrada;
  currentUser: Persona;
  onReact: (id: string, emoji: string) => void;
  onComment: (id: string, texto: string) => void;
}) {
  const m = META[b.tipo];
  const Icon = m.icon;
  const [picker, setPicker] = useState(false);
  const [abrir, setAbrir] = useState(false);
  const [reply, setReply] = useState("");
  const comentarios = b.comentarios ?? [];

  return (
    <div className="group flex gap-3 py-2.5">
      <Avatar nombre={b.autor?.nombre} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-medium text-ink">
            {b.autor?.nombre ?? (b.tipo === "evento" ? "Sistema" : "Miembro del equipo")}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <Icon className={`h-3 w-3 ${m.tono}`} strokeWidth={2} aria-hidden />
            {m.label}
          </span>
          <time className="ml-auto shrink-0 text-[11px] text-muted">
            {tiempoRelativo(b.created_at)}
          </time>
        </div>

        {b.texto && (
          <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
            {b.texto}
          </p>
        )}

        {b.adjuntos && b.adjuntos.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {b.adjuntos.map((a, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink-soft"
              >
                <FileText className="h-3.5 w-3.5 text-muted" strokeWidth={2} aria-hidden />
                {a.nombre}
              </span>
            ))}
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {(b.reacciones ?? []).map((r) => {
            const mio = r.usuarios.includes(currentUser.nombre);
            return (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onReact(b.id, r.emoji)}
                title={r.usuarios.join(", ")}
                className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] transition-colors ${
                  mio
                    ? "border-primary/40 bg-primary/10 text-ink"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                <span>{r.emoji}</span>
                {r.usuarios.length}
              </button>
            );
          })}

          <div className="relative">
            <button
              type="button"
              onClick={() => setPicker((v) => !v)}
              className="inline-flex h-5 w-6 items-center justify-center rounded-full border border-line text-muted opacity-0 transition-colors hover:text-ink group-hover:opacity-100 focus:opacity-100"
              aria-label="Reaccionar"
            >
              <SmilePlus className="h-3 w-3" strokeWidth={2} aria-hidden />
            </button>
            {picker && (
              <div className="absolute z-20 mt-1 flex gap-0.5 rounded-md border border-line bg-surface p-1 shadow-raised">
                {REACCIONES.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      onReact(b.id, e);
                      setPicker(false);
                    }}
                    className="rounded px-1 text-base leading-none transition-transform hover:scale-125"
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAbrir((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-ink"
          >
            <MessageCircle className="h-3 w-3" strokeWidth={2} aria-hidden />
            {comentarios.length > 0 ? `${comentarios.length} comentarios` : "Comentar"}
          </button>
        </div>

        {(abrir || comentarios.length > 0) && (
          <div className="mt-2 space-y-2 border-l border-line pl-3">
            {comentarios.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Avatar nombre={c.autor.nombre} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[12px] font-medium text-ink">
                      {c.autor.nombre}
                    </span>
                    <time className="text-[10px] text-muted">
                      {tiempoRelativo(c.created_at)}
                    </time>
                  </div>
                  <p className="text-[12px] text-ink-soft">{c.texto}</p>
                </div>
              </div>
            ))}
            {abrir && (
              <div className="flex items-center gap-2">
                <Avatar nombre={currentUser.nombre} size={20} />
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onComment(b.id, reply);
                      setReply("");
                    }
                  }}
                  placeholder="Responder…"
                  className="flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink outline-none focus:border-primary"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Evento({ b }: { b: Entrada }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 pl-1 text-[12px] text-muted">
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-2">
        <Activity className="h-3 w-3" strokeWidth={2} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="font-medium text-ink-soft">
          {b.autor?.nombre ?? "Sistema"}
        </span>{" "}
        {b.texto.charAt(0).toLowerCase() + b.texto.slice(1)}
      </span>
      <time className="shrink-0 text-[11px]">{tiempoRelativo(b.created_at)}</time>
    </div>
  );
}
