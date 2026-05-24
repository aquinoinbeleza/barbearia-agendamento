# AQUINO Barbearia & Estética — SaaS de Agendamento

Painel administrativo + agendamento online, com bot de WhatsApp, CRM com score
de confiança, Morning Briefing (IPE), Google Calendar e cobrança de sinal via Pix.

Arquitetura: **frontend** (Vite + React, hospedado na Vercel) + **backend**
(Google Apps Script sobre Google Sheets) + integrações (Meta WhatsApp, Mercado Pago).

## Estrutura do repositório

```
aquino-saas/
├── index.html              # HTML raiz (carrega as fontes)
├── package.json            # deps: react 18 + vite 5
├── vite.config.js          # config do Vite
├── vercel.json             # headers de segurança (CSP, HSTS, X-Frame-Options…)
├── .env.example            # modelo das variáveis (copie p/ .env.local)
├── .gitignore
├── src/
│   ├── main.jsx            # ponto de entrada React
│   └── App.jsx             # aplicação (painel admin + telas mobile)
├── backend/
│   └── Codigo.gs           # backend Google Apps Script (NÃO vai p/ Vercel)
├── docs/
│   ├── SETUP-BACKEND.md    # como publicar o GAS + Script Properties
│   ├── Guia_Meta_WhatsApp.md  # passo a passo da conta Meta/WhatsApp
└── legal/
    ├── 01-Politica-de-Privacidade.md
    ├── 02-Termos-de-Uso.md
    ├── 03-Termo-de-Consentimento-LGPD.md
    ├── 04-Politica-de-Cancelamento-e-NoShow.md
    └── 05-Aviso-de-Cookies.md
```

## Como rodar o frontend (local)

```bash
npm install
cp .env.example .env.local   # preencha VITE_GAS_URL e VITE_SITE_TOKEN
npm run dev                  # http://localhost:5173
```

> Sem `VITE_GAS_URL`, o app roda em **modo demonstração** (ações simuladas via toast).

## Deploy do frontend (Vercel)

1. Suba este repositório no GitHub.
2. Na Vercel: New Project → importe o repo (framework detectado: Vite).
3. Settings → Environment Variables: `VITE_GAS_URL` e `VITE_SITE_TOKEN`.
4. Deploy. O `vercel.json` já aplica os headers de segurança.

## Backend (Google Apps Script)

O `backend/Codigo.gs` **não** vai para a Vercel — ele é colado no editor do
Apps Script de uma Planilha Google. Siga `docs/SETUP-BACKEND.md`:
`setupScriptProperties` → `setupSheets` → (opcional) `criarTriggers` → publicar
como App da Web. Depois conecte a Meta seguindo `docs/Guia_Meta_WhatsApp.md`.

## Documentos legais (LGPD)

Os textos em `legal/` são modelos orientativos — **revise com um advogado** e
preencha os campos entre `[colchetes]` (CNPJ, endereço, e-mail do encarregado…)
antes de publicar. Sugestão de uso:
- Política de Privacidade e Termos de Uso → páginas do site.
- Termo de Consentimento → aceite no primeiro agendamento / primeiro contato no bot.
- Política de Cancelamento → exibida antes de confirmar o agendamento.
- Aviso de Cookies → banner do site (snippet incluído no documento).

## Variáveis de ambiente

| Variável | Onde | Descrição |
|---|---|---|
| `VITE_GAS_URL` | Vercel / .env.local | URL `/exec` do Apps Script |
| `VITE_SITE_TOKEN` | Vercel / .env.local | token de origem (igual ao `SITE_TOKEN` do GAS) |

A senha do admin (`ADMIN_KEY`) e as chaves da Meta/Mercado Pago ficam **apenas**
nas Script Properties do GAS — nunca no frontend. Veja `docs/SETUP-BACKEND.md`.

---
Versão atual: **v9.3** (front v9.1 + backend v9.3 alinhado ao código real de produção).
