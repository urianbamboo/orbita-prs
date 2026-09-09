# Deploy

## Build único + serve SPA

```bash
npm run build
npm start
# equivale a: NODE_ENV=production SERVE_CLIENT=1 node server/dist/index.js
```

Defina as mesmas variáveis de [`.env.example`](../.env.example) no host (arquivo `.env` ao lado do monorepo ou secrets do provedor).

## systemd (VPS Linux)

```ini
[Unit]
Description=Órbita de PRs
After=network.target

[Service]
Type=simple
WorkingDirectory=/srv/orbita-prs
EnvironmentFile=/srv/orbita-prs/.env
Environment=NODE_ENV=production
Environment=SERVE_CLIENT=1
Environment=HOST=127.0.0.1
# Se o proxy encaminhar o Host público:
# Environment=TRUSTED_HOSTS=panel.example.com
ExecStart=/usr/bin/node server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Railway / PaaS

- Build: `npm run build`
- Start: `npm start`
- Injete env vars pelo painel do provedor (não suba `.pem` no git).
- Porta: use `PORT` fornecido pelo host.
- Defina `HOST=0.0.0.0` e `TRUSTED_HOSTS` com o hostname público fornecido.

## Notas

- Sync usa a Search API + `pulls.get`; respeite rate limits (o server tem circuit breaker para secondary limit).
- Poll padrão: `PR_ORBIT_POLL_MS` (ex.: `120000`).
- Para bind remoto, configure `HOST` e `TRUSTED_HOSTS`; prefira proxy/VPN.
- O dashboard **não** autentica usuários finais — coloque atrás de VPN, Tailscale ou auth do reverse proxy se for expor.
