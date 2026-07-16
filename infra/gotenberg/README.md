# Convertidor Word→PDF (Gotenberg en el VPS 147.93.183.165)

## Lo desplegado (2026-07-16)

El VPS ya tiene nginx-proxy-manager ocupando 80/443, así que NO se usa el
docker-compose con Caddy de esta carpeta (queda como alternativa para un VPS
limpio). Lo que corre:

```bash
docker run -d --name gotenberg --restart unless-stopped \
  --network proxy_reverse_default \
  gotenberg/gotenberg:8 gotenberg --api-timeout=60s
```

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
