# Product

## Register

product

## Users

Equipo pequeño (3–5 personas) de Innovación Tecnológica SK, SRL: gerencia y
ventas que dan seguimiento a órdenes de compra adjudicadas en licitaciones
públicas dominicanas (DGCP / ComprasDominicana). Manejan 4–5 órdenes vivas en
paralelo. No son power users; el uso es frecuente pero no todo el día. Trabajan
desde la oficina, casi siempre en escritorio, a veces revisan desde el celular.
El trabajo es de coordinación: correos, llamadas, plazos, entregas, facturación.

## Product Purpose

Registro único del trayecto post-adjudicación: de la orden de compra al cobro.
Existe porque entre que se adjudica y se cobra pasan semanas, los documentos se
pierden, varias personas tocan la misma orden y se pierde la continuidad (una
licitación se perdió por no vigilar una ventana de subsanación). Éxito = ninguna
orden se cae por un plazo no vigilado y nadie tiene que reconstruir el estado de
una orden de memoria.

## Brand Personality

Voz: precisa, directa, sin floritura — habla como un colega operativo, no como
software corporativo. Tres palabras: **instrumental, vigilante, confiable**.
Sensación objetivo: la de un panel de control donde la información crítica salta
sola y todo lo demás se queda quieto. Densa pero no ruidosa.

## Anti-references

- **SaaS genérico violeta/cian con gradientes** y tarjetas idénticas — esto es
  una herramienta de trabajo, no una landing.
- **Dashboards que "gritan" todo** con badges de colores por todos lados: aquí
  el color (rojo/ámbar) está reservado para urgencia real de plazo.
- **Formularios largos y burocráticos**: la fricción mata el uso (el OCR existe
  justo para no teclear).
- Estética de software gubernamental pesado (tablas grises planas, sin jerarquía).

## Design Principles

1. **Solo grita cuando hay fecha límite.** El color de alerta es un recurso
   escaso; si todo alerta, nada alerta.
2. **La data manda, el cromo se aparta.** Densidad alta y legible: números,
   plazos e identificadores son los protagonistas (de ahí la mono tabular).
3. **Una sola pantalla ordena el día.** El triage cabe en una vista y se ordena
   solo por urgencia; no hay que cazar la orden urgente.
4. **Fricción cero o no lo usan.** Cada acción en segundos; el sistema sabe, el
   usuario no teclea dos veces.
5. **Construir chico.** v0 sobrio y completo antes que amplio y a medias.

## Accessibility & Inclusion

- Texto en español (es-DO), montos en RD$.
- Contraste WCAG AA: cuerpo ≥ 4.5:1, texto grande ≥ 3:1 (incluye placeholders).
- La urgencia nunca se comunica **solo** por color: siempre acompaña texto
  ("Vencido 3d", "Hoy") para daltonismo.
- Tema claro y oscuro (auto, según sistema).
- `prefers-reduced-motion`: toda transición tiene alternativa de fundido/instantánea.
- Objetivos táctiles ≥ 40px en móvil.
