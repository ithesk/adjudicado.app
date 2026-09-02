"use client";

// Importación de listas de precios: elige un suplidor del catálogo, sube su
// Excel y el parser detecta solo las columnas. La nueva lista queda vigente
// y la anterior pasa al historial.

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { Panel } from "@/components/ui";
import ProgresoLargo from "@/components/ProgresoLargo";
import { fetchLargo } from "@/lib/fetch-cliente";
import { createClient } from "@/lib/supabase/client";
import { carpetaDeImportacion } from "@/lib/actions/precios";

import type { ListaVigente } from "@/lib/precios/tipos";
import type { SuplidorOpcion } from "./BuscadorPrecios";

const MB = 1024 * 1024;

// El Excel sube DIRECTO al almacenamiento, así que el techo ya no es el de
// Vercel (4,5 MB por petición, que rechazaba un archivo de 6 MB sin dar
// ninguna explicación) sino el que la aplicación siempre prometió y la ruta
// valida al procesarlo.
const TOPE_SUBIDA = 30 * MB;

const legible = (bytes: number) => `${(bytes / MB).toFixed(1)} MB`;

// Traduce el código de la respuesta a algo que se pueda leer y actuar. Sin
// esto, cualquier fallo que no venga de la ruta se veía como «inténtalo de
// nuevo», que no dice qué pasó ni qué hacer.
function mensajePorEstado(status: number, tamano: number): string {
  if (status === 413)
    return `El archivo pesa ${legible(tamano)} y supera el máximo de ${legible(TOPE_SUBIDA)}. Divide la lista en partes e impórtalas una a una.`;
  if (status === 401)
    return "Tu sesión caducó. Recarga la página y vuelve a entrar.";
  if (status === 504 || status === 502)
    return "El servidor tardó demasiado procesando la lista. Prueba con menos filas.";
  if (status >= 500)
    return `El servidor falló procesando la lista (error ${status}). Si se repite, avísanos.`;
  return `La importación falló (error ${status}).`;
}

interface ResultadoImport {
  suplidor: string;
  filas: number;
  vigencia: string | null;
  hojas: string[];
}

export default function ImportarLista({
  suplidores,
  listas,
  onCerrar,
}: {
  suplidores: SuplidorOpcion[];
  listas: ListaVigente[];
  onCerrar?: () => void; // sin onCerrar el panel queda fijo (vista Listas)
}) {
  const [suplidorId, setSuplidorId] = useState(suplidores[0]?.id ?? "");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  // Qué se está haciendo AHORA y desde cuándo — para poder decirlo en vez de
  // dejar un círculo girando sin más.
  const [fase, setFase] = useState<string | null>(null);
  const [inicio, setInicio] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivo || !suplidorId || subiendo) return;
    // Se comprueba ANTES de subir: mandar un archivo para que lo rechacen es
    // hacer esperar al usuario para nada.
    if (archivo.size > TOPE_SUBIDA) {
      setError(
        `El archivo pesa ${legible(archivo.size)} y el máximo son ${legible(TOPE_SUBIDA)}. ` +
          "Divide la lista en varias partes (por hoja o por rango de filas) e impórtalas una a una.",
      );
      return;
    }
    setSubiendo(true);
    setError(null);
    setResultado(null);
    // Las dos fases son REALES: son dos peticiones distintas y el cliente
    // sabe con certeza en cuál está. Nada de pasos inventados por reloj.
    setInicio(Date.now());
    setFase(`Subiendo el archivo (${legible(archivo.size)})…`);
    try {
      // 1) El Excel va DIRECTO al almacenamiento, sin pasar por Vercel — que
      //    rechaza cualquier cuerpo mayor de 4,5 MB antes de ejecutar nada.
      //    La RLS del bucket exige que la primera carpeta sea la de la
      //    organización, así que autoriza la sesión del propio usuario.
      const carpeta = await carpetaDeImportacion();
      if (!carpeta) throw new Error("Tu sesión caducó. Recarga la página y vuelve a entrar.");
      const supabase = createClient();
      const ruta = `${carpeta}/${crypto.randomUUID()}-${archivo.name.replace(/[^\w.-]+/g, "_")}`;
      const { error: errSubida } = await supabase.storage
        .from("documentos")
        .upload(ruta, archivo, { contentType: archivo.type || undefined });
      if (errSubida) throw new Error(`No se pudo subir el archivo: ${errSubida.message}`);

      // Segunda fase: el archivo ya está arriba, ahora se procesa. Es la
      // parte larga (23 s con 23.650 filas) y hasta ahora no se distinguía
      // de la primera: todo era el mismo círculo girando.
      setFase("Procesando la lista y guardando los precios…");

      // 2) A la función solo viaja la RUTA: unos bytes, nunca el Excel. Con
      //    tope de espera, que es la parte que sí puede tardar (procesar
      //    decenas de miles de filas).
      const res = await fetchLargo("/api/precios/importar", 150_000, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruta, nombre: archivo.name, suplidor_id: suplidorId }),
      });
      // La respuesta se lee DEFENSIVAMENTE. Antes se hacía res.json() antes
      // de mirar si había ido bien: cuando el fallo no viene de la ruta sino
      // de la plataforma (un rechazo por tamaño, un corte del proxy), el
      // cuerpo no es JSON, res.json() reventaba y el error acababa en el
      // catch como «revisa tu conexión» — que no es lo que pasó y no dice
      // nada. El usuario veía «inténtalo de nuevo» para siempre.
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? mensajePorEstado(res.status, archivo.size));
      } else if (!data) {
        setError("El servidor respondió algo que no se pudo leer. Inténtalo de nuevo.");
      } else {
        setResultado(data);
        setArchivo(null);
        if (fileRef.current) fileRef.current.value = "";
        router.refresh(); // actualiza el resumen (productos listos para buscar)
      }
    } catch (e) {
      // fetchLargo ya distingue «tardó demasiado» de «sin conexión»: se
      // muestra su mensaje en vez de uno genérico que no dice qué pasó.
      setError(
        e instanceof Error
          ? e.message
          : "La importación falló. Revisa tu conexión e inténtalo de nuevo.",
      );
    } finally {
      setSubiendo(false);
      setFase(null);
    }
  };

  const listaDe = (suplidor: string) => listas.find((l) => l.suplidor_id === suplidor);

  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-ink">Importar lista de precios</h2>
          <p className="mt-0.5 text-xs text-muted">
            Sube el Excel tal como lo envía el suplidor — las columnas de SKU,
            descripción y precio se detectan solas. La lista anterior queda como
            historial.
          </p>
        </div>
        {onCerrar && (
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar importación"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        )}
      </div>

      {suplidores.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          Primero crea el suplidor en{" "}
          <Link href="/configuracion" className="text-primary hover:underline">
            Configuración → Suplidores
          </Link>
          .
        </p>
      ) : (
        <form onSubmit={enviar} className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex min-w-44 flex-col gap-1 text-xs text-muted">
            Suplidor
            <select
              value={suplidorId}
              onChange={(e) => setSuplidorId(e.target.value)}
              className="rounded-md border border-line bg-surface px-2.5 py-2 text-sm text-ink shadow-card outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-[var(--ring)]"
            >
              {suplidores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-60 flex-1 flex-col gap-1 text-xs text-muted">
            <span className="flex items-baseline justify-between gap-2">
              <span>Excel de la lista (.xlsx)</span>
              {/* El peso, en cuanto se elige el archivo: es el dato que
                  decide si la subida va a funcionar, y hasta ahora solo se
                  descubría fallando. */}
              {archivo && (
                <span
                  className={`font-mono ${archivo.size > TOPE_SUBIDA ? "font-semibold text-danger" : "text-muted"}`}
                >
                  {legible(archivo.size)}
                  {archivo.size > TOPE_SUBIDA ? ` · máx. ${legible(TOPE_SUBIDA)}` : ""}
                </span>
              )}
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.xlsm"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setError(null);
              }}
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink shadow-card file:mr-3 file:rounded file:border-0 file:bg-surface-2 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-ink-soft"
            />
          </label>
          <button
            type="submit"
            disabled={!archivo || !suplidorId || subiendo}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-medium text-primary-ink shadow-card transition-colors hover:bg-primary-hover disabled:opacity-55"
          >
            {subiendo ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
            ) : (
              <Upload className="h-4 w-4" strokeWidth={2} aria-hidden />
            )}
            {subiendo ? "Importando…" : "Importar"}
          </button>

          {/* Qué está pasando y desde cuándo. Una lista de 24.000 filas tarda
              ~25 s: sin esto eran 25 segundos de círculo girando sin saber
              si seguía viva. */}
          {fase && (
            <ProgresoLargo
              fase={fase}
              desde={inicio}
              estimado={30}
              className="basis-full"
            />
          )}
        </form>
      )}

      {suplidorId && listaDe(suplidorId) && !resultado && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
          <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Lista vigente: {listaDe(suplidorId)!.filename ?? "—"} ·{" "}
          {listaDe(suplidorId)!.row_count.toLocaleString()} productos
          {listaDe(suplidorId)!.vigencia ? ` · vigente desde ${listaDe(suplidorId)!.vigencia}` : ""}
          . Importar otra la reemplaza (la anterior queda como historial).
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>
      )}
      {resultado && (
        <p className="mt-3 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok">
          Lista de {resultado.suplidor} importada: {resultado.filas.toLocaleString()} productos
          {resultado.vigencia ? ` · vigencia ${resultado.vigencia}` : ""}
          {resultado.hojas.length > 0 ? ` · hojas: ${resultado.hojas.join(", ")}` : ""}. Ya puedes
          buscar.
        </p>
      )}
    </Panel>
  );
}
