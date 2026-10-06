# Convertidor Word→PDF (Gotenberg en el VPS 147.93.183.165)

## Lo desplegado (2026-07-16)

El VPS ya tiene nginx-proxy-manager ocupando 80/443, así que NO se usa el
docker-compose con Caddy de esta carpeta (queda como alternativa para un VPS
limpio). Lo que corre:

```bash
docker run -d --name gotenberg --restart unless-stopped \
  --network proxy_reverse_default \
  gotenberg/gotenberg:8 gotenberg \
  --api-timeout=60s --webhook-disable=true \
  "--chromium-allow-list=^file:///tmp/.*" \
  --chromium-deny-private-ips --chromium-deny-public-ips \
  --chromium-disable-javascript
```

### Chromium (oferta técnica HTML→PDF) — blindado (2026-10-06)

Hasta oct-2026 corría con `--chromium-disable-routes=true`. Se activó para la
oferta técnica (PROP-TEC), que es HTML, pero SIN red: el VPS no tiene firewall
y comparte la red `proxy_reverse_default` con Odoo y los bots, así que un
Chromium con salida sería una puerta a todo eso (SSRF).

- `--chromium-allow-list=^file:///tmp/.*`: solo abre el HTML subido.
- `--chromium-deny-private-ips` / `--chromium-deny-public-ips`: ni red interna
  ni internet, aunque el HTML pida una URL.
- `--chromium-disable-javascript`.

Consecuencia: el HTML debe ser AUTOCONTENIDO — fuentes e imágenes en base64
(ver `src/lib/licitaciones/oferta-tecnica.ts`). Una `<img src="https://…">`
sale en blanco, a propósito. Verificado: `/forms/chromium/convert/url` con
`https://example.com` o `http://odoo:8069` → 403.

Sin puertos públicos: solo el proxy lo alcanza como `gotenberg:3000`.
Verificado end-to-end: F.033 relleno real → PDF en ~2.7 s.

## Exposición (proxy host en nginx-proxy-manager)

- Domain: `gotenberg.147-93-183-165.sslip.io` (sslip.io resuelve al VPS)
- Forward: `gotenberg` puerto `3000` (http)
- SSL: Let's Encrypt + Force SSL
- Advanced (la llave de API + tamaño de los docx):

```nginx
if ($http_x_api_key != "<GOTENBERG_TOKEN>") { return 401; }
client_max_body_size 25m;
```

## La app

- `GOTENBERG_URL=https://gotenberg.147-93-183-165.sslip.io`
- `GOTENBERG_TOKEN=<la llave>` (en .env.local y en Vercel; nunca en el repo)
