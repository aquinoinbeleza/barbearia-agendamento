# 🔧 Configuração Meta WhatsApp — Passo a Passo

Este guia ativa o bot WhatsApp que já existe no GAS. Sem isso, o sistema funciona, mas não envia/recebe mensagens automáticas.

**Tempo estimado:** 30–45 minutos · **Custo:** R$ 0 até 1.000 conversas/mês

---

## ✅ O que você vai precisar antes de começar

- [ ] Conta Meta for Developers (mesma do Facebook)
- [ ] Um número de WhatsApp **separado** do seu pessoal (chip novo é o ideal)
- [ ] Cartão de crédito cadastrado na Meta (mesmo sendo gratuito até 1.000 conv/mês — é exigência da plataforma)
- [ ] Acesso ao Google Apps Script da AQUINO
- [ ] Foto de perfil e descrição da barbearia prontas (para exibir no WhatsApp Business)

---

## 1. Acessar Meta for Developers

1. Vá em **https://developers.facebook.com/apps/1295130922042903/dashboard/**
2. Esse é o app que você já tem criado (`Aquino Barbearia`)
3. Se pedir, faça login com a conta do Facebook ligada à barbearia

---

## 2. Adicionar produto WhatsApp ao app

1. No menu lateral esquerdo, clique em **"Adicionar produto"**
2. Encontre **WhatsApp** e clique em **"Configurar"**
3. Aceite os termos da Meta para WhatsApp Business API
4. Você verá uma tela com **"Primeiros passos"** — siga em frente

---

## 3. Adicionar e verificar seu número de WhatsApp

⚠️ **Importante:** o número que você adicionar **não pode estar ativo no WhatsApp ou WhatsApp Business em outro celular**. Se estiver, faça primeiro logout completo nesse aparelho.

1. Em **WhatsApp → Configurações da API**, vá em **"Adicionar número de telefone"**
2. Selecione **Brasil 🇧🇷** e digite o número do chip novo (com DDD, sem +55)
3. A Meta envia um código SMS ou ligação ao número — digite o código
4. Pronto, seu número está vinculado

Anote esses 2 valores que vão aparecer na tela (vai precisar no próximo passo):
- **Phone Number ID** (sequência longa de números)
- **WhatsApp Business Account ID**

---

## 4. Gerar Token de Acesso (Token Permanente)

O token inicial é temporário (24h). Para o bot funcionar 24/7, precisa de token permanente:

1. Vá em **Configurações do App → Básico** (menu lateral esquerdo)
2. Anote o **App Secret** — clique em "Mostrar" e copie
3. Volte ao menu **WhatsApp → Configurações da API**
4. Clique em **"Gerar token"** ou **"Token de acesso permanente"**
5. Quando a Meta perguntar "Para quem é este token?", selecione **seu próprio usuário**
6. Marque as permissões:
   - `whatsapp_business_messaging` ✅
   - `whatsapp_business_management` ✅
7. Clique em **"Gerar Token"** — copie o valor (começa com `EAAB...` ou `EAAxxxx...`)

---

## 5. Configurar Script Properties no GAS

1. Abra o **Google Apps Script** (script.google.com)
2. Vá em **⚙️ Configurações do projeto** (engrenagem na barra lateral)
3. Role até **"Propriedades do script"**
4. Adicione/atualize estas 3 propriedades:

| Propriedade | Valor |
|---|---|
| `WHATSAPP_TOKEN` | (cole o token permanente gerado no passo 4) |
| `PHONE_NUMBER_ID` | (cole o Phone Number ID do passo 3) |
| `META_APP_SECRET` | (cole o App Secret do passo 4) |

5. Clique em **"Salvar propriedades do script"**

---

## 6. Configurar o Webhook

O webhook é a URL que a Meta vai chamar quando alguém te mandar mensagem.

1. No painel da Meta, vá em **WhatsApp → Configuração**
2. Em **Webhook**, clique em **"Editar"** ou **"Configurar webhook"**
3. Preencha:
   - **URL de retorno de chamada:** cole a URL do seu deploy GAS:
     ```
     https://script.google.com/macros/s/AKfycbyYk03d8DY8NQTDRNEfb3CSUO0gJOi5Ya-TcYyj9VCj_VEwnCumwoLI15WgXJL1Bvz9_Q/exec
     ```
   - **Token de verificação:** `barber2025` (mesmo valor do `VERIFY_TOKEN` no Script Properties)
4. Clique em **"Verificar e salvar"**
5. A Meta vai fazer uma chamada GET para sua URL — o GAS responde com o `hub.challenge` automaticamente

Se aparecer **"Falha na verificação"**, verifique:
- A URL do GAS está correta?
- O `VERIFY_TOKEN` no Script Properties é exatamente `barber2025`?
- Você fez **novo deploy** depois de adicionar os Script Properties? (Implantar → Gerenciar → ✏️ → Nova versão)

---

## 7. Ativar campo "messages" no Webhook

1. Depois que o webhook verificou OK, role para baixo até **"Campos do webhook"**
2. Clique em **"Gerenciar"** ao lado de **WhatsApp Business Account**
3. Procure **`messages`** e clique em **"Inscrever-se"**
4. Pronto — agora toda mensagem recebida no número da barbearia vai pro GAS

---

## 8. Personalizar o perfil do WhatsApp Business

1. Em **WhatsApp → Gerenciador**, abra o perfil do número
2. Preencha:
   - **Nome:** AQUINO Barbearia & Estética
   - **Descrição:** Barbearia premium em Ipatinga · Atendimento Ter–Sáb
   - **Foto:** logo da barbearia
   - **Categoria:** Beauty / Salon
   - **Endereço:** R. Carlos Gomes, 256 - Ideal, Ipatinga - MG
   - **Horário:** Ter–Sáb 8h–19h
   - **Site:** https://barbearia-agendamento-peach.vercel.app/

---

## 9. Testar

1. **Salve o número** da barbearia no seu celular pessoal
2. Envie **"oi"** para esse número via WhatsApp
3. Deve chegar uma resposta automática com o menu:
   ```
   Olá! 😊 Sou o assistente do AQUINO Barbearia & Estética.

   Digite:
   • AGENDAR — para marcar horário
   • CANCELAR — para cancelar
   • REAGENDAR — para remarcar
   • ATENDENTE — falar com humano
   ```
4. Digite **"AGENDAR"** — deve receber o link do site
5. Digite **"ATENDENTE"** — deve te redirecionar para o número SAC pessoal

Se algo não funcionar, abra o **Logger do GAS** (Execuções → Última execução) para ver o erro.

---

## 🚨 Limitações importantes que você precisa saber

### Regra das 24 horas
O WhatsApp só permite mandar **mensagem livre** dentro de 24h depois que o cliente te escreveu.
- ✅ **Confirmação imediata após agendar** — funciona
- ✅ **Lembrete 24h antes** — funciona (cliente agendou faz pouco)
- ✅ **Lembrete 1h antes** — funciona
- ❌ **Reativação automática (cliente inativo 15+ dias)** — não funciona sem **template aprovado**
- ❌ **Mensagem de aniversário** — não funciona sem **template aprovado**

### Templates Meta
Para reativar cliente após 24h, precisa criar **templates aprovados pela Meta**:

1. Vá em **WhatsApp → Modelos de mensagem**
2. Clique em **"Criar modelo"**
3. Use o exemplo abaixo:

**Template: `reativacao_cliente`**
- Categoria: Marketing
- Idioma: Português (Brasil)
- Corpo:
  ```
  Olá, {{1}}! Já faz {{2}} dias desde seu último atendimento na AQUINO Barbearia.
  Que tal renovar o visual? 💈
  Agende em: {{3}}
  ```
- Variáveis: 1=nome, 2=dias, 3=link

A Meta leva de 1 a 24h para aprovar. Depois disso, o GAS pode chamar esse template via API mesmo após as 24h.

### Custo
- **Gratuito:** até 1.000 conversas por mês (uma conversa = 24h de interação com um cliente)
- **Acima de 1.000:** R$ 0,03 a R$ 0,15 por conversa, dependendo do tipo
- Para uma barbearia média, isso significa **sempre gratuito**

---

## 🎯 Checklist final

Antes de considerar pronto, confirme:

- [ ] Token permanente está no Script Properties (`WHATSAPP_TOKEN`)
- [ ] Phone Number ID está no Script Properties (`PHONE_NUMBER_ID`)
- [ ] App Secret está no Script Properties (`META_APP_SECRET`)
- [ ] Webhook foi verificado com sucesso (mostra ✅ verde no painel Meta)
- [ ] Campo `messages` está inscrito
- [ ] Você fez **novo deploy** do GAS depois das mudanças
- [ ] Teste com "oi" no número da barbearia funcionou
- [ ] Perfil do WhatsApp Business está preenchido com logo + descrição
- [ ] Criou pelo menos 1 template para reativações (`reativacao_cliente`)

Quando todos estiverem ✅, o bot está 100% operacional.

---

**Dúvidas?** Volta aqui e me avisa em qual passo travou — eu te ajudo a resolver.

---

## Coexistência — bot + atendente humano no MESMO número (Meta, desde mai/2025)

Permite usar o **mesmo número** (ex.: +55 31 98698-8939) no app do WhatsApp
Business (no celular, para o atendente humano) **e** na Cloud API (para o bot)
ao mesmo tempo. As mensagens são espelhadas entre app e API.

### Como ativar
1. Use um número que **já está ativo** no app WhatsApp Business com conversas
   reais (a Meta rejeita número novo/sem histórico).
2. No onboarding da Cloud API (Embedded Signup), escolha a opção
   **"Coexistence" / usar número existente do app** em vez de criar número novo.
3. Assine os webhooks extras `smb_message_echoes` e `smb_app_state_sync` além
   do `messages` (no painel Meta → WhatsApp → Configuration → Webhooks).
4. No GAS, defina a Script Property `MODO_COEXISTENCIA = 1`.

### Como o nosso backend se comporta no modo Coexistência
- **"ATENDENTE" / opção 5:** o bot **pausa** a automação naquela conversa por 3h
  e te avisa (mesmo número) para responder pelo app. Nada de link para outro número.
- **Quando você responde pelo app:** a Meta envia um `smb_message_echoes`; o
  backend detecta e **pausa o bot** automaticamente para aquele cliente (não te
  atropela). O cliente digitar **menu** / **voltar** devolve o controle ao bot.
- Em `MODO_COEXISTENCIA = 0` (padrão), volta ao modelo de dois números
  (bot na API + `SAC_NUMERO` separado, com link wa.me).

### Limitações da Coexistência (impostas pela Meta)
- Recursos do app desativados no número: **transmissões/broadcasts, grupos e
  mensagens temporárias/ver-uma-vez**.
- **Não deixe o app sem abrir por mais de 14 dias** — a conexão com a API cai.
- Só funciona com a **Cloud API oficial** (não com a API on-premise antiga).
- Mantém ~6 meses de histórico ao conectar.
