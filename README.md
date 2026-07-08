# Centro de Ejecución SK

Sistema interno para dar seguimiento a las **órdenes de compra adjudicadas** en
licitaciones públicas dominicanas (DGCP / ComprasDominicana) — de la orden de
compra al cobro.

> Especificación completa en [`docs/doc.md`](docs/doc.md).

## Stack

- **Next.js 16** (App Router) + React 19 + TypeScript + Tailwind 4
- **Supabase** (Postgres, Auth, Storage, RLS)
- **Anthropic Claude** (`claude-sonnet-4-6`) para el AI OCR de la OC (server-side)

## Funcionalidad (v0)

- Autenticación por correo/contraseña + organizaciones multi-tenant con RLS.
- Invitar colaboradores con un código (= id de la organización).
- **Crear orden subiendo el PDF de la OC** → Claude extrae institución, ítems y
  montos → el usuario confirma y pone el plazo de entrega.
- **Tablero de triage**: órdenes ordenadas por urgencia + métricas (vivas, vencen
  ≤5 días, RD$ atascado sin facturar, RD$ por cobrar).
- **Detalle de orden**: máquina de estados, dos relojes (institución / suplidor),
  ítems con check de entregado, bitácora (nota/correo/llamada/suplidor),
  documentos adjuntos, marcadores y handoff a Odoo.

---

## Puesta en marcha

### 1. Crear el proyecto de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, corre en este orden:
   - `supabase_schema.sql` — tablas, funciones, triggers y RLS.
   - `supabase_storage.sql` — buckets `ordenes-oc` y `documentos` + policies.
   - `supabase_saas.sql` — capa comercial: plan, estado de cuenta y período de
     prueba por organización. (En proyectos nuevos ya viene en el schema; corre
     esta migración solo si tu base es anterior al modo SaaS.)
3. En **Authentication → Providers**, deja activo *Email*. Para uso interno puedes
   **desactivar “Confirm email”** (Authentication → Settings) para que las cuentas
   queden activas al instante. Si lo dejas activo, los usuarios deben confirmar por
   correo antes de entrar.

### 2. Variables de entorno

Copia `.env.example` a `.env.local` y rellena:

```bash
cp .env.example .env.local
```

| Variable | Dónde encontrarla |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role (¡secreto!) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| `OCR_MODEL` | opcional; por defecto `claude-sonnet-4-6` |

> El `service_role` y el `ANTHROPIC_API_KEY` solo se usan server-side; nunca se
> exponen al navegador.

### 3. Instalar y correr

```bash
pnpm install
pnpm dev
```

Abre http://localhost:3000.

### 4. Primer uso

1. La raíz `/` es la **landing pública** (marketing + planes). Desde ahí,
   **Crear cuenta** lleva al registro self-service (`/registro`), que crea tu
   usuario y la empresa (quedas como `admin`) con el plan elegido y un período
   de prueba. El tablero de la app queda en `/tablero`.
2. Para invitar a tu equipo: **Configuración → Equipo → Invitar** (por correo).
3. **+ Nueva orden** → sube el PDF de una OC → confirma los datos → listo.

> Rutas públicas (sin sesión): `/` (landing), `/registro`, `/login`, `/auth`.
> Los planes y sus límites viven en `src/lib/planes.ts`.

---

## Notas de arquitectura

- **RLS**: todo el acceso a datos respeta Row Level Security; la app usa el cliente
  con la sesión del usuario. El `service_role` solo se usa para el bootstrap de
  organización/membresía (inserts que RLS bloquea a propósito), en
  `src/app/onboarding/actions.ts`.
- **OCR**: `src/lib/ocr.ts` + el route handler `src/app/api/ocr/route.ts`. El PDF se
  sube a Storage y se manda a Claude como bloque `document`. El JSON crudo se guarda
  en `orden.ocr_raw` para auditar.
- **Estados**: `orden_recibida → en_coordinacion → entregado → listo_facturar →
  facturado → cobrado → cerrado`. Marcar todos los ítems entregados mueve la orden a
  `entregado`. El botón en `listo_facturar` es el handoff a Odoo (cambia el estado;
  **no factura**).
- **Documentos privados**: se sirven con URLs firmadas temporales (10 min).

## Fuera de alcance (v0)

Captura de correos por Gmail, sync con Odoo, e-CF/DGII, permisos granulares por rol
y notificaciones por email/push. Ver `docs/doc.md` §5 y §11.
# adjudicado.app
