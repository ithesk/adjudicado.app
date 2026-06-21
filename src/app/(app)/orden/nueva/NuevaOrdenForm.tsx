"use client";

import { useActionState, useRef, useState } from "react";
import { X } from "lucide-react";
import type { TipoItem } from "@/lib/types";
import { crearOrden, type CrearState } from "./actions";

interface ItemDraft {
  nombre: string;
  tipo: TipoItem;
  cantidad: number;
}

interface Datos {
  numero_oc: string;
  institucion: string;
  codigo_expediente: string;
  fecha_oc: string;
  moneda: "DOP" | "USD";
  monto: string;
  plazo_entrega: string;
}

const VACIO: Datos = {
  numero_oc: "",
  institucion: "",
  codigo_expediente: "",
  fecha_oc: "",
  moneda: "DOP",
  monto: "",
  plazo_entrega: "",
};

export default function NuevaOrdenForm() {
  const [fase, setFase] = useState<"subir" | "confirmar">("subir");
  const [cargando, setCargando] = useState(false);
  const [errorOcr, setErrorOcr] = useState<string | null>(null);
  const [datos, setDatos] = useState<Datos>(VACIO);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [ocrRaw, setOcrRaw] = useState<unknown>(null);
  const [archivoPath, setArchivoPath] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [state, formAction, enviando] = useActionState<CrearState, FormData>(
    crearOrden,
    {},
  );

  async function subir(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setCargando(true);
    setErrorOcr(null);

    const fd = new FormData();
    fd.append("archivo", file);
    try {
      const res = await fetch("/api/ocr", { method: "POST", body: fd });
      const json = await res.json();
      if (json.archivo_path) setArchivoPath(json.archivo_path);

      if (!res.ok) {
        setErrorOcr(
          (json.error ?? "El OCR falló.") +
            " Puedes ingresar los datos a mano.",
        );
        setFase("confirmar");
        return;
      }

      const o = json.ocr;
      setDatos({
        numero_oc: o.numero_oc ?? "",
        institucion: o.institucion ?? "",
        codigo_expediente: o.codigo_expediente ?? "",
        fecha_oc: o.fecha_oc ?? "",
        moneda: o.moneda === "USD" ? "USD" : "DOP",
        monto: o.monto_total != null ? String(o.monto_total) : "",
        plazo_entrega: o.plazo_entrega ?? "",
      });
      setItems(
        Array.isArray(o.items)
          ? o.items.map((it: ItemDraft) => ({
              nombre: it.nombre ?? "",
              tipo: it.tipo ?? "licencia",
              cantidad: Number(it.cantidad) || 1,
            }))
          : [],
      );
      setOcrRaw(json.crudo ?? null);
      setFase("confirmar");
    } catch {
      setErrorOcr("No se pudo contactar el servidor. Intenta de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  if (fase === "subir") {
    return (
      <form
        onSubmit={subir}
        className="rounded-md border border-line bg-surface p-6"
      >
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-line px-6 py-10 text-center transition hover:border-line">
          <span className="text-sm font-medium text-ink">
            Toca para elegir el PDF de la OC
          </span>
          <span className="text-xs text-muted">Solo PDF, hasta 15 MB</span>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            className="mt-2 text-xs"
            required
          />
        </label>

        {errorOcr && (
          <p className="mt-3 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
            {errorOcr}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="mt-4 w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-ink transition hover:bg-primary-hover disabled:opacity-60"
        >
          {cargando ? "Leyendo el documento…" : "Extraer datos"}
        </button>
      </form>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-5 rounded-md border border-line bg-surface p-6"
    >
      {errorOcr && (
        <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {errorOcr}
        </p>
      )}
      <p className="rounded-md bg-surface-2 px-3 py-2 text-sm text-ink">
        Revisa lo extraído y corrige lo que haga falta. El{" "}
        <strong>plazo de entrega</strong> es obligatorio.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo
          label="Número de OC"
          value={datos.numero_oc}
          onChange={(v) => setDatos({ ...datos, numero_oc: v })}
        />
        <Campo
          label="Institución"
          value={datos.institucion}
          onChange={(v) => setDatos({ ...datos, institucion: v })}
        />
        <Campo
          label="Código de expediente"
          value={datos.codigo_expediente}
          onChange={(v) => setDatos({ ...datos, codigo_expediente: v })}
        />
        <Campo
          label="Fecha de la OC"
          type="date"
          value={datos.fecha_oc}
          onChange={(v) => setDatos({ ...datos, fecha_oc: v })}
        />
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-1 block">
            <span className="mb-1 block text-sm font-medium text-ink">
              Moneda
            </span>
            <select
              value={datos.moneda}
              onChange={(e) =>
                setDatos({
                  ...datos,
                  moneda: e.target.value as "DOP" | "USD",
                })
              }
              className="w-full rounded-md border border-line px-2 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="DOP">RD$</option>
              <option value="USD">US$</option>
            </select>
          </label>
          <div className="col-span-2">
            <Campo
              label="Monto total"
              type="number"
              value={datos.monto}
              onChange={(v) => setDatos({ ...datos, monto: v })}
            />
          </div>
        </div>
        <Campo
          label="Plazo de entrega *"
          type="date"
          required
          value={datos.plazo_entrega}
          onChange={(v) => setDatos({ ...datos, plazo_entrega: v })}
        />
      </div>

      <Items items={items} setItems={setItems} />

      {state.error && (
        <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}

      {/* Campos que viajan al server action */}
      <input type="hidden" name="numero_oc" value={datos.numero_oc} />
      <input type="hidden" name="institucion" value={datos.institucion} />
      <input
        type="hidden"
        name="codigo_expediente"
        value={datos.codigo_expediente}
      />
      <input type="hidden" name="fecha_oc" value={datos.fecha_oc} />
      <input type="hidden" name="moneda" value={datos.moneda} />
      <input type="hidden" name="monto" value={datos.monto} />
      <input type="hidden" name="plazo_entrega" value={datos.plazo_entrega} />
      <input type="hidden" name="archivo_path" value={archivoPath} />
      <input type="hidden" name="items_json" value={JSON.stringify(items)} />
      <input
        type="hidden"
        name="ocr_raw"
        value={ocrRaw ? JSON.stringify(ocrRaw) : ""}
      />

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setFase("subir")}
          className="rounded-md border border-line px-4 py-2.5 text-sm font-medium text-muted"
        >
          Atrás
        </button>
        <button
          type="submit"
          disabled={enviando}
          className="flex-1 rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-ink transition hover:bg-primary-hover disabled:opacity-60"
        >
          {enviando ? "Creando…" : "Crear orden"}
        </button>
      </div>
    </form>
  );
}

function Items({
  items,
  setItems,
}: {
  items: ItemDraft[];
  setItems: (i: ItemDraft[]) => void;
}) {
  function actualizar(idx: number, patch: Partial<ItemDraft>) {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink">
          Ítems ({items.length})
        </span>
        <button
          type="button"
          onClick={() =>
            setItems([...items, { nombre: "", tipo: "licencia", cantidad: 1 }])
          }
          className="text-sm font-medium text-muted hover:text-ink"
        >
          + Agregar ítem
        </button>
      </div>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={it.nombre}
              onChange={(e) => actualizar(i, { nombre: e.target.value })}
              placeholder="Nombre del ítem"
              className="flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={it.tipo}
              onChange={(e) =>
                actualizar(i, { tipo: e.target.value as TipoItem })
              }
              className="w-28 rounded-md border border-line px-2 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="licencia">Licencia</option>
              <option value="fisico">Físico</option>
              <option value="servicio">Servicio</option>
            </select>
            <input
              type="number"
              value={it.cantidad}
              min={1}
              onChange={(e) =>
                actualizar(i, { cantidad: Number(e.target.value) || 1 })
              }
              className="w-16 rounded-md border border-line px-2 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              className="grid place-items-center px-2 text-muted transition-colors hover:text-danger"
              title="Quitar"
              aria-label="Quitar ítem"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-muted">
            Sin ítems. Agrega al menos uno si el OCR no los detectó.
          </p>
        )}
      </div>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">
        {label}
      </span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
