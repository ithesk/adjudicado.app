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
| Tabla/lista densa | (sin Hoja — full width) | Bandeja, Precios, Licitaciones lista |
| Ficha con riel | `ficha` (1200px) | entidades/[id], orden/[id] |
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

## Reglas de la casa vigentes (no UI, pero se pagan caro)

- Componentes definidos FUERA del padre (adentro se remontan y pierden foco).
- Sin `new Date()` / `toLocaleString` en render (hidratación) — formatear
  cortando el string ISO.
- Nunca `export type` en archivos `"use server"`.
- Checkboxes no controlados (`defaultChecked`) para respuesta instantánea.
