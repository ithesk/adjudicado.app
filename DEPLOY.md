# Desplegar en Vercel + Supabase

La app está hecha para este stack. Sigue estos pasos para ponerla en producción.

## 1. Supabase (backend)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor** → corre, en orden:
   - `supabase_schema.sql` — todas las tablas, funciones, triggers y RLS (v1,
     incluye responsable, ítem-suplidor, catálogos, contactos, bitácora con
     eventos/reacciones/comentarios, coordinación por ítem, documentos).
   - `supabase_storage.sql` — buckets `ordenes-oc` y `documentos` + policies.
3. **Authentication → Providers**: deja *Email* activo. Para uso interno,
   **desactiva “Confirm email”** (Authentication → Settings) para que las cuentas
   queden activas al instante.
4. **Project Settings → API**: copia `Project URL`, `anon public`, `service_role`.

## 2. Vercel (frontend + funciones)

1. Sube el repo a GitHub e impórtalo en [vercel.com/new](https://vercel.com/new)
   (o `vercel` con la CLI desde la carpeta del proyecto).
2. **Environment Variables** (Production y Preview):

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role (¡secreto!) |
   | `ANTHROPIC_API_KEY` | tu API key de Anthropic |
   | `OCR_MODEL` | `claude-sonnet-4-6` (opcional) |

   > **No** definas `NEXT_PUBLIC_DEMO`. Si no está, la app corre en modo real
   > contra Supabase. (Con `NEXT_PUBLIC_DEMO=1` corre con datos de ejemplo.)
3. Deploy. Vercel detecta Next.js automáticamente; el OCR corre como Function.

## 3. Primer uso (en producción)

1. Entra a `/login` → **Crear cuenta**.
2. **Onboarding** → **Crear nueva** organización (quedas como `admin`).
3. **Configuración → Suplidores/Equipo** para cargar tu catálogo.
4. **+ Nueva orden** → sube el PDF de una OC → el OCR extrae → confirma.

## Qué persiste hoy vs. qué falta cablear

Con el schema v1 + env vars + demo apagado, **persiste en Supabase**:
- Auth, organizaciones e invitación de miembros.
- Crear orden con OCR (sube el PDF a Storage, guarda orden + ítems + `ocr_raw`).
- Tablero, detalle, métricas, repositorio de documentos (lectura real).
- Avanzar estado, asignar **responsable**, marcadores, plazos, subir documentos,
  agregar entradas de **bitácora** (las acciones ya escriben a la BD).

**Pendiente de cablear a persistencia** (hoy interactivo en memoria; el schema ya
tiene las columnas/tablas listas):
- Edición en vivo de campos del ítem (suplidor/canal/estado/ETA/condiciones) y
  coordinación por ítem.
- Reacciones y comentarios de la bitácora.
- CRUD del catálogo (crear/editar suplidores y contactos desde Configuración).

Es trabajo mecánico: conectar cada interacción de estado local a su Server Action
(la estructura de datos ya existe). Pídelo y lo dejo persistiendo.

## Local

```bash
cp .env.example .env.local   # rellena las llaves
pnpm install
pnpm dev
```

> En local, si otro proyecto dejó un Service Worker en `localhost:3000`, usa otro
> puerto (`pnpm dev -p 3001`) o desregistra el SW. En el dominio de Vercel no pasa.
