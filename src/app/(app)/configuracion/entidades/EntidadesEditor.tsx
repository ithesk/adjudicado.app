"use client";

// CRUD del catálogo de entidades, con autosave por campo (onBlur).

import Link from "next/link";
import { useState } from "react";
import { Landmark, Plus, Trash2 } from "lucide-react";
import { IndicadorGuardado, Panel, SectionTitle, btnPrimary, inputBase } from "@/components/ui";
import { useAccion } from "@/lib/use-accion";
import type { Institucion } from "@/lib/types";
import {
  actualizarEntidadAction,
  crearEntidadAction,
  eliminarEntidadAction,
} from "@/lib/actions/entidades";

const inputSm =
  "rounded-md border border-line bg-surface px-2 py-1 text-[12.5px] text-ink outline-none focus:border-primary";

// Fuera del componente (regla del autosave: adentro se remonta y borra texto).
function CampoEntidad({
  valor,
  placeholder,
  ancho,
  mono = false,
  onSave,
}: {
  valor: string;
  placeholder: string;
  ancho: string;
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
      className={`${inputSm} ${ancho} ${mono ? "font-mono" : ""}`}
    />
  );
}

export default function EntidadesEditor({
  entidades,
}: {
  entidades: Institucion[];
}) {
  const [nueva, setNueva] = useState("");
  // Alcance por entidad: guardar una fila no bloquea las demás; el error de
  // la fila sale como aviso, el del alta queda junto al form (errorInline).
  const { correr, ocupada, estado, error } = useAccion();

  return (
    <Panel>
      <SectionTitle
        icon={Landmark}
        right={<IndicadorGuardado estado={estado} />}
      >
        Entidades ({entidades.length})
      </SectionTitle>

      {error && (
        <p className="mx-4 mt-3 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      )}

      {/* Alta rápida */}
      <form
        action={() => {
          if (!nueva.trim()) return;
          correr("crear", () => crearEntidadAction(nueva), { errorInline: true });
          setNueva("");
        }}
        className="flex gap-2 border-b border-line p-3"
      >
        <input
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          placeholder="Nombre de la entidad nueva (Ministerio de…)"
          className={`${inputBase} flex-1`}
        />
        <button type="submit" disabled={ocupada("crear") || !nueva.trim()} className={btnPrimary()}>
          <Plus className="h-4 w-4" strokeWidth={2.4} aria-hidden />
          Agregar
        </button>
      </form>

      {/* Encabezados */}
      <div className="hidden gap-2 border-b border-line px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted sm:flex">
        <span className="flex-1">Nombre</span>
        <span className="w-20">Siglas</span>
        <span className="w-32">RNC</span>
        <span className="w-56">Dirección</span>
        <span className="w-7" />
      </div>

      <ul className="divide-y divide-line">
        {entidades.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
            <CampoEntidad
              valor={e.nombre}
              placeholder="Nombre"
              ancho="min-w-48 flex-1"
              onSave={(v) => v && correr(`ent-${e.id}`, () => actualizarEntidadAction(e.id, { nombre: v }))}
            />
            <CampoEntidad
              valor={e.siglas ?? ""}
              placeholder="Siglas"
              ancho="w-20"
              onSave={(v) => correr(`ent-${e.id}`, () => actualizarEntidadAction(e.id, { siglas: v || null }))}
            />
            <CampoEntidad
              valor={e.rnc ?? ""}
              placeholder="RNC"
              ancho="w-32"
              mono
              onSave={(v) => correr(`ent-${e.id}`, () => actualizarEntidadAction(e.id, { rnc: v || null }))}
            />
            <CampoEntidad
              valor={e.direccion ?? ""}
              placeholder="Dirección"
              ancho="w-56"
              onSave={(v) => correr(`ent-${e.id}`, () => actualizarEntidadAction(e.id, { direccion: v || null }))}
            />
            <Link
              href={`/entidades/${e.id}`}
              className="text-[12px] font-medium text-primary hover:underline"
              title="Ficha completa: logo, contactos, asignación y bitácora"
            >
              Ficha
            </Link>
            <button
              type="button"
              onClick={() => {
                if (confirm(`¿Eliminar "${e.nombre}"?`))
                  correr(`ent-${e.id}`, () => eliminarEntidadAction(e.id));
              }}
              disabled={ocupada(`ent-${e.id}`)}
              className="rounded p-1 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
              aria-label="Eliminar entidad"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </li>
        ))}
        {entidades.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">
            El catálogo se llena solo: cada orden u proceso con una entidad
            nueva la agrega aquí. También puedes crearlas a mano.
          </li>
        )}
      </ul>
    </Panel>
  );
}
