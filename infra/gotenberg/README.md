# Convertidor Word→PDF (Gotenberg en el VPS)

Pasos en el VPS (una sola vez):

```bash
ssh root@147.93.183.165
curl -fsSL https://get.docker.com | sh        # si Docker no está instalado
mkdir -p /opt/gotenberg && cd /opt/gotenberg
# copiar aquí docker-compose.yml y Caddyfile (de esta carpeta del repo)
echo 'GOTENBERG_TOKEN=<LA_LLAVE>' > .env   # la llave la genera/da Claude
docker compose up -d
```

Verificar desde cualquier máquina:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://147-93-183-165.sslip.io/health
# 401 = vivo y protegido (falta la llave). Con la llave:
curl -s -H "X-Api-Key: <LLAVE>" https://147-93-183-165.sslip.io/health
# → {"status":"up"}
```

La llave vive en `GOTENBERG_TOKEN` (env de la app; nunca en el repo).
La app usa `GOTENBERG_URL=https://147-93-183-165.sslip.io`.
