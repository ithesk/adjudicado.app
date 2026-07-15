"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, PenLine } from "lucide-react";
import { Panel, SectionTitle, btnPrimary, inputBase } from "@/components/ui";
import { formatRD } from "@/lib/types";
import {
  guardarFirmanteAction,
  guardarPerfilAction,
} from "@/lib/actions/licitaciones";
import {
  factorMargen,
  precioVentaUnitario,
  redondear2,
} from "@/lib/licitaciones/cotizador";
import {
  ROL_FIRMANTE_LABEL,
  type EmpresaPerfil,
  type LicFirmante,
  type RolFirmante,
} from "@/lib/licitaciones/tipos";

export default function EmpresaForm({
  perfil,
  firmantes,
}: {
  perfil: EmpresaPerfil | null;
  firmantes: LicFirmante[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [pendiente, startTransition] = useTransition();

  // Estado vivo para la vista previa del margen.
  const [margenPct, setMargenPct] = useState(perfil?.margen_pct ?? 30);
  const [margenModo, setMargenModo] = useState<"markup" | "margen">(
    perfil?.margen_modo ?? "markup",
  );
  const [tasa, setTasa] = useState(perfil?.tasa_usd_dop ?? 0);

  function guardar(fd: FormData) {
    setError(null);
    setGuardado(false);
    startTransition(async () => {
      const err = await guardarPerfilAction({
        nombre_legal: String(fd.get("nombre_legal") || ""),
        rnc: String(fd.get("rnc") || "") || null,
        rpe: String(fd.get("rpe") || "") || null,
        direccion: String(fd.get("direccion") || "") || null,
        telefono: String(fd.get("telefono") || "") || null,
        email: String(fd.get("email") || "") || null,
        tasa_usd_dop: tasa > 0 ? tasa : null,
        tasa_fecha: tasa > 0 ? new Date().toISOString().slice(0, 10) : null,
        margen_pct: margenPct,
        margen_modo: margenModo,
        itbis_pct: Number(fd.get("itbis_pct")) || 18,
      });
      if (err) setError(err);
      else setGuardado(true);
      router.refresh();
    });
  }

  const ejemploCosto = 1000;
  const pMarkup = precioVentaUnitario(ejemploCosto, {
    tasa: tasa || 61.5,
    margenPct,
    margenModo: "markup",
    itbisPct: 18,
  });
  const pMargen = precioVentaUnitario(ejemploCosto, {
    tasa: tasa || 61.5,
    margenPct,
    margenModo: "margen",
    itbisPct: 18,
  });

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel>
        <SectionTitle icon={Building2}>Perfil fiscal y cotizador</SectionTitle>
        <form action={guardar} className="grid gap-3 p-4 sm:grid-cols-2">
          {error && (
            <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger sm:col-span-2">
              {error}
            </p>
          )}
          {guardado && (
            <p className="rounded-md bg-ok-soft px-3 py-2 text-[13px] text-ok sm:col-span-2">
              Guardado.
            </p>
          )}

          <label className="text-[12.5px] text-muted sm:col-span-2">
            Razón social (como aparece en el RPE) *
            <input
              name="nombre_legal"
              required
              defaultValue={perfil?.nombre_legal ?? ""}
              className={`${inputBase} mt-1`}
            />
          </label>
          <label className="text-[12.5px] text-muted">
            RNC
            <input name="rnc" defaultValue={perfil?.rnc ?? ""} className={`${inputBase} mt-1 font-mono`} />
          </label>
          <label className="text-[12.5px] text-muted">
            RPE
            <input name="rpe" defaultValue={perfil?.rpe ?? ""} className={`${inputBase} mt-1 font-mono`} />
          </label>
          <label className="text-[12.5px] text-muted sm:col-span-2">
            Dirección
            <input name="direccion" defaultValue={perfil?.direccion ?? ""} className={`${inputBase} mt-1`} />
          </label>
          <label className="text-[12.5px] text-muted">
            Teléfono
            <input name="telefono" defaultValue={perfil?.telefono ?? ""} className={`${inputBase} mt-1`} />
          </label>
          <label className="text-[12.5px] text-muted">
            Email
            <input type="email" name="email" defaultValue={perfil?.email ?? ""} className={`${inputBase} mt-1`} />
          </label>

          <div className="mt-2 border-t border-line pt-3 sm:col-span-2">
            <p className="mb-2 text-[13px] font-semibold text-ink">Cotizador</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-[12.5px] text-muted">
                Tasa USD → DOP
                <input
                  type="number"
                  step="0.01"
                  value={tasa || ""}
                  onChange={(e) => setTasa(Number(e.target.value) || 0)}
                  placeholder="61.50"
                  className={`${inputBase} mt-1 text-right font-mono`}
                />
              </label>
              <label className="text-[12.5px] text-muted">
                Margen %
                <input
                  type="number"
                  step="0.1"
                  value={margenPct}
                  onChange={(e) => setMargenPct(Number(e.target.value) || 0)}
                  className={`${inputBase} mt-1 text-right font-mono`}
                />
              </label>
              <label className="text-[12.5px] text-muted">
                ITBIS %
                <input
                  type="number"
                  step="0.1"
                  name="itbis_pct"
                  defaultValue={perfil?.itbis_pct ?? 18}
                  className={`${inputBase} mt-1 text-right font-mono`}
                />
              </label>
            </div>

            {/* El modo del margen, con los DOS números en vivo: la diferencia
                es plata en cada oferta — se elige viéndola. */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["markup", "Markup sobre el costo", pMarkup, `costo × ${redondear2(factorMargen(margenPct, "markup"))}`],
                  ["margen", "Margen sobre la venta", pMargen, margenPct < 100 ? `costo ÷ ${redondear2(1 / factorMargen(margenPct, "margen"))}` : "—"],
                ] as const
              ).map(([modo, label, precio, formula]) => (
                <button
                  key={modo}
                  type="button"
                  onClick={() => setMargenModo(modo)}
                  className={`rounded-lg border-2 p-3 text-left transition-colors ${
                    margenModo === modo
                      ? "border-primary bg-primary/5"
                      : "border-line hover:border-line-strong"
                  }`}
                >
                  <p className="text-[12.5px] font-semibold text-ink">{label}</p>
                  <p className="font-mono text-[11.5px] text-muted">{formula}</p>
                  <p className="mt-1 font-mono text-sm text-ink">
                    US${ejemploCosto.toLocaleString()} →{" "}
                    <strong>{precio !== null ? formatRD(precio) : "—"}</strong>
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="sm:col-span-2">
            <button type="submit" disabled={pendiente} className={btnPrimary()}>
              {pendiente ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </Panel>

      <Panel className="self-start">
        <SectionTitle icon={PenLine}>Firmantes</SectionTitle>
        <div className="space-y-4 p-4">
          <p className="text-[12.5px] text-muted">
            Quién firma qué: el Gerente General firma las ofertas técnicas y
            todo requisito no-subsanable; la Gerencia de Ventas, lo comercial y
            subsanable.
          </p>
          {(["gerente_general", "gerente_ventas"] as RolFirmante[]).map((rol) => (
            <FirmanteForm
              key={rol}
              rol={rol}
              actual={firmantes.find((f) => f.rol === rol) ?? null}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function FirmanteForm({
  rol,
  actual,
}: {
  rol: RolFirmante;
  actual: LicFirmante | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pendiente, startTransition] = useTransition();

  function guardar(fd: FormData) {
    setMsg(null);
    startTransition(async () => {
      const err = await guardarFirmanteAction(rol, {
        nombre: String(fd.get("nombre") || ""),
        cedula: String(fd.get("cedula") || "") || null,
        cargo: String(fd.get("cargo") || "") || ROL_FIRMANTE_LABEL[rol],
      });
      setMsg(err ?? "Guardado.");
      router.refresh();
    });
  }

  return (
    <form action={guardar} className="space-y-2 rounded-md border border-line p-3">
      <p className="text-[12.5px] font-semibold text-ink">{ROL_FIRMANTE_LABEL[rol]}</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          name="nombre"
          required
          defaultValue={actual?.nombre ?? ""}
          placeholder="Nombre completo"
          className={`${inputBase} sm:col-span-2`}
        />
        <input
          name="cedula"
          defaultValue={actual?.cedula ?? ""}
          placeholder="Cédula"
          className={`${inputBase} font-mono`}
        />
        <input
          name="cargo"
          defaultValue={actual?.cargo ?? ROL_FIRMANTE_LABEL[rol]}
          placeholder="Cargo"
          className={`${inputBase} sm:col-span-2`}
        />
        <button type="submit" disabled={pendiente} className={btnPrimary("!py-2")}>
          {pendiente ? "…" : "Guardar"}
        </button>
      </div>
      {msg && (
        <p className={`text-[12px] ${msg === "Guardado." ? "text-ok" : "text-danger"}`}>
          {msg}
        </p>
      )}
    </form>
  );
}
