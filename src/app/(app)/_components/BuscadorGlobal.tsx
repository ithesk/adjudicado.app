"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FileText,
  Package,
  Building2,
  Activity,
  ListChecks,
  Truck,
  Loader2,
  CornerDownLeft,
  type LucideIcon,
} from "lucide-react";
import { buscarGlobal, type Hit, type ResultadoBusqueda } from "@/lib/actions/buscar";

const EVENTO = "adjudica:abrir-buscador";

const sinAcento = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

// "Pliega" el texto carácter a carácter manteniendo el mapeo a índices
// originales, para resaltar coincidencias aunque difieran en acentos.
function plegar(s: string): { folded: string; map: { s: number; e: number }[] } {
  let folded = "";
  const map: { s: number; e: number }[] = [];
  let i = 0;
  for (const ch of s) {
    const piece = sinAcento(ch) || ch.toLowerCase();
    const start = i;
    const end = i + ch.length;
    for (let k = 0; k < piece.length; k++) map.push({ s: start, e: end });
    folded += piece;
    i = end;
  }
  return { folded, map };
}

// Devuelve el texto con las coincidencias de `query` resaltadas.
function resaltar(texto: string, query: string): ReactNode {
  const q = sinAcento(query.trim());
  if (q.length < 1 || !texto) return texto;
  const { folded, map } = plegar(texto);
  const partes: ReactNode[] = [];
  let cursor = 0;
  let from = 0;
  let key = 0;
  for (;;) {
    const idx = folded.indexOf(q, from);
    if (idx === -1) break;
    const oStart = map[idx].s;
    const oEnd = map[idx + q.length - 1].e;
    if (cursor < oStart) partes.push(texto.slice(cursor, oStart));
    partes.push(
      <mark key={key++} className="rounded-[2px] bg-primary/20 text-ink">
        {texto.slice(oStart, oEnd)}
      </mark>,
    );
    cursor = oEnd;
    from = idx + q.length;
  }
  if (partes.length === 0) return texto;
  if (cursor < texto.length) partes.push(texto.slice(cursor));
  return partes;
}

// Botón disparador (sidebar / móvil). Abre el buscador global.
export function BotonBuscar({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENTO))}
      className={className}
    >
      {children}
    </button>
  );
}

const GRUPOS: { key: keyof ResultadoBusqueda; label: string; icon: LucideIcon }[] = [
  { key: "ordenes", label: "Órdenes", icon: FileText },
  { key: "items", label: "Ítems", icon: ListChecks },
  { key: "documentos", label: "Documentos", icon: FileText },
  { key: "bitacora", label: "Bitácora", icon: Activity },
  { key: "suplidores", label: "Suplidores", icon: Truck },
  { key: "instituciones", label: "Instituciones", icon: Building2 },
];

const ICONO: Record<string, LucideIcon> = {
  ordenes: FileText,
  items: ListChecks,
  documentos: FileText,
  bitacora: Activity,
  suplidores: Truck,
  instituciones: Building2,
};

export default function BuscadorGlobal() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState("");
  const [res, setRes] = useState<ResultadoBusqueda | null>(null);
  const [cargando, setCargando] = useState(false);
  const [activo, setActivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const abrir = useCallback(() => setAbierto(true), []);
  const cerrar = useCallback(() => {
    setAbierto(false);
    setQ("");
    setRes(null);
    setActivo(0);
  }, []);

  // Atajos globales: Cmd/Ctrl+K abre; evento desde los botones disparadores.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAbierto((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener(EVENTO, abrir);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(EVENTO, abrir);
    };
  }, [abrir]);

  useEffect(() => {
    if (abierto) requestAnimationFrame(() => inputRef.current?.focus());
  }, [abierto]);

  // Búsqueda con debounce.
  useEffect(() => {
    if (!abierto) return;
    const texto = q.trim();
    if (texto.length < 2) {
      setRes(null);
      setCargando(false);
      return;
    }
    setCargando(true);
    const t = setTimeout(async () => {
      const r = await buscarGlobal(texto);
      setRes(r);
      setActivo(0);
      setCargando(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, abierto]);

  // Lista plana de resultados (para navegar con flechas).
  const plano = useMemo(() => {
    if (!res) return [] as { grupo: string; hit: Hit }[];
    const out: { grupo: string; hit: Hit }[] = [];
    for (const g of GRUPOS)
      for (const hit of res[g.key]) out.push({ grupo: g.key, hit });
    return out;
  }, [res]);

  const total = plano.length;

  function irA(href: string) {
    cerrar();
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      cerrar();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActivo((i) => (total ? (i + 1) % total : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActivo((i) => (total ? (i - 1 + total) % total : 0));
    } else if (e.key === "Enter" && plano[activo]) {
      e.preventDefault();
      irA(plano[activo].hit.href);
    }
  }

  if (!abierto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-[10vh] backdrop-blur-sm"
      onClick={cerrar}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-raised"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {/* Campo de búsqueda */}
        <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en órdenes, ítems, documentos, suplidores, bitácora…"
            aria-label="Buscar en todo"
            className="w-full bg-transparent py-3.5 text-base sm:text-[14px] text-ink outline-none placeholder:text-muted/70"
          />
          {cargando && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" strokeWidth={2} aria-hidden />
          )}
          <kbd className="hidden shrink-0 rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted sm:block">
            Esc
          </kbd>
        </div>

        {/* Resultados */}
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {q.trim().length < 2 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">
              Escribe al menos 2 letras para buscar en todo el sistema.
            </p>
          ) : total === 0 && !cargando ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">
              Nada coincide con “{q.trim()}”.
            </p>
          ) : (
            GRUPOS.map((g) => {
              const hits = res?.[g.key] ?? [];
              if (hits.length === 0) return null;
              const Icon = ICONO[g.key];
              return (
                <div key={g.key} className="mb-1">
                  <p className="px-4 py-1 text-[10px] font-medium uppercase tracking-wide text-muted">
                    {g.label}
                  </p>
                  {hits.map((hit) => {
                    const idx = plano.findIndex(
                      (p) => p.grupo === g.key && p.hit === hit,
                    );
                    const esActivo = idx === activo;
                    return (
                      <button
                        key={hit.id}
                        type="button"
                        onMouseEnter={() => setActivo(idx)}
                        onClick={() => irA(hit.href)}
                        className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                          esActivo ? "bg-surface-2" : "hover:bg-surface-2"
                        }`}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink">
                            {resaltar(hit.titulo, q)}
                          </span>
                          {hit.sub && (
                            <span className="block truncate text-[11px] text-muted">
                              {resaltar(hit.sub, q)}
                            </span>
                          )}
                        </span>
                        {esActivo && (
                          <CornerDownLeft
                            className="h-3.5 w-3.5 shrink-0 text-muted"
                            strokeWidth={2}
                            aria-hidden
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Pie con ayuda de navegación */}
        <div className="flex shrink-0 items-center gap-3 border-t border-line px-4 py-2 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-line bg-surface-2 px-1 font-mono">↑</kbd>
            <kbd className="rounded border border-line bg-surface-2 px-1 font-mono">↓</kbd>
            navegar
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-line bg-surface-2 px-1 font-mono">↵</kbd>
            abrir
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Package className="h-3 w-3" strokeWidth={2} aria-hidden />
            {total} resultados
          </span>
        </div>
      </div>
    </div>
  );
}
