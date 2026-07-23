"use client";

// El flujo «Conectar con Odoo», lo más cercano a un OAuth posible con la API
// de Odoo (que no tiene servidor de autorización al cual redirigir):
//
//   Paso 1 — el admin pone SOLO la URL → el sistema descubre versión y
//            base(s) de datos (db.list, o el subdominio en odoo.com).
//   Paso 2 — usuario + contraseña (o API key, la API acepta ambas) →
//            se VALIDA contra el servidor ANTES de guardar → conectado.
//
// La clave se cifra en reposo y nunca vuelve al navegador.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Plug, Unplug, XCircle } from "lucide-react";
import { Boton, inputBase } from "@/components/ui";
import { avisoOk } from "@/lib/avisos";
import { conectarOdoo, desconectarOdoo, detectarOdoo, probarOdoo } from "@/lib/actions/odoo";
import type { EstadoIntegracionOdoo } from "@/lib/odoo-config";
import type { ServidorOdoo } from "@/lib/odoo";

function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`;
}

export default function ConexionOdoo({ estado }: { estado: EstadoIntegracionOdoo }) {
  const router = useRouter();
  // paso: cerrado → url → credenciales
  const [paso, setPaso] = useState<"cerrado" | "url" | "credenciales">("cerrado");
  const [url, setUrl] = useState("");
  const [servidor, setServidor] = useState<ServidorOdoo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prueba, setPrueba] = useState<string | null>(null);
  const [ocupado, startTransition] = useTransition();

  function detectar(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await detectarOdoo(String(fd.get("url") || ""));
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setUrl(r.url);
      setServidor(r.servidor);
      setPaso("credenciales");
    });
  }

  function conectar(fd: FormData) {
    setError(null);
    startTransition(async () => {
      const r = await conectarOdoo({
        url,
        db: String(fd.get("db") || ""),
        usuario: String(fd.get("usuario") || ""),
        apiKey: String(fd.get("clave") || ""),
      });
      if (!r.ok) {
        setError(r.error ?? "No se pudo conectar.");
        return;
      }
      setPaso("cerrado");
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
  if (estado.conectado && paso === "cerrado") {
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
            <Boton variante="ghost" disabled={ocupado} onClick={() => setPaso("url")} className="!px-2.5 !py-1 !text-[12px]">
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

  // ── El botón de arranque ─────────────────────────────────────────────────
  if (paso === "cerrado") {
    return (
      <div className="space-y-2">
        <Boton onClick={() => setPaso("url")}>
          <Plug className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          Conectar con Odoo
        </Boton>
        <p className="text-[12px] text-muted">
          Pon la dirección de tu Odoo y tus credenciales de administrador — el
          sistema descubre el resto y deja la sincronización andando sola.
        </p>
      </div>
    );
  }

  const errorInline = error && (
    <p className="flex items-start gap-1.5 rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
      <XCircle className="mt-0.5 h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
      {error}
    </p>
  );

  // ── Paso 1: solo la URL ──────────────────────────────────────────────────
  if (paso === "url") {
    return (
      <form action={detectar} className="max-w-md space-y-2.5">
        <label className="block text-[12.5px] text-muted">
          Dirección de tu Odoo
          <input
            name="url"
            required
            autoFocus
            defaultValue={url || (estado.via === "env" ? estado.url : "")}
            placeholder="miempresa.odoo.com"
            className={`${inputBase} mt-1 font-mono`}
          />
        </label>
        {errorInline}
        <div className="flex items-center gap-2">
          <Boton type="submit" cargando={ocupado}>
            {ocupado ? "Buscando el servidor…" : "Continuar"}
            {!ocupado && <ArrowRight className="h-4 w-4" strokeWidth={2.2} aria-hidden />}
          </Boton>
          <Boton variante="ghost" type="button" disabled={ocupado} onClick={() => { setPaso("cerrado"); setError(null); }}>
            Cancelar
          </Boton>
        </div>
      </form>
    );
  }

  // ── Paso 2: credenciales (la base ya viene descubierta si se pudo) ───────
  const varias = (servidor?.bases.length ?? 0) > 1;
  const unica = servidor?.bases.length === 1 ? servidor.bases[0] : null;
  return (
    <form action={conectar} className="max-w-md space-y-2.5">
      <p className="flex items-center gap-1.5 text-[12.5px] text-ok">
        <CheckCircle2 className="h-3.5 w-3.5 flex-none" strokeWidth={2} aria-hidden />
        Servidor encontrado — Odoo {servidor?.version}
        <button
          type="button"
          onClick={() => { setPaso("url"); setError(null); }}
          className="ml-1 text-[11.5px] text-muted underline hover:text-ink"
        >
          cambiar URL
        </button>
      </p>

      {unica ? (
        <input type="hidden" name="db" value={unica} />
      ) : varias ? (
        <label className="block text-[12.5px] text-muted">
          Base de datos
          <select name="db" required className={`${inputBase} mt-1 font-mono`}>
            {servidor!.bases.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </label>
      ) : (
        <label className="block text-[12.5px] text-muted">
          Base de datos
          <input
            name="db"
            required
            defaultValue={servidor?.sugerida ?? (estado.via === "env" ? estado.db ?? "" : "")}
            placeholder="miempresa"
            className={`${inputBase} mt-1 font-mono`}
          />
          {servidor?.sugerida && (
            <span className="mt-0.5 block text-[11px] text-muted">
              Detectada del subdominio — cámbiala solo si no coincide.
            </span>
          )}
        </label>
      )}

      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="block text-[12.5px] text-muted">
          Usuario (email)
          <input
            name="usuario"
            required
            autoFocus
            defaultValue={estado.via === "env" ? estado.usuario : ""}
            placeholder="admin@miempresa.com"
            className={`${inputBase} mt-1 font-mono`}
          />
        </label>
        <label className="block text-[12.5px] text-muted">
          Contraseña o API key
          <input
            name="clave"
            type="password"
            required
            autoComplete="off"
            className={`${inputBase} mt-1 font-mono`}
          />
        </label>
      </div>
      <p className="text-[11.5px] text-muted">
        Con verificación en dos pasos activa, usa una API key (en Odoo:
        Ajustes → Seguridad de la cuenta → Claves API). Se guarda cifrada y se
        prueba ANTES de guardar.
      </p>
      {errorInline}
      <div className="flex items-center gap-2">
        <Boton type="submit" cargando={ocupado}>
          <Plug className="h-4 w-4" strokeWidth={2.2} aria-hidden />
          {ocupado ? "Probando la conexión…" : "Conectar"}
        </Boton>
        <Boton variante="ghost" type="button" disabled={ocupado} onClick={() => { setPaso("cerrado"); setError(null); }}>
          Cancelar
        </Boton>
      </div>
    </form>
  );
}
