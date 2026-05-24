# 🆕 O QUE MUDOU — Portal do Cliente + Barbeiros

Esta versão adiciona o **Portal do Cliente** (agendamento público) e a **gestão de
barbeiros** no painel. Tudo testado e funcionando. Leia este arquivo para entender
o que é novo e como subir.

---

## 1. O QUE FOI ADICIONADO

### ✅ Portal do Cliente (página pública de agendamento)
Uma página onde seus clientes agendam sozinhos, sem instalar nada. Fluxo em 5 passos:
1. Digita o WhatsApp
2. Escolhe o serviço (seu menu real de serviços)
3. **Escolhe o barbeiro**
4. Escolhe dia e horário
5. Confirma os dados → pronto

A tela de **sinal (Pix)** só aparece se você ativar a cobrança no painel — começa desligada.

### ✅ Gestão de Barbeiros (no painel admin)
Nova aba em **Configurações → Barbeiros**, onde você pode:
- **Adicionar** barbeiro (só digitar o nome)
- **Editar** o nome
- **Excluir** (quando alguém sair da empresa)
- **Ativar/desativar** (o desativado não aparece no portal, mas não some do histórico)

Começa só com **Vinícius Aquino**. Todos são editáveis, inclusive o seu.

---

## 2. COMO FICAM OS ENDEREÇOS (URLs)

Depois de publicar no Vercel:
- `seusite.vercel.app/` → **painel de gestão** (você e sua equipe)
- `seusite.vercel.app/agendar` → **portal do cliente** (esse link você divulga)

O link `/agendar` é o que vai na bio do Instagram, no Google e no QR code da barbearia.

---

## 3. COMO SUBIR (atualização)

É a mesma coisa de antes — você está só atualizando os arquivos.

### No GitHub
Substitua os arquivos do repositório pelos desta pasta `aquino-saas-github/`
(o jeito mais simples: apague a pasta `src` antiga e suba a nova, ou suba tudo por cima).
Os arquivos novos/alterados são:
- `src/BookingPortal.jsx` ← **novo** (o portal do cliente)
- `src/main.jsx` ← alterado (faz o `/agendar` funcionar)
- `src/App.jsx` ← alterado (aba Barbeiros)
- `index.html` ← alterado (fontes do portal)

Depois do `git push`, o Vercel atualiza sozinho em ~30 segundos.

### No Google Apps Script
Cole novamente o conteúdo de `apps-script-google/Codigo.gs` (tem as funções
novas de barbeiros e a coluna Barbeiro nos agendamentos). Depois:
1. Rode `setupSheets` de novo (adiciona a coluna "Barbeiro" na planilha — não apaga nada)
2. Implantar → Gerenciar implantações → Editar → Nova versão → Implantar

> ⚠️ Se você **já tinha agendamentos** na planilha, a coluna "Barbeiro" será
> adicionada vazia para os antigos — sem problema, os novos já gravam o barbeiro.

---

## 4. TESTAR ANTES DE DIVULGAR

1. Abra `seusite.vercel.app/agendar` no celular
2. Faça um agendamento de teste do começo ao fim
3. No painel admin, veja se o agendamento apareceu com o barbeiro certo
4. Em Configurações → Barbeiros, adicione um barbeiro de teste e veja ele
   aparecer no portal; depois exclua

**Sem o backend configurado**, o portal funciona em **modo demonstração**
(mostra o menu real, deixa agendar, mas não grava). Serve pra ver o visual.

---

## 5. QUANDO QUISER ATIVAR O SINAL (PIX)

No futuro, quando quiser cobrar sinal pra garantir horário:
- No Google Apps Script → Propriedades do script → `COBRANCA_MODO`
  - `desativado` = sem sinal (padrão atual)
  - `reincidentes` = cobra só de quem já faltou
  - `universal` = cobra de todos
- O portal detecta sozinho e mostra a tela de Pix quando necessário. Não precisa mexer no site.

---

## 6. PRÓXIMOS PASSOS SUGERIDOS (quando você quiser)

- Configurar o WhatsApp (Meta) para disparar as confirmações automáticas — guia em `docs/Guia_Meta_WhatsApp.md`
- Preencher os dados reais em Configurações (serviços, horários, dados da barbearia)
- Revisar os documentos LGPD em `legal/` com um advogado
- Divulgar o link `/agendar` no Instagram e Google Meu Negócio

---

*Atualização de 24/05/2026 · Portal do Cliente + Barbeiros · build e backend testados ✓*
