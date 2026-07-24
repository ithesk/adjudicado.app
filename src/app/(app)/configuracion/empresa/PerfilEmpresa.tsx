"use client";

// Perfil fiscal, cotizador y firmantes — con AUTOSAVE: cada campo se guarda
// al salir de él (fricción cero, no hay botón "Guardar" que olvidar).

import { useRef, useState } from "react";
import { Building2, PenLine } from "lucide-react";
import { IndicadorGuardado, Panel, SectionTitle, inputBase } from "@/components/ui";
import { useAccion } from "@/lib/use-accion";
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

// Fuera del componente a propósito: si se define adentro, React lo remonta en
// cada render y el refresh del autosave borraría texto a medio escribir.
function Campo({
  label,
  name,
  defaultValue,
  onSave,
  span2 = false,
  mono = false,
  type = "text",
}: {
  label: string;
  name: keyof EmpresaPerfil;
  defaultValue: string;
  onSave: (patch: Partial<EmpresaPerfil>) => void;
  span2?: boolean;
  mono?: boolean;
  type?: string;
}) {
  return (
    <label className={`text-[12.5px] text-muted ${span2 ? "sm:col-span-2" : ""}`}>
      {label}
      <input
        type={type}
        defaultValue={defaultValue}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== defaultValue) onSave({ [name]: v || null });
        }}
        className={`${inputBase} mt-1 ${mono ? "font-mono" : ""}`}
      />
    </label>
  );
}

export default function PerfilEmpresa({
  perfil,
  firmantes,
}: {
  perfil: EmpresaPerfil | null;
  firmantes: LicFirmante[];
}) {
  const { correr, estado } = useAccion();

  // Estado vivo del cotizador (para la vista previa de los dos modos).
  const [margenPct, setMargenPct] = useState(perfil?.margen_pct ?? 30);
  const [margenModo, setMargenModo] = useState<"markup" | "margen">(
    perfil?.margen_modo ?? "markup",
  );
  const [tasa, setTasa] = useState(perfil?.tasa_usd_dop ?? 0);

  // `encolar`: todos los campos comparten la clave "perfil", así que rellenar
  // el formulario a golpe de Tab encadena guardados. Sin cola, los que caían
  // mientras corría el anterior se descartaban en silencio.
  function autosave(patch: Parameters<typeof guardarPerfilAction>[0]) {
    correr("perfil", () => guardarPerfilAction(patch), { encolar: true });
  }

  const ejemploCosto = 1000;
  const preview = (modo: "markup" | "margen") =>
    precioVentaUnitario(ejemploCosto, {
      tasa: tasa || 61.5,
      margenPct,
      margenModo: modo,
      itbisPct: 18,
    });

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel>
        <SectionTitle icon={Building2} right={<IndicadorGuardado estado={estado} />}>
          Perfil fiscal y cotizador
        </SectionTitle>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Campo
            label="Razón social (como aparece en el RPE)"
            name="nombre_legal"
            defaultValue={perfil?.nombre_legal ?? ""}
            onSave={autosave}
            span2
          />
          <Campo label="RNC" name="rnc" defaultValue={perfil?.rnc ?? ""} onSave={autosave} mono />
          <Campo label="RPE" name="rpe" defaultValue={perfil?.rpe ?? ""} onSave={autosave} mono />
          <Campo
            label="Dirección"
            name="direccion"
            defaultValue={perfil?.direccion ?? ""}
            onSave={autosave}
            span2
          />
          <Campo label="Teléfono" name="telefono" defaultValue={perfil?.telefono ?? ""} onSave={autosave} />
          <Campo label="Email" name="email" defaultValue={perfil?.email ?? ""} onSave={autosave} type="email" />

          <div className="mt-1 border-t border-line pt-3 sm:col-span-2">
            <p className="mb-2 text-[13px] font-semibold text-ink">Cotizador</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-[12.5px] text-muted">
                Tasa USD → DOP
                <input
                  type="number"
                  step="0.01"
                  defaultValue={perfil?.tasa_usd_dop ?? ""}
                  placeholder="61.50"
                  onChange={(e) => setTasa(Number(e.target.value) || 0)}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || null;
                    if (v !== perfil?.tasa_usd_dop) autosave({ tasa_usd_dop: v });
                  }}
                  className={`${inputBase} mt-1 text-right font-mono`}
                />
              </label>
              <label className="text-[12.5px] text-muted">
                Margen %
                <input
                  type="number"
                  step="0.1"
                  defaultValue={perfil?.margen_pct ?? 30}
                  onChange={(e) => setMargenPct(Number(e.target.value) || 0)}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 30;
                    if (v !== perfil?.margen_pct) autosave({ margen_pct: v });
                  }}
                  className={`${inputBase} mt-1 text-right font-mono`}
                />
              </label>
              <label className="text-[12.5px] text-muted">
                ITBIS %
                <input
                  type="number"
                  step="0.1"
                  defaultValue={perfil?.itbis_pct ?? 18}
                  onBlur={(e) => {
                    const v = Number(e.target.value) || 18;
                    if (v !== perfil?.itbis_pct) autosave({ itbis_pct: v });
                  }}
                  className={`${inputBase} mt-1 text-right font-mono`}
                />
              </label>
            </div>

            {/* El modo del margen con los DOS números en vivo: la diferencia
                es plata en cada oferta. Elegir guarda al instante. */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["markup", "Markup sobre el costo", `costo × ${redondear2(factorMargen(margenPct, "markup"))}`],
                  ["margen", "Margen sobre la venta", margenPct < 100 ? `costo ÷ ${redondear2(1 / factorMargen(margenPct, "margen"))}` : "—"],
                ] as const
              ).map(([modo, label, formula]) => (
                <button
                  key={modo}
                  type="button"
                  onClick={() => {
                    setMargenModo(modo);
                    autosave({ margen_modo: modo });
                  }}
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
                    <strong>{preview(modo) !== null ? formatRD(preview(modo)) : "—"}</strong>
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </Panel>

      <Panel className="self-start">
        <SectionTitle icon={PenLine}>Firmantes</SectionTitle>
        <div className="space-y-4 p-4">
          <p className="text-[12.5px] text-muted">
            Quién firma qué: el Gerente General firma las ofertas técnicas y todo
            requisito no-subsanable; la Gerencia de Ventas, lo comercial y
            subsanable. Se guarda solo al salir del campo.
          </p>
          {(["gerente_general", "gerente_ventas"] as RolFirmante[]).map((rol) => (
            <FirmanteAutosave
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

function FirmanteAutosave({
  rol,
  actual,
}: {
  rol: RolFirmante;
  actual: LicFirmante | null;
}) {
  const { correr, estado } = useAccion();
  // El upsert necesita la fila completa: el estado local acumula los campos.
  const datos = useRef({
    nombre: actual?.nombre ?? "",
    cedula: actual?.cedula ?? "",
    cargo: actual?.cargo ?? ROL_FIRMANTE_LABEL[rol],
  });

  function guardar() {
    const d = datos.current;
    if (!d.nombre.trim()) return; // sin nombre no hay firmante todavía
    correr(
      `firmante-${rol}`,
      () =>
        guardarFirmanteAction(rol, {
          nombre: d.nombre.trim(),
          cedula: d.cedula.trim() || null,
          cargo: d.cargo.trim() || ROL_FIRMANTE_LABEL[rol],
        }),
      { encolar: true },
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-line p-3">
      <p className="flex items-center justify-between text-[12.5px] font-semibold text-ink">
        {ROL_FIRMANTE_LABEL[rol]}
        <IndicadorGuardado estado={estado} />
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          defaultValue={actual?.nombre ?? ""}
          placeholder="Nombre completo"
          onBlur={(e) => {
            datos.current.nombre = e.target.value;
            guardar();
          }}
          className={`${inputBase} sm:col-span-2`}
        />
        <input
          defaultValue={actual?.cedula ?? ""}
          placeholder="Cédula"
          onBlur={(e) => {
            datos.current.cedula = e.target.value;
            guardar();
          }}
          className={`${inputBase} font-mono`}
        />
        <input
          defaultValue={actual?.cargo ?? ROL_FIRMANTE_LABEL[rol]}
          placeholder="Cargo"
          onBlur={(e) => {
            datos.current.cargo = e.target.value;
            guardar();
          }}
          className={`${inputBase} sm:col-span-3`}
        />
      </div>
    </div>
  );
}
