# Setup — macOS, Linux e Windows

## 1. Node

Instale Node.js **20.19+ ou 22.12+** ([nodejs.org](https://nodejs.org/)).

```bash
node -v   # v20.19+ ou v22.12+
npm -v    # 10+
```

## 2. Clone e dependências

```bash
git clone https://github.com/urianbamboo/orbita-prs.git
cd orbita-prs
npm install
```

## 3. Ambiente

```bash
# macOS / Linux
cp .env.example .env

# Windows PowerShell
Copy-Item .env.example .env
```

Edite `.env`. Mínimo para dados reais:

- `PR_ORBIT_USER=seu-login`
- `PR_ORBIT_ORGS=sua-org` (ou `sua-org,seu-login`)
- Auth: App **ou** `GITHUB_TOKEN=...`

Sem auth → **modo demo** (dados fictícios).

## 4. GitHub App (recomendado)

Siga [`GITHUB_APP.md`](GITHUB_APP.md). Resumo:

1. Crie um GitHub App na **sua** org/user.
2. Permissões **Read-only**: Pull requests e Metadata. Contents e Checks ficam sem acesso.
3. Webhooks desligados; instale só na conta monitorada.
4. Gere uma private key (`.pem`) e cole no `.env`.

### Colar o PEM numa linha (necessário no `.env`)

**macOS / Linux:**

```bash
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' caminho/para/app.private-key.pem
```

**Windows PowerShell:**

```powershell
((Get-Content -Raw .\app.private-key.pem) -replace "`r","" -replace "`n","\n")
```

Cole o resultado em `GITHUB_APP_PRIVATE_KEY="..."`.

Guarde o `.pem` fora do repo (pasta local ignorada por `secret/` / `*.pem` no `.gitignore`).

## 5. PAT (alternativa)

Crie um fine-grained PAT com leitura de Pull requests nos repositórios desejados. Defina:

```env
GITHUB_TOKEN=github_pat_...
PR_ORBIT_USER=seu-login
PR_ORBIT_ORGS=sua-org
```

Deixe os campos `GITHUB_APP_*` vazios.

## 6. Rodar

```bash
npm run dev
```

Abra http://localhost:5173.

## Checklist rápido

- [ ] Node 20.19+ ou 22.12+, com npm ≥ 10
- [ ] `npm install` ok
- [ ] `.env` existe (não commitado)
- [ ] Demo sobe sem token **ou** App/PAT válidos
- [ ] `PR_ORBIT_USER` / `PR_ORBIT_ORGS` batem com a conta instalada
