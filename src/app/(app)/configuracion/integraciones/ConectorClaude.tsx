"use client";

// Conectores de Claude: cada URL /api/mcp/<token> se pega en claude.ai como
// conector personalizado. El token se ve UNA vez al crearlo; después solo
// su prefijo, para reconocerlo y revocarlo.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Plus } from "lucide-react";
import { Boton, inputBase } from "@/components/ui";
import { avisoOk } from "@/lib/avisos";
import { crearConector, revocarConector, type ConectorMcp } from "@/lib/actions/mcp";

function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export default function ConectorClaude({
  conectores,
  esAdmin,
}: {
  conectores: ConectorMcp[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [creando, setCreando] = useState(false);
  const [nueva, setNueva] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, startTransition] = useTransition();

  if (!esAdmin) {
    return <p className="text-[12.5px] text-muted">Solo un administrador puede crear conectores.</p>;
  }

  function crear(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await crearConector(String(fd.get("nombre") || ""));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setNueva(`${window.location.origin}/api/mcp/${r.token}`);
      setCreando(false);
      router.refresh();
    });
  }

  function revocar(c: ConectorMcp) {
    if (!confirm(`¿Revocar «${c.nombre}»? Claude dejará de poder usar esa URL.`)) return;
    startTransition(async () => {
      const err = await revocarConector(c.id);
      if (err) setError(err);
      else avisoOk("Conector revocado.");
      router.refresh();
    });
  }

  async function copiar() {
    if (!nueva) return;
    await navigator.clipboard.writeText(nueva);
    setCopiada(true);
    setTimeout(() => setCopiada(false), 2000);
  }

  const activos = conectores.filter((c) => !c.revocado_at);

  return (
    <div className="space-y-3">
      {nueva && (
        <div className="space-y-2 rounded-md border border-ok/25 bg-ok-soft/40 px-3 py-2.5">
          <p className="text-[13px] font-medium text-ink">
            Copia esta URL ahora: no se vuelve a mostrar.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded border border-line bg-surface px-2 py-1 font-mono text-[11.5px] text-ink">
              {nueva}
            </code>
            <Boton variante="ghost" onClick={copiar} className="!px-2.5 !py-1 !text-[12px]">
              {copiada ? <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />}
              {copiada ? "Copiada" : "Copiar"}
            </Boton>
          </div>
          <p className="text-[12px] text-muted">
            En claude.ai: Configuración → Conectores → «Agregar conector personalizado», pega la URL y
            deja vacíos los campos de OAuth.
          </p>
        </div>
      )}

      {activos.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line">
          {activos.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <KeyRound className="h-4 w-4 flex-none text-muted" strokeWidth={2} aria-hidden />
              <div className="min-w-40 flex-1">
                <p className="text-[13px] font-medium text-ink">{c.nombre}</p>
                <p className="text-[11.5px] text-muted">
                  <span className="font-mono">{c.prefijo}…</span> · creado {fechaCorta(c.created_at)}
                  {c.ultimo_uso ? ` · usado ${fechaCorta(c.ultimo_uso)}` : " · sin usar"}
                </p>
              </div>
              <Boton variante="ghost" disabled={ocupado} onClick={() => revocar(c)} className="!px-2.5 !py-1 !text-[12px]">
                Revocar
              </Boton>
            </li>
          ))}
        </ul>
      )}

      {creando ? (
        <form action={crear} className="flex flex-wrap items-center gap-2">
          <input
            name="nombre"
            autoFocus
            placeholder="Nombre (p. ej. «Claude de Pablo»)"
            className={`${inputBase} min-w-56 flex-1`}
          />
          <Boton type="submit" cargando={ocupado}>Crear URL</Boton>
          <Boton variante="ghost" onClick={() => setCreando(false)}>Cancelar</Boton>
        </form>
      ) : (
        <Boton onClick={() => setCreando(true)}>
          <Plus className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
          Nuevo conector
        </Boton>
      )}
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}
