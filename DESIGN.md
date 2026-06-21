# Design

Mood: **sala de control — instrumentación cobalto sobre grafito; las luces de
señal (rojo/ámbar/verde) son la urgencia de plazo cortando la penumbra.**
Registro: product. Estrategia de color: neutro + 1 acento (cobalto). Densidad alta.

## Color (OKLCH)

Marca anclada en hue 230 (cobalto). El mood vive en la marca + el semáforo, no en
el fondo (fondo casi puro).

### Light
- `--bg`: `oklch(1 0 0)` (blanco puro)
- `--surface`: `oklch(0.985 0.002 240)` (paneles/filas zebra)
- `--line`: `oklch(0.922 0.004 240)`
- `--ink`: `oklch(0.22 0.01 240)` (cuerpo, AA holgado)
- `--muted`: `oklch(0.50 0.012 240)` (secundario, aún ≥4.5:1)
- `--primary`: `oklch(0.50 0.13 240)` (cobalto, acciones)
- `--primary-ink`: `oklch(0.99 0 0)`

### Dark
- `--bg`: `oklch(0.17 0.006 240)` (grafito frío, chroma mínimo)
- `--surface`: `oklch(0.205 0.008 240)`
- `--line`: `oklch(0.27 0.01 240)`
- `--ink`: `oklch(0.94 0.004 240)`
- `--muted`: `oklch(0.68 0.012 240)`
- `--primary`: `oklch(0.66 0.14 240)` (cobalto más luminoso para contraste)

### Semáforo (urgencia — único uso del color "alarma")
- vencido/≤2d → rojo `oklch(0.55 0.20 25)`
- 3–5d → ámbar `oklch(0.70 0.15 75)`
- >5d → verde `oklch(0.62 0.14 150)`
- sin plazo → muted

## Tipografía

Pareo por eje de contraste (sans humanista + mono), no dos sans parecidas.
- **IBM Plex Sans** — UI, etiquetas, prosa.
- **IBM Plex Mono** — números, montos, plazos, IDs (numero_oc, expediente),
  contadores de días. Tabular. Es la voz "instrumental".
- Escala compacta: base 13–14px; densidad de tabla con line-height ajustado.
- `text-wrap: balance` en títulos.

## Layout

- **Triage = tabla densa**, no rejilla de tarjetas. Filas compactas ordenadas por
  urgencia; columnas: días (chip semáforo), OC, institución, estado, ítems x/y,
  suplidor, monto (mono, alineado a la derecha). Zebra sutil, hover de fila.
- **Métricas = tira compacta** de 4 cifras con separadores, no tarjetas grandes.
- Detalle: paneles con borde completo (sin side-stripe), sin tarjetas anidadas.
- Bordes 1px, radio moderado (6–8px), sombras casi nulas (herramienta, no vitrina).
- z-index semántico.

## Motion

- Sólo transiciones de color/opacidad en hover y cambios de estado; ease-out.
- `@media (prefers-reduced-motion: reduce)` → sin transición.
- Nada de bounce/elastic; nada de animar layout.

## Prohibiciones (impeccable)

Sin gradient text, sin side-stripe borders, sin glassmorphism, sin eyebrows
all-caps por sección, sin rejilla de tarjetas idénticas, sin Inter.
