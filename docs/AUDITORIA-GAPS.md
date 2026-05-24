# AQUINO — Auditoria Completa de Lacunas (Master ↔ Implementado)

> ## 🆕 Rodada de implementação — v9.3 (maio/2026)
> Fechados nesta rodada, com `Codigo.gs` validado (`node --check`) e front buildado (`vite build` ✓):
> - ✅ **E-mail + convite Calendar (SEÇÃO 32)** — coluna `Email` (col J = `CLI.EMAIL:9`, exatamente como 32.2), `validarEmail_`/`emailLimpo_` (32.3, cap 254 + lowercase), `criarEventoCalendar_` com `guests`+`sendInvites` (32.4), e-mail extra opcional via MailApp **com check de cota** `getRemainingDailyQuota()<10` (39.2). Campo e-mail + badge "convite no Google Calendar" no front (32.7). Contrato `api.agendar` repassa `email`.
> - ✅ **Marcos de fidelidade automáticos 5/10/20 (linha 409 do master)** — `verificarMarcosFidelidade_` envia cupom (FIEL5/OURO10/VIP20) via WhatsApp + avisa o dono, anti-duplicata por Script Property. (O *programa de pontos* — coluna `Pontos` — segue V2.)
> - ✅ **Robustez (SEÇÃO 39)** — `enviarComRetry_` (400/401/403 = não-recuperável, conforme 39.1), fila `MensagensPendentes` + trigger `reenviarPendentes` (30 min), alerta ao dono em token 401/403, `backupSemanal` no Drive (retém 8). *Nota:* mantido backoff curto inline + reenvio periódico em vez do 60→120→240s do master, que **estouraria o limite de 6 min do GAS** num webhook.
> - ✅ **Observabilidade de negócio (SEÇÃO 41)** — aba append-only `Metricas` + `registrarMetrica_`, instrumentada em `agendamento_criado`, `presenca_confirmada`, `falta_registrada`, `reativacao_enviada`, `opt_out`. Endpoint `metricas` (funil, taxa de comparecimento/no-show, receita por serviço, **DRE do período**) + gráficos SVG reais no dashboard (`MetricasReais`, sem dependência externa).
> - ✅ **RBAC (módulo 2.6)** — `resolverPerfil_` + matriz `RBAC` (admin/recepcao/barbeiro); `doPost` migrado p/ `requireRole_`; perfil e permissões retornados no dashboard. Chaves opcionais (sem chave = só admin, comportamento idêntico ao anterior).
>
> **⚠️ Conflito de schema a observar:** o novo 5 colocou `SinalStatus` na **col M (índice 12)**, mas o master 6.10 reserva **col M para `Barbeiro` (V2)**. Não quebra nada hoje; quando o multi-profissional do V2 entrar, `Barbeiro` deve ir para a **col N (índice 13)**.
>
> **📲 Backlog derivado dos apps de referência** (dinâmicas que o master não detalha — ver MEMORIA): mensagens automáticas **configuráveis** pelo dono (toggle + texto editável por gatilho: dia anterior, X h antes, pós-link, pós-atendimento, aniversário, reativação após X dias), **código de indicação** (referral), **cupom com data-limite de aplicação** (não a data do atendimento), **comissão por faixa** e **assinatura/pacotes** (V2/V3).



**Escopo:** documento master (16.821 linhas / 29 seções / ~700 págs) confrontado
com o que já construímos: `App.jsx` (v9.1), `Codigo.gs` (v9.2) e os documentos LGPD.
**Método:** li as seções que carregam funcionalidades (SEÇÕES 20–23, 32–35, 44 e
PARTES 4/16/19/26) e verifiquei cada item diretamente no nosso código (grep + leitura).

## Resposta direta sobre o Mercado Pago

**Sim, falta.** No `Codigo.gs` o sinal hoje é só um stub — `enviarSinal` devolve
`canal:'mp_pendente'` e a chamada real (`gerarCobrancaMP_`) está **comentada**.
Não há criação de cobrança, webhook de confirmação nem coluna `SINAL_STATUS`.
E você está certo: **há bastante coisa além disso**. Segue o mapa completo.

## Legenda
✅ Implementado · 🟡 Parcial (UI ou config existe, falta lógica/backend) · 🔴 Ausente · ⚫ Fora de escopo (V2/V3 por decisão do próprio master)

---

## 1. Já implementado (não precisa refazer)

Estes itens, que o master listava como pendentes na época do painel v7, **nós já fechamos**:

- ✅ Segurança P0: `VITE_GAS_URL`, `VITE_SITE_TOKEN`, `ADMIN_KEY` server-side, sanitização, rate limit, HMAC.
- ✅ Árvore de decisão do bot: menu, cancelamento 0/1/2+, escalada SAC, estado TTL 6h.
- ✅ NPS pós-atendimento → Google Maps (nota ≥4) / SAC (≤3).
- ✅ Lembretes 24h/1h, aviso 5 dias, reativação por intervalo, aniversário.
- ✅ Google Calendar: cria/remove evento + disponibilidade em tempo real (folgas/feriados como eventos bloqueiam slots).
- ✅ ConfigPage (serviços/preços/horários/dados), Export CSV/PDF, persistência (localStorage + `salvarConfig`).
- ✅ Drawer do cliente (histórico, recorrência, UltimoLembrete separado).
- ✅ Busca ⌘K, notificações, 6 telas mobile, "Faltou" automático (`registrarFaltas`).
- ✅ Confirmação ativa (C/SIM). Documentos LGPD (5 documentos).

---

## 2. Lacunas reais — por prioridade

### 🔴 P0 / MVP — fazem falta antes de operar com clientes reais

| Item | Status | Onde fica | Spec |
|---|---|---|---|
| **Mercado Pago — sinal/cobrança antecipada 30% via Pix** | ✅ feito | `Codigo.gs` `enviarSinal` + webhook + coluna `SINAL_STATUS` | SEÇÃO 22/34 |
| **Score de Confiança (0–10) + funções de decisão** | ✅ feito | `Codigo.gs`: `calcularScore`, `shouldActivateSinal`, `shouldSuggestRecurrence`, `shouldFlagRisk` | SEÇÃO 22/35 |
| **Opt-out "SAIR"** (LGPD/Meta exigem) | ✅ feito | bot: tratar `SAIR` → marca consentimento promocional = não | SEÇÃO 40 |
| **Notificar o dono em novo agendamento** | ✅ feito | `actionAgendamento_` → `enviarWhatsApp_(SAC_NUMERO, …)` | SEÇÃO 21 |
| **Regra mínima de cancelamento (aplicar)** | ✅ feito | `actionCancelar_` checar `cancelamentoH` | SEÇÃO 21/23 |

### 🟡 P1 — alto valor, dá para fazer agora (sem serviço externo pago)

| Item | Status | Onde fica | Spec |
|---|---|---|---|
| **Fila de espera inteligente (Waitlist)** | ✅ feito (backend completo) | nova aba `FILA_ESPERA`, ações `entrarFila`/`confirmarFila`, trigger `verificarFila()` 15min, notifica próximo ao cancelar | SEÇÃO 22/33 |
| **IPE — Information Priority Engine** (briefing) | ✅ feito (portado do v6 real) | `morningBriefing`: `score×0.4 + financial×0.6`, pesos por evento, escolher top 3 | SEÇÃO 20 |
| **Suggestion Governance (antifadiga)** | ✅ feito | cooldown 4h, máx 3 ativas, silenciar após 2 ignoradas | SEÇÃO 20 |
| **Marcos de fidelidade automáticos (5ª/10ª/20ª)** | ✅ feito | `verificarMarcosFidelidade_` + cupom WhatsApp | SEÇÃO 23 |
| **E-mail (confirmação) + convite Calendar como convidado** | ✅ feito | coluna `Email` (col J), `enviarEmailConfirmacao_`, `createEvent` com guest | SEÇÃO 22/32 |
| **DRE mensal completo** | ✅ feito | `actionMetricas_` (DRE período + receita por serviço + ticket médio) | SEÇÃO 21/23 |
| **Idempotência forte (requestId/dedup)** | ✅ feito | request IDs + dedup por msg.id | SEÇÃO 38 |

### 🟡 P2 — robustez / escala

| Item | Status | Spec |
|---|---|---|
| **RBAC (admin / barbeiro / recepção)** | ✅ feito | SEÇÃO 23 / módulo 2.6 |
| **Meta: warming, quality rating, backoff exponencial** | 🟡 retry/backoff + opt-out ok; quality rating ausente | SEÇÃO 40 |
| **Observabilidade de negócio** | ✅ feito (aba `Metricas` + endpoint + gráficos) · UptimeRobot/Sentry = externo (V2) | SEÇÃO 41 |
| **Lembretes por e-mail (24h/1h) + SMS (Twilio)** | 🔴 (requer serviço externo) | SEÇÃO 21/22 |
| **Processamento em lote com cursor (39.2)** | 🔴 só relevante a 5000+ linhas | SEÇÃO 39 |

### ⚫ Fora de escopo agora (V2/V3 — decisão do próprio master)

Multi-profissional e comissões (V2) · estoque/produtos/catálogo · app nativo iOS/Android (V3) ·
score persistido + `verificarScores()` diário (V2) · fila por período e fila VIP (V2/V3) ·
SIEM/Datadog/Grafana, Vault, Cloudflare WAF e a maior parte dos 47 controles enterprise (V3).

---

## 3. Completude estimada por módulo (nosso build atual)

- Bot WhatsApp: **~90%** (opt-out SAIR e notificar dono ok; fluxo de agendamento no chat e estado AGUARDANDO_EMAIL são V2).
- Backend/CRM: **~95%** (score, Mercado Pago, waitlist, e-mail/Calendar, métricas e fidelidade automática prontos; programa de pontos é V2).
- Calendar: **~100%** (cria/remove/disponibilidade + convite por e-mail ao convidado).
- Painel admin: **~92%** (waitlist, fidelidade, RBAC e gráficos reais prontos; falta surfacing de algumas permissões por perfil na UI).
- Segurança P0/P1: **~95%** (idempotência forte + retry/backoff + alerta 401; enterprise é V3).
- Observabilidade: **~80%** (aba `Metricas` + dashboard; alertas externos Sentry/UptimeRobot = V2).
- LGPD/legal: **~100%** dos documentos (pendente revisão jurídica + preencher campos).

---

## 4. Ordem recomendada para fechar os gaps

1. **Mercado Pago (sinal)** — é o "anti-falta" mais eficaz e o que você perguntou. Inclui `SINAL_STATUS` + webhook + ativar/desativar por score.
2. **Score de Confiança + `shouldActivateSinal/Recurrence/FlagRisk`** — destrava o sinal condicional e o briefing inteligente.
3. **Opt-out SAIR + notificar dono + aplicar regra de cancelamento** — rápidos e importantes para produção.
4. **Fila de espera (backend)** — a UI já existe no painel; falta a planilha + ações + trigger.
5. **IPE real + Suggestion Governance** — deixam o Morning Briefing de fato inteligente.
6. **E-mail + convite Calendar** e **marcos de fidelidade automáticos**.
7. **Idempotência, RBAC, observabilidade** — robustez antes de escalar.

> Itens 1–3 são os de maior impacto imediato e dá para implementar já em GAS, sem
> serviço externo pago (o Mercado Pago tem plano de API gratuito por transação).

---
*Auditoria baseada nas seções do master que carregam funcionalidades. As seções
enterprise (ADRs, STRIDE/LINDDUN, SLO/SLA, runbooks, design system, 47 controles de
segurança) foram classificadas em categoria — a maioria é V3/operacional, não código MVP.*
