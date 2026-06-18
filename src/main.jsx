import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import BookingPortal from "./BookingPortal.jsx";
import BarberView from "./BarberView.jsx";

// Roteamento simples por caminho da URL:
//   /agendar  → Portal do Cliente (página pública de agendamento)
//   /barbeiro → Painel público do barbeiro (metas/ranking, sem login) — link ?b=<token>
//   /         → Painel de Administração (gestão da barbearia)
const path = window.location.pathname.replace(/\/+$/, "");
const isPortal = path === "/agendar" || path === "/agendamento" || path.endsWith("/agendar");
const isBarber = path === "/barbeiro" || path.endsWith("/barbeiro");

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {isBarber ? <BarberView /> : isPortal ? <BookingPortal /> : <App />}
  </React.StrictMode>
);

// PWA: registra o service worker (instalável + offline + pronto p/ push).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
