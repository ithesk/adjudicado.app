"use client";

import { coincideTexto } from "@/lib/buscar-texto";
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
  Pencil,
  Trash2,
  Square,
  CheckSquare,
  type LucideIcon,
} from "lucide-react";
import {
  inferirTipoBitacora,
  tipoPorArchivo,
  tiempoRelativo,
  type Bitacora,
  type Persona,
  type TipoBitacora,
} from "@/lib/types";
import { Avatar, Panel, SectionTitle } from "@/components/ui";
import type { Adjunto } from "@/lib/types";
import { avisoError } from "@/lib/avisos";
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import VisorDocumento from "@/components/VisorDocumento";
import {
  agregarBitacora,
  agregarComentario,
  alternarReaccion,
  adjuntarDocumentoBitacora,
  editarBitacora,
  eliminarBitacora,
} from "../actions";
import { useActividad } from "./Actividad";

// Solo las entradas que ya viven en la base (UUID) se pueden reaccionar/comentar
// de forma persistente; las locales (recién creadas en la sesión) son optimistas.
const esUUID = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

// ---------- Texto rico estilo Notion (markdown ligero + @menciones) ----------

const plegar = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

// ¿"@Nombre" corresponde a un miembro real? (insensible a acentos/mayúsculas)
function esMencion(candidato: string, nombres: string[]): boolean {
  const c = plegar(candidato);
  return nombres.some((n) => plegar(n).startsWith(c) || c.startsWith(plegar(n)));
}

// Formato en línea: **negrita**, *cursiva*, @Mención.
function renderInline(texto: string, nombres: string[], keyBase: string) {
  const out: React.ReactNode[] = [];
  const re =
    /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|@[\p{L}][\p{L}.'-]*(?: [\p{L}][\p{L}.'-]*)?)/gu;
  let cursor = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(texto))) {
    if (m.index > cursor) out.push(texto.slice(cursor, m.index));
    const t = m[0];
    if (t.startsWith("**")) {
      out.push(
        <strong key={`${keyBase}-${k++}`} className="font-semibold text-ink">
          {t.slice(2, -2)}
        </strong>,
      );
    } else if (t.startsWith("*")) {
      out.push(<em key={`${keyBase}-${k++}`}>{t.slice(1, -1)}</em>);
    } else if (esMencion(t.slice(1), nombres)) {
      out.push(
        <span
          key={`${keyBase}-${k++}`}
          className="rounded bg-primary/10 px-1 py-px font-medium text-primary"
        >
          {t}
        </span>,
      );
    } else {
      out.push(t);
    }
    cursor = m.index + t.length;
  }
  if (cursor < texto.length) out.push(texto.slice(cursor));
  return out;
}

// Render por líneas: checklists (- [ ] / - [x]), viñetas (- / *), párrafos.
function TextoRico({ texto, nombres }: { texto: string; nombres: string[] }) {
  const lineas = texto.split("\n");
  return (
    <div className="mt-0.5 space-y-0.5 text-[13px] leading-relaxed text-ink-soft">
      {lineas.map((linea, i) => {
        const check = linea.match(/^\s*[-*]\s*\[([ xX])\]\s?(.*)$/);
        if (check) {
          const hecho = check[1].toLowerCase() === "x";
          return (
            <div key={i} className="flex items-start gap-1.5">
              {hecho ? (
                <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2} aria-hidden />
              ) : (
                <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={2} aria-hidden />
              )}
              <span className={hecho ? "text-muted line-through" : ""}>
                {renderInline(check[2], nombres, `l${i}`)}
              </span>
            </div>
          );
        }
        const vineta = linea.match(/^\s*[-*]\s+(.*)$/);
        if (vineta) {
          return (
            <div key={i} className="flex items-start gap-1.5 pl-0.5">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted" aria-hidden />
              <span>{renderInline(vineta[1], nombres, `l${i}`)}</span>
            </div>
          );
        }
        if (!linea.trim()) return <div key={i} className="h-1.5" />;
        return <p key={i}>{renderInline(linea, nombres, `l${i}`)}</p>;
      })}
    </div>
  );
}

const META: Record<TipoBitacora, { icon: LucideIcon; label: string; tono: string }> =
  {
    llamada: { icon: Phone, label: "Llamada", tono: "text-primary" },
    correo: { icon: Mail, label: "Correo", tono: "text-ink-soft" },
    nota: { icon: StickyNote, label: "Nota", tono: "text-ink-soft" },
    suplidor: { icon: Package, label: "Suplidor", tono: "text-warn" },
    evento: { icon: Activity, label: "Evento", tono: "text-muted" },
  };

const REACCIONES = ["👍", "✅", "👀", "❗", "🎉"];

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

// Datos de ejemplo (reacción + comentario) SOLO para el demo, para mostrar
// cómo lucen las reacciones y comentarios. En producción no se inyecta nada.
function sembrar(items: Entrada[]): Entrada[] {
  if (!isDemo()) return items;
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
  personas,
}: {
  ordenId: string;
  entradas: Bitacora[];
  currentUser: Persona;
  personas: Persona[];
}) {
  const [items, setItems] = useState<Entrada[]>(() =>
    sembrar(entradas as Entrada[]),
  );
  const { eventos } = useActividad();
  const [texto, setTexto] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [filtro, setFiltro] = useState<"todo" | TipoBitacora>("todo");
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const seq = useRef(0);

  // ---- @Menciones en el composer ----
  const [menc, setMenc] = useState<{ q: string; desde: number } | null>(null);
  const [mencIdx, setMencIdx] = useState(0);
  const nombres = personas.map((p) => p.nombre);

  const candidatos = menc
    ? personas
        .filter((p) => plegar(p.nombre).includes(plegar(menc.q)))
        .slice(0, 5)
    : [];

  // Detecta "@algo" justo antes del cursor para abrir el autocompletar.
  function detectarMencion(valor: string, caret: number) {
    const antes = valor.slice(0, caret);
    const m = antes.match(/(?:^|[\s(])@([\p{L}]{0,24}(?: [\p{L}]{0,24})?)$/u);
    if (m) {
      setMenc({ q: m[1], desde: caret - m[1].length - 1 });
      setMencIdx(0);
    } else {
      setMenc(null);
    }
  }

  function insertarMencion(p: Persona) {
    if (!menc) return;
    const el = composerRef.current;
    const caret = el?.selectionStart ?? texto.length;
    const nuevo =
      texto.slice(0, menc.desde) + "@" + p.nombre + " " + texto.slice(caret);
    setTexto(nuevo);
    setMenc(null);
    requestAnimationFrame(() => {
      el?.focus();
      const pos = menc.desde + p.nombre.length + 2;
      el?.setSelectionRange(pos, pos);
    });
  }

  // Sube archivos arrastrados/elegidos: cada uno se guarda como documento de la
  // orden y crea su propia entrada en la bitácora (optimista + persistente).
  async function adjuntar(files: File[]) {
    for (const file of files) {
      const id = nuevoId("adj");
      setItems((prev) => [
        {
          id,
          orden_id: ordenId,
          autor_id: currentUser.id,
          autor: currentUser,
          tipo: tipoPorArchivo(file.name),
          texto: file.name,
          created_at: nowISO(),
          adjuntos: [{ nombre: file.name }],
        } as Entrada,
        ...prev,
      ]);
      scrollAbajo();
      const fd = new FormData();
      fd.append("archivo", file);
      let res: { path: string; nombre: string } | null = null;
      try {
        res = await adjuntarDocumentoBitacora(ordenId, null, fd);
      } catch {
        res = null;
      }
      if (res?.path) {
        const listo = res;
        setItems((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  adjuntos: [{ nombre: listo.nombre, bucket: "documentos", path: listo.path }],
                }
              : b,
          ),
        );
      } else if (!isDemo()) {
        // La entrada no puede quedarse «subiendo…» para siempre: la quitamos.
        setItems((prev) => prev.filter((b) => b.id !== id));
        avisoError(`No se pudo subir ${file.name} — inténtalo de nuevo.`);
      }
    }
  }

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

  // Tiempo real: notas/eventos y comentarios de OTROS usuarios aparecen sin
  // recargar (Supabase Realtime; respeta la RLS por organización).
  const personasRef = useRef(personas);
  personasRef.current = personas;
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  useEffect(() => {
    if (isDemo()) return;
    const supabase = (() => {
      try {
        return createClient();
      } catch {
        return null; // sin realtime, la app sigue funcionando (se ve al recargar)
      }
    })();
    if (!supabase) return;
    const resolver = (autorId: string | null): Persona => {
      if (autorId && autorId === currentUserRef.current.id) return currentUserRef.current;
      return (
        (autorId ? personasRef.current.find((p) => p.id === autorId) : null) ?? {
          id: autorId ?? "",
          nombre: "Miembro del equipo",
        }
      );
    };

    const canal = supabase
      .channel(`bitacora-${ordenId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bitacora", filter: `orden_id=eq.${ordenId}` },
        (payload) => {
          const r = payload.new as Bitacora;
          if (r.item_id) return; // las de ítem no van al feed general
          setItems((prev) => {
            if (prev.some((b) => b.id === r.id)) return prev;
            const nueva: Entrada = { ...r, autor: resolver(r.autor_id) };
            // Eco de mi propia entrada optimista: la reemplazo (id local → real).
            const i = prev.findIndex(
              (b) =>
                b.id.startsWith("local-") &&
                b.autor_id === r.autor_id &&
                b.texto === r.texto &&
                b.tipo === r.tipo,
            );
            if (i >= 0) {
              const c = [...prev];
              c[i] = { ...c[i], ...nueva };
              return c;
            }
            return [nueva, ...prev];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bitacora_comentario" },
        (payload) => {
          const c = payload.new as {
            id: string;
            bitacora_id: string;
            autor_id: string | null;
            texto: string;
            created_at: string;
          };
          setItems((prev) => {
            if (!prev.some((b) => b.id === c.bitacora_id)) return prev;
            return prev.map((b) => {
              if (b.id !== c.bitacora_id) return b;
              if ((b.comentarios ?? []).some((x) => x.id === c.id)) return b;
              const nuevoC = {
                id: c.id,
                autor: resolver(c.autor_id),
                texto: c.texto,
                created_at: c.created_at,
              };
              const lista = [...(b.comentarios ?? [])];
              const i = lista.findIndex(
                (x) =>
                  x.id.startsWith("local-") &&
                  x.texto === c.texto &&
                  x.autor.id === c.autor_id,
              );
              if (i >= 0) lista[i] = nuevoC;
              else lista.push(nuevoC);
              return { ...b, comentarios: lista };
            });
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [ordenId]);

  function registrar() {
    if (!texto.trim()) return;
    const t = inferirTipoBitacora(texto);
    const entrada: Entrada = {
      id: nuevoId("e"),
      orden_id: ordenId,
      autor_id: currentUser.id,
      autor: currentUser,
      tipo: t,
      texto: texto.trim(),
      created_at: nowISO(),
    };
    setItems((prev) => [entrada, ...prev]);
    setTexto("");
    scrollAbajo();
    startTransition(async () => {
      // Si el guardado falla, quitamos la entrada optimista, recuperamos el
      // texto en el composer (si sigue vacío) y avisamos.
      const deshacer = (msg: string) => {
        setItems((prev) => prev.filter((b) => b.id !== entrada.id));
        setTexto((v) => v || entrada.texto);
        avisoError(msg);
      };
      try {
        const err = await agregarBitacora(ordenId, t, entrada.texto);
        if (err) deshacer(err);
      } catch {
        deshacer("No se pudo guardar la entrada.");
      }
    });
  }

  // Aplica el toggle de reacción en local; llamarla otra vez lo revierte.
  function aplicarReaccion(id: string, emoji: string) {
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

  function toggleReaccion(id: string, emoji: string) {
    aplicarReaccion(id, emoji);
    if (!esUUID(id)) return;
    startTransition(async () => {
      // Si falla, volvemos a alternar (queda como estaba) y avisamos.
      try {
        const err = await alternarReaccion(ordenId, id, emoji);
        if (err) {
          aplicarReaccion(id, emoji);
          avisoError(err);
        }
      } catch {
        aplicarReaccion(id, emoji);
        avisoError("No se pudo guardar la reacción.");
      }
    });
  }

  function comentar(id: string, t: string) {
    const limpio = t.trim();
    if (!limpio) return;
    const cid = nuevoId("c");
    setItems((prev) =>
      prev.map((b) =>
        b.id === id
          ? {
              ...b,
              comentarios: [
                ...(b.comentarios ?? []),
                {
                  id: cid,
                  autor: currentUser,
                  texto: limpio,
                  created_at: nowISO(),
                },
              ],
            }
          : b,
      ),
    );
    if (!esUUID(id)) return;
    startTransition(async () => {
      // Si el guardado falla, quitamos la respuesta optimista y avisamos.
      const deshacer = (msg: string) => {
        setItems((prev) =>
          prev.map((b) =>
            b.id === id
              ? {
                  ...b,
                  comentarios: (b.comentarios ?? []).filter((c) => c.id !== cid),
                }
              : b,
          ),
        );
        avisoError(msg);
      };
      try {
        const err = await agregarComentario(ordenId, id, limpio);
        if (err) deshacer(err);
      } catch {
        deshacer("No se pudo guardar la respuesta.");
      }
    });
  }

  // Editar una entrada propia (estilo Notion): local + persistente.
  function editarEntrada(id: string, nuevoTexto: string) {
    const limpio = nuevoTexto.trim();
    if (!limpio) return;
    const anterior = items.find((b) => b.id === id);
    setItems((prev) =>
      prev.map((b) => (b.id === id ? { ...b, texto: limpio, editada: true } : b)),
    );
    if (!esUUID(id)) return;
    startTransition(async () => {
      // Si el guardado falla, restauramos el texto anterior y avisamos.
      const restaurar = (msg: string) => {
        if (anterior) {
          setItems((prev) =>
            prev.map((b) =>
              b.id === id
                ? { ...b, texto: anterior.texto, editada: anterior.editada }
                : b,
            ),
          );
        }
        avisoError(msg);
      };
      try {
        const err = await editarBitacora(ordenId, id, limpio);
        if (err) restaurar(err);
      } catch {
        restaurar("No se pudo guardar la edición.");
      }
    });
  }

  // Eliminar una entrada propia.
  function borrarEntrada(id: string) {
    const entrada = items.find((b) => b.id === id);
    setItems((prev) => prev.filter((b) => b.id !== id));
    if (!esUUID(id)) return;
    startTransition(async () => {
      // Si el borrado falla, la entrada vuelve al feed (se reordena por fecha).
      const restaurar = (msg: string) => {
        if (entrada) setItems((prev) => [entrada, ...prev]);
        avisoError(msg);
      };
      try {
        const err = await eliminarBitacora(ordenId, id);
        if (err) restaurar(err);
      } catch {
        restaurar("No se pudo eliminar la entrada.");
      }
    });
  }

  const visibles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...items, ...(eventos as Entrada[])]
      .filter((b) => {
        if (filtro !== "todo" && b.tipo !== filtro) return false;
        if (!q) return true;
        const enComentarios = (b.comentarios ?? []).some((c) =>
          coincideTexto(c.texto, q),
        );
        return (
          coincideTexto(`${b.texto} ${b.autor?.nombre ?? ""}`, q) ||
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
    <div
      className="relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) adjuntar(files);
      }}
    >
      {dragActive && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5">
          <span className="rounded-md bg-surface px-3 py-1.5 text-[13px] font-medium text-primary shadow-card">
            Suelta para adjuntar a la bitácora
          </span>
        </div>
      )}
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
        <div className="flex flex-wrap items-center gap-0.5">
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
            nombres={nombres}
            onReact={toggleReaccion}
            onComment={comentar}
            onEdit={editarEntrada}
            onDelete={borrarEntrada}
          />
        )}
      </div>

      {/* Composer (fijo abajo, como los grandes) */}
      <div className="border-t border-line p-3">
        <div className="rounded-md border border-line focus-within:border-primary focus-within:ring-2 focus-within:ring-[var(--ring)]">
          <div className="relative">
            {menc && candidatos.length > 0 && (
              <div className="absolute bottom-full left-3 z-30 mb-1 w-60 rounded-md border border-line bg-surface p-1 shadow-raised">
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted">
                  Mencionar
                </p>
                {candidatos.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onMouseEnter={() => setMencIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault(); // no perder el foco del textarea
                      insertarMencion(p);
                    }}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-ink transition-colors ${
                      i === mencIdx ? "bg-surface-2" : "hover:bg-surface-2"
                    }`}
                  >
                    <Avatar nombre={p.nombre} size={20} />
                    <span className="truncate">{p.nombre}</span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={composerRef}
              value={texto}
              onChange={(e) => {
                setTexto(e.target.value);
                detectarMencion(e.target.value, e.target.selectionStart ?? 0);
              }}
              onKeyDown={(e) => {
                if (menc && candidatos.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setMencIdx((i) => (i + 1) % candidatos.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setMencIdx((i) => (i - 1 + candidatos.length) % candidatos.length);
                    return;
                  }
                  if (e.key === "Enter" || e.key === "Tab") {
                    e.preventDefault();
                    insertarMencion(candidatos[mencIdx]);
                    return;
                  }
                  if (e.key === "Escape") {
                    setMenc(null);
                    return;
                  }
                }
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") registrar();
              }}
              placeholder="Escribe lo que pasó… @menciona, **negrita**, - [ ] pendiente"
              rows={2}
              className="w-full resize-none rounded-t-md bg-surface px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-muted/70"
            />
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {(() => {
                const det = META[inferirTipoBitacora(texto)];
                const DetIcon = det.icon;
                return (
                  <span
                    className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-muted"
                    title="Tipo detectado automáticamente"
                  >
                    <DetIcon className={`h-3.5 w-3.5 ${det.tono}`} strokeWidth={2} aria-hidden />
                    {texto.trim() ? det.label : "Detección automática"}
                  </span>
                );
              })()}
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
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) adjuntar(files);
                  e.target.value = "";
                }}
              />
            </div>
            <button
              type="button"
              onClick={registrar}
              disabled={!texto.trim()}
              className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-ink transition-colors hover:bg-primary-hover disabled:opacity-45"
              title="Cmd/Ctrl + Enter"
            >
              Registrar
            </button>
          </div>
        </div>
      </div>
      </Panel>
    </div>
  );
}

function Timeline({
  entradas,
  currentUser,
  nombres,
  onReact,
  onComment,
  onEdit,
  onDelete,
}: {
  entradas: Entrada[];
  currentUser: Persona;
  nombres: string[];
  onReact: (id: string, emoji: string) => void;
  onComment: (id: string, texto: string) => void;
  onEdit: (id: string, texto: string) => void;
  onDelete: (id: string) => void;
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
                nombres={nombres}
                onReact={onReact}
                onComment={onComment}
                onEdit={onEdit}
                onDelete={onDelete}
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
  nombres,
  onReact,
  onComment,
  onEdit,
  onDelete,
}: {
  b: Entrada;
  currentUser: Persona;
  nombres: string[];
  onReact: (id: string, emoji: string) => void;
  onComment: (id: string, texto: string) => void;
  onEdit: (id: string, texto: string) => void;
  onDelete: (id: string) => void;
}) {
  const m = META[b.tipo];
  const Icon = m.icon;
  const [picker, setPicker] = useState(false);
  const [abrir, setAbrir] = useState(false);
  const [reply, setReply] = useState("");
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(b.texto);
  const comentarios = b.comentarios ?? [];
  const esMia = b.autor_id === currentUser.id;

  function guardarEdicion() {
    if (borrador.trim() && borrador.trim() !== b.texto) {
      onEdit(b.id, borrador);
    }
    setEditando(false);
  }

  return (
    <div className="group flex gap-3 py-2.5">
      <Avatar nombre={b.autor?.nombre} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[13px] font-medium text-ink">
            {b.autor?.nombre ?? (b.tipo === "evento" ? "Sistema" : "Miembro del equipo")}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted">
            <Icon className={`h-3 w-3 ${m.tono}`} strokeWidth={2} aria-hidden />
            {m.label}
          </span>
          {b.itemNombre && (
            <span
              className="inline-flex max-w-[12rem] items-center gap-1 truncate rounded bg-surface-2 px-1.5 py-px text-[10px] font-medium text-muted"
              title={b.itemNombre}
            >
              <Package className="h-2.5 w-2.5 shrink-0" strokeWidth={2} aria-hidden />
              {b.itemNombre}
            </span>
          )}
          {b.editada && (
            <span className="text-[10px] italic text-muted">(editada)</span>
          )}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {esMia && !editando && (
              <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                <button
                  type="button"
                  onClick={() => {
                    setBorrador(b.texto);
                    setEditando(true);
                  }}
                  aria-label="Editar entrada"
                  title="Editar"
                  className="grid h-5 w-5 place-items-center rounded text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <Pencil className="h-3 w-3" strokeWidth={2} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("¿Eliminar esta entrada? No se puede deshacer."))
                      onDelete(b.id);
                  }}
                  aria-label="Eliminar entrada"
                  title="Eliminar"
                  className="grid h-5 w-5 place-items-center rounded text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={2} aria-hidden />
                </button>
              </span>
            )}
            <time className="text-[11px] text-muted">
              {tiempoRelativo(b.created_at)}
            </time>
          </span>
        </div>

        {editando ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") guardarEdicion();
                if (e.key === "Escape") setEditando(false);
              }}
              rows={Math.min(6, Math.max(2, borrador.split("\n").length))}
              autoFocus
              className="w-full resize-none rounded-md border border-primary bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={guardarEdicion}
                className="rounded-md bg-primary px-2.5 py-1 text-[12px] font-medium text-primary-ink transition-colors hover:bg-primary-hover"
              >
                Guardar
              </button>
              <button
                type="button"
                onClick={() => setEditando(false)}
                className="rounded-md px-2 py-1 text-[12px] text-muted transition-colors hover:text-ink"
              >
                Cancelar
              </button>
              <span className="text-[10px] text-muted">Esc cancela · ⌘↵ guarda</span>
            </div>
          </div>
        ) : (
          b.texto && <TextoRico texto={b.texto} nombres={nombres} />
        )}

        {b.adjuntos && b.adjuntos.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {b.adjuntos.map((a, i) =>
              a.bucket && a.path ? (
                <VisorDocumento
                  key={i}
                  bucket={a.bucket}
                  path={a.path}
                  nombre={a.nombre}
                  label={a.nombre}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                />
              ) : (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-[12px] text-muted"
                >
                  <FileText className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  {a.nombre} · subiendo…
                </span>
              ),
            )}
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
            className={`inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] transition-colors hover:text-ink ${
              comentarios.length > 0 ? "font-medium text-primary" : "text-muted"
            }`}
          >
            <MessageCircle className="h-3 w-3" strokeWidth={2} aria-hidden />
            {comentarios.length > 0
              ? `${comentarios.length} ${comentarios.length === 1 ? "respuesta" : "respuestas"}`
              : "Responder"}
          </button>
        </div>

        {abrir && (
          <div className="mt-2 space-y-2 border-l-2 border-line pl-3">
            {comentarios.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Avatar nombre={c.autor.nombre} size={20} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
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
