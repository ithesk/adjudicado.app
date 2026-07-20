"use client";

// Combobox de entidades con BÚSQUEDA TOLERANTE (regla de la casa: el usuario
// no sabe cómo está escrito el nombre — mayúsculas, acentos y faltas leves
// dan igual). Escribe para filtrar; clic elige; y si no existe, el mismo
// texto sirve para CREARLA nueva (el formulario decide qué hacer con él).

import { useState } from "react";
import { Check, Landmark, Plus } from "lucide-react";
import { inputBase } from "@/components/ui";
import { coincideTexto } from "@/lib/buscar-texto";

export default function SelectorEntidad({
  entidades,
  valorId,
  texto,
  onElegir,
  onTexto,
  permitirNueva = false,
  placeholder = "Escribe para buscar la entidad…",
}: {
  entidades: { id: string; nombre: string }[];
  // Entidad elegida ("" = ninguna; el texto libre queda en `texto`).
  valorId: string;
  texto: string;
  onElegir: (id: string, nombre: string) => void;
  onTexto: (texto: string) => void;
  // true → el texto sin coincidencia crea una entidad nueva al guardar.
  permitirNueva?: boolean;
  placeholder?: string;
}) {
  const [abierto, setAbierto] = useState(false);

  const filtradas =
    texto.trim() && !valorId
      ? entidades.filter((e) => coincideTexto(e.nombre, texto))
      : entidades;
  const yaExiste = entidades.some(
    (e) => e.nombre.trim().toLowerCase() === texto.trim().toLowerCase(),
  );

  return (
    <div className="relative">
      <input
        value={texto}
        onChange={(e) => {
          onTexto(e.target.value);
          setAbierto(true);
        }}
        onFocus={() => setAbierto(true)}
        // El timeout deja llegar el clic de la lista antes de cerrarla.
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        placeholder={placeholder}
        className={`${inputBase} pr-8`}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted">
        {valorId ? (
          <Check className="h-4 w-4 text-ok" strokeWidth={2.2} aria-hidden />
        ) : (
          <Landmark className="h-4 w-4" strokeWidth={1.8} aria-hidden />
        )}
      </span>

      {abierto && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-surface py-1 shadow-card">
          {filtradas.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                // onMouseDown para ganarle al blur del input.
                onMouseDown={(ev) => {
                  ev.preventDefault();
                  onElegir(e.id, e.nombre);
                  setAbierto(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-surface-2 ${
                  e.id === valorId ? "font-medium text-primary" : "text-ink"
                }`}
              >
                <Landmark className="h-3.5 w-3.5 flex-none text-muted" strokeWidth={1.8} aria-hidden />
                <span className="min-w-0 truncate">{e.nombre}</span>
              </button>
            </li>
          ))}
          {filtradas.length === 0 && !texto.trim() && (
            <li className="px-3 py-2 text-[12px] text-muted">
              Tu catálogo de entidades está vacío todavía.
            </li>
          )}
          {texto.trim() && !valorId && !yaExiste && (
            <li
              className={`px-3 py-2 text-[12px] ${
                permitirNueva ? "text-ink-soft" : "text-muted"
              } ${filtradas.length > 0 ? "border-t border-line" : ""}`}
            >
              {permitirNueva ? (
                <span className="flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5 flex-none text-primary" strokeWidth={2.2} aria-hidden />
                  No está en tu catálogo — se creará{" "}
                  <strong className="truncate">“{texto.trim()}”</strong> al guardar.
                </span>
              ) : (
                <>Nada coincide con “{texto.trim()}”.</>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
