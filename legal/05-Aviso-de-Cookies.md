# Aviso de Cookies — AQUINO Barbearia & Estética

**Última atualização:** [DD/MM/AAAA]

## 1. O que são cookies

Cookies são pequenos arquivos armazenados no seu navegador que ajudam o site a
funcionar e a lembrar preferências.

## 2. Quais cookies usamos

Nosso site de agendamento usa **apenas cookies essenciais**, necessários para o
funcionamento básico (ex.: manter o estado do formulário de agendamento e
preferências mínimas). **Não** usamos cookies de publicidade nem de rastreamento
de terceiros para perfilamento.

| Tipo | Finalidade | Necessário? |
|---|---|---|
| Essencial | Funcionamento do agendamento e segurança | Sim — não pode ser desativado |
| Preferências | Lembrar escolhas básicas (ex.: tema) | Opcional |
| Analítico (se ativado) | Métricas agregadas de uso (ex.: Vercel Analytics) | Opcional — depende de aceite |

## 3. Suas opções

Você pode aceitar ou recusar os cookies não essenciais no banner exibido no
primeiro acesso, e gerenciar/limpar cookies nas configurações do seu navegador.
A recusa de cookies opcionais não impede o agendamento.

## 4. Mais informações

Veja a **Política de Privacidade** para detalhes sobre o tratamento de dados.
Contato: [email do encarregado].

---

## Snippet de banner (referência para o site)

> Banner minimal, sem dependências, com opção de aceitar/recusar. Cole no
> `index.html` e ajuste o estilo. **Não** use `localStorage` em artifacts do
> Claude.ai, mas em produção (Vercel) ele funciona normalmente.

```html
<div id="cookie-banner" style="position:fixed;bottom:16px;left:16px;right:16px;max-width:560px;margin:auto;background:#111;color:#eee;padding:16px 18px;border-radius:14px;font:14px/1.5 system-ui;box-shadow:0 8px 30px rgba(0,0,0,.35);z-index:9999;display:none">
  <div style="margin-bottom:10px">
    Usamos apenas cookies essenciais ao funcionamento do site e, se você permitir,
    métricas de uso agregadas. Veja a <a href="/privacidade" style="color:#4dd0e1">Política de Privacidade</a>.
  </div>
  <div style="display:flex;gap:8px;justify-content:flex-end">
    <button onclick="cookieConsent(false)" style="background:transparent;color:#aaa;border:1px solid #444;border-radius:10px;padding:8px 14px;cursor:pointer">Recusar opcionais</button>
    <button onclick="cookieConsent(true)" style="background:#4dd0e1;color:#003;border:0;border-radius:10px;padding:8px 14px;font-weight:700;cursor:pointer">Aceitar</button>
  </div>
</div>
<script>
  (function () {
    var KEY = 'cookie_consent_v1';
    var saved = localStorage.getItem(KEY);
    if (!saved) document.getElementById('cookie-banner').style.display = 'block';
    window.cookieConsent = function (analytics) {
      localStorage.setItem(KEY, JSON.stringify({ essential: true, analytics: !!analytics, ts: Date.now() }));
      document.getElementById('cookie-banner').style.display = 'none';
      // if (analytics) { /* inicialize Vercel Analytics / etc aqui */ }
    };
  })();
</script>
```

---
*Modelo orientativo. **Revisar com profissional jurídico** antes de publicar.*
