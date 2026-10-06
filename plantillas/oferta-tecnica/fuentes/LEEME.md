# Fuentes de la oferta técnica (PROP-TEC)

Manrope, Fraunces y JetBrains Mono, subconjunto *latin* (incluye tildes, ñ, ¿ ¡),
descargadas de Google Fonts. Licencia SIL Open Font License 1.1: se pueden
incluir y redistribuir con el software.

Van incrustadas en base64 dentro del HTML porque el Chromium de Gotenberg corre
SIN red (ver `infra/gotenberg/README.md`): un `<link>` a Google Fonts no cargaría.
