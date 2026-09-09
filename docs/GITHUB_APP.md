# Configurando um GitHub App (auth read-only)

O painel usa GitHub App em produção (recomendado). Escopos só de **leitura**. O App não “é” o dashboard — só credencial + permissões para a API.

**Padrão:** um App **privado** por org ou conta pessoal que você monitora (*Only on this account*). Evite “Any account” a menos que saiba o que está fazendo.

Suporte a até **dois** Apps no `.env`:

```env
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY="-----BEGIN ...\n...\n-----END ...\n"
GITHUB_APP_INSTALLATION_ID=          # opcional

GITHUB_APP_2_ID=                     # opcional — segunda org/user
GITHUB_APP_2_PRIVATE_KEY=
GITHUB_APP_2_INSTALLATION_ID=

PR_ORBIT_USER=your-login
PR_ORBIT_ORG=YOUR_ORG
PR_ORBIT_ORGS=YOUR_ORG,another-owner
```

Contas pessoais usam o qualifier `user:` na Search; orgs usam `org:` — o server resolve sozinho.

---

## 1. Criar o App

Na org: `https://github.com/organizations/YOUR_ORG/settings/apps/new`  
Na conta pessoal: GitHub → **Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**.

Preencha:

- **GitHub App name**: ex. `meu-orbita-prs` (slug único)
- **Homepage URL**: `http://localhost:3000` (depois a URL do painel)
- **Webhooks**: desmarque **Active**

**Repository permissions** (só Read):

| Permissão | Nível |
|-----------|-------|
| Pull requests | **Read-only** |
| Metadata      | **Read-only** |

O painel não lê conteúdo de arquivos nem check runs. Portanto, **Contents** e
**Checks** devem ficar em **No access**.

**Where can this GitHub App be installed?** → **Only on this account**.

Create GitHub App. Anote o **App ID**.

## 2. Chave privada

App → **Private keys** → **Generate a private key**. Baixe o `.pem`.

**macOS / Linux** (uma linha para o `.env`):

```bash
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' *.pem
```

**Windows PowerShell:**

```powershell
((Get-Content -Raw .\app.private-key.pem) -replace "`r","" -replace "`n","\n")
```

Cole em `GITHUB_APP_PRIVATE_KEY="..."`. **Não** commite o `.pem`.

## 3. Instalar

App → **Install App** → escolha a org/user → **All repositories** (ou só os desejados) → **Install**.

Se houver várias installations, defina `GITHUB_APP_INSTALLATION_ID` ou `PR_ORBIT_ORG` para desambiguar.

## 4. Segundo owner (opcional)

Repita os passos com um segundo App (`GITHUB_APP_2_*`) se precisar varrer outra org/user com instalação separada. Liste ambos em `PR_ORBIT_ORGS`.

## Alternativa: PAT

Se não quiser App, use `GITHUB_TOKEN` (fine-grained, leitura de PRs) e deixe os campos `GITHUB_APP_*` vazios. Ver [`SETUP.md`](SETUP.md).
