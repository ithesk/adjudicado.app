"use client";

// Importación de listas de precios: elige un suplidor del catálogo, sube su
// Excel y el parser detecta solo las columnas. La nueva lista queda vigente
// y la anterior pasa al historial.

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { Panel } from "@/components/ui";
import { fetchLargo } from "@/lib/fetch-cliente";

const MB = 1024 * 1024;

// Tope REAL de una subida en Vercel: la plataforma rechaza cualquier cuerpo
// mayor, y lo hace ANTES de que la ruta llegue a ejecutarse. Por eso su
// respuesta no es JSON y no trae explicación: hay que ponerla aquí.
const TOPE_SUBIDA = 4.5 * MB;

const legible = (bytes: number) => `${(bytes / MB).toFixed(1)} MB`;

// Traduce el código de la respuesta a algo que se pueda leer y actuar. Sin
// esto, cualquier fallo que no venga de la ruta se veía como «inténtalo de
// nuevo», que no dice qué pasó ni qué hacer.
function mensajePorEstado(status: number, tamano: number): string {
  if (status === 413)
    return `El archivo pesa ${legible(tamano)} y el servidor no acepta más de ${legible(TOPE_SUBIDA)}. Divide la lista en partes o pídeme que habilitemos la subida directa.`;
  if (status === 401)
    return "Tu sesión caducó. Recarga la página y vuelve a entrar.";
  if (status === 504 || status === 502)
    return "El servidor tardó demasiado procesando la lista. Prueba con menos filas.";
  if (status >= 500)
    return `El servidor falló procesando la lista (error ${status}). Si se repite, avísanos.`;
  return `La importación falló (error ${status}).`;
}
import type { ListaVigente } from "@/lib/precios/tipos";
import type { SuplidorOpcion } from "./BuscadorPrecios";

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
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivo || !suplidorId || subiendo) return;
    // Se comprueba ANTES de subir: enviar 20 MB para que el servidor los
    // rechace es hacer esperar al usuario un minuto para nada, y encima el
    // rechazo llega sin explicación porque no lo genera la aplicación.
    if (archivo.size > TOPE_SUBIDA) {
      setError(
        `El archivo pesa ${legible(archivo.size)} y el máximo que admite el servidor son ${legible(TOPE_SUBIDA)}. ` +
          "Divide la lista en varias partes (por hoja o por rango de filas) e impórtalas una a una.",
      );
      return;
    }
    setSubiendo(true);
    setError(null);
    setResultado(null);
    const form = new FormData();
    form.set("archivo", archivo);
    form.set("suplidor_id", suplidorId);
    try {
      // Con tope: es la subida más pesada de la app (listas de hasta 30 MB) y
      // era la ÚNICA llamada del cliente sin límite de espera — si el
      // servidor se colgaba, el spinner giraba para siempre. 150 s deja
      // margen sobre los 120 s que la ruta se concede a sí misma.
      const res = await fetchLargo("/api/precios/importar", 150_000, {
        method: "POST",
        body: form,
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
