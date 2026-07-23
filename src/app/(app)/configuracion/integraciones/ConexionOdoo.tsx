"use client";

// El flujo «Conectar con Odoo»: un botón, el admin pone sus credenciales,
// el sistema VALIDA contra el servidor antes de guardar (si fallan, no se
// guarda nada) y queda la tarjeta de conectado con versión y última prueba.
// La API key nunca vuelve al navegador: conectado se muestra ••••.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Plug, Unplug, XCircle } from "lucide-react";
import { Boton, inputBase } from "@/components/ui";
import { avisoOk } from "@/lib/avisos";
import { conectarOdoo, desconectarOdoo, probarOdoo } from "@/lib/actions/odoo";
import type { EstadoIntegracionOdoo } from "@/lib/odoo-config";

function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

export default function ConexionOdoo({ estado }: { estado: EstadoIntegracionOdoo }) {
  const router = useRouter();
  const [formAbierto, setFormAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prueba, setPrueba] = useState<string | null>(null);
  const [ocupado, startTransition] = useTransition();

  function conectar(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await conectarOdoo({
        url: String(fd.get("url") || ""),
        db: String(fd.get("db") || ""),
        usuario: String(fd.get("usuario") || ""),
        apiKey: String(fd.get("apiKey") || ""),
      });
      if (!r.ok) {
        setError(r.error ?? "No se pudo conectar.");
        return;
      }
      setFormAbierto(false);
      avisoOk(`Conectado con Odoo ${r.version ?? ""}`.trim());
      router.refresh();
    });
  }

  function probar() {
    setPrueba(null);
    startTransition(async () => {
      const r = await probarOdoo();
      setPrueba(r.ok ? `Conexión OK — Odoo ${r.version}` : r.error ?? "Falló la conexión.");
      router.refresh();
    });
  }

  function desconectar() {
    if (!confirm("¿Desconectar Odoo de esta empresa? La sincronización de facturas se detiene (las credenciales se borran).")) return;
    startTransition(async () => {
      const err = await desconectarOdoo();
      if (err) setError(err);
      else {
        setPrueba(null);
        avisoOk("Odoo desconectado.");
      }
      router.refresh();
    });
  }

  // ── Conectado: la tarjeta de estado ──────────────────────────────────────
  if (estado.conectado && !formAbierto) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-ok/25 bg-ok-soft/40 px-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 flex-none text-ok" strokeWidth={2} aria-hidden />
          <div className="min-w-52 flex-1">
            <p className="text-[13px] font-medium text-ink">
              Conectado a <span className="font-mono">{estado.db}</span>
              {estado.version ? ` — Odoo ${estado.version}` : ""}
            </p>
            <p className="truncate text-[11.5px] text-muted">
              {estado.url} · {estado.usuario}
              {estado.probado_at ? ` · probado ${fechaCorta(estado.probado_at)}` : ""}
              {estado.via === "env" ? " · por variables de entorno (modo legado)" : ""}
            </p>
          </div>
          <Boton variante="ghost" cargando={ocupado} onClick={probar} className="!px-2.5 !py-1 !text-[12px]">
            Probar
          </Boton>
          {estado.via === "cuenta" ? (
            <Boton variante="ghost" disabled={ocupado} onClick={desconectar} className="!px-2.5 !py-1 !text-[12px]">
              <Unplug className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              Desconectar
            </Boton>
          ) : (
            <Boton variante="ghost" disabled={ocupado} onClick={() => setFormAbierto(true)} className="!px-2.5 !py-1 !text-[12px]">
              Conectar la cuenta de esta empresa
            </Boton>
          )}
        </div>
        {prueba && (
          <p className={`flex items-center gap-1.5 text-[12.5px] ${prueba.startsWith("Conexión OK") ? "text-ok" : "text-danger"}`}>
            {prueba.startsWith("Conexión OK") ? (
              <CheckCircle2 className="h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
            ) : (
              <XCircle className="h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
            )}
            {prueba}
          </p>
        )}
      </div>
    );
  }

  // ── Sin conectar: el botón → el formulario ───────────────────────────────
  if (!formAbierto) {
    return (
      <div className="space-y-2">
        <Boton onClick={() => setFormAbierto(true)}>
          <Plug className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          Conectar con Odoo
        </Boton>
        <p className="text-[12px] text-muted">
          El administrador pone las credenciales una vez y la sincronización de
          facturas queda andando sola. La API key se guarda cifrada.
        </p>
      </div>
    );
  }

  return (
    <form action={conectar} className="max-w-md space-y-2.5">
      <label className="block text-[12.5px] text-muted">
        URL del servidor
        <input
          name="url"
          required
          placeholder="https://miempresa.odoo.com"
          defaultValue={estado.via === "env" ? estado.url : ""}
          className={`${inputBase} mt-1 font-mono`}
        />
      </label>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block text-[12.5px] text-muted">
          Base de datos
          <input
            name="db"
            required
            placeholder="miempresa"
            defaultValue={estado.via === "env" ? estado.db : ""}
            className={`${inputBase} mt-1 font-mono`}
          />
        </label>
        <label className="block text-[12.5px] text-muted">
          Usuario (email)
          <input
            name="usuario"
            required
            placeholder="admin@miempresa.com"
            defaultValue={estado.via === "env" ? estado.usuario : ""}
            className={`${inputBase} mt-1 font-mono`}
          />
        </label>
      </div>
      <label className="block text-[12.5px] text-muted">
        API key
        <input
          name="apiKey"
          type="password"
          required
          placeholder="La llave API del usuario (Ajustes → Seguridad de la cuenta)"
          autoComplete="off"
          className={`${inputBase} mt-1 font-mono`}
        />
      </label>
      {error && (
        <p className="flex items-start gap-1.5 rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
          <XCircle className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Boton type="submit" cargando={ocupado}>
          <Plug className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          {ocupado ? "Probando la conexión…" : "Conectar"}
        </Boton>
        <Boton variante="ghost" type="button" disabled={ocupado} onClick={() => { setFormAbierto(false); setError(null); }}>
          Cancelar
        </Boton>
      </div>
      <p className="text-[11.5px] text-muted">
        Se prueba la conexión ANTES de guardar: si las credenciales fallan, no
        se guarda nada.
      </p>
    </form>
  );
}
