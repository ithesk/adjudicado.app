"use client";

// Subir un archivo, en cualquier parte del sistema, con la misma mecánica y
// el mismo aviso.
//
// Antes cada pantalla mandaba el archivo DENTRO de la petición al servidor.
// Eso arrastra dos problemas que se veían en las órdenes, en los requisitos
// de licitaciones y en la importación de precios:
//
//  1. Vercel rechaza cualquier cuerpo mayor de 4,5 MB ANTES de ejecutar el
//     código, así que un adjunto grande fallaba sin que la aplicación se
//     enterara — y su respuesta, al no venir de nuestro código, no traía
//     ninguna explicación.
//  2. No había forma de saber el avance: el archivo viajaba dentro de una
//     petición opaca y solo quedaba un círculo girando.
//
// Aquí el archivo va DIRECTO al almacenamiento (con porcentaje real, que
// son bytes enviados) y al servidor solo se le manda la ruta para que
// registre la fila. La RLS del bucket exige que la primera carpeta sea la
// de la organización, así que autoriza la sesión del propio usuario.

import { useRef, useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import ProgresoLargo from "@/components/ProgresoLargo";
import { subirConProgreso } from "@/lib/subir-con-progreso";
import { avisoError, avisoOk } from "@/lib/avisos";

const MB = 1024 * 1024;
// Tope del bucket. Ya no es el de Vercel: el archivo no pasa por ahí.
const TOPE = 30 * MB;
const legible = (b: number) => `${(b / MB).toFixed(1)} MB`;

export default function SubirArchivo({
  /** Carpeta destino dentro del bucket. La da el servidor, que conoce la org. */
  carpeta,
  /** Registra la fila en la base una vez subido. Devuelve error o null. */
  onRegistrar,
  etiqueta = "Subir",
  etiquetaOcupado = "Subiendo…",
  accept,
  className = "",
  onListo,
}: {
  carpeta: () => Promise<string | null>;
  onRegistrar: (ruta: string, nombre: string) => Promise<string | null>;
  etiqueta?: string;
  etiquetaOcupado?: string;
  accept?: string;
  className?: string;
  onListo?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [fase, setFase] = useState<string | null>(null);
  const [inicio, setInicio] = useState(0);

  async function subir(file: File) {
    if (file.size === 0) {
      avisoError("El archivo está vacío.");
      return;
    }
    if (file.size > TOPE) {
      avisoError(
        `«${file.name}» pesa ${legible(file.size)} y el máximo son ${legible(TOPE)}.`,
      );
      return;
    }
    setOcupado(true);
    setInicio(Date.now());
    setPct(0);
    setFase(`Subiendo ${file.name} (${legible(file.size)})…`);
    try {
      const destino = await carpeta();
      if (!destino) throw new Error("Tu sesión caducó. Recarga la página.");
      const ruta = `${destino}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const { error } = await subirConProgreso("documentos", ruta, file, setPct);
      if (error) throw new Error(error);

      // Subido: ahora el servidor solo anota la fila. Es rápido, pero el
      // avance ya no se puede medir — barra indeterminada.
      setPct(null);
      setFase("Registrando el documento…");
      const err = await onRegistrar(ruta, file.name);
      if (err) throw new Error(err);

      avisoOk(`«${file.name}» subido.`);
      onListo?.();
    } catch (e) {
      avisoError(e instanceof Error ? e.message : "No se pudo subir el archivo.");
    } finally {
      setOcupado(false);
      setFase(null);
      setPct(null);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <span className={`inline-flex min-w-0 flex-col gap-1 ${className}`}>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void subir(f);
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={ocupado}
        className="flex items-center gap-1 text-[12px] text-muted transition-colors hover:text-ink disabled:opacity-60"
      >
        {ocupado ? (
          <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <Paperclip className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        )}
        {ocupado ? etiquetaOcupado : etiqueta}
      </button>
      {fase && (
        <ProgresoLargo fase={fase} desde={inicio} porcentaje={pct} estimado={20} />
      )}
    </span>
  );
}
