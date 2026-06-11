# AQUINO — Backend (Google Apps Script)

Guia de configuração do backend. Schemas, payloads, respostas e segurança do
sistema de agendamento.

## Estrutura
- **Schemas EXATOS** (PARTE 6.9/6.10):
  - Clientes: ClienteID · Telefone · Nome · NomeAbreviado · UltimoAgendamento ·
    TotalAgendamentos · IntervaloDias · Nascimento · UltimoLembrete
  - Agendamentos: ID · Nome · NomeAbreviado · Telefone · ClienteID · Servico ·
    Duracao · Data · Horario · Preco · Status · CriadoEm
  - Financeiro: Data · Tipo · Categoria · Descricao · Valor · Profissional ·
    AgendamentoID · FormaPagamento · Status
- **Respostas canônicas**: `{success,error}` / `{encontrado,...}` exatamente como
  6.4 e 6.5 (inclui erros "Horário não disponível", "Já cancelado",
  "Agendamento já realizado", "Agendamento não encontrado").
- **IDs**: ClienteID `CLI-001` sequencial (com LockService); Agendamento UUID 8 hex.
- **Status**: confirmado · presenca_confirmada · cancelado · faltou · realizado.
- **Anti-spam**: `UltimoLembrete` (col I) gravado SEPARADO de `UltimoAgendamento`
  (col E) — o bug nº 1 da v1.0, agora garantido.
- **IntervaloDias** validado 1–365. **NomeAbreviado** gerado automaticamente.
- **Segurança P0/P1** (PARTE 11/17): SITE_TOKEN + ADMIN_KEY server-side,
  comparação tempo-constante (timing-safe), sanitização anti formula-injection
  (= + - @), rate limit 15/min via CacheService, HMAC-SHA256 do webhook,
  erros genéricos (sem stack trace), rota admin ofuscada, Log via appendRow.


## Novas Script Properties (cobrança / Mercado Pago) — v9.3
- `COBRANCA_MODO` = `desativado` (MVP/Modelo A). Outros: `universal`, `novatos`,
  `reincidentes`, `premium`, `longos`, `score` (SEÇÃO 34).
- `COBRANCA_PERCENTUAL` = `30` · `COBRANCA_DURACAO_MIN` = `60` ·
  `COBRANCA_SCORE_LIMITE` = `5` · `COBRANCA_HORARIOS_PREMIUM` = `sabado,domingo`.
- `MP_ACCESS_TOKEN` (Mercado Pago) · `GAS_WEBHOOK_URL` (= URL /exec, para o
  notification_url do Pix) · `SITE_URL`. Preencher para ativar o Pix do sinal.

> Configure o webhook do Mercado Pago apontando para a URL /exec com `?source=mp`.
> O sinal só é exigido quando `COBRANCA_MODO` ≠ `desativado` e `deveExigirSinal()`
> retorna true; o agendamento fica `aguardando_sinal` até o pagamento ser aprovado.

## Ações implementadas
- GET: `ping`, `getConfig`, `listarServicos`, `verificarCliente`, `slots`,
  `meusAgendamentos`, verificação de webhook (`hub.challenge`).
- POST: `agendamento`, `cancelar`, `confirmarPresenca`, `reagendar`,
  `enviarLembrete`, `enviarSinal`; admin: `dashboard`, `morningBriefing`,
  `salvarConfig`, `servicoCreate/Update/Delete`; webhook Meta (`entry[]`).

## Setup
1. Planilha Google → Extensões → Apps Script → cole o `Codigo.gs`.
2. Rode `setupScriptProperties` → **altere** SITE_TOKEN e ADMIN_KEY; preencha as
   chaves da Meta (WHATSAPP_TOKEN, PHONE_NUMBER_ID, VERIFY_TOKEN, META_APP_SECRET,
   SAC_NUMERO) em Projeto → Propriedades do script.
3. Rode `setupSheets` (cria as abas com cabeçalho canônico + seed de serviços —
   inclui as novas `MensagensPendentes` e `Metricas`, e `Email` como col J de Clientes).
4. (Opcional) Rode `criarTriggers` para os gatilhos de tempo. Agora inclui também
   `reenviarPendentes` (a cada 30 min — fila de reenvio) e `backupSemanal`
   (segunda 3h — backup JSON no Drive, pasta `AQUINO_Backups`, retém 8).
5. **Permissão do Calendar:** na 1ª execução o GAS pedirá autorização de acesso
   ao Google Calendar — aceite. Para enviar **convite ao cliente** (`sendInvites:true`,
   SEÇÃO 32) é preciso o escopo `https://www.googleapis.com/auth/calendar`; ao ativar
   o e-mail/convite, **re-autorize** o script na primeira execução seguinte. Opcional:
   defina `CALENDAR_ID` nas Script Properties (padrão = agenda principal).
   - **E-mail (opcional):** o convite do Calendar já manda um e-mail ao cliente. Para um
     e-mail extra com a sua marca, defina `EMAIL_ATIVO=1` (cuidado: cota MailApp = 100/dia;
     o código pula o envio se restarem < 10). `EMAIL_DONO` recebe alerta se o token Meta expirar.
   - **RBAC (opcional):** defina `BARBEIRO_KEY` e/ou `RECEPCAO_KEY` para perfis com acesso
     reduzido. Sem essas chaves, só existe o perfil admin (comportamento idêntico ao anterior).
6. Implantar → App da Web → Executar como **Eu** · Acesso **Qualquer pessoa** →
   copie a URL `/exec` para `VITE_GAS_URL`. `VITE_SITE_TOKEN` = `SITE_TOKEN`.

## Implementado x Pendente (espelha PARTE 19 do master)
- ✅ Implementado aqui (núcleo + bot completo):
  - Site/API: agendar, cancelar, confirmarPresenca, slots, meusAgendamentos, CRM.
  - Schemas canônicos + segurança P0/P1 + CRUD de serviços + config completa.
  - **Motor de conversa do bot** (PARTE 7/8): máquina de estados em CacheService
    (TTL 6h) — menu principal personalizado, fluxo de cancelamento 0/1/2+
    (CONFIRMAR_CANCELAMENTO / ESCOLHER_CANCELAMENTO), confirmação C/SIM,
    escalada ATENDENTE, "Meus agendamentos", lista de serviços, e NPS pós-atendimento.
  - **Regra das 24h** (PARTE 9): `clienteAtivouJanela_` decide texto livre x template.
  - **Triggers reais** (PARTE 5.3): `verificarLembretes` (24h/1h),
    `verificarLembrete5Dias`, `verificarReativacao` (inativo + aniversário ANIV10),
    `registrarFaltas`, `verificarFeedback` (NPS) — todos com anti-duplicata.
  - **5 templates Meta** nomeados (lembrete_24h, lembrete_1h, reativacao_cliente,
    lembrete_5dias, aniversario) + envio livre e via template (`enviarWhatsAppTemplate_`).
  - **Google Calendar** (PARTE 5/19): cria evento ao agendar, remove ao
    cancelar (mapa agendamentoID→eventID em Script Properties) e alimenta a
    disponibilidade em tempo real do `slots` (eventos/folgas/feriados bloqueiam horários).
- ⏳ Pendente — operacional/integração externa (não é lógica de código):
  - **Mercado Pago** (sinal/cobrança) em `enviarSinal` — comentado.
  - **Credenciais Meta**: gerar token permanente + submeter os 5 templates p/
    aprovação (1–3 dias úteis) e setar `TEMPLATES_ATIVOS=1`.
  - HMAC: o GAS não expõe headers em `doPost(e)`; a função está pronta e ativa
    quando `META_APP_SECRET` + assinatura (via proxy/param) existem.

> Nada inventado: o que resta é exatamente o que o master marca como
> integração externa / V2. O site + CRM + segurança + bot estão completos e fiéis.