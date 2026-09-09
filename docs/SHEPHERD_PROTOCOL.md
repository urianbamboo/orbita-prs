# Shepherd Protocol — Contrato para agentes de auto-merge

O painel expõe um **overlay de shepherd**: qualquer agente (scripts de CI, bots) pode injetar hints sobre PRs que está trabalhando. Esses hints são exibidos no painel em tempo real — mover um PR para a coluna **Em obra** quando o agente está ajustando CI, por exemplo.

---

## Autenticação

Configure `SHEPHERD_INGEST_TOKEN` no servidor. Todos os endpoints de escrita do shepherd exigem:

```
Authorization: Bearer <SHEPHERD_INGEST_TOKEN>
```

Sem token, os endpoints de escrita respondem `503`. Para um demo local
descartável, `SHEPHERD_ALLOW_ANON=1` habilita ingest sem autenticação
explicitamente. Nunca use essa opção em uma interface de rede compartilhada.

---

## Endpoints

### `POST /api/shepherds/:agentId/heartbeat`

Registra que o agente está ativo. Envie a cada **≤ 60 segundos**.

**Body (JSON):**
```json
{
  "displayName": "DemoBot",
  "ownerLogin": "your-login"
}
```

**Resposta:**
```json
{ "ok": true, "agentId": "demo-bot", "at": "2026-09-03T18:00:00.000Z" }
```

---

### `PUT /api/shepherds/:agentId/hints`

Substitui **todos** os hints do agente (snapshot completo). Envie a cada **≤ 30 segundos** ou quando o estado mudar.

**Body (JSON):**
```json
{
  "agent": {
    "id": "demo-bot",
    "displayName": "DemoBot",
    "ownerLogin": "your-login"
  },
  "hints": [
    {
      "agent": { "id": "demo-bot", "displayName": "DemoBot" },
      "owner": "YOUR_ORG",
      "repo":  "example-repo",
      "number": 217,
      "activity": "adjusting",
      "label": "DemoBot adjusting CI",
      "updatedAt": "2026-09-03T18:00:00.000Z",
      "sha": "abc1234",
      "detailUrl": "https://slack.com/archives/C1234/..."
    }
  ]
}
```

**Resposta:**
```json
{ "ok": true, "agentId": "demo-bot", "count": 1, "at": "2026-09-03T18:00:00.000Z" }
```

---

### `GET /api/shepherds`

Lista agentes registrados e último heartbeat (sem segredos).

---

## Activity enum e mapeamento de estágios

| `activity`           | Estágio no painel   | Status  | Label no card        |
|----------------------|---------------------|---------|----------------------|
| `adjusting`          | **Em obra**         | busy    | `hint.label`         |
| `merging`            | **Em obra**         | busy    | `hint.label`         |
| `awaiting_approval`  | (mantém estágio GH) | —       | `hint.label`         |
| `blocked`            | (mantém estágio GH) | —       | `hint.label`         |
| `watching`           | (mantém estágio GH) | —       | sem alteração        |
| `idle`               | (mantém estágio GH) | —       | sem alteração        |

---

## TTL e staleness

Hints com `updatedAt` mais antigo que `SHEPHERD_HINT_TTL_MS` (padrão: **120 000 ms / 2 minutos**) são ignorados automaticamente. O agente deve renviar hints ativos antes do TTL expirar.

O servidor aceita no máximo 100 agentes ativos e 500 hints por agente. Agentes
sem heartbeat por `SHEPHERD_AGENT_TTL_MS` (padrão: 5 minutos) são removidos.

Fluxo esperado:
1. **Heartbeat** a cada ≤ 60 s
2. **PUT hints** a cada ≤ 30 s (ou imediatamente ao mudar de estado)
3. Quando terminar: enviar `PUT hints` com `hints: []` (array vazio) para limpar

---

## Multi-agente

Se dois agentes enviarem hints para o mesmo PR, o **mais recente** (`updatedAt`) vence. O servidor registra um warning no console.

---

## Exemplo com curl

```bash
TOKEN="seu_shepherd_token"
BASE="http://localhost:3000"
AGENT="demo-bot"

# 1. Heartbeat
curl -s -X POST "$BASE/api/shepherds/$AGENT/heartbeat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"DemoBot","ownerLogin":"your-login"}'

# 2. Reportar hint (PR YOUR_ORG/example-repo#217 sendo ajustado)
curl -s -X PUT "$BASE/api/shepherds/$AGENT/hints" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": {"id":"demo-bot","displayName":"DemoBot","ownerLogin":"your-login"},
    "hints": [{
      "agent": {"id":"demo-bot","displayName":"DemoBot"},
      "owner": "YOUR_ORG",
      "repo": "example-repo",
      "number": 217,
      "activity": "adjusting",
      "label": "DemoBot adjusting CI",
      "updatedAt": "'$(date -u +%Y-%m-%dT%H:%M:%S.000Z)'"
    }]
  }'

# 3. Limpar hints ao terminar
curl -s -X PUT "$BASE/api/shepherds/$AGENT/hints" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"agent":{"id":"demo-bot","displayName":"DemoBot"},"hints":[]}'
```
