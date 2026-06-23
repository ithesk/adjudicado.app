"use client";

import { useRef, useState, useTransition } from "react";
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
  Split,
  Trash2,
  Plus,
  type LucideIcon,
} from "lucide-react";
import {
  CANAL_LABEL,
  cantidadRepartida,
  diasRestantes,
  estadoItemLabel,
  flujoDeItem,
  formatFecha,
  formatRD,
  itemEntregado,
  asignacionEntregada,
  precioTotalItem,
  proximoEstadoItem,
  resumenReparto,
  tieneReparto,
  nivelUrgencia,
  tiempoRelativo,
  type Asignacion,
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
import { useActividad } from "./Actividad";
import VisorDocumento from "@/components/VisorDocumento";
import {
  actualizarItem,
  agregarCoordinacionItem,
  adjuntarDocumentoBitacora,
} from "../actions";

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
  ordenId,
  items: itemsIniciales,
  currentUser,
}: {
  ordenId: string;
  items: Item[];
  currentUser: Persona;
}) {
  const [items, setItems] = useState<Item[]>(itemsIniciales);
  const [, startTransition] = useTransition();
  const { emitir } = useActividad();
  const entregados = items.filter(itemEntregado).length;

  // Actualiza el estado local (UI inmediata).
  function update(id: string, patch: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  // Persiste en Supabase (no-op en demo). Los campos no soportados se filtran.
  function persist(id: string, patch: Record<string, unknown>) {
    startTransition(() => actualizarItem(ordenId, id, patch));
  }
  // Local + persistente.
  function save(id: string, patch: Partial<Item>) {
    update(id, patch);
    persist(id, patch as Record<string, unknown>);
  }

  function avanzar(it: Item) {
    const prox = proximoEstadoItem(it);
    if (!prox) return;
    const flujo = flujoDeItem(it);
    const esTerminal = prox.key === flujo[flujo.length - 1].key;
    save(it.id, {
      estado_item: prox.key,
      entregado: esTerminal,
      fecha_entrega: esTerminal ? new Date().toISOString().slice(0, 10) : null,
    });
    emitir(`Avanzó “${it.nombre}” a ${prox.label}.`);
  }

  function setEstado(it: Item, key: string) {
    const flujo = flujoDeItem(it);
    const esTerminal = key === flujo[flujo.length - 1].key;
    const label = flujo.find((x) => x.key === key)?.label ?? key;
    save(it.id, {
      estado_item: key,
      entregado: esTerminal,
      fecha_entrega: esTerminal ? new Date().toISOString().slice(0, 10) : null,
    });
    emitir(`Marcó “${it.nombre}” como ${label}.`);
  }

  // Adjunta archivos (arrastrados) al hilo de coordinación de un ítem: sube y
  // los registra como documentos de la orden, ligados al ítem.
  async function adjuntarItem(itemId: string, files: File[]) {
    for (const file of files) {
      const cid = nid();
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                coordinacion: [
                  ...(it.coordinacion ?? []),
                  {
                    id: cid,
                    orden_id: ordenId,
                    item_id: itemId,
                    autor_id: currentUser.id,
                    autor: currentUser,
                    tipo: "nota",
                    texto: file.name,
                    created_at: new Date().toISOString(),
                    adjuntos: [{ nombre: file.name }],
                  },
                ],
              }
            : it,
        ),
      );
      const fd = new FormData();
      fd.append("archivo", file);
      const res = await adjuntarDocumentoBitacora(ordenId, itemId, fd);
      if (res?.path) {
        setItems((prev) =>
          prev.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  coordinacion: (it.coordinacion ?? []).map((c) =>
                    c.id === cid
                      ? {
                          ...c,
                          adjuntos: [
                            { nombre: res.nombre, bucket: "documentos", path: res.path },
                          ],
                        }
                      : c,
                  ),
                }
              : it,
          ),
        );
      }
    }
  }

  function addCoord(id: string, tipo: TipoBitacora, texto: string) {
    // La nota del ítem se persiste con su item_id y rueda hacia la bitácora de
    // la orden (etiquetada con el ítem). No emitimos evento resumen aparte para
    // no duplicar.
    startTransition(() => agregarCoordinacionItem(ordenId, id, tipo, texto));
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
              onUpdate={update}
              onPersist={persist}
              onAvanzar={avanzar}
              onSetEstado={setEstado}
              onCoord={addCoord}
              onAdjuntar={adjuntarItem}
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
  onUpdate,
  onPersist,
  onAvanzar,
  onSetEstado,
  onCoord,
  onAdjuntar,
}: {
  item: Item;
  currentUser: Persona;
  onUpdate: (id: string, patch: Partial<Item>) => void;
  onPersist: (id: string, patch: Record<string, unknown>) => void;
  onAvanzar: (it: Item) => void;
  onSetEstado: (it: Item, key: string) => void;
  onCoord: (id: string, tipo: TipoBitacora, texto: string) => void;
  onAdjuntar: (itemId: string, files: File[]) => void;
}) {
  const { suplidores, agregarSuplidor, emitir } = useActividad();
  const supInicial = useRef(item.suplidor ?? "");
  const [abierto, setAbierto] = useState(false);
  const Icon = TIPO_ICON[item.tipo];
  const entregado = itemEntregado(item);
  const dias = entregado ? null : diasRestantes(item.fecha_estim);
  const nivel = nivelUrgencia(dias);
  const prox = proximoEstadoItem(item);
  const supCatalogo = suplidores.find(
    (s) => s.nombre.toLowerCase() === (item.suplidor ?? "").toLowerCase(),
  );

  // ---- Reparto entre suplidores ----
  const flujo = flujoDeItem(item);
  const split = tieneReparto(item);
  const asignaciones = item.asignaciones ?? [];
  const partesListas = asignaciones.filter((a) =>
    asignacionEntregada(item, a),
  ).length;

  // Solo estado local (para teclear suave en los campos del reparto).
  function setAsignaciones(next: Asignacion[] | undefined) {
    onUpdate(item.id, { asignaciones: next });
  }
  // Local + persistente (para cambios estructurales y al perder foco).
  function commitAsignaciones(next: Asignacion[] | undefined) {
    onUpdate(item.id, { asignaciones: next });
    onPersist(item.id, { asignaciones: next ?? null });
  }
  function persistAsignaciones() {
    onPersist(item.id, { asignaciones: item.asignaciones ?? null });
  }
  function nuevaAsig(cantidad: number): Asignacion {
    return {
      id: nid(),
      suplidor: null,
      canal: item.canal,
      cantidad,
      precio: null,
      estado_item: flujo[0].key,
      fecha_estim: null,
    };
  }
  function dividir() {
    commitAsignaciones([
      {
        id: nid(),
        suplidor: item.suplidor,
        canal: item.canal,
        cantidad: item.cantidad,
        precio: item.precio,
        estado_item: item.estado_item ?? flujo[0].key,
        fecha_estim: item.fecha_estim,
      },
      nuevaAsig(1),
    ]);
    emitir(`Dividió “${item.nombre}” entre varios suplidores.`);
  }
  function addAsig() {
    commitAsignaciones([...asignaciones, nuevaAsig(1)]);
  }
  function setAsig(aId: string, patch: Partial<Asignacion>) {
    setAsignaciones(asignaciones.map((a) => (a.id === aId ? { ...a, ...patch } : a)));
  }
  function delAsig(aId: string) {
    const rest = asignaciones.filter((a) => a.id !== aId);
    commitAsignaciones(rest.length ? rest : undefined);
    emitir(`Quitó un suplidor del reparto de “${item.nombre}”.`);
  }
  function avanzarAsig(a: Asignacion) {
    const i = flujo.findIndex((x) => x.key === (a.estado_item ?? flujo[0].key));
    if (i < 0 || i >= flujo.length - 1) return;
    const next = flujo[i + 1];
    commitAsignaciones(
      asignaciones.map((x) => (x.id === a.id ? { ...x, estado_item: next.key } : x)),
    );
    emitir(`“${item.nombre}” · ${a.suplidor || "suplidor"}: ${next.label}.`);
  }

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
              {split ? (
                <>
                  <Split className="mr-1 inline h-3 w-3 align-[-1px]" strokeWidth={2} aria-hidden />
                  {resumenReparto(item)}
                </>
              ) : (
                <>
                  {estadoItemLabel(item)} ·{" "}
                  {item.canal ? CANAL_LABEL[item.canal] : "canal por definir"}
                  {item.suplidor ? ` · ${item.suplidor}` : ""}
                </>
              )}
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

        {/* Acción directa: avanzar de estado sin tener que expandir.
            Si el ítem está repartido, se gestiona por suplidor al expandir. */}
        {split ? (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
          >
            <Split className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {partesListas}/{asignaciones.length} partes
          </button>
        ) : prox ? (
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

          {/* Datalist compartido de suplidores (lo usan los campos de abajo). */}
          <datalist id={`sup-cat-${item.id}`}>
            {suplidores.map((s) => (
              <option key={s.id} value={s.nombre} />
            ))}
          </datalist>

          {!split ? (
            <>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">
                  Estado del ítem · toca para fijar uno
                </p>
                <Pipeline item={item} onSet={(k) => onSetEstado(item, k)} />
              </div>

              {/* Campos del ítem (un solo suplidor) */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo label="Suplidor">
                  <input
                    value={item.suplidor ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const cat = suplidores.find(
                        (s) => s.nombre.toLowerCase() === v.toLowerCase(),
                      );
                      onUpdate(item.id, {
                        suplidor: v,
                        ...(cat?.canal ? { canal: cat.canal } : {}),
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      onPersist(item.id, { suplidor: v || null, canal: item.canal });
                      if (!v) return;
                      agregarSuplidor(v, item.canal as CanalItem | null);
                      if (v !== supInicial.current) {
                        emitir(`Asignó suplidor “${v}” a “${item.nombre}”.`);
                        supInicial.current = v;
                      }
                    }}
                    list={`sup-cat-${item.id}`}
                    placeholder="Elige del catálogo o escribe…"
                    className={inputBase}
                  />
                </Campo>
                <Campo label="Canal">
                  <select
                    value={item.canal ?? ""}
                    onChange={(e) => {
                      const canal = e.target.value as CanalItem;
                      onUpdate(item.id, { canal });
                      onPersist(item.id, { canal });
                    }}
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
                    onChange={(e) => {
                      onUpdate(item.id, { fecha_estim: e.target.value });
                      onPersist(item.id, { fecha_estim: e.target.value });
                    }}
                    className={inputBase}
                  />
                </Campo>
                <Campo label="Precio acordado (RD$)">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={item.precio ?? ""}
                    onChange={(e) =>
                      onUpdate(item.id, {
                        precio: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    onBlur={() => onPersist(item.id, { precio: item.precio })}
                    placeholder="0.00"
                    className={inputBase}
                  />
                </Campo>
              </div>

              <button
                type="button"
                onClick={dividir}
                className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-line px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
              >
                <Split className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                Dividir entre suplidores
              </button>
            </>
          ) : (
            <Reparto
              item={item}
              suplidores={suplidores}
              onSet={setAsig}
              onPersist={persistAsignaciones}
              onAdd={addAsig}
              onDel={delAsig}
              onAvanzar={avanzarAsig}
              onGuardarSup={(canal, nombre) => agregarSuplidor(nombre, canal)}
            />
          )}

          {/* Condiciones / notas (siempre) */}
          <Campo
            label={item.tipo === "servicio" ? "Método de pago / condiciones" : "Condiciones / notas"}
          >
            <input
              value={item.condiciones ?? ""}
              onChange={(e) => onUpdate(item.id, { condiciones: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              onBlur={() => onPersist(item.id, { condiciones: item.condiciones })}
              placeholder={
                item.tipo === "servicio"
                  ? "Transferencia, tarjeta…"
                  : "Soporte, tracking, garantía…"
              }
              className={inputBase}
            />
          </Campo>

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
            onAdjuntar={(files) => onAdjuntar(item.id, files)}
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

const miniInput =
  "w-full rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink outline-none focus:border-primary";

function MiniCampo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

// Editor de reparto: un ítem repartido entre varios suplidores, cada parte con
// su cantidad, precio, canal, ETA y su propio flujo de estado.
function Reparto({
  item,
  onSet,
  onPersist,
  onAdd,
  onDel,
  onAvanzar,
  onGuardarSup,
}: {
  item: Item;
  suplidores: Suplidor[];
  onSet: (aId: string, patch: Partial<Asignacion>) => void;
  onPersist: () => void;
  onAdd: () => void;
  onDel: (aId: string) => void;
  onAvanzar: (a: Asignacion) => void;
  onGuardarSup: (canal: CanalItem | null, nombre: string) => void;
}) {
  const flujo = flujoDeItem(item);
  const asignaciones = item.asignaciones ?? [];
  const total = precioTotalItem(item);
  const repartida = cantidadRepartida(item);
  const descuadre = repartida !== item.cantidad;

  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          <Split className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
          Reparto entre suplidores · {asignaciones.length}
        </p>
        <span
          className={`font-mono text-[11px] ${descuadre ? "text-warn" : "text-muted"}`}
        >
          {repartida}/{item.cantidad} uds
        </span>
      </div>

      <ul className="divide-y divide-line">
        {asignaciones.map((a) => {
          const lista = asignacionEntregada(item, a);
          const i = flujo.findIndex(
            (x) => x.key === (a.estado_item ?? flujo[0].key),
          );
          const prox = i >= 0 && i < flujo.length - 1 ? flujo[i + 1] : null;
          return (
            <li key={a.id} className="space-y-2.5 px-3 py-3">
              <div className="flex items-center gap-2">
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${
                    lista ? "bg-ok-soft text-ok" : "bg-surface-2 text-muted"
                  }`}
                >
                  {lista ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  ) : (
                    <Box className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  )}
                </span>
                <input
                  value={a.suplidor ?? ""}
                  onChange={(e) => onSet(a.id, { suplidor: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v) onGuardarSup(a.canal, v);
                    onPersist();
                  }}
                  list={`sup-cat-${item.id}`}
                  placeholder="Suplidor de esta parte…"
                  className="flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => onDel(a.id)}
                  aria-label="Quitar suplidor"
                  className="text-muted transition-colors hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MiniCampo label="Cantidad">
                  <input
                    type="number"
                    min={0}
                    value={a.cantidad}
                    onChange={(e) =>
                      onSet(a.id, { cantidad: Number(e.target.value) || 0 })
                    }
                    onBlur={onPersist}
                    className={miniInput}
                  />
                </MiniCampo>
                <MiniCampo label="Canal">
                  <select
                    value={a.canal ?? ""}
                    onChange={(e) => {
                      onSet(a.id, { canal: e.target.value as CanalItem });
                      onPersist();
                    }}
                    className={miniInput}
                  >
                    {(Object.keys(CANAL_LABEL) as CanalItem[]).map((c) => (
                      <option key={c} value={c}>
                        {CANAL_LABEL[c]}
                      </option>
                    ))}
                  </select>
                </MiniCampo>
                <MiniCampo label="Precio (RD$)">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={a.precio ?? ""}
                    onChange={(e) =>
                      onSet(a.id, {
                        precio:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    onBlur={onPersist}
                    placeholder="0.00"
                    className={miniInput}
                  />
                </MiniCampo>
                <MiniCampo label="ETA">
                  <input
                    type="date"
                    value={a.fecha_estim ?? ""}
                    onChange={(e) => {
                      onSet(a.id, { fecha_estim: e.target.value });
                      onPersist();
                    }}
                    className={miniInput}
                  />
                </MiniCampo>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted">
                  Estado:{" "}
                  <span className="text-ink-soft">
                    {flujo[Math.max(0, i)].label}
                  </span>
                </span>
                {prox ? (
                  <button
                    type="button"
                    onClick={() => onAvanzar(a)}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-ink transition-colors hover:bg-primary-hover"
                  >
                    {prox.label}
                    <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden />
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-ok-soft px-2 py-1 text-[11px] font-medium text-ok">
                    <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    Listo
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between border-t border-line px-3 py-2">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-primary transition-opacity hover:opacity-80"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          Agregar suplidor
        </button>
        {total != null && (
          <span className="font-mono text-[12px] text-ink-soft">
            Total: {formatRD(total)}
          </span>
        )}
      </div>

      {descuadre && (
        <p className="border-t border-line px-3 py-1.5 text-[11px] text-warn">
          Las cantidades suman {repartida} y el ítem pide {item.cantidad}. Ajusta
          el reparto.
        </p>
      )}
    </div>
  );
}

const COORD_ICON: Record<string, LucideIcon> = {
  llamada: Phone,
  correo: Mail,
  nota: StickyNote,
  suplidor: Box,
  evento: StickyNote,
};

// Detecta el tipo de la nota por su contenido, para no obligar a elegirlo.
function inferirTipo(t: string): TipoBitacora {
  const s = t.toLowerCase();
  if (/(llam|tel[eé]fon|whats|wasap|me dijo|habl[eé]|por tel)/.test(s))
    return "llamada";
  if (/(corre|e-?mail|escrib|adjunt|envi[eé] un correo|me respondi[oó])/.test(s))
    return "correo";
  return "nota";
}

const TIPO_LABEL: Record<string, string> = {
  llamada: "Llamada",
  correo: "Correo",
  nota: "Nota",
};

function Coordinacion({
  item,
  currentUser,
  onCoord,
  onAdjuntar,
}: {
  item: Item;
  currentUser: Persona;
  onCoord: (id: string, tipo: TipoBitacora, texto: string) => void;
  onAdjuntar: (files: File[]) => void;
}) {
  const [texto, setTexto] = useState("");
  const [drag, setDrag] = useState(false);
  const entradas = item.coordinacion ?? [];
  const tipoInferido = inferirTipo(texto);
  const IconInferido = COORD_ICON[tipoInferido];

  function enviar() {
    if (!texto.trim()) return;
    onCoord(item.id, inferirTipo(texto), texto.trim());
    setTexto("");
  }

  return (
    <div
      className={`relative rounded-md border bg-surface ${
        drag ? "border-primary" : "border-line"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) onAdjuntar(files);
      }}
    >
      {drag && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-primary/5">
          <span className="rounded bg-surface px-2 py-1 text-[11px] font-medium text-primary shadow-card">
            Suelta para adjuntar a este ítem
          </span>
        </div>
      )}
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
                        {b.autor?.nombre ?? "Miembro del equipo"}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                        <Icon className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
                        {TIPO_LABEL[b.tipo] ?? b.tipo}
                      </span>
                      <time className="ml-auto text-[10px] text-muted">
                        {tiempoRelativo(b.created_at)}
                      </time>
                    </div>
                    {b.adjuntos && b.adjuntos[0]?.path ? (
                      <VisorDocumento
                        bucket={b.adjuntos[0].bucket ?? "documentos"}
                        path={b.adjuntos[0].path}
                        nombre={b.adjuntos[0].nombre}
                        label={b.adjuntos[0].nombre}
                        className="mt-0.5 inline-flex items-center gap-1.5 rounded border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
                      />
                    ) : b.adjuntos && b.adjuntos.length > 0 ? (
                      <span className="mt-0.5 inline-flex items-center gap-1.5 rounded border border-line bg-surface-2 px-2 py-1 text-[12px] text-muted">
                        <Box className="h-3 w-3" strokeWidth={2} aria-hidden />
                        {b.adjuntos[0].nombre} · subiendo…
                      </span>
                    ) : (
                      <p className="text-[12px] leading-relaxed text-ink-soft">
                        {b.texto}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
      )}

      <div className="flex items-center gap-1.5 border-t border-line p-2">
        {/* Icono del tipo detectado automáticamente según lo que escribes. */}
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded text-muted"
          title={texto.trim() ? `Detectado: ${TIPO_LABEL[tipoInferido]}` : "Se detecta solo"}
        >
          <IconInferido className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        </span>
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") enviar();
          }}
          placeholder="Anota una actualización del suplidor…"
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
