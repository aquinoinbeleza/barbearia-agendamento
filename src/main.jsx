import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import BookingPortal from "./BookingPortal.jsx";

// Roteamento simples por caminho da URL:
//   /agendar  → Portal do Cliente (página pública de agendamento)
//   /         → Painel de Administração (gestão da barbearia)
const path = window.location.pathname.replace(/\/+$/, "");
const isPortal = path === "/agendar" || path === "/agendamento" || path.endsWith("/agendar");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isPortal ? <BookingPortal /> : <App />}
  </React.StrictMode>
);

// PWA: registra o service worker (instalável + offline + pronto p/ push).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
