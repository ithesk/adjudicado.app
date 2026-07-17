"use client";

// La FICHA de una entidad del Estado: perfil con autosave, logo, asignación
// a personas/grupos, contactos con extensión, lo relacionado (órdenes y
// procesos) y la bitácora con TODOS los movimientos (los de la ficha + la
// actividad de sus órdenes, en un solo hilo).

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ImagePlus,
  Landmark,
  Loader2,
  Mail,
  Phone,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Panel, SectionTitle, btnPrimary } from "@/components/ui";
import { formatRD } from "@/lib/types";
import type { EntidadDetalle } from "@/lib/entidades/queries";
import {
  actualizarContactoEntidadAction,
  actualizarEntidadAction,
  agregarNotaEntidadAction,
  crearContactoEntidadAction,
  eliminarContactoEntidadAction,
  subirLogoEntidadAction,
  toggleAsignacionEntidadAction,
} from "@/lib/actions/entidades";

const inputSm =
  "rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink outline-none focus:border-primary";

// dd/mm/aaaa hh:mm desde el ISO guardado, sin new Date (hidratación segura).
function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

const TIPO_EVENTO: Record<string, { label: string; clase: string }> = {
  perfil: { label: "perfil", clase: "bg-surface-2 text-muted" },
  logo: { label: "logo", clase: "bg-surface-2 text-muted" },
  contacto: { label: "contacto", clase: "bg-primary/10 text-primary" },
  asignacion: { label: "asignación", clase: "bg-primary/10 text-primary" },
  nota: { label: "nota", clase: "bg-warn-soft text-warn" },
  orden: { label: "orden", clase: "bg-ok-soft text-ok" },
};

// Campo con autosave onBlur. Definido FUERA (regla de la casa).
function Campo({
  valor,
  placeholder,
  mono = false,
  onSave,
}: {
  valor: string;
  placeholder: string;
  mono?: boolean;
  onSave: (v: string) => void;
}) {
  return (
    <input
      defaultValue={valor}
      placeholder={placeholder}
      onBlur={(e) => {
        const v = e.target.value.trim();
        if (v !== valor) onSave(v);
      }}
      className={`${inputSm} w-full ${mono ? "font-mono" : ""}`}
    />
  );
}

export default function FichaEntidad({
  detalle,
  personas,
  grupos,
}: {
  detalle: EntidadDetalle;
  personas: { id: string; nombre: string }[];
  grupos: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const e = detalle;
  const [error, setError] = useState<string | null>(null);
  const [estado, setEstado] = useState<"idle" | "guardando" | "ok">("idle");
  const [pendiente, startTransition] = useTransition();
  const logoRef = useRef<HTMLInputElement>(null);

  function correr(fn: () => Promise<string | null>) {
    setError(null);
    setEstado("guardando");
    startTransition(async () => {
      const err = await fn();
      if (err) {
        setError(err);
        setEstado("idle");
      } else {
        setEstado("ok");
        setTimeout(() => setEstado("idle"), 2000);
      }
      router.refresh();
    });
  }

  const asignadasPersonas = new Set(e.asignaciones.filter((a) => a.user_id).map((a) => a.user_id));
  const asignadosGrupos = new Set(e.asignaciones.filter((a) => a.grupo_id).map((a) => a.grupo_id));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/entidades" className="text-muted transition-colors hover:text-ink">
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden />
        </Link>
        <h1 className="min-w-0 truncate text-lg font-semibold text-ink">
          {e.siglas ? `${e.siglas} — ` : ""}
          {e.nombre}
        </h1>
        {estado === "guardando" && (
          <span className="flex items-center gap-1 text-[11.5px] text-muted">
            <Loader2 className="h-3 w-3 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
            Guardando…
          </span>
        )}
        {estado === "ok" && (
          <span className="flex items-center gap-1 text-[11.5px] text-ok">
            <Check className="h-3 w-3" strokeWidth={2.4} aria-hidden />
            Guardado
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Columna principal */}
        <div className="space-y-4">
          {/* Perfil */}
          <Panel className="p-4">
            <div className="flex flex-wrap items-start gap-4">
              <button
                type="button"
                onClick={() => logoRef.current?.click()}
                className="group relative flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-lg border border-line bg-white"
                title="Subir o cambiar el logo"
              >
                {e.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.logo} alt="Logo" className="h-full w-full object-contain p-1" />
                ) : (
                  <Landmark className="h-8 w-8 text-muted" strokeWidth={1.6} aria-hidden />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <ImagePlus className="h-5 w-5 text-white" strokeWidth={2} aria-hidden />
                </span>
              </button>
              <input
                ref={logoRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(ev) => {
                  const f = ev.target.files?.[0];
                  if (!f) return;
                  const fd = new FormData();
                  fd.set("logo", f);
                  correr(() => subirLogoEntidadAction(e.id, fd));
                  ev.target.value = "";
                }}
              />
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <Campo valor={e.nombre} placeholder="Nombre" onSave={(v) => correr(() => actualizarEntidadAction(e.id, { nombre: v }))} />
                <Campo valor={e.siglas ?? ""} placeholder="Siglas (MICM…)" mono onSave={(v) => correr(() => actualizarEntidadAction(e.id, { siglas: v || null }))} />
                <Campo valor={e.rnc ?? ""} placeholder="RNC" mono onSave={(v) => correr(() => actualizarEntidadAction(e.id, { rnc: v || null }))} />
                <Campo valor={e.telefono ?? ""} placeholder="Teléfono central" mono onSave={(v) => correr(() => actualizarEntidadAction(e.id, { telefono: v || null }))} />
                <div className="sm:col-span-2">
                  <Campo valor={e.direccion ?? ""} placeholder="Dirección" onSave={(v) => correr(() => actualizarEntidadAction(e.id, { direccion: v || null }))} />
                </div>
                <textarea
                  defaultValue={e.notas ?? ""}
                  placeholder="Notas de la entidad (horarios, cómo trabajan, mañas del portal…)"
                  rows={2}
                  onBlur={(ev) => {
                    const v = ev.target.value.trim();
                    if (v !== (e.notas ?? "")) correr(() => actualizarEntidadAction(e.id, { notas: v || null }));
                  }}
                  className={`${inputSm} w-full resize-y sm:col-span-2`}
                />
              </div>
            </div>
          </Panel>

          {/* Contactos */}
          <Panel>
            <SectionTitle icon={Phone}>Contactos ({e.contactos.length})</SectionTitle>
            <ul className="divide-y divide-line">
              {e.contactos.map((c) => (
                <li key={c.id} className="grid gap-1.5 px-4 py-2 sm:grid-cols-[1.2fr_1fr_1.2fr_0.9fr_0.5fr_auto]">
                  <Campo valor={c.nombre} placeholder="Nombre" onSave={(v) => correr(() => actualizarContactoEntidadAction(e.id, c.id, { nombre: v }))} />
                  <Campo valor={c.rol ?? ""} placeholder="Cargo" onSave={(v) => correr(() => actualizarContactoEntidadAction(e.id, c.id, { rol: v || null }))} />
                  <Campo valor={c.email ?? ""} placeholder="Email" mono onSave={(v) => correr(() => actualizarContactoEntidadAction(e.id, c.id, { email: v || null }))} />
                  <Campo valor={c.telefono ?? ""} placeholder="Tel. directo" mono onSave={(v) => correr(() => actualizarContactoEntidadAction(e.id, c.id, { telefono: v || null }))} />
                  <Campo valor={c.extension ?? ""} placeholder="Ext." mono onSave={(v) => correr(() => actualizarContactoEntidadAction(e.id, c.id, { extension: v || null }))} />
                  <span className="flex items-center gap-1.5">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="text-muted hover:text-primary" title={`Escribir a ${c.email}`}>
                        <Mail className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`¿Eliminar el contacto ${c.nombre}?`))
                          correr(() => eliminarContactoEntidadAction(e.id, c.id, c.nombre));
                      }}
                      className="rounded p-0.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                      aria-label="Eliminar contacto"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
            <form
              action={(fd) => {
                correr(() =>
                  crearContactoEntidadAction(e.id, {
                    nombre: String(fd.get("nombre") || ""),
                    rol: String(fd.get("rol") || ""),
                    email: String(fd.get("email") || ""),
                    telefono: String(fd.get("telefono") || ""),
                    extension: String(fd.get("extension") || ""),
                  }),
                );
              }}
              className="grid gap-1.5 border-t border-line bg-surface-2/50 px-4 py-2.5 sm:grid-cols-[1.2fr_1fr_1.2fr_0.9fr_0.5fr_auto]"
            >
              <input name="nombre" required placeholder="Nuevo contacto" className={inputSm} />
              <input name="rol" placeholder="Cargo" className={inputSm} />
              <input name="email" placeholder="Email" className={`${inputSm} font-mono`} />
              <input name="telefono" placeholder="Tel. directo" className={`${inputSm} font-mono`} />
              <input name="extension" placeholder="Ext." className={`${inputSm} font-mono`} />
              <button type="submit" disabled={pendiente} className={btnPrimary("!px-2.5 !py-1 !text-[12px]")}>
                <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
              </button>
            </form>
          </Panel>

          {/* Bitácora de la entidad */}
          <Panel>
            <SectionTitle icon={Landmark}>Bitácora de la entidad</SectionTitle>
            <form
              action={(fd) => {
                const texto = String(fd.get("texto") || "");
                correr(() => agregarNotaEntidadAction(e.id, texto));
              }}
              className="flex gap-1.5 border-b border-line px-4 py-2.5"
            >
              <input
                name="texto"
                required
                placeholder="Escribir una nota en la bitácora…"
                className={`${inputSm} flex-1`}
              />
              <button type="submit" disabled={pendiente} className={btnPrimary("!px-3 !py-1 !text-[12px]")}>
                Anotar
              </button>
            </form>
            <ul className="divide-y divide-line">
              {e.eventos.length === 0 && (
                <li className="px-4 py-6 text-center text-[13px] text-muted">
                  Sin movimientos todavía — todo lo que pase con esta entidad
                  quedará escrito aquí.
                </li>
              )}
              {e.eventos.map((ev) => {
                const t = TIPO_EVENTO[ev.tipo] ?? TIPO_EVENTO.nota;
                return (
                  <li key={`${ev.tipo}-${ev.id}`} className="flex items-start gap-2.5 px-4 py-2">
                    <span className={`mt-0.5 flex-none rounded px-1.5 py-0.5 font-mono text-[10px] uppercase ${t.clase}`}>
                      {t.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-ink">
                        {ev.texto}
                        {ev.orden_id && (
                          <Link href={`/orden/${ev.orden_id}`} className="ml-1.5 font-mono text-[11.5px] text-primary hover:underline">
                            {ev.numero_oc ?? "ver orden"}
                          </Link>
                        )}
                      </p>
                      <p className="font-mono text-[10.5px] text-muted">
                        {fechaCorta(ev.created_at)}
                        {ev.autor ? ` · ${ev.autor}` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        {/* Columna lateral */}
        <div className="space-y-4">
          {/* Asignación */}
          <Panel className="p-4">
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              <Users className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Quién la atiende
            </p>
            <p className="mb-1 text-[11px] text-muted">Personas</p>
            <div className="mb-2.5 flex flex-wrap gap-1">
              {personas.map((p) => {
                const activa = asignadasPersonas.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={pendiente}
                    onClick={() => correr(() => toggleAsignacionEntidadAction(e.id, { userId: p.id }, p.nombre))}
                    className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
                      activa
                        ? "bg-primary text-white"
                        : "bg-surface-2 text-muted hover:text-ink"
                    }`}
                  >
                    {p.nombre}
                  </button>
                );
              })}
            </div>
            <p className="mb-1 text-[11px] text-muted">Grupos</p>
            <div className="flex flex-wrap gap-1">
              {grupos.length === 0 && (
                <span className="text-[12px] text-muted">
                  Sin grupos — se crean en Configuración → Grupos.
                </span>
              )}
              {grupos.map((g) => {
                const activo = asignadosGrupos.has(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    disabled={pendiente}
                    onClick={() => correr(() => toggleAsignacionEntidadAction(e.id, { grupoId: g.id }, g.nombre))}
                    className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
                      activo
                        ? "bg-primary text-white"
                        : "bg-surface-2 text-muted hover:text-ink"
                    }`}
                  >
                    {g.nombre}
                  </button>
                );
              })}
            </div>
          </Panel>

          {/* Lo relacionado */}
          <Panel>
            <SectionTitle icon={Landmark}>De esta entidad</SectionTitle>
            <p className="border-b border-line bg-surface-2 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              Licitaciones ({e.procesos.length})
            </p>
            <ul className="divide-y divide-line">
              {e.procesos.length === 0 && (
                <li className="px-4 py-2 text-[12.5px] text-muted">Ninguna todavía.</li>
              )}
              {e.procesos.map((p) => (
                <li key={p.id}>
                  <Link href={`/licitaciones/${p.id}`} className="flex items-center justify-between px-4 py-2 transition-colors hover:bg-surface-2">
                    <span className="font-mono text-[12.5px] text-ink">{p.codigo}</span>
                    <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] uppercase text-muted">{p.estado}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="border-y border-line bg-surface-2 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              Órdenes ({e.ordenes.length})
            </p>
            <ul className="divide-y divide-line">
              {e.ordenes.length === 0 && (
                <li className="px-4 py-2 text-[12.5px] text-muted">Ninguna todavía.</li>
              )}
              {e.ordenes.map((o) => (
                <li key={o.id}>
                  <Link href={`/orden/${o.id}`} className="flex items-center justify-between gap-2 px-4 py-2 transition-colors hover:bg-surface-2">
                    <span className="min-w-0 truncate font-mono text-[12.5px] text-ink">
                      {o.numero_oc ?? "sin número"}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {o.monto !== null && (
                        <span className="font-mono text-[11.5px] text-muted">{formatRD(o.monto)}</span>
                      )}
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10.5px] uppercase text-muted">
                        {o.estado.replace(/_/g, " ")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
