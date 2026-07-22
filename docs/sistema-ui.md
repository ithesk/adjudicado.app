# Sistema de UI — cómo se arma una página en adjudicado

La app es desktop-first (los usuarios viven en pantallas anchas trabajando con
tablas), pero cada página decide su ancho: **nada se estira a los 1600px del
main salvo las tablas densas**. La línea gráfica (tokens de `globals.css`,
tipografías, colores del semáforo) es intocable — este documento es sobre
ESTRUCTURA.

## Las primitivas (`src/components/ui.tsx`)

- **`CabeceraPagina`** — título/descrición/volver/acciones. TODA página la usa;
  no se escriben `<h1>` a mano. La acción principal de la página va en
  `acciones` (arriba-derecha), nunca al fondo del contenido.
- **`Hoja`** — el ancho por tipo de página (tabla de abajo).
- **`DisposicionFicha`** — ficha con riel: trabajo a la izquierda (`principal`),
  consulta a la derecha (`riel`, sticky 360px), contenido largo en `despues`.
  En móvil el riel se intercala entre principal y despues (los datos clave no
  caen al fondo).
- `Panel` + `SectionTitle` — cada bloque de contenido. El slot `right` de
  SectionTitle lleva la acción del bloque ("+ agregar") o el indicador de
  autosave.

## Anchos por tipo de página

| Tipo | Hoja | Ejemplos |
|---|---|---|
| Tabla/lista densa | `ficha` (1200px) | Bandeja, Precios, Entidades, Licitaciones |
| Ficha con riel | `ficha` (1200px) | entidades/[id], orden/[id], Bid Room |
| Feed | `feed` (3xl) | Actividad |
| Lista simple / buscador | `lista` (4xl) | Documentos, Plantillas |
| Form de creación | `form` (2xl) | orden/nueva, licitaciones/nuevo |

## Reglas

1. **La acción evidente va arriba** — en `CabeceraPagina.acciones` o en una
   barra sticky (Bid Room). El fondo de la página es para detalle y errores;
   si una acción de arriba falla, se desplaza a la sección del detalle.
2. **La bitácora/actividad de una ficha va en el riel derecho** (patrón
   chatter de Odoo), con scroll interno (`max-h + overflow-y-auto`) para no
   empujar lo demás.
3. **Campos con ancho según contenido**: un RNC, un teléfono o una extensión
   usan columnas fijas (`11rem`, `7rem`, `3.5rem`); solo nombre/descripción
   flexibles. Nada de inputs de 500px para 10 dígitos.
4. **Autosave onBlur** con indicador Guardando…/Guardado (en la cabecera o en
   el SectionTitle). Botones de envío al pie SOLO en forms de creación cortos.
5. **Sidebar**: colapsable a rail; secciones plegables con preferencia
   recordada; Configuración/Equipo siempre visibles al pie.

## §carga — El sistema de feedback (espera, éxito, error)

El principio: **cada clic responde algo en <300 ms, cerca de donde se hizo**.
Un spinner global que bloquea la pantalla está prohibido; un error que no se
ve, también. Las piezas (todas existen ya — no se inventan spinners ad-hoc):

- **`useAccion()`** (`src/lib/use-accion.ts`) — EL patrón de mutación. Cada
  llamada lleva una CLAVE (`correr("it-"+id, fn)`): `ocupada(clave)` responde
  por control (nada de deshabilitar el panel entero), anti doble-clic de
  serie, y el error SIEMPRE sale — aviso (toast) por defecto, `errorInline`
  para pintarlo junto a un form. Prohibido copiar `correr()` a mano.
- **Avisos (toasts)** — `avisoOk`/`avisoError` de `src/lib/avisos.ts`. Para
  confirmar lo que no queda a la vista y para errores de acciones optimistas.
  El error persiste 7 s y se puede cerrar; el ok se va solo.
- **`IndicadorGuardado`** — el trío Guardando…/Guardado de cabecera (autosave
  de un panel). **`MicroGuardado`** — el mismo estado JUNTO al campo/fila
  editada (celdas del cotizador, filas de requisitos): puntico girando →
  check ~2 s. Tamaño fijo, sin saltos de layout.
- **`Boton cargando`** — spinner integrado + disabled (el spinner sustituye
  al icono, el ancho no salta).
- **`Esqueleto` / `EsqueletoPagina` + `loading.tsx`** — TODA ruta navegable
  tiene fallback instantáneo (hay uno general en `(app)/loading.tsx`; las
  fichas con riel tienen silueta propia). El NavLink muestra su pista de
  navegación pendiente (useLinkStatus, retardo 150 ms).
- **`fetchLargo()`** (`src/lib/fetch-cliente.ts`) — obligatorio para toda
  llamada larga del cliente (generar, PDF, OCR, importar): tope de tiempo y
  error legible. Un spinner NUNCA puede girar para siempre ni apagarse en
  silencio.

Qué patrón toca, según la espera:

| Espera | Patrón obligatorio |
|---|---|
| <300 ms (toggle, checkbox, drag) | Optimista/no-controlado, SIN indicador (parpadea). Si el servidor falla: rollback + `avisoError` — la UI no miente. |
| Corta (escritura a DB) | `useAccion` con clave propia → `MicroGuardado` junto a lo editado o `IndicadorGuardado` en la cabecera; botón con `disabled` de SU clave. |
| Larga (generar, subir, OCR, ERP) | Spinner + texto EN el botón («Subiendo…») o stepper narrado (Bid Room); `fetchLargo` con timeout; error pegado al botón que lo disparó o aviso. |
| Navegación | `loading.tsx` (skeleton) — nunca pantalla congelada. |

## Reglas de la casa vigentes (no UI, pero se pagan caro)

- Componentes definidos FUERA del padre (adentro se remontan y pierden foco).
- Sin `new Date()` / `toLocaleString` en render (hidratación) — formatear
  cortando el string ISO.
- Nunca `export type` en archivos `"use server"`.
- Checkboxes no controlados (`defaultChecked`) para respuesta instantánea.
