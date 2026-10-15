"use client";

// Debida diligencia de la empresa — lo que piden los formularios de «conozca
// a su proveedor» (TSS ADM-FO-031, SNCCP-PROV-F-040, beneficiarios finales).
// Se carga UNA vez aquí y sale en cada proceso. Mismo autosave que el perfil:
// los campos al salir de ellos; las listas, al salir de una fila o al
// agregar/quitar.

import { useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { IndicadorGuardado, Panel, SectionTitle, inputBase } from "@/components/ui";
import { useAccion } from "@/lib/use-accion";
import { guardarPerfilAction } from "@/lib/actions/licitaciones";
import {
  ROLES_PERSONA,
  ROL_PERSONA_LABEL,
  anosOperando,
  diligenciaDe,
  faltantesDiligencia,
  type EmpresaRelacionada,
  type PersonaEmpresa,
  type RolPersona,
} from "@/lib/empresa/diligencia";
import type { EmpresaPerfil } from "@/lib/licitaciones/tipos";

type Patch = Parameters<typeof guardarPerfilAction>[0];

function Texto({
  label,
  defaultValue,
  onSave,
  type = "text",
  placeholder,
  span2 = false,
}: {
  label: string;
  defaultValue: string;
  onSave: (v: string | null) => void;
  type?: string;
  placeholder?: string;
  span2?: boolean;
}) {
  return (
    <label className={`text-[12.5px] text-muted ${span2 ? "sm:col-span-2" : ""}`}>
      {label}
      <input
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== defaultValue) onSave(v || null);
        }}
        className={`${inputBase} mt-1`}
      />
    </label>
  );
}

const PERSONA_VACIA: PersonaEmpresa = {
  nombre: "",
  documento: null,
  nacionalidad: "Dominicana",
  cargo: null,
  formacion: null,
  porcentaje: null,
  roles: [],
};

export default function DiligenciaEmpresa({ perfil }: { perfil: EmpresaPerfil | null }) {
  const { correr, estado } = useAccion();
  const d = diligenciaDe(perfil as unknown as Record<string, unknown>);
  const [personas, setPersonas] = useState<PersonaEmpresa[]>(d.personas);
  const [relacionadas, setRelacionadas] = useState<EmpresaRelacionada[]>(d.empresas_relacionadas);
  const [constitucion, setConstitucion] = useState(d.fecha_constitucion ?? "");

  function guardar(patch: Patch) {
    correr("diligencia", () => guardarPerfilAction(patch), { encolar: true });
  }

  const faltan = faltantesDiligencia({ ...d, personas, empresas_relacionadas: relacionadas, fecha_constitucion: constitucion || null });
  const anos = anosOperando(constitucion || null);

  // Las listas se guardan enteras: son pocas filas y así no hay ids que cuidar.
  function cambiarPersona(i: number, cambio: Partial<PersonaEmpresa>, guardarYa = false) {
    const nuevas = personas.map((p, j) => (j === i ? { ...p, ...cambio } : p));
    setPersonas(nuevas);
    if (guardarYa) guardar({ personas: nuevas });
  }
  function alternarRol(i: number, rol: RolPersona) {
    const p = personas[i];
    const roles = p.roles.includes(rol) ? p.roles.filter((r) => r !== rol) : [...p.roles, rol];
    cambiarPersona(i, { roles }, true);
  }
  function cambiarRelacionada(i: number, cambio: Partial<EmpresaRelacionada>) {
    const nuevas = relacionadas.map((e, j) => (j === i ? { ...e, ...cambio } : e));
    setRelacionadas(nuevas);
    guardar({ empresas_relacionadas: nuevas });
  }

  return (
    <Panel>
      <SectionTitle icon={ShieldCheck} right={<IndicadorGuardado estado={estado} />}>
        Debida diligencia
      </SectionTitle>
      <div className="space-y-5 p-4">
        <p className="text-[12.5px] text-muted">
          Lo que piden los formularios de «conozca a su proveedor» (debida diligencia, beneficiarios
          finales, conflicto de interés). Se carga una vez y sale en cada proceso.
        </p>

        {faltan.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
            <p className="font-semibold">Falta para llenar los formularios sin huecos:</p>
            <p>{faltan.join(" · ")}</p>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Texto
            label="Número de registro mercantil"
            defaultValue={d.registro_mercantil ?? ""}
            onSave={(v) => guardar({ registro_mercantil: v })}
          />
          <label className="text-[12.5px] text-muted">
            Fecha de constitución{anos !== null ? ` · ${anos} años operando` : ""}
            <input
              type="date"
              defaultValue={d.fecha_constitucion ?? ""}
              onChange={(e) => setConstitucion(e.target.value)}
              onBlur={(e) => {
                if (e.target.value !== (d.fecha_constitucion ?? "")) guardar({ fecha_constitucion: e.target.value || null });
              }}
              className={`${inputBase} mt-1`}
            />
          </label>
          <Texto
            label="Fuente principal de financiamiento"
            placeholder="Fondos propios"
            defaultValue={d.financiamiento_principal ?? ""}
            onSave={(v) => guardar({ financiamiento_principal: v })}
          />
          <Texto
            label="Fuente secundaria de financiamiento"
            placeholder="Línea de crédito bancaria"
            defaultValue={d.financiamiento_secundario ?? ""}
            onSave={(v) => guardar({ financiamiento_secundario: v })}
          />
          <Texto
            label="Relación con personas políticamente expuestas"
            placeholder="No (o el detalle)"
            defaultValue={d.relacion_pep ?? ""}
            onSave={(v) => guardar({ relacion_pep: v })}
            span2
          />
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Personas de la empresa</p>
          <p className="mb-2 text-[12px] text-muted">
            Una fila por persona; marca todo lo que es (accionista, beneficiario final, directivo, personal técnico).
          </p>
          <div className="space-y-2">
            {personas.map((p, i) => (
              <div key={i} className="space-y-2 rounded-md border border-line p-3">
                <div className="grid gap-2 sm:grid-cols-6">
                  <input
                    defaultValue={p.nombre}
                    placeholder="Nombre completo"
                    onBlur={(e) => cambiarPersona(i, { nombre: e.target.value }, true)}
                    className={`${inputBase} sm:col-span-2`}
                  />
                  <input
                    defaultValue={p.documento ?? ""}
                    placeholder="Cédula / pasaporte"
                    onBlur={(e) => cambiarPersona(i, { documento: e.target.value || null }, true)}
                    className={`${inputBase} font-mono`}
                  />
                  <input
                    defaultValue={p.nacionalidad ?? ""}
                    placeholder="Nacionalidad"
                    onBlur={(e) => cambiarPersona(i, { nacionalidad: e.target.value || null }, true)}
                    className={inputBase}
                  />
                  <input
                    defaultValue={p.porcentaje ?? ""}
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    placeholder="% acciones"
                    onBlur={(e) => cambiarPersona(i, { porcentaje: e.target.value === "" ? null : Number(e.target.value) }, true)}
                    className={`${inputBase} text-right font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const nuevas = personas.filter((_, j) => j !== i);
                      setPersonas(nuevas);
                      guardar({ personas: nuevas });
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-line text-[12px] text-muted hover:text-red-600"
                    aria-label={`Quitar a ${p.nombre || "esta persona"}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Quitar
                  </button>
                  <input
                    defaultValue={p.cargo ?? ""}
                    placeholder="Cargo"
                    onBlur={(e) => cambiarPersona(i, { cargo: e.target.value || null }, true)}
                    className={`${inputBase} sm:col-span-3`}
                  />
                  <input
                    defaultValue={p.formacion ?? ""}
                    placeholder="Formación académica"
                    onBlur={(e) => cambiarPersona(i, { formacion: e.target.value || null }, true)}
                    className={`${inputBase} sm:col-span-3`}
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  {ROLES_PERSONA.map((rol) => (
                    <label key={rol} className="inline-flex items-center gap-1.5 text-[12px] text-ink">
                      <input type="checkbox" checked={p.roles.includes(rol)} onChange={() => alternarRol(i, rol)} />
                      {ROL_PERSONA_LABEL[rol]}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPersonas([...personas, { ...PERSONA_VACIA }])}
            className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden /> Agregar persona
          </button>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-ink">Empresas relacionadas que venden al Estado</p>
          <p className="mb-2 text-[12px] text-muted">Déjalo vacío si no hay ninguna: los formularios dirán «Ninguna».</p>
          <div className="space-y-2">
            {relacionadas.map((e, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-5">
                <input
                  defaultValue={e.empresa}
                  placeholder="Empresa"
                  onBlur={(ev) => cambiarRelacionada(i, { empresa: ev.target.value })}
                  className={`${inputBase} sm:col-span-2`}
                />
                <input
                  defaultValue={e.rnc ?? ""}
                  placeholder="RNC"
                  onBlur={(ev) => cambiarRelacionada(i, { rnc: ev.target.value || null })}
                  className={`${inputBase} font-mono`}
                />
                <input
                  defaultValue={e.servicio ?? ""}
                  placeholder="Servicio"
                  onBlur={(ev) => cambiarRelacionada(i, { servicio: ev.target.value || null })}
                  className={inputBase}
                />
                <button
                  type="button"
                  onClick={() => {
                    const nuevas = relacionadas.filter((_, j) => j !== i);
                    setRelacionadas(nuevas);
                    guardar({ empresas_relacionadas: nuevas });
                  }}
                  className="inline-flex items-center justify-center gap-1 rounded-md border border-line text-[12px] text-muted hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Quitar
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRelacionadas([...relacionadas, { empresa: "", pais: "República Dominicana", rnc: null, servicio: null }])}
            className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden /> Agregar empresa relacionada
          </button>
        </div>
      </div>
    </Panel>
  );
}
