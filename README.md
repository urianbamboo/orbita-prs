# Órbita de PRs

Dashboard **read-only** em tela única: pull requests abertas (e mergeadas recentes) em vários repositórios, organizadas em 6 estágios. Opcionalmente mostra um overlay de *shepherd* quando um agente (ex.: bot de CI/ajuste) está trabalhando numa PR.

> Sem approve/merge pela UI — use o GitHub.

**by [Urian](https://github.com/urianbamboo)** · MIT

## Quick start (demo, zero segredo)

Sem token o servidor sobe com dados fictícios.

### macOS / Linux

```bash
git clone https://github.com/urianbamboo/orbita-prs.git
cd orbita-prs
npm install
npm run dev
```

### Windows (PowerShell)

```powershell
git clone https://github.com/urianbamboo/orbita-prs.git
cd orbita-prs
npm install
npm run dev
```

- API: http://localhost:3000  
- UI (Vite): http://localhost:5173  

Pré-requisito: **Node.js 20.19+ ou 22.12+** e **npm ≥ 10**.

## Ligar ao seu GitHub

1. Copie o template de env:

```bash
# macOS / Linux
cp .env.example .env

# Windows
copy .env.example .env
```

2. Preencha o mínimo:

| Variável | Uso |
|----------|-----|
| `PR_ORBIT_USER` | Seu login GitHub (“Minhas PRs”) |
| `PR_ORBIT_ORGS` | Orgs/users a varrer, separados por vírgula |
| `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY` | App read-only (recomendado) **ou** |
| `GITHUB_TOKEN` | PAT fine-grained com leitura de PRs |
| `HOST` | Interface de rede; padrão seguro `127.0.0.1` |
| `TRUSTED_HOSTS` | Hostnames aceitos quando o painel é servido remotamente |
| `PR_ORBIT_POLL_MS` | Intervalo do sync em ms; padrão `120000` |
| `PR_ORBIT_MANUAL_SYNC_MIN_MS` | Intervalo mínimo entre syncs manuais |
| `ENV_FILE` | Caminho explícito para outro arquivo env |

Guia passo a passo (App + PEM no Mac/Windows): [`docs/SETUP.md`](docs/SETUP.md) e [`docs/GITHUB_APP.md`](docs/GITHUB_APP.md).

3. Reinicie `npm run dev`.

## Produção (um processo)

```bash
npm run build
npm start
```

Serve API + SPA em `PORT` (padrão 3000). Deploy: [`docs/DEPLOY.md`](docs/DEPLOY.md).

## Testes

```bash
npm test
```

## Shepherd (opcional)

Agentes podem publicar hints via HTTP (`PUT /api/shepherds/...`). Contrato: [`docs/SHEPHERD_PROTOCOL.md`](docs/SHEPHERD_PROTOCOL.md). Em demo, um hint fictício é semeado automaticamente.

## Arquitetura

```
orbita-prs/
├── shared/    Tipos TypeScript (Stage, Pr, StateDto, …)
├── server/    Fastify — sync GitHub, classificação, shepherd
└── client/    Vite + React + Tailwind
```

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/state?scope=mine\|org` | Estado da tela |
| `GET` | `/api/prs/:owner/:repo/:number` | Detalhe de uma PR |
| `POST` | `/api/sync` | Força re-sync |
| `POST` | `/api/shepherds/:agentId/heartbeat` | Heartbeat do agente |
| `PUT` | `/api/shepherds/:agentId/hints` | Snapshot de hints |
| `GET` | `/api/shepherds` | Agentes ativos |

## Segurança

Nunca commite `.env`, `*.pem` ou `secret/`. Ver [`SECURITY.md`](SECURITY.md).

O servidor usa `HOST=127.0.0.1` e valida o header `Host` por padrão. Para acesso
remoto, configure `TRUSTED_HOSTS` e coloque-o atrás de VPN ou reverse proxy
autenticado. Os endpoints de escrita do shepherd ficam desabilitados até que
`SHEPHERD_INGEST_TOKEN` seja configurado; ingest anônimo exige opt-in explícito
com `SHEPHERD_ALLOW_ANON=1`.

## Licença

[MIT](LICENSE) · mantido por [Urian](https://github.com/urianbamboo).
