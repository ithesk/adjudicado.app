# Centro de Ejecución SK — Especificación de construcción (v0)

> Documento de trabajo para el agente de Claude Code.
> Sistema interno de **Innovación Tecnológica SK, SRL** para dar seguimiento a las órdenes de compra adjudicadas en licitaciones públicas dominicanas (DGCP / ComprasDominicana), desde que llega la orden de compra hasta que se cobra.

---

## 1. Contexto y problema

SK participa en licitaciones del Estado dominicano. La preparación y presentación de ofertas ya está resuelta por fuera (cotización económica en **Odoo**, oferta técnica en su propio sistema editorial). El dolor **no** está ahí.

El dolor está **después de presentar**: llegan correos de subsanación, avisos de adjudicación, órdenes de compra con plazos, hay que coordinar con la institución (correos y llamadas), entregar (licencias o equipo físico), conseguir requisitos para facturar, facturar en Odoo y cobrar. En todo ese trayecto pasan semanas, los documentos se pierden, varias personas trabajan la misma orden y se pierde la continuidad. Una licitación se perdió por no vigilar la ventana de subsanación (caso real, "INABIE").

Este sistema es el **registro único** de ese trayecto: de la orden de compra al cobro.

### A quién sirve
Equipo pequeño (3–5 personas). Manejan **4–5 órdenes vivas en paralelo** normalmente. Firmas: el Gerente General firma documentos no-subsanables; la Gerente de Ventas firma comerciales/subsanables.

---

## 2. Principios de diseño (LEER PRIMERO)

1. **Fricción cero o no lo usan.** El equipo no alimenta sistemas a mano. Crear una orden debe tomar segundos: se sube el PDF de la OC, el AI OCR extrae los datos, el usuario solo confirma y agrega el plazo de entrega. **Nada de formularios largos.**
2. **El sistema sabe, el usuario no teclea dos veces.** Los datos salen del documento (OCR) o de Odoo, no de que el usuario los reescriba.
3. **Solo grita cuando hay una acción con fecha límite.** Si todo alerta, nada alerta. Las alarmas son para plazos reales.
4. **Pocas órdenes, una sola pantalla.** Con 4–5 órdenes vivas, la vista principal debe caber en una pantalla y ordenarse sola por urgencia.
5. **Construir chico.** Esto es un v0. Resistir el scope creep. Lo que no está en "Alcance", no se construye (ver sección "Fuera de alcance").

---

## 3. Stack técnico

- **Frontend / app:** Next.js (App Router) + React + TypeScript + Tailwind.
- **Backend / datos:** Supabase (Postgres, Auth, Storage, Row Level Security).
- **AI OCR:** API de Anthropic (Claude) con entrada de documento PDF → JSON estructurado. **La llamada debe ser server-side** (route handler / server action) para no exponer la API key.
- **Multi-tenant desde el día 1** vía tabla `organizacion` + RLS. Para uso interno es una sola organización, pero la arquitectura queda lista para productizar.

---

## 4. Flujo principal (la espina del sistema)

```
[Sube la OC en PDF]
      ↓  AI OCR extrae institución, número OC, ítems, montos, (plazo si aparece)
[Confirmar datos + ingresar plazo de entrega]   ← único paso manual
      ↓
ESTADO: orden_recibida   → arranca el reloj de entrega
      ↓  (coordinación: correos, llamadas, seguimiento al suplidor)
ESTADO: en_coordinacion
      ↓  (marcar cada ítem entregado: licencia = keys/activación, físico = entrega + acta)
ESTADO: entregado        → se apaga el reloj de entrega; aparece "atascado sin facturar"
      ↓  (conseguir requisitos de factura de la institución)
ESTADO: listo_facturar
      ↓  (handoff manual: se factura en Odoo, fuera del sistema)
ESTADO: facturado        → arranca el reloj de pago
      ↓
ESTADO: cobrado → cerrado
```

**Los dos relojes de cada orden:**
- **Reloj de la institución** → `plazo_entrega`. Cuándo hay que entregar. Es el que más duele.
- **Reloj del suplidor** → `suplidor_fecha_estim`. Cuándo llega el producto de Ingram/distribuidor. El riesgo de incumplir casi siempre viene de aquí, no del equipo. Hay que vigilarlo en paralelo.

---

## 5. Alcance del MVP (v0)

### Incluido
1. **Autenticación** (Supabase Auth) e invitar colaboradores a la organización.
2. **Crear orden subiendo el PDF de la OC** → AI OCR → confirmar/editar → pedir plazo de entrega.
3. **Vista principal (tablero de triage):** lista de órdenes vivas ordenada por urgencia de plazo. Métricas arriba: órdenes vivas, cuántas vencen ≤5 días, **RD$ atascado sin facturar**, RD$ por cobrar.
4. **Detalle de orden:** máquina de estados, ítems (con tipo licencia/físico/servicio y check de entregado), bitácora, documentos adjuntos, seguimiento al suplidor, marcadores.
5. **Bitácora de coordinación:** notas, correos, llamadas. La llamada es la entrada más importante (se evapora si no se anota); que el formulario lo facilite.
6. **Adjuntar documentos** de cualquier tipo (actas, cartas, facturas) a la orden (Supabase Storage).
7. **Seguimiento al suplidor:** suplidor, estado (pedido/en tránsito/recibido), fecha estimada.
8. **Marcadores/etiquetas** libres por orden.
9. **Avanzar estados** y el botón de handoff "Listo para facturar en Odoo" (no factura; marca el estado).
10. **Alarmas de plazo** visibles en la vista principal (color según días restantes; vencido = rojo).

### Fuera de alcance (NO construir en v0)
- Captura automática de correos de subsanación vía Gmail (es v1.5; en v0 la subsanación, si se trabaja, es manual).
- Sincronización automática con Odoo (en v0 el handoff de factura es un botón manual; importar líneas desde Odoo es v1.5).
- Etapas previas a la OC (búsqueda, preparación, presentación). El sistema arranca en la OC.
- Suplidor a nivel de ítem (en v0 es a nivel de orden).
- Integración con e-CF / PENI / DGII.
- Notificaciones por email/push (en v0 las alarmas son visuales en la app).
- Permisos granulares por rol (en v0 todos los miembros de la org ven y editan todas las órdenes).

---

## 6. AI OCR — extracción de la orden de compra

**Objetivo:** que el usuario no teclee. Sube el PDF, el modelo extrae, el usuario confirma.

**Flujo técnico:**
1. El usuario sube el PDF de la OC.
2. Se guarda el archivo en Supabase Storage (bucket `ordenes-oc`).
3. Una función server-side envía el PDF al API de Anthropic (modelo sugerido: `claude-sonnet-4-6`) como bloque `document` (PDF en base64) + un prompt que pide **solo JSON**.
4. El JSON se usa para pre-llenar el formulario de confirmación. Se guarda crudo en `orden.ocr_raw` (para auditar).
5. El usuario revisa, corrige lo que haga falta y **obligatoriamente ingresa/confirma el `plazo_entrega`** (el OCR a veces no lo agarra bien).

**Regla de oro:** nunca confiar ciego en el OCR. Siempre mostrar lo extraído para corregir en segundos.

**Forma del JSON esperado:**
```json
{
  "numero_oc": "string",
  "institucion": "string",
  "codigo_expediente": "string | null",
  "fecha_oc": "YYYY-MM-DD | null",
  "moneda": "DOP | USD",
  "monto_total": 0,
  "plazo_entrega": "YYYY-MM-DD | null",
  "items": [
    { "nombre": "string", "tipo": "licencia|fisico|servicio", "cantidad": 1, "monto": 0 }
  ]
}
```

**Prompt de extracción (base, ajustable):**
> Eres un extractor de datos de órdenes de compra del Estado dominicano (ComprasDominicana). Lee el PDF adjunto y devuelve **únicamente** un objeto JSON con esta forma exacta: { … }. No incluyas texto fuera del JSON, ni explicaciones, ni markdown. Si un campo no aparece en el documento, ponlo en null. Para `tipo` de cada ítem, infiere: software/suscripciones/licencias = "licencia"; equipos/hardware = "fisico"; instalación/soporte/capacitación = "servicio".

---

## 7. Modelo de datos (Postgres / Supabase)

Esquema completo a ejecutar en el SQL Editor de Supabase.

```sql
create extension if not exists "pgcrypto";

-- 1. ORGANIZACIÓN (multi-tenant; uso interno = 1 fila)
create table organizacion (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  created_at  timestamptz not null default now()
);

-- 2. MIEMBRO (colaboradores)
create table miembro (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizacion(id) on delete cascade,
  user_id     uuid not null references auth.users(id)   on delete cascade,
  nombre      text,
  rol         text not null default 'colaborador',  -- 'admin' | 'colaborador'
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

create or replace function es_miembro(p_org uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from miembro where org_id = p_org and user_id = auth.uid());
$$;

-- 3. ORDEN (el corazón — nace al subir la OC)
create table orden (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizacion(id) on delete cascade,
  numero_oc         text,
  institucion       text,
  codigo_expediente text,
  monto             numeric(14,2),
  moneda            text not null default 'DOP',
  fecha_oc          date,
  plazo_entrega     date,                       -- reloj de la institución
  estado            text not null default 'orden_recibida',
  suplidor              text,                   -- reloj del suplidor
  suplidor_estado       text,                   -- 'pedido'|'en_transito'|'recibido'
  suplidor_fecha_estim  date,
  metodo_pago       text,
  plazo_pago_dias   int,
  etiquetas         text[] not null default '{}',  -- marcadores libres
  oc_archivo_url    text,
  ocr_raw           jsonb,
  creado_por        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint estado_valido check (estado in (
    'orden_recibida','en_coordinacion','entregado',
    'listo_facturar','facturado','cobrado','cerrado'))
);
create index idx_orden_org    on orden(org_id);
create index idx_orden_estado on orden(org_id, estado);
create index idx_orden_plazo  on orden(org_id, plazo_entrega);

-- 4. ITEM (del OCR, editable)
create table item (
  id            uuid primary key default gen_random_uuid(),
  orden_id      uuid not null references orden(id) on delete cascade,
  nombre        text not null,
  tipo          text not null default 'licencia',  -- 'licencia'|'fisico'|'servicio'
  cantidad      numeric(12,2) not null default 1,
  entregado     boolean not null default false,
  fecha_entrega date,
  notas         text,
  orden_indice  int not null default 0,
  constraint tipo_valido check (tipo in ('licencia','fisico','servicio'))
);
create index idx_item_orden on item(orden_id);

-- 5. BITACORA (documentar: notas, correos, llamadas, suplidor)
create table bitacora (
  id          uuid primary key default gen_random_uuid(),
  orden_id    uuid not null references orden(id) on delete cascade,
  autor_id    uuid references auth.users(id),
  tipo        text not null default 'nota',  -- 'nota'|'correo'|'llamada'|'suplidor'
  texto       text not null,
  created_at  timestamptz not null default now(),
  constraint bitacora_tipo_valido check (tipo in ('nota','correo','llamada','suplidor'))
);
create index idx_bitacora_orden on bitacora(orden_id, created_at desc);

-- 6. DOCUMENTO (adjuntos; archivos en Storage)
create table documento (
  id          uuid primary key default gen_random_uuid(),
  orden_id    uuid not null references orden(id) on delete cascade,
  nombre      text not null,
  tipo        text default 'otro',  -- 'acta'|'carta_fabricante'|'factura'|'oc'|'otro'
  archivo_url text not null,
  subido_por  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);
create index idx_documento_orden on documento(orden_id);

-- updated_at automático
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger trg_orden_touch before update on orden
  for each row execute function touch_updated_at();

-- RLS
alter table organizacion enable row level security;
alter table miembro      enable row level security;
alter table orden        enable row level security;
alter table item         enable row level security;
alter table bitacora     enable row level security;
alter table documento    enable row level security;

create policy org_select     on organizacion for select using (es_miembro(id));
create policy miembro_select  on miembro      for select using (es_miembro(org_id));
create policy orden_all       on orden        for all
  using (es_miembro(org_id)) with check (es_miembro(org_id));
create policy item_all        on item         for all
  using (es_miembro((select org_id from orden where orden.id = item.orden_id)))
  with check (es_miembro((select org_id from orden where orden.id = item.orden_id)));
create policy bitacora_all    on bitacora     for all
  using (es_miembro((select org_id from orden where orden.id = bitacora.orden_id)))
  with check (es_miembro((select org_id from orden where orden.id = bitacora.orden_id)));
create policy documento_all   on documento    for all
  using (es_miembro((select org_id from orden where orden.id = documento.orden_id)))
  with check (es_miembro((select org_id from orden where orden.id = documento.orden_id)));
```

**Storage:** crear dos buckets — `ordenes-oc` (PDFs de OC) y `documentos` (adjuntos). Agregar policies de Storage que limiten acceso por `org_id` en la ruta del archivo (ej. ruta `{org_id}/{orden_id}/{archivo}`).

---

## 8. Pantallas

### 8.1 Tablero de triage (vista principal)
- **Ordenado por urgencia de plazo**, no por estado. La orden que vence (o ya venció) sube al tope.
- **Banda de métricas arriba:** órdenes vivas · vencen ≤5 días · **RD$ atascado sin facturar** · RD$ por cobrar.
  - *Atascado sin facturar* = suma de `monto` de órdenes en estado `entregado` o `listo_facturar`.
  - *Por cobrar* = suma de `monto` de órdenes en estado `facturado`.
- **Cada tarjeta** muestra: contador de días al plazo dominante (con color), número OC + institución, chip de estado, ítems entregados (x/y), próxima acción, monto.
- **Colores del contador:** vencido o ≤2 días = rojo; 3–5 días = ámbar; >5 días = verde; sin plazo activo = neutro.

### 8.2 Detalle de orden (panel/drawer)
- **Máquina de estados** visible (stepper) + botón "Avanzar a: [siguiente estado]".
- **Ítems:** lista con tipo (licencia/físico/servicio) y check de entregado. Al marcar todos entregados, la orden pasa a `entregado`.
- **Bitácora:** historial de notas/correos/llamadas + agregar entrada. Tipo "llamada" preseleccionado o destacado.
- **Suplidor:** nombre, estado, fecha estimada de llegada.
- **Documentos:** lista de adjuntos + subir archivo.
- **Marcadores:** etiquetas editables.
- **Camino al cobro:** Entregado → Requisitos de factura completos → Facturado (Odoo) → Cobrado. Botón de handoff a Odoo (marca estado, no factura).

> Referencia visual: ya existe un prototipo HTML del tablero y el detalle (triage por urgencia, dos relojes, bitácora, camino al cobro). Usarlo como guía de UX/UI.

---

## 9. Reglas de negocio

- **Entrada:** la orden nace al subir la OC. Estado inicial `orden_recibida`.
- **Transiciones de estado** (en orden): `orden_recibida → en_coordinacion → entregado → listo_facturar → facturado → cobrado → cerrado`. Se avanzan manualmente o por acción (marcar todos los ítems entregados → `entregado`).
- **Reloj de entrega** corre desde `orden_recibida` hasta `entregado`, contra `plazo_entrega`.
- **Reloj de pago** corre desde `facturado`, contra `fecha de factura + plazo_pago_dias` (o `plazo_pago_dias` desde el cambio a `facturado`).
- **Handoff a Odoo:** el botón en estado `listo_facturar` mueve a `facturado`. El sistema **no factura**: la factura/e-CF se emite en Odoo, fuera del sistema.
- **Atasco:** órdenes en `entregado`/`listo_facturar` representan plata entregada sin facturar; deben resaltarse (métrica + marcador sugerido `espera-acta`).
- **Colaboración:** todos los miembros de la organización ven y editan todas las órdenes (sin permisos granulares en v0). La bitácora registra el autor de cada entrada.

---

## 10. Criterios de aceptación (v0 listo cuando…)

1. Un usuario puede iniciar sesión e invitar a un colaborador a la organización.
2. Subiendo el PDF de una OC real, el sistema extrae institución, ítems y montos con OCR y los muestra para confirmar; el usuario ingresa el plazo y crea la orden en < 1 minuto, sin teclear los ítems a mano.
3. La vista principal muestra las órdenes ordenadas por urgencia, con el contador de días en color correcto, y las 4 métricas calculadas bien.
4. En el detalle se puede: avanzar estados, marcar ítems entregados, agregar entradas de bitácora (nota/correo/llamada), adjuntar un documento, registrar suplidor y fecha estimada, y agregar/quitar marcadores.
5. El botón de handoff mueve la orden a `facturado` y la métrica "atascado" baja en consecuencia.
6. RLS funciona: un usuario de otra organización no ve ninguna orden ajena.
7. Dos colaboradores trabajando la misma orden ven los cambios del otro (al recargar es suficiente en v0; realtime es opcional).

---

## 11. Roadmap posterior (referencia, NO construir ahora)

- **v1.5:** importar líneas desde Odoo por número de orden de venta (cero tipeo de ítems). Captura de subsanaciones vía Gmail (etiqueta → tarjeta + alarma de ventana). Sincronización del handoff con Odoo. Notificaciones por correo de plazos próximos.
- **v2:** suplidor a nivel de ítem; plantillas de requisitos de facturación por institución; integración con e-CF/PENI; modo multi-organización para vender a otros revendedores.

---

## 12. Notas para el agente

- Trabajar en pasos verificables: (1) schema + auth + RLS, (2) crear orden con OCR, (3) tablero de triage, (4) detalle con bitácora/ítems/documentos/suplidor/marcadores, (5) estados + handoff + métricas.
- Texto de la interfaz en **español**. Montos en **RD$** (formato `es-DO`).
- La API key de Anthropic va en variables de entorno del servidor; la extracción OCR nunca se llama desde el cliente.
- No sobre-construir. Si una decisión no está en este documento, elegir la opción más simple que cumpla los principios de la sección 2 y dejarla anotada.
