"use client";

import { useState } from "react";
import {
  ChevronRight,
  KeyRound,
  Box,
  Wrench,
  Phone,
  Mail,
  StickyNote,
  Check,
  ArrowRight,
  ListChecks,
  CreditCard,
  Truck,
  Handshake,
  type LucideIcon,
} from "lucide-react";
import {
  CANAL_LABEL,
  diasRestantes,
  estadoItemLabel,
  flujoDeItem,
  formatFecha,
  itemEntregado,
  proximoEstadoItem,
  nivelUrgencia,
  tiempoRelativo,
  type Bitacora,
  type CanalItem,
  type Item,
  type Persona,
  type Suplidor,
  type TipoBitacora,
  type TipoItem,
} from "@/lib/types";
import { Avatar, Panel, SectionTitle, inputBase } from "@/components/ui";
import { ContactList } from "@/components/contacts";
import { textoDias, urgenciaChip } from "@/lib/ui";

const TIPO_ICON: Record<TipoItem, LucideIcon> = {
  licencia: KeyRound,
  fisico: Box,
  servicio: Wrench,
};

const HINT: Record<TipoItem, { icon: LucideIcon; texto: string }> = {
  servicio: {
    icon: CreditCard,
    texto:
      "Suscripción / servicio: define el método de pago y actívalo. Sin espera de suplidor.",
  },
  fisico: {
    icon: Truck,
    texto:
      "Producto físico: registra el pedido y su tracking; avanza según vaya llegando.",
  },
  licencia: {
    icon: Handshake,
    texto:
      "Licencia: suele requerir confirmación de fábrica, cotización y negociación. Usa la coordinación de abajo.",
  },
};

let seq = 0;
const nid = () => `local-item-${Date.now()}-${seq++}`;

export default function ItemsPanel({
  items: itemsIniciales,
  currentUser,
  suplidores = [],
}: {
  items: Item[];
  currentUser: Persona;
  suplidores?: Suplidor[];
}) {
  const [items, setItems] = useState<Item[]>(itemsIniciales);
  const entregados = items.filter(itemEntregado).length;

  function update(id: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function avanzar(it: Item) {
    const prox = proximoEstadoItem(it);
    if (!prox) return;
    const flujo = flujoDeItem(it);
    const esTerminal = prox.key === flujo[flujo.length - 1].key;
    update(it.id, {
      estado_item: prox.key,
      entregado: esTerminal,
      fecha_entrega: esTerminal ? new Date().toISOString().slice(0, 10) : null,
    });
  }

  function setEstado(it: Item, key: string) {
    const flujo = flujoDeItem(it);
    const esTerminal = key === flujo[flujo.length - 1].key;
    update(it.id, { estado_item: key, entregado: esTerminal });
  }

  function addCoord(id: string, tipo: TipoBitacora, texto: string) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              coordinacion: [
                ...(it.coordinacion ?? []),
                {
                  id: nid(),
                  orden_id: it.orden_id,
                  autor_id: currentUser.id,
                  autor: currentUser,
                  tipo,
                  texto,
                  created_at: new Date().toISOString(),
                },
              ],
            }
          : it,
      ),
    );
  }

  return (
    <Panel>
      <SectionTitle
        icon={ListChecks}
        right={
          <span className="font-mono text-xs text-muted">
            {entregados}/{items.length} entregados
          </span>
        }
      >
        Ítems · cada uno con su suplidor y flujo
      </SectionTitle>
      {items.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted">
          Esta orden no tiene ítems.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((it) => (
            <ItemRow
              key={it.id}
              item={it}
              currentUser={currentUser}
              suplidores={suplidores}
              onUpdate={update}
              onAvanzar={avanzar}
              onSetEstado={setEstado}
              onCoord={addCoord}
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ItemRow({
  item,
  currentUser,
  suplidores,
  onUpdate,
  onAvanzar,
  onSetEstado,
  onCoord,
}: {
  item: Item;
  currentUser: Persona;
  suplidores: Suplidor[];
  onUpdate: (id: string, patch: Partial<Item>) => void;
  onAvanzar: (it: Item) => void;
  onSetEstado: (it: Item, key: string) => void;
  onCoord: (id: string, tipo: TipoBitacora, texto: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const Icon = TIPO_ICON[item.tipo];
  const entregado = itemEntregado(item);
  const dias = entregado ? null : diasRestantes(item.fecha_estim);
  const nivel = nivelUrgencia(dias);
  const prox = proximoEstadoItem(item);
  const supCatalogo = suplidores.find(
    (s) => s.nombre.toLowerCase() === (item.suplidor ?? "").toLowerCase(),
  );

  return (
    <li>
      {/* Fila colapsada */}
      <div
        className={`flex items-center gap-3 px-4 py-3 transition-colors ${
          abierto ? "bg-surface-2" : "hover:bg-surface-2"
        }`}
      >
        {/* Zona expandible (nombre) */}
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={abierto}
        >
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-muted transition-transform ${
              abierto ? "rotate-90" : ""
            }`}
            strokeWidth={2}
            aria-hidden
          />
          <span
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${
              entregado ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"
            }`}
          >
            {entregado ? (
              <Check className="h-4 w-4" strokeWidth={2.5} aria-hidden />
            ) : (
              <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">
              {item.nombre}
            </span>
            <span className="block truncate text-[11px] text-muted">
              {estadoItemLabel(item)} ·{" "}
              {item.canal ? CANAL_LABEL[item.canal] : "canal por definir"}
              {item.suplidor ? ` · ${item.suplidor}` : ""}
            </span>
          </span>
        </button>

        {/* ETA */}
        <span
          className={`hidden shrink-0 rounded px-2 py-0.5 font-mono text-xs font-medium sm:inline ${urgenciaChip(
            entregado ? "neutro" : nivel,
          )}`}
        >
          {entregado ? "Listo" : item.fecha_estim ? textoDias(dias) : "s/ ETA"}
        </span>

        {/* Acción directa: avanzar de estado sin tener que expandir */}
        {prox ? (
          <button
            type="button"
            onClick={() => onAvanzar(item)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-ink transition-colors hover:bg-primary-hover"
          >
            <span className="hidden md:inline">Avanzar a</span>
            {prox.label}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          </button>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-ok-soft px-2.5 py-1.5 text-xs font-medium text-ok">
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Listo
          </span>
        )}
      </div>

      {/* Detalle expandido */}
      {abierto && (
        <div className="space-y-4 bg-canvas/40 px-4 pb-4 pt-1">
          <Hint tipo={item.tipo} />

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">
              Estado del ítem · toca para fijar uno
            </p>
            <Pipeline item={item} onSet={(k) => onSetEstado(item, k)} />
          </div>

          {/* Campos del ítem */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo label="Suplidor">
              <input
                value={item.suplidor ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  const cat = suplidores.find(
                    (s) => s.nombre.toLowerCase() === v.toLowerCase(),
                  );
                  // Al elegir del catálogo, hereda el canal del suplidor.
                  onUpdate(item.id, {
                    suplidor: v,
                    ...(cat?.canal ? { canal: cat.canal } : {}),
                  });
                }}
                list={`sup-cat-${item.id}`}
                placeholder="Elige del catálogo o escribe…"
                className={inputBase}
              />
              <datalist id={`sup-cat-${item.id}`}>
                {suplidores.map((s) => (
                  <option key={s.id} value={s.nombre} />
                ))}
              </datalist>
            </Campo>
            <Campo label="Canal">
              <select
                value={item.canal ?? ""}
                onChange={(e) =>
                  onUpdate(item.id, { canal: e.target.value as CanalItem })
                }
                className={inputBase}
              >
                {(Object.keys(CANAL_LABEL) as CanalItem[]).map((c) => (
                  <option key={c} value={c}>
                    {CANAL_LABEL[c]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Fecha estimada (ETA)">
              <input
                type="date"
                value={item.fecha_estim ?? ""}
                onChange={(e) =>
                  onUpdate(item.id, { fecha_estim: e.target.value })
                }
                className={inputBase}
              />
            </Campo>
            <Campo label={item.tipo === "servicio" ? "Método de pago / condiciones" : "Condiciones"}>
              <input
                value={item.condiciones ?? ""}
                onChange={(e) =>
                  onUpdate(item.id, { condiciones: e.target.value })
                }
                placeholder={
                  item.tipo === "servicio"
                    ? "Transferencia, tarjeta…"
                    : "Precio, soporte, tracking…"
                }
                className={inputBase}
              />
            </Campo>
          </div>

          {/* Contactos del suplidor (del catálogo reutilizable) */}
          {supCatalogo && supCatalogo.contactos.length > 0 && (
            <div className="rounded-md border border-line bg-surface">
              <p className="border-b border-line px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted">
                Contactos · {supCatalogo.nombre}
              </p>
              <div className="px-3">
                <ContactList contactos={supCatalogo.contactos} dense />
              </div>
            </div>
          )}

          <Coordinacion
            item={item}
            currentUser={currentUser}
            onCoord={onCoord}
          />
        </div>
      )}
    </li>
  );
}

function Pipeline({
  item,
  onSet,
}: {
  item: Item;
  onSet: (key: string) => void;
}) {
  const flujo = flujoDeItem(item);
  const actual = flujo.findIndex(
    (x) => x.key === (item.estado_item ?? flujo[0].key),
  );
  return (
    <div className="flex flex-wrap items-center gap-1">
      {flujo.map((s, i) => {
        const hecho = i < actual;
        const esActual = i === actual;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onSet(s.key)}
            className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
              esActual
                ? "bg-primary text-primary-ink"
                : hecho
                  ? "bg-ok-soft text-ok"
                  : "bg-surface-2 text-muted hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

const COORD_TIPOS: { valor: TipoBitacora; label: string; icon: LucideIcon }[] = [
  { valor: "llamada", label: "Llamada", icon: Phone },
  { valor: "correo", label: "Correo", icon: Mail },
  { valor: "nota", label: "Nota", icon: StickyNote },
];

const COORD_ICON: Record<string, LucideIcon> = {
  llamada: Phone,
  correo: Mail,
  nota: StickyNote,
  suplidor: Box,
  evento: StickyNote,
};

function Coordinacion({
  item,
  currentUser,
  onCoord,
}: {
  item: Item;
  currentUser: Persona;
  onCoord: (id: string, tipo: TipoBitacora, texto: string) => void;
}) {
  const [tipo, setTipo] = useState<TipoBitacora>("correo");
  const [texto, setTexto] = useState("");
  const entradas = item.coordinacion ?? [];

  function enviar() {
    if (!texto.trim()) return;
    onCoord(item.id, tipo, texto.trim());
    setTexto("");
  }

  return (
    <div className="rounded-md border border-line bg-surface">
      <p className="border-b border-line px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted">
        Coordinación del ítem · {entradas.length}
      </p>

      {entradas.length > 0 && (
        <ul className="divide-y divide-line">
          {entradas
            .slice()
            .sort(
              (a, b) =>
                new Date(a.created_at).getTime() -
                new Date(b.created_at).getTime(),
            )
            .map((b) => {
              const Icon = COORD_ICON[b.tipo] ?? StickyNote;
              return (
                <li key={b.id} className="flex gap-2.5 px-3 py-2">
                  <Avatar nombre={b.autor?.nombre} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[12px] font-medium text-ink">
                        {b.autor?.nombre ?? "Alguien"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                        <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                        {b.tipo}
                      </span>
                      <time className="ml-auto text-[10px] text-muted">
                        {tiempoRelativo(b.created_at)}
                      </time>
                    </div>
                    <p className="text-[12px] leading-relaxed text-ink-soft">
                      {b.texto}
                    </p>
                  </div>
                </li>
              );
            })}
        </ul>
      )}

      <div className="flex items-center gap-1.5 border-t border-line p-2">
        <div className="flex gap-0.5">
          {COORD_TIPOS.map((t) => {
            const Icon = t.icon;
            const activo = tipo === t.valor;
            return (
              <button
                key={t.valor}
                type="button"
                onClick={() => setTipo(t.valor)}
                title={t.label}
                aria-label={t.label}
                className={`grid h-7 w-7 place-items-center rounded transition-colors ${
                  activo ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
              </button>
            );
          })}
        </div>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") enviar();
          }}
          placeholder={`Registrar ${tipo} de este ítem…`}
          className="flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={!texto.trim()}
          className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-ink transition-colors hover:bg-primary-hover disabled:opacity-45"
        >
          Añadir
        </button>
      </div>
    </div>
  );
}

function Hint({ tipo }: { tipo: TipoItem }) {
  const h = HINT[tipo];
  const Icon = h.icon;
  return (
    <p className="flex items-start gap-2 rounded-md bg-surface-2 px-3 py-2 text-[12px] text-muted">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      {h.texto}
    </p>
  );
}

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
