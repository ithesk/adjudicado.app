"use client";

import { createContext, useContext, useRef, useState } from "react";
import type { Bitacora, CanalItem, Persona, Suplidor } from "@/lib/types";

interface ActividadCtx {
  // Eventos emitidos por acciones en los ítems (se ven en la bitácora).
  eventos: Bitacora[];
  emitir: (texto: string) => void;
  // Catálogo de suplidores en vivo (autocompletar + guardar nuevos).
  suplidores: Suplidor[];
  agregarSuplidor: (nombre: string, canal: CanalItem | null) => void;
  currentUser: Persona;
}

const Ctx = createContext<ActividadCtx | null>(null);

export function useActividad(): ActividadCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useActividad fuera del proveedor");
  return c;
}

export default function ActividadProvider({
  currentUser,
  suplidores: inicial,
  children,
}: {
  currentUser: Persona;
  suplidores: Suplidor[];
  children: React.ReactNode;
}) {
  const [eventos, setEventos] = useState<Bitacora[]>([]);
  const [suplidores, setSuplidores] = useState<Suplidor[]>(inicial);
  const seq = useRef(0);

  function emitir(texto: string) {
    seq.current += 1;
    setEventos((prev) => [
      {
        id: `ev-${Date.now()}-${seq.current}`,
        orden_id: "",
        autor_id: currentUser.id,
        autor: currentUser,
        tipo: "evento",
        texto,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  function agregarSuplidor(nombre: string, canal: CanalItem | null) {
    const n = nombre.trim();
    if (!n) return;
    setSuplidores((prev) =>
      prev.some((s) => s.nombre.toLowerCase() === n.toLowerCase())
        ? prev
        : [
            ...prev,
            {
              id: `sup-local-${Date.now()}`,
              nombre: n,
              canal,
              notas: null,
              contactos: [],
            },
          ],
    );
  }

  return (
    <Ctx.Provider
      value={{ eventos, emitir, suplidores, agregarSuplidor, currentUser }}
    >
      {children}
    </Ctx.Provider>
  );
}
