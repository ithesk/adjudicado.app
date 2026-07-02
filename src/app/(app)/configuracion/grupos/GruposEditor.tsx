"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, UsersRound, Check, Pencil } from "lucide-react";
import type { Grupo, Persona } from "@/lib/types";
import { Avatar, inputBase } from "@/components/ui";
import {
  crearGrupo,
  eliminarGrupo,
  renombrarGrupo,
  toggleMiembroGrupo,
} from "@/lib/actions/grupos";

export default function GruposEditor({
  grupos,
  personas,
}: {
  grupos: Grupo[];
  personas: Persona[];
}) {
  const [nuevo, setNuevo] = useState("");
  const [pending, startTransition] = useTransition();

  function crear() {
    const n = nuevo.trim();
    if (!n) return;
    setNuevo("");
    startTransition(() => crearGrupo(n));
  }

  return (
    <div className="space-y-3">
      {/* Crear grupo */}
      <div className="flex gap-2">
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") crear();
          }}
          placeholder="Nombre del grupo (ej. Logística)…"
          className={`${inputBase} max-w-xs`}
        />
        <button
          type="button"
          onClick={crear}
          disabled={pending || !nuevo.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-ink transition-colors hover:bg-primary-hover disabled:opacity-50"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          Crear grupo
        </button>
      </div>

      {grupos.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-muted">
          Sin grupos todavía. Crea el primero (ej. Logística, Facturación).
        </p>
      ) : (
        <ul className="space-y-3">
          {grupos.map((g) => (
            <GrupoCard key={g.id} grupo={g} personas={personas} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GrupoCard({ grupo, personas }: { grupo: Grupo; personas: Persona[] }) {
  const [, startTransition] = useTransition();
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState(grupo.nombre);
  // Estado local optimista de membresía.
  const [ids, setIds] = useState<string[]>(grupo.miembros.map((p) => p.id));

  function toggle(p: Persona) {
    setIds((prev) =>
      prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
    );
    startTransition(() => toggleMiembroGrupo(grupo.id, p.id));
  }

  function renombrar() {
    const n = nombre.trim();
    setEditando(false);
    if (n && n !== grupo.nombre) startTransition(() => renombrarGrupo(grupo.id, n));
  }

  return (
    <li className="rounded-lg border border-line bg-surface shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-2.5">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-surface-2 text-muted">
          <UsersRound className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        {editando ? (
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") renombrar();
              if (e.key === "Escape") setEditando(false);
            }}
            onBlur={renombrar}
            autoFocus
            className="rounded-md border border-primary bg-surface px-2 py-1 text-[14px] font-semibold text-ink outline-none"
          />
        ) : (
          <span className="text-[14px] font-semibold text-ink">{nombre}</span>
        )}
        <span className="text-[12px] text-muted">
          {ids.length} {ids.length === 1 ? "miembro" : "miembros"}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditando(true)}
            aria-label="Renombrar grupo"
            title="Renombrar"
            className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  `¿Eliminar el grupo “${nombre}”? Las órdenes asignadas quedan sin grupo.`,
                )
              )
                startTransition(() => eliminarGrupo(grupo.id));
            }}
            aria-label="Eliminar grupo"
            title="Eliminar"
            className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
        </span>
      </div>

      {/* Miembros: toca para agregar/quitar */}
      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        {personas.map((p) => {
          const dentro = ids.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p)}
              aria-pressed={dentro}
              className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12.5px] transition-colors ${
                dentro
                  ? "border-primary/40 bg-primary/10 text-ink"
                  : "border-line text-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              <Avatar nombre={p.nombre} size={20} />
              {p.nombre}
              {dentro && (
                <Check className="h-3 w-3 text-primary" strokeWidth={2.5} aria-hidden />
              )}
            </button>
          );
        })}
        {personas.length === 0 && (
          <p className="text-[12px] text-muted">
            Invita a tu equipo para agregar miembros.
          </p>
        )}
      </div>
    </li>
  );
}
