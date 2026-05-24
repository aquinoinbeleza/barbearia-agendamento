# MEMÓRIA DO PROJETO — Digest Completo do Documento Master

> ## Changelog v9.3 (maio/2026) — rodada "fechar gaps + cruzar master"
> Implementado e validado (`node --check` no `Codigo.gs`; `vite build` ✓ no front):
> SEÇÃO 32 (e-mail + convite Calendar, `CLI.EMAIL:9`, cota MailApp), marcos de
> fidelidade 5/10/20 (cupons FIEL5/OURO10/VIP20), SEÇÃO 39 (retry/backoff curto +
> fila `MensagensPendentes` + `reenviarPendentes` 30min + alerta token 401 + `backupSemanal`),
> SEÇÃO 41 (aba `Metricas` append-only + `registrarMetrica_` + endpoint `metricas` + DRE
> + gráficos SVG `MetricasReais`), RBAC admin/recepcao/barbeiro (`requireRole_`).
> Decisão de engenharia: backoff longo do master (60→120→240s) **não** rodado inline
> (estoura o limite de 6 min do GAS) — usamos reenvio periódico via trigger.
> Schema a observar: `SinalStatus` ocupa col M; o `Barbeiro` do V2 deve ir p/ col N.
>
> ### 📲 Dinâmicas extraídas dos apps de referência (APKs) — não detalhadas no master
> Material de inspiração (BestBarbers, AppBarber PRO, Booksy Biz, Gendo, MinhaAgenda, Tua Agenda).
> Padrões concretos a considerar (backlog priorizado, **não implementados** ainda):
> 1. **Mensagens automáticas configuráveis pelo dono** (modelo do Tua Agenda): cada gatilho
>    é ligável/editável — (a) dia anterior, (b) X h/min antes, (c) X min depois do agendamento
>    via link (boas-vindas), (d) X h depois do atendimento (feedback), (e) aniversário,
>    (f) reativação "após X dias sem novo agendamento". Hoje temos esses disparos, mas
>    **hardcoded**; o ganho é torná-los config no painel (toggle + texto + tempo).
> 2. **Toggle "Enviar e-mail aos clientes"** com aviso de impacto — casa com nosso `EMAIL_ATIVO`.
> 3. **Código de indicação** (referral) — cliente indica e ganha bônus/pontos.
> 4. **Cupom com data-limite de aplicação** (a data-limite é o dia de aplicar o cupom,
>    não a data do atendimento) — regra de negócio sutil que evita disputa.
> 5. **Comissão por faixa** e **assinatura/pacotes promocionais com validade** (V2/V3).
> 6. **Central de notificações** com filtros (todas / não lidas / importantes) e
>    config granular (no app / por e-mail) — referência de UX para nossa aba de avisos.

> Referência fiel do `AQUINO_100PCT_COMPLETO_v3_AUDITADO.docx`
> (16.821 linhas · 153.221 palavras · 29 seções + ~30 partes).
> Lido integralmente. Legenda de status no nosso build (App.jsx + Codigo.gs):
> ✅ feito · 🟡 parcial · 🔴 pendente · ⚫ fora de escopo (V2/V3/Enterprise) · 📄 referência (não-código).

## Natureza do documento
É a concatenação auditada de ~18 documentos-fonte sobre o mesmo produto: bot de
WhatsApp + CRM inteligente + agenda + automação de marketing + ERP simplificado
para a **AQUINO Barbearia & Estética** (Ipatinga/MG). Endereço real citado:
**R. Carlos Gomes, 256, Ideal, Ipatinga**. Há muita repetição entre versões
(v1 → v2.1 → v3 → enterprise v4); o que vale como verdade é o código real de
produção (Codigo_v6.gs) + as seções de especificação mais recentes.

## Índice das 29 SEÇÕES + PARTES (com status)

**Núcleo técnico (SEÇÃO 1, 7, 10, 12, 15, 16; PARTES 2,3,6,7)**
- Schemas canônicos Clientes/Agendamentos/Financeiro · endpoints · árvore do bot · contrato Meta · 4 mudanças do App.jsx · LGPD · estrutura de pastas. → ✅ tudo implementado/alinhado.

**PARTE 20 — Análise estratégica** 📄 O projeto é um híbrido (agenda+CRM+automação+bot+ERP). 5 acertos: foco no WhatsApp, recorrência automática, cobrança antecipada, API oficial Meta (nunca QR code), intervalo personalizado por cliente.

**PARTE 22 — 10 bugs corrigidos (v2.0+v2.1)** ✅ Conferido: nenhum presente no nosso código.
1. funções duplicadas → não há. 2. CLI.TEL índice 1 → ok. 3. Agendamentos 12 col ordenadas → ok. 4. lembrete só em UltimoLembrete (col I), nunca UltimoAgendamento (col E) → ok. 5. getEstado/setEstado via Cache TTL 6h → ok. 6. ClienteID vinculado ao agendamento → ok. 7. verificarCliente usa CLI.TEL → ok. 8. HMAC anti-spoofing webhook → ok. 9. fallback template fora da janela 24h → ok. 10. cancelamento remove evento do Calendar → ok.

**PARTE 23 — Scripts do bot** ✅ textos implementados (menu, confirmação, lembrete 24h/1h, NPS, recuperação 45+ dias, promoção). 📄 Refinar com os textos exatos do master quando quiser (incl. endereço real).

**SEÇÃO 32 — E-mail + Google Calendar** Calendar ✅ (cria/remove/disponibilidade). E-mail (coluna EMAIL + GmailApp + convite ao convidado) 🔴 V2.

**SEÇÃO 33 — Fila de espera** ✅ backend completo (planilha FilaEspera, prioridade VIP+FIFO+score<3 ao fim, TTL 30min, conversão automática, anti-abuso, trigger 5min).

**SEÇÃO 34 — Cobrança antecipada / Mercado Pago** ✅ `deveExigirSinal` com 7 modelos (COBRANCA_MODO), Pix via `/v1/payments`, webhook de confirmação, SinalStatus.

**SEÇÃO 35 — Score de confiança** ✅ modelo real de produção (base 10, recência+cancelamentos+visitas), níveis VIP/Ouro/Prata/Bronze + status por score, `shouldActivateSinal/FlagRisk/SuggestRecurrence`.

**SEÇÃO 36/37 — Riscos por plataforma e escalabilidade** 📄 referência (gargalos do GAS, Sheets 5k linhas, cota Calendar/Mail).

**SEÇÃO 38 — Idempotência forte** ✅ feito: `requestId` no agendamento (dedup via Cache 6h, devolve resultado original) + dedup de webhook por `msg.id` (Cache 6h). Front gera `requestId` no `api.agendar`. Elimina reserva dupla e mensagem repetida.

**SEÇÃO 39 — Cenários de falha** 🟡 parcial: salvamos no Sheets antes do Calendar ✅; faltam retry com backoff (`enviarWhatsAppComRetry`), planilha MensagensPendentes, backup semanal p/ Drive, alerta ao dono em token 401. → V2.

**SEÇÃO 40 — Meta warming/quality/opt-out** Opt-out SAIR/PARAR/STOP/DESCADASTRAR ✅. Warming/quality rating 📄 operacional (nosso volume está abaixo dos limites; crítico só na escala SaaS).

**SEÇÃO 41 — Observabilidade de negócio** 🔴 V2: planilha Métricas (funil de comparecimento/recorrência) + Sentry/UptimeRobot. (Log básico ✅.)

**SEÇÃO 42 — Event-driven roadmap** ⚫ V2/V3 (EventBus simples no GAS → BullMQ).

**SEÇÃO 43/44 + PARTE 4 — Maturidade MVP→V2→V3→Enterprise** 📄 mapa de fases (abaixo).

**SEÇÃO 18 — Security Master (47/48 controles, P0–P3)** P0 ✅ (HMAC, SITE_TOKEN, ADMIN_KEY, sanitização anti-fórmula, rate limit, erros genéricos, rota admin ofuscada). P1 🟡 (idempotência pendente; JWT/sessão server-side é alternativa ao nosso modelo de ADMIN_KEY). P2/P3 ⚫ (WAF/Cloudflare, Vault/Doppler, SIEM/Datadog, ISO 27001/SOC 2, OWASP ASVS).

**SEÇÃO 19 — Design System & UX Philosophy** 📄/⚫ filosofia visual ("produto de nível global"). Nosso front v9.1 já adota linguagem própria mais avançada — não reaproveitar o layout do protótipo.

**SEÇÃO 4 (ADRs, STRIDE/LINDDUN, SLO/SLI/SLA), SEÇÃO 5/9 (blueprint de mercado, RBAC), SEÇÃO 11 (enterprise v4), SEÇÃO 26 (bot modular), SEÇÃO 27 (arquitetura de componentes)** ⚫ majoritariamente V2/V3/enterprise. RBAC (admin/barbeiro/recepção) 🔴 V2.

**SEÇÃO 24/28 — Documentos legais das plataformas (referência LGPD)** ✅ produzimos 5 documentos próprios (privacidade, termos, consentimento, cancelamento, cookies).

**SEÇÃO 25 — Plano de entrega 4 frentes + roadmap 3 fases** 📄 (front, backend, integrações, legal).

**SEÇÕES 17/29 — Conteúdo residual/variantes** 📄 duplicatas de versões antigas.

## Matriz de fases (resumo executivo)
- **MVP (fazer):** bot+menu+agendamento via site, CRM 10 campos, lembretes 24h/1h, reativação por intervalo, HMAC+SITE_TOKEN+ADMIN_KEY, 5 templates Meta, cancelamento remove Calendar, vercel.json, registrarFaltas. → **tudo ✅ no nosso build.**
- **V2 (meses 2-4):** cobrança 30% MP ✅, fila de espera ✅, NPS ✅, score dinâmico ✅, **idempotência 🔴**, e-mail+convite Calendar 🔴, opt-out ✅, dashboard Recharts 🟡, multi-profissional 🔴, backup semanal 🔴, EventBus ⚫, observabilidade de negócio 🔴.
- **V3 (meses 5-12):** PostgreSQL, Node.js, Redis, IA conversacional, assinatura/clube, multi-unidade/white-label, PWA, NF-e, BullMQ, ML preditivo. → ⚫ todos.
- **Enterprise (nunca cedo demais):** CQRS, Event Sourcing, Kubernetes, Chaos Eng, ISO/SOC, microsserviços, GraphQL, blockchain. → ⚫ evitar (overengineering).

## Gaps reais ainda abertos no nosso build (ordem recomendada)
1. ✅ **Suggestion Governance** (antifadiga: cooldown 4h, máx 3 ativas, silencia após 2 ignoradas, zera quando o cliente responde) — SEÇÃO 20. Aplicado em reativação/aniversário/5dias.
2. ✅ **Idempotência forte** (requestId + dedup webhook por msg.id) — SEÇÃO 38.
3. 🔴 **E-mail + convite Google Calendar ao convidado** — SEÇÃO 32 (scope extra no GAS).
4. 🟡 **Marcos de fidelidade automáticos** (5ª/10ª/20ª) — só visual hoje.
5. 🟡 **Robustez** (retry/backoff, MensagensPendentes, backup Drive, alerta token 401) — SEÇÃO 39.
6. 🔴 **Observabilidade de negócio** (planilha Métricas + Sentry/UptimeRobot) — SEÇÃO 41.
7. 🔴 **RBAC** (admin/barbeiro/recepção) — V2.

## Decisões de arquitetura confirmadas pelo master
- API oficial Meta (nunca QR code). Coexistência permite bot + humano no mesmo número (já suportado: `MODO_COEXISTENCIA`).
- SITE_TOKEN em GET expõe token nos logs (limitação do GAS sem headers em doGet) — aceitável no MVP porque GETs são leituras sem dado sensível; operações sensíveis usam POST. ✅ nosso padrão.
- Salvar no Sheets ANTES do Calendar (consistência em falha parcial). ✅.
- Lembrete nunca toca UltimoAgendamento (col E) — só UltimoLembrete (col I). ✅.

---
*Este digest é a referência viva do master para o projeto. Não substitui o
documento original, mas mapeia cada seção ao nosso estado de implementação.*
