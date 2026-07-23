import { CheckCircle2, XCircle, Plug, Mail } from "lucide-react";
import { requireMiembro } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { estadoIntegracionOdoo } from "@/lib/odoo-config";
import { Panel, SectionTitle } from "@/components/ui";
import ConexionOdoo from "./ConexionOdoo";

export const dynamic = "force-dynamic";

export default async function IntegracionesPage() {
  const miembro = await requireMiembro();
  const supabase = await createClient();
  const odoo = await estadoIntegracionOdoo(supabase, miembro.org_id);
  const dominioEntrante = process.env.INBOUND_DOMAIN || null;
  const secretConfigurado = Boolean(process.env.INBOUND_SECRET);

  return (
    <div className="space-y-4">
      {/* ── Odoo ─────────────────────────────────────────────── */}
      <Panel>
        <SectionTitle icon={Plug}>Odoo</SectionTitle>

        <div className="space-y-4 p-4">
          {/* Conectar / estado de la cuenta de ESTA empresa */}
          <ConexionOdoo estado={odoo} />

          {/* Descripción */}
          <p className="text-[12px] text-muted">
            Sincroniza el estado de pago de cada orden con su factura en Odoo:
            un proceso diario busca las facturas de las órdenes vivas (por
            número de OC en <span className="font-mono">invoice_origin</span> y{" "}
            <span className="font-mono">ref</span> de{" "}
            <span className="font-mono">account.move</span>), anota los cambios
            en la bitácora y avanza la orden a Facturado/Cobrado cuando Odoo lo
            confirma.
          </p>
        </div>
      </Panel>

      {/* ── Correo entrante ───────────────────────────────────── */}
      <Panel>
        <SectionTitle icon={Mail}>Correo entrante</SectionTitle>

        <div className="space-y-4 p-4">
          {/* Formato de dirección */}
          <div>
            <p className="mb-1 text-[13px] font-medium text-ink">
              Dirección de recepción por orden
            </p>
            <p className="text-[12px] text-muted">
              Cada orden tiene un código de buzón único. La dirección toma la
              forma:
            </p>
            <p className="mt-1.5 font-mono text-[13px] text-ink">
              oc-
              <span className="text-primary">&lt;código&gt;</span>
              {"@"}
              {dominioEntrante ? (
                <span className="text-ink">{dominioEntrante}</span>
              ) : (
                <span className="text-muted italic">pendiente de configurar</span>
              )}
            </p>
          </div>

          {/* Estado del webhook */}
          <div className="flex items-center gap-2">
            {secretConfigurado ? (
              <>
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-ok"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="text-[13px] text-ink">
                  Webhook activo — secreto configurado.
                </span>
              </>
            ) : (
              <>
                <XCircle
                  className="h-4 w-4 shrink-0 text-muted"
                  strokeWidth={2}
                  aria-hidden
                />
                <span className="text-[13px] text-muted">
                  Webhook inactivo — falta{" "}
                  <span className="font-mono">INBOUND_SECRET</span>.
                </span>
              </>
            )}
          </div>

          {/* URL del endpoint */}
          <div className="rounded-md border border-line bg-surface-2 px-4 py-3 space-y-2">
            <p className="text-[12px] font-medium text-ink-soft">
              Endpoint del webhook (POST):
            </p>
            <p className="break-all font-mono text-[12px] text-muted">
              {dominioEntrante
                ? `https://${dominioEntrante}/api/correo-entrante`
                : "<dominio-de-la-app>/api/correo-entrante"}
            </p>
            <p className="text-[12px] text-muted">
              Envía el secreto como header{" "}
              <span className="font-mono">x-inbound-secret</span> o como
              parámetro <span className="font-mono">?secret=</span>.
            </p>
          </div>

          {/* Instrucciones */}
          <p className="text-[12px] text-muted">
            Configura tu proveedor de correo (p. ej. Resend Inbound) para
            reenviar a esta URL los mensajes dirigidos al dominio. Cada correo
            recibido se registra automáticamente en la bitácora de la orden
            correspondiente, y sus adjuntos quedan en el repositorio de
            documentos.
          </p>
        </div>
      </Panel>
    </div>
  );
}
