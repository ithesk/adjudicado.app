"use client";

import { useState } from "react";
import { Plus, Trash2, Building, UserPlus, Mail, Phone, Tag } from "lucide-react";
import {
  CANAL_LABEL,
  type CanalItem,
  type Contacto,
  type Suplidor,
} from "@/lib/types";

let seq = 0;
const nid = (p: string) => `local-${p}-${Date.now()}-${seq++}`;

const inputSm =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-primary focus:ring-2 focus:ring-[var(--ring)]";

export default function SuplidoresEditor({
  inicial,
}: {
  inicial: Suplidor[];
}) {
  const [suplidores, setSuplidores] = useState<Suplidor[]>(inicial);

  function updateSup(id: string, patch: Partial<Suplidor>) {
    setSuplidores((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  }
  function addSup() {
    setSuplidores((prev) => [
      {
        id: nid("sup"),
        nombre: "",
        canal: "distribuidor",
        notas: null,
        contactos: [],
      },
      ...prev,
    ]);
  }
  function delSup(id: string) {
    setSuplidores((prev) => prev.filter((s) => s.id !== id));
  }
  function addContacto(supId: string) {
    const c: Contacto = {
      id: nid("c"),
      nombre: "",
      rol: null,
      email: null,
      telefono: null,
    };
    updateContactos(supId, (cs) => [...cs, c]);
  }
  function updateContacto(supId: string, cId: string, patch: Partial<Contacto>) {
    updateContactos(supId, (cs) =>
      cs.map((c) => (c.id === cId ? { ...c, ...patch } : c)),
    );
  }
  function delContacto(supId: string, cId: string) {
    updateContactos(supId, (cs) => cs.filter((c) => c.id !== cId));
  }
  function updateContactos(
    supId: string,
    fn: (cs: Contacto[]) => Contacto[],
  ) {
    setSuplidores((prev) =>
      prev.map((s) =>
        s.id === supId ? { ...s, contactos: fn(s.contactos) } : s,
      ),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-muted">
          {suplidores.length} suplidores · reutilizables en cualquier ítem
        </p>
        <button
          type="button"
          onClick={addSup}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[13px] font-medium text-primary-ink shadow-card transition-colors hover:bg-primary-hover"
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Nuevo suplidor
        </button>
      </div>

      <div className="space-y-3">
        {suplidores.map((s) => (
          <div
            key={s.id}
            className="rounded-lg border border-line bg-surface shadow-card"
          >
            {/* Encabezado editable */}
            <div className="flex items-center gap-2 border-b border-line p-3">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-md bg-surface-2 text-muted">
                <Building className="h-4 w-4" strokeWidth={2} aria-hidden />
              </span>
              <input
                value={s.nombre}
                onChange={(e) => updateSup(s.id, { nombre: e.target.value })}
                placeholder="Nombre del suplidor"
                className={`${inputSm} flex-1 font-semibold`}
                autoFocus={s.nombre === ""}
              />
              <label className="relative flex items-center">
                <Tag
                  className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted"
                  strokeWidth={2}
                  aria-hidden
                />
                <select
                  value={s.canal ?? ""}
                  onChange={(e) =>
                    updateSup(s.id, { canal: e.target.value as CanalItem })
                  }
                  className={`${inputSm} w-auto pl-7`}
                >
                  {(Object.keys(CANAL_LABEL) as CanalItem[]).map((c) => (
                    <option key={c} value={c}>
                      {CANAL_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => delSup(s.id)}
                className="grid h-8 w-8 flex-none place-items-center rounded-md text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                title="Eliminar suplidor"
                aria-label="Eliminar suplidor"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              </button>
            </div>

            <div className="space-y-3 p-3">
              <input
                value={s.notas ?? ""}
                onChange={(e) => updateSup(s.id, { notas: e.target.value })}
                placeholder="Notas (precios, condiciones, tiempos…)"
                className={inputSm}
              />

              {/* Contactos */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                    Contactos · {s.contactos.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => addContacto(s.id)}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
                  >
                    <UserPlus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Agregar contacto
                  </button>
                </div>

                {s.contactos.length === 0 ? (
                  <p className="text-[12px] text-muted">Sin contactos.</p>
                ) : (
                  <div className="space-y-2">
                    {s.contactos.map((c) => (
                      <div
                        key={c.id}
                        className="grid grid-cols-1 gap-1.5 rounded-md border border-line bg-canvas/40 p-2 sm:grid-cols-2"
                      >
                        <input
                          value={c.nombre}
                          onChange={(e) =>
                            updateContacto(s.id, c.id, { nombre: e.target.value })
                          }
                          placeholder="Nombre"
                          className={`${inputSm} font-medium`}
                        />
                        <input
                          value={c.rol ?? ""}
                          onChange={(e) =>
                            updateContacto(s.id, c.id, { rol: e.target.value })
                          }
                          placeholder="Cargo / rol"
                          className={inputSm}
                        />
                        <label className="relative flex items-center">
                          <Mail
                            className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted"
                            strokeWidth={2}
                            aria-hidden
                          />
                          <input
                            type="email"
                            value={c.email ?? ""}
                            onChange={(e) =>
                              updateContacto(s.id, c.id, { email: e.target.value })
                            }
                            placeholder="correo@dominio.com"
                            className={`${inputSm} pl-7`}
                          />
                        </label>
                        <div className="flex items-center gap-1.5">
                          <label className="relative flex flex-1 items-center">
                            <Phone
                              className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted"
                              strokeWidth={2}
                              aria-hidden
                            />
                            <input
                              value={c.telefono ?? ""}
                              onChange={(e) =>
                                updateContacto(s.id, c.id, {
                                  telefono: e.target.value,
                                })
                              }
                              placeholder="809-000-0000"
                              className={`${inputSm} pl-7`}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => delContacto(s.id, c.id)}
                            className="grid h-8 w-8 flex-none place-items-center rounded-md text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                            title="Eliminar contacto"
                            aria-label="Eliminar contacto"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {suplidores.length === 0 && (
          <p className="rounded-lg border border-dashed border-line p-8 text-center text-[13px] text-muted">
            No hay suplidores. Crea el primero con “Nuevo suplidor”.
          </p>
        )}
      </div>

      <p className="text-[11px] text-muted">
        Los cambios son locales (modo demo). Al conectar Supabase se guardarán en
        el catálogo y estarán disponibles para todo el equipo.
      </p>
    </div>
  );
}
