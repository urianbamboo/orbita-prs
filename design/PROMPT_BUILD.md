# Prompt de build — "Órbita de PRs" (central de evolução de PRs)

> Cole este prompt no início de uma sessão de coding para construir o back e o front end do produto a partir do design pronto.
> Referências visuais na mesma pasta: `pr-orbit.html` (Tailwind), `pr-orbit-puro.html` (CSS puro), `pr-orbit.tsx` (porte React/TSX estático).

---

Você vai construir, do zero, um produto full-stack chamado **"Órbita de PRs"**: uma central de controle em tela única que mostra **todas as pull requests abertas por mim** em **vários repositórios**, posicionadas em um **processo visual de estágios**, respondendo a relance: *onde cada PR está? tem alguém trabalhando nela? estamos aguardando o quê / quem?*

O design está pronto e deve ser seguido com fidelidade. Não invente outro visual. Seu trabalho é o motor (back) + dar vida ao front (dados reais + interações + estados).

---

## 1. Referências obrigatórias (leia antes de codar)

- `pr-orbit.tsx` — porte React/TSX **estático e fiel** do design (classes Tailwind idênticas ao HTML, ícones SVG inline, `data-pencil-name` em cada camada com o nome exato do elemento — use-os como âncora).
- `pr-orbit.html` / `pr-orbit-puro.html` — mesma tela em HTML (útil para comparação visual e conferir classes).
- O design é **uma tela única (1520×996), sem rolagem** no desktop wide: barra superior → cabeçalho + placar de 6 contadores → painel "Pista de evolução das PRs" com 6 estações → barra "Ficha da PR selecionada" → faixa "Quem está em órbita agora".

### Design tokens (use exatamente)

| Token | Valor |
|---|---|
| Fundo página | gradiente linear `#070B1C → #0B1128 → #0D1430` |
| Painéis | `#0E1636`, borda `#23305F`, cantos 18–20px |
| Placas de estação | `#0A112B`, borda `#23305F`, cantos 14px |
| Cartões de PR | `#131D47`, borda `#23305F`, cantos 11px |
| Texto | `#EDF2FF` (principal), `#A7B3DE` (2º), `#7481B2` (3º) |
| Neon por estado | recém: `#22D3EE` · em obra: `#A78BFA` · review: `#34D399` · esperando você: `#FBBF24` · merge: `#F472B6` · entregues: `#60A5FA` |
| Cores por repo | api-gateway `#A78BFA` · auth-service `#22D3EE` · billing-api `#FBBF24` · data-pipeline `#FB7185` |
| Fontes | Headings **Funnel Sans** · corpo **Inter** · dados/mono **Geist Mono** |
| Ícones | Material Symbols Outlined (SVG inline) — `rocket_launch`, `construction`, `visibility`, `feedback`, `merge_type`, `task_alt`, `ads_click`, `forum`, `done_all`, `schedule` |

## 2. O que o produto precisa responder (modelo mental)

Para cada PR aberta por mim, em qualquer repo monitorado:

1. **Onde está no processo?** → uma das 6 estações.
2. **Tem alguém trabalhando?** → quem (avatar/nome) e há quanto tempo, ou "ninguém pegou ainda".
3. **Estamos aguardando?** → aguardando review de quem, ou aguardando **minha** ação (feedback/resposta/merge), ou livre.
4. **Dado rápido** → repo (workspace), número, título, branch/base, última atividade, comentários.

Contadores do placar e colunas devem ser **derivados dos mesmos dados** — nunca duplicar estado (invariante: soma das 5 estações ativas = total de PRs abertas por mim; "Entregues" = merges dos últimos 7 dias).

## 3. Arquitetura sugerida (pode melhorar, justifique)

- **Front:** React + TypeScript + Tailwind (reaproveite `pr-orbit.tsx` como base visual). Estado com React Query/SWR (fetch + cache + refetch).
- **Back:** serviço pequeno (Node/Express ou Fastify; ou serverless) que fala com a **API do GitHub** e entrega DTOs prontos para o front — o front **nunca** chama o GitHub direto nem guarda token.
- **Sincronização:** polling a cada 30 s por padrão; opcional SSE/WebSocket ou webhook do GitHub (pull_request + review + issue_comment) para atualização quase em tempo real.
- **Storage:** opcional e mínimo — se precisar de histórico (ex.: tempo em cada estágio, contagem de entregues da semana mesmo entre deploys), use SQLite ou Postgres com tabelas `repos`, `prs`, `pr_events`. Se for stateless, derive tudo do GitHub a cada fetch e mantenha apenas cache com TTL.

## 4. Backend — especificação

### 4.1 Configuração

- Autenticação: GitHub App (recomendado) ou PAT com escopos mínimos: leitura `repo`; escrita **somente** quando você aprovar ações (merge/approve) — nunca peça escopo de escrita por padrão.
- Lista de repos monitorados configuravel por env (`PR_ORBIT_REPOS=owner/api-gateway,owner/auth-service,...`) e/ou auto-descoberta: repos onde EU sou membro com permissão e que tenham PRs abertas por mim.

### 4.2 Endpoints

- `GET /api/state` → payload único que o front usa para montar a tela inteira:
  - `prs[]` (todas abertas por mim + derivadas), `people[]`, `repos[]`, `counts` (6 contadores), `lastSyncAt`, `syncStatus`.
- `GET /api/prs/:repo/:number` → detalhe completo da PR (para a ficha ao clicar).
- `POST /api/sync` → força re-sync.
- Ações (atrás de confirmação explícita minha e de token com escopo):
  - `POST /api/prs/:repo/:number/approve`
  - `POST /api/prs/:repo/:number/merge`
  - `GET /api/prs/:repo/:number/comments`

### 4.3 Modelo de dados (front + back compartilham os tipos)

```ts
type Stage = "nova" | "obra" | "review" | "aguardando_voce" | "merge" | "entregues";
type ChipStatus = "busy" | "wait" | "you" | "idle" | "done";

interface Repo { key: string; owner: string; name: string; color: string; }

interface Person { login: string; name: string; role: "dev" | "reviewer" | "autor"; avatarUrl: string; online: boolean; }

interface Pr {
  repoKey: string; number: number; title: string; url: string;
  stage: Stage; status: ChipStatus; statusLabel: string; // ex.: "Rafa editando", "espera 2ª aprovação", "você pode mergear"
  pct?: number;                 // progresso (ex.: commits revisados / arquivos) para estações em obra
  assignees: Person[];          // quem está trabalhando
  reviewers: { person: Person; state: "pending" | "approved" | "changes" }[];
  waitsOn?: string;             // humano legível: quem/nada está travando
  updatedAt: string; commentedAt?: string; branch: string; base: string; commits: number;
  isMine: boolean;              // abri eu?
  checkRuns?: "pending" | "success" | "failure";
}

interface StateDto { prs: Pr[]; people: Person[]; repos: Repo[]; counts: Record<Stage, number>; lastSyncAt: string; }
```

### 4.4 Máquina de estágios (regras de classificação — implemente em função pura + testes)

Rode em cada PR **aberta por mim**; para "Entregues" use PRs **mergeadas por mim** nos últimos 7 dias. Avalie nesta ordem (primeira que casar vence) e guarde o `statusLabel` exato para o cartão:

1. **Aguardando você** — existe review com `requested changes`, OU comentário de revisor te marcando sem sua resposta, OU merge disponível após aprovação sua pendente de decisão. (No design: "feedback do Thiago", "aprovada com ressalvas", "você pode mergear".)
2. **Em review** — há `review_requests` pendentes ou reviewer atribuído sem decisão, e a PR não é sua de trabalho ativo. (No design: "Thiago está revisando", "espera 2ª aprovação".)
3. **Em obra** — alguém (não eu) é assignee e há atividade recente (push/commit < 24 h ou comentário < 24 h). Preencher `pct` se houver métrica confiável (ex.: checks concluídos / total), senão omitir.
4. **Recém-aberta / Nova** — sem assignee, sem reviewers, sem atividade além da abertura, aberta há < 72 h. (No design: "aberta há 14 min", "ninguém pegou ainda".)
5. **Fila de merge** — recebeu `approved`, mergeable, ainda não mergeada. (No design: "você pode mergear" — aqui a ação primária é **Mergear**.)
6. **Entregues** — mergeada nos últimos 7 dias (cartões com `task_alt`).

Regra de *status visual* do cartão: `busy` = ponto verde pulsando + nome de quem trabalha; `wait` = âmbar + o que esperamos; `you` = âmbar + ação sua; `idle` = cinza "ninguém pegou ainda"; `done` = cartão entregue. **A cor da estação NUNCA substitui a cor do repo no cartão** (repo é a identidade do cartão).

### 4.5 Tratamento de erros e limites (obrigatório)

- Rate limits do GitHub: tratar `403`/secondary limits com backoff + `x-ratelimit-remaining`; cache com ETag/If-None-Match; paginação 100/page; unificar PRs por repo com `GET /repos/{o}/{r}/pulls?state=open&sort=updated`.
- Estados silenciosos não podem existir: `syncStatus` = `ok | syncing | degraded | error` aparece no pill "GitHub conectado · sync 14:32" do topo (mude o texto conforme o estado).
- Falha de um repo não derruba os outros (agregue erros por repo).

## 5. Frontend — comportamento a implementar (o design mostra os estados parados)

Parta do `pr-orbit.tsx` e transforme em componentes dirigidos por `StateDto`:

- **Cartões de PR** renderizam `repoKey`+`number`+título+`statusLabel`+`pct`; a cor do repo e o estado (pulso/âmbar/cinza) vêm dos dados.
- **Hover num cartão** → revela quem está nela (nomes/avatares dos `assignees`/`reviewers` ativos) — tooltip pequeno, sem quebrar layout.
- **Clique num cartão** → o cartão ganha o anel verde (como o #219 no design) e a **"Ficha da PR selecionada"** (barra inferior do painel) preenche: repo · título · branch/base · commits · última atividade · quem está trabalhando · conversa · ações (Ver conversa / Aprovar / Mergear quando aplicável). Clicar em outro cartão troca a ficha; `Esc` fecha.
- **Ações** chamam os endpoints do back e refletem o resultado no estado (aprovar → cartão anda para "Fila de merge"; merge → cartão sai para "Entregues").
- **Faixa "Quem está em órbita agora"** = `people[]` derivados (assignees/reviewers ativos agora + você com pendências) e pill "atualiza a cada 30 s" coerente com o polling real.
- **Placar** (6 contadores) = `counts`; deve bater exatamente com o que está nas colunas.
- **Botão "Nova PR"** e pill de sync no topo são funcionais (Nova PR abre formulário ou `gh`/URL de criação pré-preenchida com repo escolhido).
- Estados do sistema (obrigatórios, além do sucesso): **loading** (esqueleto nos painéis), **erro** (banner com retry), **vazio** ("nenhuma PR sua no ar 🎉"), **offline/desatualizado** (mostrar hora do último sync).
- **Responsividade:** alvo primário desktop wide (sem rolagem até ~1440×900). Abaixo de ~1200px é permitido que o layout vire uma página com scroll vertical natural (colunas empilham); nunca quebrar horizontalmente.

## 6. Critérios de aceite (checklist)

- [ ] `GET /api/state` devolve DTO coerente; contadores = soma real das colunas.
- [ ] Classificador de estágio coberto por testes de unidade com fixtures (cada regra + precedência + caso "sem atividade", "requested changes", "approved+mergeable").
- [ ] Front replica o design com os mesmos textos/ícones/espaçamentos (compare com `pr-orbit.html`).
- [ ] Hover e clique funcionam; ficha troca com seleção; Esc fecha.
- [ ] Aprovar/mergear fluem pelas estações corretamente (estado otimista + rollback em erro).
- [ ] Estados loading/erro/vazio/offline visíveis e sem silêncio.
- [ ] Token nunca aparece no client; escopos mínimos; rate-limit tratado.
- [ ] Um repo com falha não quebra o dashboard.
- [ ] README com setup (env vars, GitHub App/PAT, repos a monitorar) e `.env.example`.
- [ ] App roda localmente com `npm run dev` + `npm test`.

## 7. Decisões abertas — pergunte e proponha antes de implementar

1. Repos: fixos por env ou descoberta automática? (sugestão: env inicial + auto-descoberta opcional)
2. Público: só você (single-user) ou time? (afeta auth e `people[]`)
3. Sync: polling 30 s (mais simples) ou webhook (quase tempo real, mais infra)?
4. Histórico: precisamos de "tempo parado em cada estágio" (exigiria storage) ou o snapshot do GitHub basta?
5. Deploy alvo (Vercel/Cloudflare/Railway/servidor próprio) para escolher a forma do back.

## 8. Entrega

Estrutura de pastas clara (ex.: `client/` + `server/` + `shared/` para os tipos), código limpo, testes para o classificador e para os endpoints principais, e um `README.md` curto. Ao terminar, rode lint + testes e faça um passo-a-passo de como eu subo localmente apontando para repos reais.
