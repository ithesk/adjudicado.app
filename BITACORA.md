# Bitácora de trabajo

Registro de cada tramo de trabajo sobre el proyecto. Sirve como respaldo del contexto:
si se pierde la sesión, la máquina o pasan semanas, aquí está en qué íbamos y por qué.

**Convención:** entrada nueva **al tope** (lo más reciente primero). Cada entrada dice qué
se hizo, qué quedó pendiente y las decisiones no obvias (las obvias ya están en el código).

---

## 2026-07-13 — Documentación base de la empresa (con vencimientos)

**Contexto:** primer corte del frente de licitaciones, deliberadamente chico. Los documentos
legales de la empresa (RPE, DGII, TSS, registro mercantil, acta constitutiva) hay que
presentarlos en cada licitación y **casi todos vencen**. Si uno está vencido el día de la
apertura, la oferta se cae. No había nada en el sistema que lo vigilara.

**Hecho:**

- `supabase_empresa.sql` — tabla `documento_empresa` (org_id, tipo, fechas de emisión y
  vencimiento, path del archivo) con RLS `es_miembro(org_id)`. **Ya corrido en producción**
  (proyecto `yhuletcbkiolekuldleb`) vía la API de gestión de Supabase. Verificado: columnas,
  índices, RLS activa, la policy bloquea a un anónimo, y el round-trip de inserción funciona.
- `src/lib/empresa/documentos.ts` — catálogo fijo de 7 tipos + "Otro", umbrales de
  vencimiento y el cálculo de qué está vigente / qué falta.
- `src/lib/empresa/queries.ts`, `src/lib/actions/empresa.ts` — subir / editar fechas /
  eliminar.
- `src/app/(app)/configuracion/empresa/` — la pantalla (checklist).
- Insignia en el menú lateral (entrada "Empresa") con el conteo de documentos vencidos o por
  vencer. Solo aparece si de verdad hay algo.

**Decisiones no obvias:**

- **Tabla propia, no reusar `documento`.** `documento.orden_id` es `NOT NULL` y su RLS
  resuelve la organización *a través de la orden*: un documento de la empresa no cuelga de
  ninguna orden y no cabe ahí. Aflojarlo obligaba a reescribir la policy, hacer backfill y
  filtrar el ruido en el repositorio global de documentos.
- **Storage sin cambios.** Los archivos van al bucket `documentos` con ruta
  `{org_id}/empresa/{uuid}.{ext}`; la policy actual ya lo autoriza porque solo exige que el
  primer folder sea el `org_id`.
- **Umbrales propios: ámbar a 30 días, rojo a 15.** Los de las órdenes (2 y 5 días) sirven
  para una entrega, no para una certificación de la DGII que se tramita con semanas. Se
  reusan los colores y textos (`urgenciaChip`, `textoDias`), solo cambian los umbrales.
- **Varias filas por tipo, a propósito.** Renovar es subir la nueva, no borrar la vieja: el
  vigente es el de vencimiento más lejano y el resto queda como historial.
- **El catálogo es fijo** para poder mostrar lo que **falta**, no solo lo que hay cargado.

**Pendiente:**

- Verificar el ciclo completo con la sesión real: subir un PDF, ver el color, renovar y ver
  bajar la insignia. (Todo lo demás ya está verificado contra la base de producción.)

---

## 2026-07-13 — Reconstrucción del entorno en laptop nueva

**Contexto:** Pablo cambió de laptop. El proyecto no existía en local y la máquina no tenía
ni Node instalado.

**Hecho:**

- Clonado `github.com/ithesk/adjudicado.app` en `~/Documents/DEVPABLO/adjudicado`.
- Instalados Node 26 y pnpm 11 (Homebrew) + dependencias del proyecto.
- Recuperadas las llaves. **No están en el repo** (`.env*` va en `.gitignore` y el
  `.env.example` que menciona el README no existe). Se bajaron del proyecto de Vercel:

  ```bash
  pnpm dlx vercel link --yes --project adjudicado-app
  pnpm dlx vercel env pull .env.local --environment=production
  ```

- Arreglado `pnpm-workspace.yaml`: estaba commiteado con los marcadores sin resolver
  (`sharp: set this to true or false`), lo que hacía fallar `pnpm dev` en el chequeo de
  dependencias. Ahora aprueba los builds de `sharp` (optimización de imágenes de Next) y
  `unrs-resolver` (ESLint). **Único cambio de código de la sesión.**
- Verificado: `pnpm dev` levanta y `/`, `/inicio` y `/login` responden 200.

**Hallazgos que sorprenden (no están en el README):**

- En producción **no hay `ANTHROPIC_API_KEY`; hay `OPENAI_API_KEY`.** `src/lib/env.ts`
  elige el proveedor de OCR por precedencia OpenAI → Gemini → Claude, así que **el OCR
  corre hoy con OpenAI**, aunque el README siga diciendo Claude. El README quedó desfasado.
- Enrutamiento (`src/proxy.ts` + `src/lib/supabase/session.ts`): un visitante anónimo que
  entra a `/` recibe la landing por *rewrite* a `/inicio`; con sesión activa, `/` es el
  tablero. La landing no vive en `/`.

**Pendiente / próximo paso:**

- **La capa de planes del SaaS no está fusionada.** La rama `claude/missing-saas-code-1gdj9u`
  tiene `src/lib/planes.ts` (planes Equipo RD$2,500/mes, Empresa, Corporativo; límites de
  miembros, órdenes vivas y OCR/mes; 14 días de prueba) y `supabase_saas.sql` (columnas
  `plan`, `estado_cuenta`, `trial_ends_at` en `organizacion`). Hoy quien se registra crea su
  organización **sin plan ni período de prueba**. La landing y el registro de esa rama, en
  cambio, ya están obsoletos: `main` los rehízo por su cuenta. **Rescatar solo planes + SQL,
  no la UI.**
- Sin cablear a persistencia (ya listado en `DEPLOY.md`): edición en vivo de campos del
  ítem, reacciones y comentarios de la bitácora, y el CRUD del catálogo de suplidores.
