import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// AQUINO Barbearia & Estética — Painel de Gestão
// Sistema de agendamento, CRM, fidelidade e financeiro.
//
// Configuração: credenciais via variáveis de ambiente (.env.local).
//   VITE_GAS_URL    → endpoint do backend (Google Apps Script)
//   VITE_SITE_TOKEN → token de origem entre o site e o backend
// Sem backend configurado, o painel roda em modo de demonstração.
//
// © AQUINO. Todos os direitos reservados.
// ═══════════════════════════════════════════════════════════════════════════

// ─── SYSTEM RHYTHM ────────────────────────────────────────────────────────
const M = {
  micro:  "120ms cubic-bezier(0.22, 1, 0.36, 1)",
  base:   "220ms cubic-bezier(0.22, 1, 0.36, 1)",
  enter:  "380ms cubic-bezier(0.22, 1, 0.36, 1)",
  spring: "360ms cubic-bezier(0.34, 1.56, 0.64, 1)",
  curve:  "cubic-bezier(0.22, 1, 0.36, 1)",
};
const S = { xs:4, sm:8, md:12, lg:16, xl:20, xxl:24, xxxl:32 };
const R = { sm:5, md:8, lg:10, xl:12, xxl:16, pill:999 };

// ─── DESIGN SYSTEM ────────────────────────────────────────────────────────
const SHARED = {
  fontAdmin:  "'DM Sans', system-ui, sans-serif",
  fontClient: "'Manrope', system-ui, sans-serif",
  fontMono:   "'JetBrains Mono', 'Fira Code', monospace",
};

// ─── ENV · CREDENCIAIS ────────────────────────────────────────────────────
// Nenhum segredo fica fixo no código. Tudo vem de import.meta.env.
// Crie um arquivo .env.local (ver .env.example) e adicione ao .gitignore.
const readEnv = (k, fallback = "") => {
  try {
    if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[k] != null)
      return import.meta.env[k];
  } catch (e) {}
  try {
    if (typeof process !== "undefined" && process.env && process.env[k] != null)
      return process.env[k];
  } catch (e) {}
  return fallback;
};
// VITE_GAS_URL    → endpoint /exec do Google Apps Script
// VITE_SITE_TOKEN → token de origem site↔backend
// A senha de admin (ADMIN_KEY) vive SÓ no backend (Script Properties) e é
// validada no servidor — nunca trafega no front.
const ENV = {
  GAS_URL:    readEnv("VITE_GAS_URL", ""),
  SITE_TOKEN: readEnv("VITE_SITE_TOKEN", "aq2025site"),
  hasBackend: !!readEnv("VITE_GAS_URL", ""),
};

// ─── API CLIENT · GAS (contrato real do backend v6) ───────────────────────
// Ações documentadas no doPost/doGet do Codigo_v6.gs:
//   GET  ?action=slots|verificarCliente|meusAgendamentos|dashboard|morningBriefing
//   POST {action: agendamento|cancelar|salvarConfig|dashboard|morningBriefing|validarSenha}
// Sem VITE_GAS_URL → modo demonstração: resolve com dados mock (sem rede).
const api = {
  get base() { return ENV.GAS_URL; },
  get token() { return ENV.SITE_TOKEN; },
  async _get(params) {
    if (!ENV.hasBackend) return { _demo: true };
    const qs = new URLSearchParams({ ...params, token: api.token }).toString();
    const r = await fetch(`${api.base}?${qs}`);
    return r.json();
  },
  async _post(body) {
    if (!ENV.hasBackend) return { _demo: true };
    const r = await fetch(api.base, {
      method: "POST",
      body: JSON.stringify({ token: api.token, ...body }),
    });
    return r.json();
  },
  // login admin: o GAS valida a key e devolve o dashboard se correta
  login:        (key) => api._post({ action: "dashboard", key }),
  dashboard:    (key) => api._post({ action: "dashboard", key }),
  briefing:     (key) => api._post({ action: "morningBriefing", key }),
  metricas:     (key, dias = 30) => api._post({ action: "metricas", key, dias }),
  verificarCliente: (tel) => api._get({ action: "verificarCliente", tel }),
  meusAgendamentos: (tel) => api._get({ action: "meusAgendamentos", tel }),
  slots:    (data, duracao) => api._get({ action: "slots", data, duracao }),
  agendar:  (payload) => api._post({ action: "agendamento", requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2,9)}`, ...payload }),
  cancelar: (agendamentoId, tel) => api._post({ action: "cancelar", agendamentoId, tel }),
  // salvarConfig: payload EXATO aceito pelo GAS (Script Properties)
  salvarConfig: (key, config) => api._post({ action: "salvarConfig", key, config }),
  // P1-1: lê a config rica do backend (fonte da verdade do portal) p/ o painel abrir sincronizado
  getConfig: () => api._get({ action: "getConfig" }),
  // extensões de contrato (degradam p/ modo demo sem backend):
  reagendar:     (agendamentoId, novoHorario, tel) => api._post({ action: "reagendar", agendamentoId, novoHorario, tel }),
  enviarLembrete:(tel, clienteId) => api._post({ action: "enviarLembrete", tel, clienteId }),
  enviarSinal:   (tel, clienteId, valor) => api._post({ action: "enviarSinal", tel, clienteId, valor }),
  // ping: usado pelo botão "Testar conexão GAS" no Sistema
  ping: async () => {
    if (!ENV.hasBackend) return { ok: false, demo: true, ms: 0 };
    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    try {
      const r = await api._get({ action: "ping" });
      const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
      return { ok: !r?._demo, ms, raw: r };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  },
};

// ─── PERSISTÊNCIA (P0) · STORE localStorage ───────────────────────────────
const LS_PREFIX = "aquino_v9_";
const lsGet = (key, fallback) => {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch (e) { return fallback; }
};
const lsSet = (key, val) => {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch (e) {}
};
const lsClearAll = () => {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {}
};

// Store reativo minimalista (subscribe/snapshot) — sem libs externas.
const makeStore = (key, initial) => {
  let state = lsGet(key, initial);
  const subs = new Set();
  return {
    get: () => state,
    set: (next) => {
      state = typeof next === "function" ? next(state) : next;
      lsSet(key, state);
      subs.forEach(fn => fn());
    },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
};

// ─── CONFIG · DADOS DE OPERAÇÃO DA BARBEARIA (P0 — ConfigPage) ─────────────
const DEFAULT_CONFIG = {
  barbearia: {
    nome: "Aquino Barbearia & Estética",
    cidade: "Ipatinga · MG",
    endereco: "Av. 28 de Abril, 1200 — Centro",
    telefone: "(31) 99999-0000",
    logoUrl: "",
  },
  servicos: [
    { id: 1, nome: "Corte",          preco: 45, duracao: 45,  ativo: true },
    { id: 2, nome: "Corte + Barba",  preco: 65, duracao: 90,  ativo: true },
    { id: 3, nome: "Barba",          preco: 30, duracao: 30,  ativo: true },
    { id: 4, nome: "Combo VIP",      preco: 90, duracao: 120, ativo: true },
    { id: 5, nome: "Sobrancelha",    preco: 20, duracao: 15,  ativo: true },
  ],
  horarios: [
    { dia: "Segunda", abre: "09:00", fecha: "19:00", fechado: false },
    { dia: "Terça",   abre: "09:00", fecha: "19:00", fechado: false },
    { dia: "Quarta",  abre: "09:00", fecha: "19:00", fechado: false },
    { dia: "Quinta",  abre: "09:00", fecha: "20:00", fechado: false },
    { dia: "Sexta",   abre: "09:00", fecha: "20:00", fechado: false },
    { dia: "Sábado",  abre: "08:00", fecha: "18:00", fechado: false },
    { dia: "Domingo", abre: "—",     fecha: "—",     fechado: true  },
  ],
  operacao: {
    slotMin: 15,             // intervalo mínimo entre horários (min)
    antecedencia: 60,        // antecedência mínima p/ agendar (min)
    sinalPct: 30,            // % de sinal antecipado
    cancelamentoH: 12,       // janela de cancelamento s/ multa (h)
    intervaloRetornoDias: 15,// recorrência: intervalo ideal de retorno (dias) → GAS INTERVALO_RETORNO
  },
  // Barbeiros/profissionais — add/editar/excluir no painel. Cliente escolhe no agendamento.
  barbeiros: [
    { id: 1, nome: "Vinícius Aquino", ativo: true },
  ],
  // ── Fidelidade ── tudo editável pelo painel; "ativo:false" oculta do cliente.
  fidelidade: {
    ativo: true,                 // liga/desliga o programa inteiro (oculta do cliente)
    rebaixamentoAtivo: true,     // liga/desliga o rebaixamento por falta
    niveis: [
      { id:4, label:"Diamond VIP", icon:"💎", cor:"#7fd8ff", min:20, beneficios:["Agenda prioritária","Bônus 10%","Desconto no combo","Acesso antecipado"] },
      { id:3, label:"Ouro",        icon:"✦",  cor:"#C18A3D", min:12, beneficios:["Fila VIP","Bônus 5%","Desconto na barba"] },
      { id:2, label:"Prata",       icon:"◆",  cor:"#9aa0a6", min:6,  beneficios:["Desconto 5%","Bônus mensal"] },
      { id:1, label:"Bronze",      icon:"○",  cor:"#B0814F", min:0,  beneficios:["Programa básico"] },
    ],
    // rebaixamento: a cada `faltas` faltas dentro de `dias` dias, cai 1 nível
    rebaixamento: { faltas: 1, dias: 15 },
    recompensas: [
      { id:1, marco:"5ª visita",  descricao:"Sobrancelha grátis", icon:"🎁", ativo:true },
      { id:2, marco:"10ª visita", descricao:"20% off no Combo",    icon:"✦",  ativo:true },
      { id:3, marco:"20ª visita", descricao:"Corte cortesia",      icon:"👑", ativo:true },
    ],
  },
};
const configStore = makeStore("config", DEFAULT_CONFIG);

// Helpers de fidelidade — usados pelo painel E pela área do cliente (fonte única)
const getFidelidade = () => {
  const f = (configStore.get() || {}).fidelidade || DEFAULT_CONFIG.fidelidade;
  // retrocompat: se faltar algum campo (config salva antiga), completa com o default
  return { ...DEFAULT_CONFIG.fidelidade, ...f,
    niveis: (f.niveis && f.niveis.length) ? f.niveis : DEFAULT_CONFIG.fidelidade.niveis,
    recompensas: (f.recompensas && f.recompensas.length) ? f.recompensas : DEFAULT_CONFIG.fidelidade.recompensas,
    rebaixamento: { ...DEFAULT_CONFIG.fidelidade.rebaixamento, ...(f.rebaixamento||{}) },
  };
};
// nível do cliente CONFORME os mínimos editados no painel (não mais "chumbado")
const nivelPorVisitas = (visitas) => {
  const niveis = [...getFidelidade().niveis].sort((a,b)=>b.min-a.min); // maior min primeiro
  return niveis.find(n => (visitas||0) >= n.min) || niveis[niveis.length-1];
};
// rebaixamento real: conta quantos níveis cair pelas faltas recentes
const aplicarRebaixamento = (nivelLabel, faltasRecentes) => {
  const f = getFidelidade();
  if (!f.rebaixamentoAtivo) return nivelLabel;
  const regra = f.rebaixamento || { faltas:1, dias:15 };
  if (!regra.faltas || (faltasRecentes||0) < regra.faltas) return nivelLabel;
  const degraus = Math.floor((faltasRecentes||0) / regra.faltas);
  const ordenados = [...f.niveis].sort((a,b)=>a.min-b.min); // do menor pro maior
  const idx = ordenados.findIndex(n => n.label === nivelLabel);
  if (idx === -1) return nivelLabel;
  const novoIdx = Math.max(0, idx - degraus);
  return ordenados[novoIdx].label;
};

// hook simples para assinar o store em componentes
const useStore = (store) => {
  const [, force] = useState(0);
  useEffect(() => store.subscribe(() => force(n => n + 1)), [store]);
  return store.get();
};

// ─── EXPORT · CSV + PDF REAIS (P1) ────────────────────────────────────────
const toCSV = (headers, rows) => {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map(esc).join(";");
  const body = rows.map(r => r.map(esc).join(";")).join("\n");
  return "\uFEFF" + head + "\n" + body; // BOM p/ Excel PT-BR
};
const downloadBlob = (filename, content, mime = "text/csv;charset=utf-8") => {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return true;
  } catch (e) { return false; }
};
const exportCSV = (filename, headers, rows) => downloadBlob(filename, toCSV(headers, rows));
const exportPDF = (titulo, headers, rows) => {
  // PDF via janela de impressão nativa (sem dependências).
  try {
    const w = window.open("", "_blank", "width=820,height=900");
    if (!w) return false;
    const th = headers.map(h => `<th>${h}</th>`).join("");
    const tr = rows.map(r => `<tr>${r.map(c => `<td>${c ?? ""}</td>`).join("")}</tr>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${titulo}</title>
      <style>
        *{font-family:'DM Sans',system-ui,sans-serif;color:#1a1a1a}
        body{padding:32px}
        h1{font-size:18px;margin:0 0 4px}
        .sub{color:#888;font-size:11px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{text-align:left;text-transform:uppercase;font-size:9px;letter-spacing:.06em;color:#888;border-bottom:2px solid #222;padding:8px 6px}
        td{padding:8px 6px;border-bottom:1px solid #eee}
        tr:nth-child(even) td{background:#fafafa}
      </style></head><body>
      <h1>${titulo}</h1>
      <div class="sub">AQUINO Barbearia & Estética · gerado em ${new Date().toLocaleString("pt-BR")}</div>
      <table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>
      <script>window.onload=()=>{window.print();}<\/script>
      </body></html>`);
    w.document.close();
    return true;
  } catch (e) { return false; }
};

// ─── PALETA · TEMA ESCURO / CLARO (v9.4) ──────────────────────────────────
// As cores são lidas via o Proxy `A`, que devolve a paleta do tema ATIVO em
// tempo de render. Ao trocar o tema, o app re-renderiza (AppInner/ThemeStyle
// assinam o themeStore) e as ~780 referências A.xxx mudam de uma vez — sem
// precisar editar componente nenhum. Os tons de destaque (azul/ciano/verde/…)
// são IDÊNTICOS nos dois temas de propósito: só fundos, bordas e textos mudam.
const PAL_DARK = {
  bg0:"#0A0D12", bg1:"#0E1118", bg2:"#131820", bg3:"#181F2A", bg4:"#1E2738",
  border:"#1C2335", borderHi:"#263047",
  textPri:"#E8EDF5", textSec:"#7A8BA5", textMuted:"#3D4F68",
  blue:"#3B82F6", blueHi:"#60A5FA",
  cyan:"#38BDF8",
  green:"#4ADE80",
  amber:"#F59E0B", red:"#F87171", purple:"#A78BFA",
};
const PAL_LIGHT = {
  bg0:"#EDF1F7", bg1:"#FFFFFF", bg2:"#F5F8FC", bg3:"#EAEFF6", bg4:"#DCE3ED",
  border:"#E2E8F0", borderHi:"#C7D2E0",
  textPri:"#0F1B2D", textSec:"#566377", textMuted:"#8A99AE",
  blue:"#3B82F6", blueHi:"#60A5FA",
  cyan:"#38BDF8",
  green:"#4ADE80",
  amber:"#F59E0B", red:"#F87171", purple:"#A78BFA",
};
const PALETTES = { dark: PAL_DARK, light: PAL_LIGHT };
const themeStore = makeStore("admin_theme", "dark");
const isLight = () => themeStore.get() === "light";
const toggleTheme = () => themeStore.set(isLight() ? "dark" : "light");
const A = new Proxy({}, { get: (_t, k) => (PALETTES[themeStore.get()] || PAL_DARK)[k] });

const C = {
  bg0:"#0C0C0C", bg1:"#111111", bg2:"#171717", bg3:"#1F1F1F",
  gold:"#C9A84C", bronze:"#D4A35A",
  white:"#EEECE7", muted:"#6B6560", border:"#242424",
};

const NIVEL_COLOR = { VIP:A.cyan, Ouro:A.amber, Prata:A.textSec, Bronze:"#B0814F" };

// ─── BEHAVIORAL ENGINE v2 ─────────────────────────────────────────────────
const BE = {
  calcScore(c) {
    let s = 10;
    const cancel = c.cancelamentos ?? 0;
    const dias   = c.diasSemVisitar ?? 0;
    if (dias > 60) s -= 4; else if (dias > 30) s -= 2;
    if (cancel > 2) s -= 3; else if (cancel > 0) s -= 1;
    if (c.visitas > 20) s += 2; else if (c.visitas > 10) s += 1;
    return Math.max(0, Math.min(10, s));
  },
  calcNivel(v) {
    // usa os mínimos editáveis do painel (fonte única), não valores chumbados
    try { return nivelPorVisitas(v).label; } catch(e) {
      if (v >= 20) return "Diamond VIP"; if (v >= 12) return "Ouro";
      if (v >= 6)  return "Prata"; return "Bronze";
    }
  },
  prioridade(score) {
    if (score >= 8) return { label:"Confiável", color:A.green };
    if (score >= 6) return { label:"Normal",    color:A.cyan };
    if (score >= 4) return { label:"Atenção",   color:A.amber };
    if (score >= 2) return { label:"Risco",     color:A.red };
    return              { label:"Crítico",   color:A.red };
  },
  shouldSuggestRecurrence: (c) => BE.calcScore(c) >= 7 && (c.diasSemVisitar ?? 0) > 25 && c.visitas >= 5,
  shouldActivateSinal: (c)     => (c.cancelamentos ?? 0) >= 2 || BE.calcScore(c) < 4,
  shouldFlagRisk: (c)          => BE.calcScore(c) < 5,
};

// ─── INFORMATION PRIORITY ENGINE ──────────────────────────────────────────
const IPE = {
  WEIGHTS: {
    faltaHoje:    { score:95, financial:65 },
    vagoPremium:  { score:80, financial:90 },
    vipReativacao:{ score:70, financial:80 },
    waitlistAtiva:{ score:65, financial:55 },
  },
  rank(tipo) {
    const w = IPE.WEIGHTS[tipo]; if (!w) return 0;
    return (w.score * 0.4) + (w.financial * 0.6);
  },
  resolve(events, max = 3) {
    return [...events].sort((a, b) => IPE.rank(b.tipo) - IPE.rank(a.tipo)).slice(0, max);
  },
};

// ─── SUGGESTION GOVERNANCE ENGINE ─────────────────────────────────────────
const createGovernance = () => {
  const dismissed = new Set();
  const ignored   = new Map();
  return {
    shouldShow(id) {
      if (dismissed.has(id)) return false;
      return (ignored.get(id) ?? 0) < 2;
    },
    dismiss(id) { dismissed.add(id); },
    ignore(id)  { ignored.set(id, (ignored.get(id) ?? 0) + 1); },
  };
};

// ─── DB CENTRALIZADO ──────────────────────────────────────────────────────
const DB_RAW = {
  clientes: [
    { id:1,  nome:"Carlos Mendes",  diasSemVisitar:5,  visitas:22, cancelamentos:0, gasto:1480, proximo:"Hoje 09:30" },
    { id:2,  nome:"João Souza",     diasSemVisitar:12, visitas:13, cancelamentos:0, gasto:845,  proximo:"Hoje 14:00" },
    { id:3,  nome:"Rafael Torres",  diasSemVisitar:8,  visitas:7,  cancelamentos:1, gasto:455,  proximo:"Hoje 15:30" },
    { id:4,  nome:"Pedro Alves",    diasSemVisitar:28, visitas:6,  cancelamentos:1, gasto:295,  proximo:"Amanhã 11:00" },
    { id:5,  nome:"Marcos Duarte",  diasSemVisitar:45, visitas:4,  cancelamentos:3, gasto:145,  proximo:"Hoje 15:30" },
    { id:6,  nome:"Lucas Ferreira", diasSemVisitar:38, visitas:18, cancelamentos:0, gasto:1680, proximo:"—" },
    { id:7,  nome:"André Braga",    diasSemVisitar:22, visitas:9,  cancelamentos:2, gasto:580,  proximo:"—" },
    { id:8,  nome:"Bruno Campos",   diasSemVisitar:3,  visitas:10, cancelamentos:0, gasto:650,  proximo:"Amanhã 09:00" },
    { id:9,  nome:"Felipe Gomes",   diasSemVisitar:15, visitas:4,  cancelamentos:0, gasto:185,  proximo:"—" },
    { id:10, nome:"Roberto Melo",   diasSemVisitar:7,  visitas:8,  cancelamentos:1, gasto:510,  proximo:"Hoje 17:00" },
    { id:11, nome:"Thiago Lima",    diasSemVisitar:20, visitas:3,  cancelamentos:0, gasto:140,  proximo:"—" },
    { id:12, nome:"Diego Rocha",    diasSemVisitar:9,  visitas:15, cancelamentos:0, gasto:1120, proximo:"Amanhã 10:00" },
  ],
  agenda: [
    { id:1, hora:"08:00", nome:"Carlos Mendes",  servico:"Corte + Barba",      status:"realizado",  duracao:90,  valor:65,  clienteId:1 },
    { id:2, hora:"09:30", nome:"João Souza",      servico:"Corte",              status:"confirmado", duracao:45,  valor:45,  clienteId:2 },
    { id:3, hora:"11:00", nome:"Pedro Alves",     servico:"Barba",              status:"aguardando", duracao:30,  valor:30,  clienteId:4 },
    { id:4, hora:"13:00", nome:"—",               servico:"Intervalo",          status:"intervalo",  duracao:60,  valor:0,   clienteId:null },
    { id:5, hora:"14:00", nome:"Rafael Torres",   servico:"Corte + Sobrancelha",status:"confirmado", duracao:60,  valor:55,  clienteId:3 },
    { id:6, hora:"15:30", nome:"Marcos Duarte",   servico:"Corte",              status:"risco",      duracao:45,  valor:45,  clienteId:5 },
    { id:7, hora:"17:00", nome:"Roberto Melo",    servico:"Combo VIP",          status:"confirmado", duracao:120, valor:90,  clienteId:10 },
    { id:8, hora:"18:30", nome:"—",               servico:"Vago",               status:"vago",       duracao:45,  valor:45,  clienteId:null },
  ],
  waitlist: [
    { id:1, nome:"Felipe Gomes",  horario:"Hoje 15:30",   servico:"Corte",       clienteId:9,  ttl:18, posicao:1 },
    { id:2, nome:"Roberto Melo",  horario:"Hoje 15:30",   servico:"Corte",       clienteId:10, ttl:null, posicao:2 },
    { id:3, nome:"Thiago Lima",   horario:"Amanhã 14:00", servico:"Corte+Barba", clienteId:11, ttl:null, posicao:3 },
    { id:4, nome:"Diego Rocha",   horario:"Amanhã 09:00", servico:"Combo VIP",   clienteId:12, ttl:null, posicao:4 },
    { id:5, nome:"André Braga",   horario:"Amanhã 10:30", servico:"Corte",       clienteId:7,  ttl:null, posicao:5 },
  ],
  financeiro: {
    hoje:   { faturado:487, meta:600, servicos:7 },
    semana: { dias:["Seg","Ter","Qua","Qui","Sex","Sáb"], valores:[380,450,620,510,550,487] },
    mes:    { faturado:11420, meta:14000, ticket:64.8, recorrencia:72 },
    servicos:[
      { nome:"Corte",         qtd:89, valor:4005, pct:35 },
      { nome:"Corte + Barba", qtd:54, valor:3510, pct:30.7 },
      { nome:"Combo VIP",     qtd:28, valor:2520, pct:22 },
      { nome:"Barba",         qtd:47, valor:1410, pct:12.3 },
    ],
  },
};

const HIST_SAMPLE = [
  { d:"03 Mai", s:"Corte",        v:45 },
  { d:"18 Abr", s:"Corte + Barba", v:65 },
  { d:"02 Abr", s:"Barba",        v:30 },
  { d:"20 Mar", s:"Corte",        v:45 },
];
const lembreteLabel = (dias) => {
  if (dias <= 2)  return "Há 2 dias";
  if (dias <= 7)  return "Há 1 semana";
  if (dias <= 30) return "Há ~1 mês";
  return "Nunca enviado";
};
const MOCK_DB = {
  ...DB_RAW,
  clientes: DB_RAW.clientes.map(c => ({
    ...c,
    score: BE.calcScore(c),
    nivel: BE.calcNivel(c.visitas),
    ultimoLembrete: lembreteLabel(c.diasSemVisitar ?? 0),
    historico: HIST_SAMPLE.slice(0, Math.max(2, Math.min(4, Math.round((c.visitas ?? 4) / 5)))),
  })),
};

// ─── DADOS AO VIVO (v9.4) · backend real × demonstração ───────────────────
// `MOCK_DB` (acima) é o conjunto de DEMONSTRAÇÃO. Em produção, o login com a
// ADMIN_KEY traz os dados REAIS do backend (action=dashboard); eles são
// adaptados ao MESMO formato do MOCK_DB e guardados em `liveDataStore`. O
// Proxy `DB` devolve os dados reais quando existem, senão cai no MOCK_DB.
// Resultado: TODAS as telas passam a usar dados reais sem ser editadas uma a
// uma — basta o painel montar depois do login (o que já acontece).
const makeMemStore = (initial) => {
  let state = initial; const subs = new Set();
  return {
    get: () => state,
    set: (n) => { state = typeof n === "function" ? n(state) : n; subs.forEach(f => f()); },
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
  };
};
const liveDataStore = makeMemStore(null);  // null → modo demonstração (usa MOCK_DB). Não persiste (privacidade).
const adminKeyStore  = makeStore("adminKey", "");  // a chave fica só no dispositivo do dono
const DB = new Proxy({}, { get: (_t, k) => (liveDataStore.get() || MOCK_DB)[k] });

// Converte a resposta de action=dashboard para o formato interno (igual ao MOCK_DB).
const adaptDashboard = (r) => {
  const clientes = (r.clientes || []).map(c => ({
    id: c.clienteID,
    nome: c.nome,
    telefone: c.telefone,
    visitas: Number(c.totalVisitas) || 0,
    diasSemVisitar: Number(c.diasDesde) || 0,
    cancelamentos: Number(c.cancelamentos) || 0,
    gasto: Number(c.gasto) || 0,            // dashboard ainda não envia gasto total → 0
    proximo: c.proximo || "—",              // idem próximo agendamento por cliente
    score: (c.score != null ? Number(c.score) : 0),
    nivel: c.nivel || BE.calcNivel(Number(c.totalVisitas) || 0),
    nivelEmoji: c.nivelEmoji,
    statusCor: c.statusCor,
    risco: !!c.risco,
    ultimoLembrete: c.ultimoLembrete ? String(c.ultimoLembrete) : "Nunca enviado",
    historico: [],                          // histórico por cliente vem em etapa futura
  }));
  const agenda = (r.agenda || []).map(a => ({
    id: a.id,
    hora: a.horario,
    nome: a.nome,
    servico: a.servico,
    status: a.status,
    valor: Number(a.preco) || 0,
    duracao: a.duracao || 45,
    clienteId: a.clienteId ?? null,
    obs: a.obs || "",
  }));
  const k = r.kpis || {};
  return {
    clientes,
    agenda,
    waitlist: MOCK_DB.waitlist,             // sem endpoint de waitlist ainda → demonstração
    financeiro: {
      ...MOCK_DB.financeiro,
      hoje: { faturado: Number(k.faturadoHoje) || 0, meta: MOCK_DB.financeiro.hoje.meta, servicos: Number(k.agendamentosHoje) || 0 },
    },
    _kpis: {
      faturadoHoje:     Number(k.faturadoHoje) || 0,
      agendamentosHoje: Number(k.agendamentosHoje) || 0,
      confirmados:      Number(k.confirmados) || 0,
      totalClientes:    Number(k.totalClientes) || clientes.length,
    },
  };
};

// Contexto leve de SESSÃO: modo (demo/real), perfil, atualizar e sair.
const LiveCtx = createContext(null);
const useLive = () => useContext(LiveCtx) || { mode:"demo", perfil:null, permissoes:null, refresh:()=>{}, logout:()=>{} };

// ─── KEYFRAMES ────────────────────────────────────────────────────────────
const KEYFRAMES = `
  @keyframes shimmer {
    0%   { background-position: -500px 0; }
    100% { background-position:  500px 0; }
  }
  @keyframes fadeUp {
    from { opacity:0; transform:translateY(7px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes fadeDown {
    from { opacity:0; transform:translateY(-7px); }
    to   { opacity:1; transform:translateY(0); }
  }
  @keyframes scaleIn {
    from { opacity:0; transform:scale(0.94); }
    to   { opacity:1; transform:scale(1); }
  }
  @keyframes slideIn {
    from { opacity:0; transform:translateX(14px); }
    to   { opacity:1; transform:translateX(0); }
  }
  @keyframes slideInLeft {
    from { opacity:0; transform:translateX(-14px); }
    to   { opacity:1; transform:translateX(0); }
  }
  @keyframes pageEnter {
    0%   { opacity:0; transform:translateY(5px) scale(0.995); filter:blur(1px); }
    100% { opacity:1; transform:translateY(0)   scale(1);     filter:blur(0);   }
  }
  @keyframes pulse {
    0%, 100% { opacity:1; }
    50% { opacity:0.4; }
  }
  @keyframes toastIn {
    from { opacity:0; transform:translateY(14px) scale(0.96); }
    to   { opacity:1; transform:translateY(0) scale(1); }
  }
  @keyframes toastOut {
    from { opacity:1; transform:translateY(0) scale(1); }
    to   { opacity:0; transform:translateY(-8px) scale(0.96); }
  }
  @keyframes overlayIn {
    from { opacity:0; }
    to   { opacity:1; }
  }
  * { box-sizing:border-box; }
  *::-webkit-scrollbar { width:5px; height:5px; }
  *::-webkit-scrollbar-track { background:transparent; }
`;

// ─── TOAST SYSTEM ─────────────────────────────────────────────────────────

const ToastCtx = createContext(null);
const useToast = () => useContext(ToastCtx);

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((msg, color=A.green, icon="check") => {
    const id = Date.now();
    setToasts(t=>[...t, { id, msg, color, icon }]);
    setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={addToast}>
      {children}
      <div style={{
        position:"fixed", bottom:S.xxl, right:S.xxl,
        zIndex:9999, display:"flex", flexDirection:"column", gap:S.sm,
        pointerEvents:"none",
      }}>
        {toasts.map(t=>(
          <div key={t.id} style={{
            display:"flex", alignItems:"center", gap:S.sm,
            background:A.bg3, border:`1px solid ${t.color}30`,
            borderRadius:R.lg, padding:"10px 16px",
            boxShadow:`0 8px 24px #00000066, 0 0 0 1px ${t.color}18`,
            animation:"toastIn 240ms cubic-bezier(0.22,1,0.36,1) both",
            minWidth:220, maxWidth:320,
          }}>
            <div style={{width:6,height:6,borderRadius:"50%",background:t.color,boxShadow:`0 0 6px ${t.color}88`,flexShrink:0}}/>
            <span style={{color:A.textPri,fontSize:11,fontWeight:600,flex:1}}>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

// ─── GLOBAL SEARCH ────────────────────────────────────────────────────────
const SEARCH_INDEX = [
  ...DB_RAW.clientes.map(c=>({ type:"cliente", label:c.nome, sub:`${c.visitas} visitas · Score ${BE.calcScore(c)}`, nav:"clients", color:A.cyan, icon:"clients" })),
  ...DB_RAW.agenda.filter(a=>a.nome!=="—").map(a=>({ type:"agenda", label:a.nome, sub:`${a.hora} · ${a.servico} · ${a.status}`, nav:"agenda", color:A.blue, icon:"calendar" })),
  { type:"page", label:"Dashboard",  sub:"Briefing operacional · KPIs", nav:"dash",     color:A.textSec, icon:"sun" },
  { type:"page", label:"Agenda",     sub:"Horários do dia",            nav:"agenda",    color:A.textSec, icon:"calendar" },
  { type:"page", label:"Clientes",   sub:"12 ativos",                  nav:"clients",   color:A.textSec, icon:"clients" },
  { type:"page", label:"CRM",        sub:"Segmentação + automações",   nav:"crm",       color:A.textSec, icon:"crm" },
  { type:"page", label:"Financeiro", sub:"Faturamento e metas",        nav:"finance",   color:A.textSec, icon:"finance" },
  { type:"page", label:"Fidelização",sub:"Níveis e benefícios",        nav:"loyalty",   color:A.textSec, icon:"loyalty" },
  { type:"page", label:"Waitlist",   sub:"5 aguardando",               nav:"waitlist",  color:A.textSec, icon:"waitlist" },
  { type:"page", label:"Relatórios", sub:"Exportar CSV e PDF",         nav:"reports",   color:A.textSec, icon:"reports" },
  { type:"page", label:"Sistema",    sub:"Saúde e motor",              nav:"system",    color:A.textSec, icon:"settings" },
];

const SearchModal = ({ open, onClose, onNavigate }) => {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  const [sel, setSel] = useState(0);

  useEffect(()=>{
    if(open){ setQ(""); setSel(0); setTimeout(()=>inputRef.current?.focus(),60); }
  },[open]);

  useEffect(()=>{
    const handler=(e)=>{
      if(!open) return;
      if(e.key==="Escape") onClose();
      if(e.key==="ArrowDown") setSel(s=>Math.min(s+1,results.length-1));
      if(e.key==="ArrowUp")   setSel(s=>Math.max(s-1,0));
      if(e.key==="Enter" && results[sel]) { onNavigate(results[sel].nav); onClose(); }
    };
    window.addEventListener("keydown",handler);
    return ()=>window.removeEventListener("keydown",handler);
  },[open,sel,q]);

  const results = !q.trim() ? SEARCH_INDEX.slice(0,8) :
    SEARCH_INDEX.filter(i=>i.label.toLowerCase().includes(q.toLowerCase())||i.sub.toLowerCase().includes(q.toLowerCase())).slice(0,10);

  if(!open) return null;
  return (
    <div style={{
      position:"fixed",inset:0,zIndex:2000,display:"flex",alignItems:"flex-start",justifyContent:"center",
      paddingTop:100, background:"#00000088", backdropFilter:"blur(4px)",
      animation:"overlayIn 120ms both",
    }} onClick={onClose}>
      <div style={{
        width:520, background:A.bg2, border:`1px solid ${A.borderHi}`,
        borderRadius:R.xxl, boxShadow:"0 24px 60px #000000AA",
        animation:`scaleIn 180ms ${M.curve} both`,
      }} onClick={e=>e.stopPropagation()}>
        {/* Barra de busca */}
        <div style={{display:"flex",alignItems:"center",gap:S.md,padding:`${S.lg}px ${S.xl}px`,borderBottom:`1px solid ${A.border}`}}>
          <Ico n="search" size={14} color={A.textMuted}/>
          <input ref={inputRef} value={q} onChange={e=>{setQ(e.target.value);setSel(0);}}
            placeholder="Buscar cliente, horário, página…"
            style={{flex:1,background:"none",border:"none",outline:"none",color:A.textPri,fontSize:14,fontFamily:SHARED.fontAdmin}}/>
          <span style={{color:A.textMuted,fontSize:9,background:A.bg3,borderRadius:3,padding:"2px 6px",fontFamily:SHARED.fontMono,flexShrink:0}}>ESC</span>
        </div>
        {/* Resultados */}
        <div style={{maxHeight:360,overflowY:"auto",padding:`${S.xs}px 0`}}>
          {results.length===0&&(
            <div style={{color:A.textMuted,fontSize:11,textAlign:"center",padding:24}}>Nenhum resultado para "{q}"</div>
          )}
          {results.map((r,i)=>(
            <div key={i} onClick={()=>{ onNavigate(r.nav); onClose(); }}
              style={{
                display:"flex",alignItems:"center",gap:12,
                padding:"9px 20px",cursor:"pointer",
                background:sel===i?A.bg3:"transparent",
                transition:`background ${M.micro}`,
              }}
              onMouseEnter={()=>setSel(i)}
            >
              <div style={{width:28,height:28,borderRadius:R.md,background:`${r.color}14`,border:`1px solid ${r.color}20`,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <Ico n={r.icon} size={13} color={r.color}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:A.textPri,fontSize:12,fontWeight:600}}>{r.label}</div>
                <div style={{color:A.textMuted,fontSize:9.5}}>{r.sub}</div>
              </div>
              <span style={{color:A.textMuted,fontSize:8,background:A.bg4,borderRadius:R.sm,padding:"1px 6px",textTransform:"uppercase",letterSpacing:"0.06em"}}>
                {r.type==="cliente"?"Cliente":r.type==="agenda"?"Agenda":"Página"}
              </span>
            </div>
          ))}
        </div>
        {/* Footer */}
        <div style={{padding:"8px 20px",borderTop:`1px solid ${A.border}`,display:"flex",gap:16}}>
          {[["↑↓","Navegar"],["↵","Abrir"],["ESC","Fechar"]].map(([k,v])=>(
            <span key={k} style={{display:"flex",alignItems:"center",gap:5,color:A.textMuted,fontSize:8.5}}>
              <span style={{background:A.bg3,border:`1px solid ${A.border}`,borderRadius:3,padding:"1px 5px",fontFamily:SHARED.fontMono,color:A.textSec,fontSize:9}}>{k}</span>
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── NOTIFICATIONS PANEL ──────────────────────────────────────────────────
const NOTIFS_DATA = [
  { id:1, icon:"warning", color:A.red,    title:"Marcos Duarte — risco de falta",   sub:"15:30 · Score 4 · 2 cancelamentos",  time:"agora",    unread:true },
  { id:2, icon:"spark",   color:A.purple, title:"Horário 18:30 vago · Fila pronta", sub:"Diego Rocha e André Braga aguardam",   time:"14 min",   unread:true },
  { id:3, icon:"star",    color:A.cyan,   title:"Lucas Ferreira — VIP reativação",  sub:"38 dias sem visitar · R$ 1.680 gasto", time:"1h",       unread:true },
  { id:4, icon:"check",   color:A.green,  title:"Carlos Mendes — atendimento ok",   sub:"Corte + Barba · R$ 65 · 08:00",        time:"3h",       unread:false },
  { id:5, icon:"zap",     color:A.amber,  title:"Meta do dia: 81% atingida",        sub:"R$ 487 de R$ 600",                     time:"5h",       unread:false },
];

const NotificationsPanel = ({ open, onClose }) => {
  const [notifs, setNotifs] = useState(NOTIFS_DATA);
  const unreadCount = notifs.filter(n=>n.unread).length;
  if(!open) return null;
  return (
    <div style={{position:"fixed",inset:0,zIndex:1500}} onClick={onClose}>
      <div style={{
        position:"absolute", top:54, right:16,
        width:340, background:A.bg2, border:`1px solid ${A.borderHi}`,
        borderRadius:R.xl, boxShadow:"0 16px 40px #000000AA",
        animation:`fadeDown ${M.base} both`,
      }} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${S.md}px ${S.lg}px`,borderBottom:`1px solid ${A.border}`}}>
          <div>
            <span style={{color:A.textPri,fontSize:12,fontWeight:700}}>Notificações</span>
            {unreadCount>0&&<span style={{marginLeft:7,background:`${A.red}20`,color:A.red,fontSize:9,fontWeight:700,borderRadius:R.pill,padding:"1px 7px"}}>{unreadCount} novas</span>}
          </div>
          {unreadCount>0&&(
            <span onClick={()=>setNotifs(n=>n.map(x=>({...x,unread:false})))}
              style={{color:A.textMuted,fontSize:9,cursor:"pointer",padding:"2px 6px",borderRadius:R.sm,
              background:A.bg3,border:`1px solid ${A.border}`}}>
              Marcar todas como lidas
            </span>
          )}
        </div>
        <div style={{maxHeight:400,overflowY:"auto"}}>
          {notifs.map((n,i)=>(
            <div key={n.id} style={{
              display:"flex",gap:12,padding:"12px 16px",cursor:"pointer",
              background:n.unread?`${n.color}05`:"transparent",
              borderBottom:i<notifs.length-1?`1px solid ${A.border}`:"none",
              transition:`background ${M.micro}`,
            }}
              onMouseEnter={e=>e.currentTarget.style.background=A.bg3}
              onMouseLeave={e=>e.currentTarget.style.background=n.unread?`${n.color}05`:"transparent"}
              onClick={()=>setNotifs(ns=>ns.map(x=>x.id===n.id?{...x,unread:false}:x))}
            >
              <div style={{width:30,height:30,borderRadius:R.md,background:`${n.color}14`,border:`1px solid ${n.color}22`,
                display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,position:"relative"}}>
                <Ico n={n.icon} size={13} color={n.color}/>
                {n.unread&&<div style={{position:"absolute",top:-2,right:-2,width:7,height:7,borderRadius:"50%",background:A.red,border:`1.5px solid ${A.bg2}`}}/>}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:A.textPri,fontSize:11,fontWeight:600,marginBottom:2}}>{n.title}</div>
                <div style={{color:A.textMuted,fontSize:9.5}}>{n.sub}</div>
              </div>
              <span style={{color:A.textMuted,fontSize:8.5,flexShrink:0,paddingTop:1}}>{n.time}</span>
            </div>
          ))}
        </div>
        <div style={{padding:"8px 16px",borderTop:`1px solid ${A.border}`,textAlign:"center"}}>
          <span style={{color:A.textMuted,fontSize:9.5,cursor:"pointer"}}>Ver histórico completo</span>
        </div>
      </div>
    </div>
  );
};


const Skeleton = ({ w="100%", h=14, r=R.sm, style:sx={} }) => (
  <div style={{
    width:w, height:h, borderRadius:r, flexShrink:0,
    background:`linear-gradient(90deg, ${A.bg3} 25%, ${A.bg4} 50%, ${A.bg3} 75%)`,
    backgroundSize:"500px 100%",
    animation:"shimmer 1.5s ease-in-out infinite",
    ...sx,
  }} />
);

const useLoader = (delay=800) => {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLoaded(true), delay); return () => clearTimeout(t); }, [delay]);
  return loaded;
};

// ─── DYNAMIC DATE HELPER (v7 fix: não mais hardcoded) ─────────────────────
const useLiveTime = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
};

const formatGreeting = (date) => {
  const h = date.getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
};

const formatDateBR = (date) => {
  const dias = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const meses = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  return `${dias[date.getDay()]}, ${date.getDate()} ${meses[date.getMonth()]}`;
};

const formatTimeBR = (date) => {
  return date.toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
};

// ─── ÁTOMOS ───────────────────────────────────────────────────────────────
const Badge = ({ color=A.cyan, children, dot, size="sm" }) => (
  <span style={{
    display:"inline-flex", alignItems:"center", gap:4,
    background:`${color}14`, color,
    border:`1px solid ${color}28`,
    borderRadius:R.sm,
    padding:size==="sm"?"2px 7px":"3px 10px",
    fontSize:size==="sm"?10:11,
    fontWeight:600, letterSpacing:"0.025em", whiteSpace:"nowrap", lineHeight:1.5,
  }}>
    {dot && <span style={{ width:5, height:5, borderRadius:"50%", background:color, flexShrink:0 }} />}
    {children}
  </span>
);

const ScoreDot = ({ score, showLabel=false }) => {
  const pr = BE.prioridade(score);
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
      <span style={{
        width:7, height:7, borderRadius:"50%", background:pr.color,
        boxShadow:`0 0 5px ${pr.color}88`, flexShrink:0,
      }} />
      <span style={{ color:pr.color, fontFamily:SHARED.fontMono, fontWeight:700, fontSize:12 }}>{score}</span>
      {showLabel && <span style={{ color:A.textMuted, fontSize:9 }}>{pr.label}</span>}
    </span>
  );
};

const MiniBar = ({ pct, color, height=4, delay="0s" }) => {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), 200); return () => clearTimeout(t); }, [pct]);
  return (
    <div style={{ background:`${color}15`, borderRadius:height, height, width:"100%", overflow:"hidden" }}>
      <div style={{
        background:color, width:`${Math.min(w,100)}%`, height:"100%", borderRadius:height,
        boxShadow:`0 0 5px ${color}44`,
        transition:`width 600ms ${M.curve} ${delay}`,
      }} />
    </div>
  );
};

const Sparkline = ({ data=[], color, height=30, width=120 }) => {
  if (data.length < 2) return null;
  const max=Math.max(...data), min=Math.min(...data), range=max-min||1;
  const pts = data.map((v,i) => {
    const x=(i/(data.length-1))*width;
    const y=height-((v-min)/range)*(height-6)-3;
    return `${x},${y}`;
  }).join(" ");
  const id=`sk_${color.replace(/\W/g,"")}${data[0]}`;
  return (
    <svg width={width} height={height} style={{ overflow:"visible", display:"block" }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const Donut = ({ pct, color, size=52, label }) => {
  const r=20, circ=2*Math.PI*r;
  const [cur, setCur] = useState(0);
  useEffect(() => { const t=setTimeout(()=>setCur(pct),300); return ()=>clearTimeout(t); },[pct]);
  const dash=(cur/100)*circ;
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5 }}>
      <svg width={size} height={size} viewBox="0 0 52 52">
        <circle cx={26} cy={26} r={r} fill="none" stroke={`${color}18`} strokeWidth={4.5}/>
        <circle cx={26} cy={26} r={r} fill="none" stroke={color} strokeWidth={4.5}
          strokeDasharray={`${dash} ${circ-dash}`} strokeDashoffset={circ*0.25} strokeLinecap="round"
          style={{ transition:`stroke-dasharray 600ms ${M.curve}`, filter:`drop-shadow(0 0 3px ${color}66)` }}/>
        <text x={26} y={30} textAnchor="middle" fill={color} fontSize={10} fontWeight={700}
          fontFamily={SHARED.fontMono}>{cur}%</text>
      </svg>
      {label && <span style={{ color:A.textMuted, fontSize:9, textAlign:"center" }}>{label}</span>}
    </div>
  );
};

// SVG Icon system
const Ico = ({ n, size=14, color }) => {
  const c = color||"currentColor";
  const icons = {
    sun:      <><circle cx={12} cy={12} r={4} stroke={c} strokeWidth="1.4" fill="none"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></>,
    calendar: <><rect x={3} y={4} width={15} height={14} rx={2} stroke={c} strokeWidth="1.4" fill="none"/><path d="M16 2v4M8 2v4M3 9h15" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></>,
    clients:  <><circle cx={9} cy={7} r={3} stroke={c} strokeWidth="1.4" fill="none"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round"/><circle cx={17} cy={7} r={2.5} stroke={c} strokeWidth="1.4" fill="none"/><path d="M19.5 20c0-2.5-1.8-4.5-4-5" stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round"/></>,
    crm:      <><path d="M3 6h15M3 12h10M3 18h7" stroke={c} strokeWidth="1.4" strokeLinecap="round"/><circle cx={18} cy={16} r={3} stroke={c} strokeWidth="1.4" fill="none"/><path d="M20.5 18.5l2 2" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></>,
    finance:  <><circle cx={12} cy={12} r={9} stroke={c} strokeWidth="1.4" fill="none"/><path d="M12 7v1.5M12 15.5V17M9.5 10a2.5 2.5 0 0 1 5 0c0 2-5 3-5 5a2.5 2.5 0 0 0 5 0" stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round"/></>,
    loyalty:  <path d="M12 21.5L5.5 15C3.5 13 3.5 10 5.5 8a4.5 4.5 0 0 1 6.5 1.3A4.5 4.5 0 0 1 18.5 8c2 2 2 5 0 7L12 21.5z" stroke={c} strokeWidth="1.4" fill="none" strokeLinejoin="round"/>,
    waitlist: <><circle cx={12} cy={12} r={9} stroke={c} strokeWidth="1.4" fill="none"/><path d="M12 7v5l3 3" stroke={c} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></>,
    reports:  <><path d="M5 3h10l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" stroke={c} strokeWidth="1.4" fill="none"/><path d="M8 12h5M8 16h3" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></>,
    settings: <><circle cx={12} cy={12} r={3} stroke={c} strokeWidth="1.4" fill="none"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></>,
    bell:     <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={c} strokeWidth="1.4" fill="none" strokeLinejoin="round"/><path d="M13.7 21a2 2 0 0 1-3.4 0" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></>,
    search:   <><circle cx={10} cy={10} r={6} stroke={c} strokeWidth="1.4" fill="none"/><path d="M20 20l-4.3-4.3" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></>,
    plus:     <path d="M12 5v14M5 12h14" stroke={c} strokeWidth="1.4" strokeLinecap="round"/>,
    check:    <path d="M4 12l5 5 9-9" stroke={c} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    warning:  <><path d="M10.3 3.7L2 20h16L9.7 3.7a.3.3 0 0 0-.5-.4z" stroke={c} strokeWidth="1.4" fill="none" strokeLinejoin="round"/><path d="M12 10v4M12 16.5v.5" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></>,
    zap:      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke={c} strokeWidth="1.4" fill="none" strokeLinejoin="round"/>,
    spark:    <><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke={c} strokeWidth="1.3" fill="none" strokeLinejoin="round"/></>,
    star:     <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z" stroke={c} strokeWidth="1.3" fill={`${c}18`} strokeLinejoin="round"/>,
    close:    <path d="M18 6L6 18M6 6l12 12" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>,
    chevron:  <path d="M6 9l6 6 6-6" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    cut:      <><circle cx={6} cy={6} r={2.5} stroke={c} strokeWidth="1.4" fill="none"/><circle cx={6} cy={18} r={2.5} stroke={c} strokeWidth="1.4" fill="none"/><path d="M8.1 7.9l9.4 9.4M17.5 6.5L12 12" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></>,
    phone:    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" stroke={c} strokeWidth="1.4" fill="none" strokeLinejoin="round"/>,
    activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>,
    cpu:      <><rect x={4} y={4} width={16} height={16} rx={2} stroke={c} strokeWidth="1.4" fill="none"/><rect x={9} y={9} width={6} height={6} stroke={c} strokeWidth="1.4" fill="none"/><path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" stroke={c} strokeWidth="1.4" strokeLinecap="round"/></>,
    database: <><ellipse cx={12} cy={5} rx={9} ry={3} stroke={c} strokeWidth="1.4" fill="none"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3M21 19c0 1.7-4 3-9 3s-9-1.3-9-3" stroke={c} strokeWidth="1.4"/><path d="M3 5v14M21 5v14" stroke={c} strokeWidth="1.4"/></>,
    wifi:     <><path d="M1.4 8.6C5.2 4.8 10.4 3 12 3s6.8 1.8 10.6 5.6" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round"/><path d="M5 12.5c1.9-1.9 4.4-3 7-3s5.1 1.1 7 3" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round"/><path d="M8.5 16c.9-.9 2.2-1.5 3.5-1.5s2.6.6 3.5 1.5" stroke={c} strokeWidth="1.5" fill="none" strokeLinecap="round"/><circle cx={12} cy={20} r={1} fill={c}/></>,
    menu:     <path d="M3 6h18M3 12h18M3 18h18" stroke={c} strokeWidth="1.6" strokeLinecap="round"/>,
    logout:   <><path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round"/><path d="M16 17l5-5-5-5M21 12H9" stroke={c} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink:0, display:"block" }}>
      {icons[n] || <circle cx={12} cy={12} r={5} stroke={c} strokeWidth="1.4" fill="none"/>}
    </svg>
  );
};

// ─── COMPONENTES BASE ─────────────────────────────────────────────────────
const Card = ({ children, style:sx={}, pad=true, onClick }) => (
  <div onClick={onClick} style={{
    background:A.bg2, border:`1px solid ${A.border}`,
    borderRadius:R.xl, padding:pad?`${S.lg}px ${S.xl}px`:0,
    ...(onClick?{cursor:"pointer"}:{}), ...sx,
  }}>{children}</div>
);

const SectionHead = ({ title, sub, action }) => (
  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:S.md }}>
    <div>
      <div style={{ color:A.textPri, fontWeight:700, fontSize:13 }}>{title}</div>
      {sub && <div style={{ color:A.textMuted, fontSize:9.5, marginTop:2 }}>{sub}</div>}
    </div>
    {action && <div>{action}</div>}
  </div>
);

const Stat = ({ label, value, color=A.textPri }) => (
  <div style={{ background:A.bg3, borderRadius:R.md, padding:`${S.sm}px ${S.md}px` }}>
    <div style={{ color:A.textMuted, fontSize:9, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:3 }}>{label}</div>
    <div style={{ color, fontSize:16, fontWeight:800, fontFamily:SHARED.fontMono }}>{value}</div>
  </div>
);

const Avatar = ({ nome, size=32, color=A.cyan }) => {
  const initials = nome.split(" ").slice(0,2).map(p=>p[0]).join("").toUpperCase();
  return (
    <div style={{
      width:size, height:size, borderRadius:R.md, flexShrink:0,
      background:`${color}18`, border:`1px solid ${color}28`,
      display:"flex", alignItems:"center", justifyContent:"center",
      color, fontSize:size*0.35, fontWeight:700,
    }}>{initials}</div>
  );
};

const Btn = ({ children, variant="primary", size="md", onClick, style:sx={}, disabled }) => {
  const base = {
    display:"inline-flex", alignItems:"center", gap:5,
    borderRadius:R.md, border:"1px solid transparent",
    fontFamily:SHARED.fontAdmin, fontWeight:600, cursor:disabled?"not-allowed":"pointer",
    transition:`all ${M.micro}`, opacity:disabled?0.4:1, whiteSpace:"nowrap",
    padding: size==="sm"?"4px 10px":size==="md"?"7px 14px":"9px 18px",
    fontSize: size==="sm"?10:size==="md"?11:12,
  };
  const variants = {
    primary:   { background:A.blue, color:"#fff", border:`1px solid ${A.blue}` },
    secondary: { background:A.bg3, color:A.textSec, border:`1px solid ${A.border}` },
    ghost:     { background:"transparent", color:A.textMuted, border:"1px solid transparent" },
    danger:    { background:`${A.red}15`, color:A.red, border:`1px solid ${A.red}28` },
    amber:     { background:`${A.amber}15`, color:A.amber, border:`1px solid ${A.amber}28` },
    purple:    { background:`${A.purple}18`, color:A.purple, border:`1px solid ${A.purple}30` },
  };
  return (
    <button onClick={disabled?undefined:onClick}
      style={{ ...base, ...(variants[variant]||variants.primary), ...sx }}>
      {children}
    </button>
  );
};

// ─── ZERO-THINK BANNER (v7: persiste dismiss na sessão) ───────────────────
const ZeroThinkBanner = ({ trigger, onDismiss }) => {
  const [confirmed, setConfirmed] = useState(false);
  const confirm = () => {
    setConfirmed(true);
    setTimeout(onDismiss, 1200);
  };
  if (!trigger) return null;
  return (
    <div style={{
      position:"fixed", top:S.lg, right:S.lg, zIndex:1000,
      width:320, animation:`slideIn ${M.enter}`,
    }}>
      <div style={{
        background:A.bg2, border:`1px solid ${A.purple}40`,
        borderRadius:R.xl, padding:S.lg,
        boxShadow:`0 16px 40px #00000080, 0 0 0 1px ${A.purple}20, 0 0 24px ${A.purple}18`,
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:S.md }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{
              width:30, height:30, borderRadius:R.md,
              background:`${A.purple}18`, border:`1px solid ${A.purple}30`,
              display:"flex", alignItems:"center", justifyContent:"center",
            }}><Ico n="zap" size={14} color={A.purple}/></div>
            <div>
              <div style={{ color:A.textPri, fontWeight:700, fontSize:11.5 }}>Cancelamento detectado</div>
              <div style={{ color:A.textMuted, fontSize:9 }}>{trigger.slot} · {trigger.client} · agora</div>
            </div>
          </div>
          <div onClick={onDismiss} style={{ cursor:"pointer", padding:2 }}>
            <Ico n="close" size={14} color={A.textMuted}/>
          </div>
        </div>
        <div style={{
          background:`${A.purple}0C`, border:`1px solid ${A.purple}20`,
          borderRadius:R.md, padding:"9px 12px", marginBottom:10,
        }}>
          <div style={{ color:A.purple, fontSize:11, fontWeight:600, marginBottom:3 }}>
            ⚡ Fila automática pronta — {trigger.waitlist.length} aguardando
          </div>
          <div style={{ color:A.textSec, fontSize:9.5 }}>Quem notificar primeiro?</div>
        </div>
        {trigger.waitlist.map((w,i)=>(
          <div key={i} style={{
            display:"flex", alignItems:"center", gap:10,
            padding:"8px 0",
            borderBottom:i<trigger.waitlist.length-1?`1px solid ${A.border}`:"none",
          }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:i===0?A.amber:A.textMuted, flexShrink:0,
              boxShadow:i===0?`0 0 5px ${A.amber}88`:"none" }} />
            <div style={{ flex:1 }}>
              <span style={{ color:A.textPri, fontSize:12, fontWeight:600 }}>{w.nome}</span>
              <span style={{ color:A.textMuted, fontSize:9, marginLeft:6 }}>nível {w.nivel}</span>
            </div>
            <ScoreDot score={w.score}/>
            {i===0&&<Badge color={A.amber}>Prioridade</Badge>}
          </div>
        ))}
        <div style={{ display:"flex", gap:S.sm, marginTop:12 }}>
          <button onClick={confirm} style={{
            flex:1,
            background:confirmed?`${A.green}18`:A.purple,
            color:confirmed?A.green:"#fff",
            border:`1px solid ${confirmed?A.green+"40":"transparent"}`,
            borderRadius:R.md, padding:"8px",
            fontSize:10, fontWeight:700, cursor:"pointer",
            transition:`all ${M.base}`,
            boxShadow:confirmed?"none":`0 0 14px ${A.purple}44`,
            fontFamily:SHARED.fontAdmin,
          }}>
            {confirmed?"✓ Notificado!":"Notificar Felipe G."}
          </button>
          <button onClick={onDismiss} style={{
            flex:1, background:A.bg3, color:A.textSec,
            border:`1px solid ${A.border}`,
            borderRadius:R.md, padding:"8px",
            fontSize:10, fontWeight:600, cursor:"pointer",
            fontFamily:SHARED.fontAdmin,
          }}>Ver todos</button>
        </div>
      </div>
    </div>
  );
};

// ─── MORNING BRIEFING (v7: data dinâmica, fix: ignore vs dismiss) ──────────
const generateSuggestions = () => {
  const suggestions = [];
  const riscoHoje = DB.agenda
    .filter(s => s.status === "risco" && s.clienteId)
    .map(s => DB.clientes.find(c => c.id === s.clienteId))
    .filter(Boolean);
  if (riscoHoje.length > 0) {
    const nomes = riscoHoje.map(c => `${c.nome.split(" ")[0]} (score ${c.score})`).join(", ");
    suggestions.push({
      id: "risco_falta", tipo: "faltaHoje", icon: "warning", color: A.amber,
      title: `${riscoHoje.length} cliente${riscoHoje.length > 1 ? "s" : ""} com risco de falta hoje`,
      detail: `${nomes}. Sinal parcial reduz no-show em ~78%.`,
      primary: riscoHoje.length > 1 ? `Ativar sinal nos ${riscoHoje.length}` : "Ativar sinal",
      secondary: "Ver clientes",
    });
  }
  const vagos = DB.agenda.filter(s => s.status === "vago");
  if (vagos.length > 0 && DB.waitlist.length > 0) {
    suggestions.push({
      id: "vago_premium", tipo: "vagoPremium", icon: "spark", color: A.cyan,
      title: `${vagos.length} horário${vagos.length > 1 ? "s" : ""} vago${vagos.length > 1 ? "s" : ""} · ${DB.waitlist.length} na fila`,
      detail: `${vagos.map(v => v.hora).join(", ")} sem reserva. Fila pronta para notificação automática.`,
      primary: "Disparar para waitlist",
      secondary: "Ver agenda",
    });
  }
  const vipReativ = DB.clientes
    .filter(c => BE.shouldSuggestRecurrence(c))
    .sort((a, b) => b.gasto - a.gasto)[0];
  if (vipReativ) {
    suggestions.push({
      id: `vip_reativ_${vipReativ.id}`, tipo: "vipReativacao", icon: "star", color: A.purple,
      title: `${vipReativ.nome} — ${vipReativ.nivel} pronto para reativar`,
      detail: `${vipReativ.visitas} visitas, score ${vipReativ.score}. Sem agendar há ${vipReativ.diasSemVisitar} dias. Gasto total R$ ${vipReativ.gasto}.`,
      primary: "Sugerir recorrência",
      secondary: "Ver perfil",
    });
  }
  return suggestions;
};

const MorningBriefing = () => {
  const toast = useToast();
  const governance = useRef(createGovernance());
  const now = useLiveTime();
  const allSuggestions = generateSuggestions();
  const ordered = IPE.resolve(allSuggestions);
  const [dismissed, setDismissed] = useState({});
  const [acting, setActing] = useState({});

  // v8: ação primária = dismiss + toast feedback
  const actPrimary = useCallback((id, s) => {
    governance.current.dismiss(id);
    setActing(prev=>({...prev,[id]:true}));
    setTimeout(()=>setDismissed(d=>({...d,[id]:true})),280);
    if(s) toast(s.primary+" · ação registrada", s.color, s.icon);
  },[toast]);

  const actIgnore = useCallback((id) => {
    governance.current.ignore(id);
    setActing(prev=>({...prev,[id]:true}));
    setTimeout(()=>setDismissed(d=>({...d,[id]:true})),280);
  },[]);

  const visible = ordered.filter(s=>!dismissed[s.id]&&governance.current.shouldShow(s.id));

  return (
    <Card style={{ position:"relative", overflow:"hidden",
      background:`linear-gradient(160deg, ${A.bg2} 0%, ${A.bg1} 100%)` }}>
      <div style={{ position:"absolute", top:-60, right:-60, width:220, height:220,
        borderRadius:"50%", background:`radial-gradient(circle, ${A.cyan}08 0%, transparent 70%)`,
        pointerEvents:"none" }} />
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:S.lg }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:4 }}>
            <Ico n="sun" size={13} color={A.amber}/>
            {/* v7: data dinâmica, não hardcoded */}
            <span style={{ color:A.textMuted, fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", fontWeight:600 }}>
              {formatGreeting(now)} · {formatDateBR(now)}
            </span>
          </div>
          <div style={{ color:A.textPri, fontSize:21, fontWeight:700, letterSpacing:"-0.02em", lineHeight:1.2 }}>
            {visible.length===0
              ? "Tudo certo por aqui. Boa operação."
              : <>Hoje você tem{" "}
                  <span style={{ color:A.cyan }}>{visible.length} {visible.length===1?"decisão":"decisões"}</span>
                  {" "}que valem atenção.</>
            }
          </div>
          <div style={{ color:A.textSec, fontSize:11, marginTop:4 }}>
            Sistema ativo · Priorizado por impacto financeiro
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px",
          borderRadius:R.md, background:`${A.green}0D`, border:`1px solid ${A.green}22` }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:A.green,
            boxShadow:`0 0 6px ${A.green}`, animation:"pulse 2s ease-in-out infinite" }}/>
          <span style={{ color:A.green, fontSize:10, fontWeight:600 }}>Motor ativo</span>
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:S.sm }}>
        {visible.map(s=>(
          <div key={s.id} style={{
            display:"flex", alignItems:"center", gap:S.md,
            padding:`${S.md}px ${S.lg}px`,
            background:A.bg3, border:`1px solid ${A.border}`, borderRadius:R.lg,
            transition:`all ${M.base}`,
            transform:acting[s.id]?"translateX(14px)":"translateX(0)",
            opacity:acting[s.id]?0:1,
          }}>
            <div style={{
              width:32, height:32, borderRadius:R.md, flexShrink:0,
              background:`${s.color}12`, border:`1px solid ${s.color}25`,
              display:"flex", alignItems:"center", justifyContent:"center",
            }}><Ico n={s.icon} size={14} color={s.color}/></div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ color:A.textPri, fontSize:12.5, fontWeight:600, marginBottom:2 }}>{s.title}</div>
              <div style={{ color:A.textSec, fontSize:10.5, lineHeight:1.5 }}>{s.detail}</div>
            </div>
            <div style={{ display:"flex", gap:S.xs, flexShrink:0 }}>
              {/* v8: toast feedback em todas as ações */}
              <Btn variant="ghost" size="sm" onClick={()=>actIgnore(s.id)}>Ignorar</Btn>
              <Btn variant="secondary" size="sm" onClick={()=>actPrimary(s.id, s)}>{s.secondary}</Btn>
              <Btn size="sm" onClick={()=>actPrimary(s.id, s)}
                style={{ background:`${s.color}18`, color:s.color, borderColor:`${s.color}30` }}>
                {s.primary}
              </Btn>
            </div>
          </div>
        ))}
        {visible.length===0&&(
          <div style={{
            padding:S.lg, background:`${A.green}08`, border:`1px solid ${A.green}20`,
            borderRadius:R.lg, color:A.textSec, fontSize:11,
            display:"flex", alignItems:"center", gap:8,
            animation:`fadeUp ${M.base}`,
          }}>
            <Ico n="check" size={14} color={A.green}/>
            Todas as decisões foram tratadas. O sistema avisa se algo mudar.
          </div>
        )}
      </div>
    </Card>
  );
};

// ─── KPI STRIP ────────────────────────────────────────────────────────────
const KPIStrip = () => {
  const [open, setOpen] = useState(false);
  const loaded = useLoader(600);
  const live = DB._kpis || null;  // presente só no modo real (vem do backend)
  const emRisco = DB.clientes.filter(c=>BE.shouldFlagRisk(c)).length;
  const presenca = live && live.agendamentosHoje ? Math.round(live.confirmados/live.agendamentosHoje*100) : null;
  const kpis = live ? [
    { label:"Faturado hoje", value:`R$ ${live.faturadoHoje.toLocaleString("pt-BR")}`, sub:`${live.agendamentosHoje} agendamento${live.agendamentosHoje===1?"":"s"}`, delta:"", pos:true,  color:A.blue,  spark:[310,420,380,490,440,520,live.faturadoHoje||1] },
    { label:"Presença",      value: presenca!=null?`${presenca}%`:"—",                 sub:`${live.confirmados} de ${live.agendamentosHoje}`,                          delta:"", pos:true,  color:A.green, spark:[80,83,78,85,82,88,presenca||0] },
    { label:"Clientes",      value: String(live.totalClientes),                          sub:"cadastrados",                                                              delta:"", pos:true,  color:A.cyan,  spark:[65,68,66,70,69,71,72] },
    { label:"Em risco",      value: String(emRisco),                                     sub:"Score < 5",                                                                delta:"", pos:false, color:A.red,   spark:[5,4,6,3,5,4,emRisco] },
  ] : [
    { label:"Faturamento", value:"R$ 487", sub:"Meta R$ 600", delta:"+12%", pos:true,  color:A.blue,  spark:[310,420,380,490,440,520,487] },
    { label:"Presença",    value:"87%",    sub:"7 de 8",      delta:"+3%",  pos:true,  color:A.green, spark:[80,83,78,85,82,88,87] },
    { label:"Recorrência", value:"72%",    sub:"Voltaram",    delta:"+2%",  pos:true,  color:A.cyan,  spark:[65,68,66,70,69,71,72] },
    { label:"Em risco",    value:"3",      sub:"Score < 4",   delta:"+1",   pos:false, color:A.red,   spark:[5,4,6,3,5,4,3] },
  ];
  return (
    <Card pad={false} style={{ overflow:"hidden" }}>
      <div onClick={()=>setOpen(!open)} style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:`${S.md}px ${S.xl}px`, cursor:"pointer",
        borderBottom:open?`1px solid ${A.border}`:"none",
        transition:`border-bottom-color ${M.micro}`,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ color:A.textMuted, fontSize:9.5, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:600 }}>
            Métricas do dia
          </span>
          {!open&&loaded&&(
            <div style={{ display:"flex", gap:16, animation:`fadeUp ${M.base}` }}>
              {kpis.map(k=>(
                <div key={k.label} style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <span style={{ color:A.textSec, fontSize:10 }}>{k.label}</span>
                  <span style={{ color:k.color, fontSize:11.5, fontWeight:700, fontFamily:SHARED.fontMono }}>{k.value}</span>
                  <span style={{ color:k.pos?A.green:A.red, fontSize:9.5, fontWeight:600 }}>
                    {k.delta ? <>{k.pos?"↑":"↓"} {k.delta}</> : null}
                  </span>
                </div>
              ))}
            </div>
          )}
          {!open&&!loaded&&(
            <div style={{ display:"flex", gap:16 }}>
              {kpis.map(k=><Skeleton key={k.label} w={80} h={14} r={R.sm}/>)}
            </div>
          )}
        </div>
        <div style={{ transition:`transform ${M.base}`, transform:open?"rotate(180deg)":"rotate(0)" }}>
          <Ico n="chevron" size={12} color={A.textMuted}/>
        </div>
      </div>
      {open&&(
        <div className="aq-grid-1" style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:1, background:A.border }}>
          {kpis.map((k,i)=>(
            <div key={k.label}
              style={{ background:A.bg2, padding:`${S.lg}px ${S.xl}px`,
                transition:`transform ${M.micro}`, cursor:"default",
                animation:`fadeUp ${M.enter} ${i*60}ms both` }}
              onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"}
              onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}
            >
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div>
                  <div style={{ color:A.textMuted, fontSize:9.5, letterSpacing:"0.07em", textTransform:"uppercase", fontWeight:600, marginBottom:5 }}>{k.label}</div>
                  <div style={{ color:A.textPri, fontSize:23, fontWeight:800, fontFamily:SHARED.fontMono, letterSpacing:"-0.04em", lineHeight:1 }}>{k.value}</div>
                  <div style={{ color:A.textSec, fontSize:10, marginTop:4 }}>{k.sub}</div>
                </div>
                <span style={{ color:k.pos?A.green:A.red, fontSize:10, fontWeight:600 }}>{k.delta ? <>{k.pos?"↑":"↓"} {k.delta}</> : null}</span>
              </div>
              <Sparkline data={k.spark} color={k.color} width={140} height={28}/>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

// ─── SIDEBAR ──────────────────────────────────────────────────────────────
const Sidebar = ({ active, setActive }) => {
  const { mode, perfil, logout } = useLive();
  // v8: badges calculados dinamicamente a partir do DB
  const nav = [
    { id:"dash",     label:"Hoje",       icon:"sun",      badge:null },
    { id:"agenda",   label:"Agenda",     icon:"calendar", badge:String(DB.agenda.length) },
    { id:"clients",  label:"Clientes",   icon:"clients",  badge:null },
    { id:"crm",      label:"CRM",        icon:"crm",      badge:String(DB.clientes.filter(c=>BE.shouldFlagRisk(c)).length) },
    { id:"finance",  label:"Financeiro", icon:"finance",  badge:null },
    { id:"loyalty",  label:"Fidelização",icon:"loyalty",  badge:null },
    { id:"waitlist", label:"Waitlist",   icon:"waitlist", badge:String(DB.waitlist.length) },
    { id:"reports",  label:"Relatórios", icon:"reports",  badge:null },
    { id:"config",   label:"Configurações", icon:"settings", badge:null },
    { id:"system",   label:"Sistema",    icon:"cpu",      badge:null },
  ];
  return (
    <div style={{
      width:204, background:A.bg1, borderRight:`1px solid ${A.border}`,
      display:"flex", flexDirection:"column", height:"100%", flexShrink:0,
    }}>
      <div style={{ padding:"20px 14px 16px", borderBottom:`1px solid ${A.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{
            width:32, height:32, borderRadius:R.md,
            background:`linear-gradient(135deg, ${A.blue}CC, ${A.cyan}88)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:`0 0 12px ${A.blue}30`,
          }}><Ico n="cut" size={15} color="#fff"/></div>
          <div>
            <div style={{ color:A.textPri, fontWeight:800, fontSize:13, letterSpacing:"0.04em" }}>AQUINO</div>
            {/* v8: label correto */}
            <div style={{ color:A.textMuted, fontSize:8, letterSpacing:"0.1em", textTransform:"uppercase" }}>SaaS · v9</div>
          </div>
        </div>
      </div>
      <div style={{ padding:"10px 6px", flex:1, overflowY:"auto" }}>
        {nav.map(item=>{
          const isActive=active===item.id;
          return (
            <div key={item.id} onClick={()=>setActive(item.id)}
              style={{
                display:"flex", alignItems:"center", gap:9,
                padding:"7px 10px", borderRadius:R.md, marginBottom:1,
                cursor:"pointer", position:"relative",
                background:isActive?`${A.blue}12`:"transparent",
                border:`1px solid ${isActive?A.blue+"25":"transparent"}`,
                transition:`all ${M.micro}`,
              }}
              onMouseEnter={e=>!isActive&&(e.currentTarget.style.background=A.bg3)}
              onMouseLeave={e=>!isActive&&(e.currentTarget.style.background="transparent")}
            >
              {isActive&&<span style={{
                position:"absolute", left:-6, top:"50%", transform:"translateY(-50%)",
                width:2, height:14, borderRadius:2, background:A.cyan,
                boxShadow:`0 0 6px ${A.cyan}88`,
              }}/>}
              <Ico n={item.icon} size={14} color={isActive?A.cyan:A.textMuted}/>
              <span style={{ color:isActive?A.textPri:A.textSec, fontSize:12, fontWeight:isActive?600:400, flex:1 }}>
                {item.label}
              </span>
              {item.badge&&(
                <span style={{
                  background:isActive?A.blue:A.bg4, color:isActive?"#fff":A.textMuted,
                  borderRadius:R.pill, padding:"1px 6px", fontSize:9, fontWeight:700,
                }}>{item.badge}</span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ padding:"12px 12px", borderTop:`1px solid ${A.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:9, marginBottom:8 }}>
          <div style={{
            width:30, height:30, borderRadius:"50%", flexShrink:0,
            background:`linear-gradient(135deg, ${A.blue}99, ${A.purple}88)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            color:"#fff", fontSize:12, fontWeight:700,
          }}>A</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:A.textPri, fontSize:11, fontWeight:600 }}>
              {perfil ? `Aquino · ${perfil}` : "Aquino Admin"}
            </div>
            <div style={{ color:A.textMuted, fontSize:9 }}>Ipatinga · MG</div>
          </div>
          <span style={{
            fontSize:7.5, fontWeight:700, letterSpacing:"0.06em", padding:"2px 5px", borderRadius:R.pill,
            background: mode==="real" ? `${A.green}1A` : `${A.amber}1A`,
            color: mode==="real" ? A.green : A.amber,
            border:`1px solid ${mode==="real"?A.green:A.amber}33`,
          }}>{mode==="real" ? "AO VIVO" : "DEMO"}</span>
        </div>
        {mode==="real" && (
          <div onClick={logout} style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:7,
            padding:"7px 10px", borderRadius:R.md, cursor:"pointer",
            background:A.bg2, border:`1px solid ${A.border}`, color:A.textSec, fontSize:11, fontWeight:600,
            transition:`all ${M.micro}`,
          }}
            onMouseEnter={e=>{ e.currentTarget.style.borderColor=A.red+"55"; e.currentTarget.style.color=A.red; }}
            onMouseLeave={e=>{ e.currentTarget.style.borderColor=A.border; e.currentTarget.style.color=A.textSec; }}
          >
            <Ico n="logout" size={13} color="currentColor"/> Sair
          </div>
        )}
      </div>
    </div>
  );
};

// ─── TOPBAR (v8: busca funcional + painel de notificações) ───────────────
const Topbar = ({ title, subtitle, onSearchOpen, onNotifsOpen, notifsOpen, unreadCount, mobile, onMenu }) => {
  const now = useLiveTime();
  const light = isLight();
  return (
    <div style={{
      height:54, background:A.bg1, borderBottom:`1px solid ${A.border}`,
      display:"flex", alignItems:"center", padding:`0 ${mobile?S.md:S.xxl}px`,
      justifyContent:"space-between", flexShrink:0, position:"relative", zIndex:100, gap:8,
    }}>
      <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
        {mobile && (
          <div onClick={onMenu} aria-label="Menu" style={{
            width:34, height:34, borderRadius:R.md, flexShrink:0,
            background:A.bg2, border:`1px solid ${A.border}`,
            display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
          }}><Ico n="menu" size={16} color={A.textSec}/></div>
        )}
        <div style={{minWidth:0}}>
          <div style={{ color:A.textPri, fontWeight:700, fontSize:14, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{title}</div>
          {subtitle&&<div className={mobile?"aq-hide-mobile":undefined} style={{ color:A.textMuted, fontSize:10, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{subtitle}</div>}
        </div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:S.sm }}>
        {/* Relógio ao vivo (oculto no celular) */}
        {!mobile && (
          <div style={{
            display:"flex", alignItems:"center", gap:6,
            padding:"5px 10px", borderRadius:R.md,
            background:A.bg2, border:`1px solid ${A.border}`,
          }}>
            <span style={{ color:A.textMuted, fontSize:10, fontFamily:SHARED.fontMono }}>{formatTimeBR(now)}</span>
          </div>
        )}
        {/* busca funcional (oculta no celular) */}
        {!mobile && (
          <div onClick={onSearchOpen} style={{
            display:"flex", alignItems:"center", gap:7,
            background:A.bg2, border:`1px solid ${A.border}`,
            borderRadius:R.md, padding:"7px 12px", cursor:"pointer", minWidth:190,
            transition:`border-color ${M.micro}`,
          }}
            onMouseEnter={e=>e.currentTarget.style.borderColor=A.borderHi}
            onMouseLeave={e=>e.currentTarget.style.borderColor=A.border}
          >
            <Ico n="search" size={12} color={A.textMuted}/>
            <span style={{ color:A.textMuted, fontSize:11, flex:1 }}>Buscar…</span>
            <span style={{ color:A.textMuted, fontSize:9, background:A.bg3, borderRadius:3, padding:"1px 5px", fontFamily:SHARED.fontMono }}>⌘K</span>
          </div>
        )}
        {/* botão de tema claro/escuro */}
        <div onClick={toggleTheme} aria-label="Alternar tema" title="Tema claro / escuro" style={{
          width:34, height:34, borderRadius:R.md, flexShrink:0,
          background:A.bg2, border:`1px solid ${A.border}`,
          display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
          transition:`all ${M.micro}`,
        }}
          onMouseEnter={e=>e.currentTarget.style.borderColor=A.borderHi}
          onMouseLeave={e=>e.currentTarget.style.borderColor=A.border}
        >
          <span style={{fontSize:15,lineHeight:1}}>{light?"☾":"☀"}</span>
        </div>
        {/* sino com dropdown de notificações */}
        <div style={{ position:"relative" }}>
          <div onClick={onNotifsOpen} style={{
            width:34, height:34, borderRadius:R.md,
            background:notifsOpen?A.bg3:A.bg2,
            border:`1px solid ${notifsOpen?A.borderHi:A.border}`,
            display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer",
            transition:`all ${M.micro}`,
          }}><Ico n="bell" size={14} color={unreadCount>0?A.red:A.textSec}/></div>
          {unreadCount>0&&(
            <div style={{ position:"absolute", top:-3, right:-3, minWidth:16, height:16, borderRadius:R.pill,
              background:A.red, border:`1.5px solid ${A.bg1}`, display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:8, color:"#fff", fontWeight:700, padding:"0 3px" }}>
              {unreadCount}
            </div>
          )}
        </div>
        {!mobile && <Btn variant="primary" size="md"><Ico n="plus" size={12} color="#fff"/>Agendar</Btn>}
      </div>
    </div>
  );
};


// ─── AGENDA DO DIA ────────────────────────────────────────────────────────
const AgendaDia = () => {
  const toast = useToast();
  const loaded = useLoader(700);
  const [hover, setHover] = useState(null);
  const cfg = {
    realizado: {color:A.green, label:"Realizado"},
    confirmado:{color:A.cyan,  label:"Confirmado"},
    aguardando:{color:A.amber, label:"Aguardando"},
    intervalo: {color:A.textMuted, label:"Intervalo"},
    risco:     {color:A.red,   label:"Risco"},
    fila:      {color:A.purple,label:"Fila"},
    vago:      {color:A.bg4,   label:"Vago"},
  };
  const ags = DB.agenda || [];
  const totalH = ags.length;
  const confirmadosH = ags.filter(s=>["confirmado","realizado"].includes(s.status)).length;
  const riscosH = ags.filter(s=>s.status==="risco").length;
  return (
    <Card>
      <SectionHead title="Agenda · Hoje" sub={`${totalH} horário${totalH===1?"":"s"} · ${confirmadosH} confirmado${confirmadosH===1?"":"s"}`}
        action={loaded?<div style={{display:"flex",gap:5}}>
          <Badge color={A.green} dot>{confirmadosH} ok</Badge>
          {riscosH>0 && <Badge color={A.red} dot>{riscosH} risco</Badge>}
        </div>:null}
      />
      {!loaded?(
        <div style={{display:"flex",flexDirection:"column",gap:2}}>
          {Array(7).fill(0).map((_,i)=>(
            <div key={i} style={{display:"flex",gap:10,padding:"9px 0",alignItems:"center"}}>
              <Skeleton w={36} h={11}/>
              <Skeleton w={3} h={28} r={2}/>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
                <Skeleton h={11} w="55%"/>
                <Skeleton h={9} w="40%"/>
              </div>
              <Skeleton h={20} w={70} r={R.sm}/>
            </div>
          ))}
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:1,animation:`fadeUp ${M.base}`}}>
          {DB.agenda.map((s,i)=>{
            const st=cfg[s.status]||cfg.vago;
            const isRisco=s.status==="risco";
            const isVago=s.status==="vago";
            const cliente=s.clienteId?DB.clientes.find(c=>c.id===s.clienteId):null;
            return (
              <div key={i}
                onMouseEnter={()=>setHover(i)}
                onMouseLeave={()=>setHover(null)}
                style={{
                  display:"flex", alignItems:"center", gap:10,
                  padding:"9px 10px", borderRadius:R.md, cursor:"pointer",
                  background:isRisco?`${A.red}09`:hover===i?A.bg3:"transparent",
                  border:`1px solid ${isRisco?A.red+"20":"transparent"}`,
                  transition:`all ${M.micro}`,
                  transform:hover===i&&!isRisco?"translateX(2px)":"translateX(0)",
                }}>
                <div style={{color:A.textMuted,fontSize:10.5,fontFamily:SHARED.fontMono,width:36,flexShrink:0}}>{s.hora}</div>
                <div style={{width:2.5,height:28,borderRadius:2,background:st.color,flexShrink:0,
                  boxShadow:isRisco?`0 0 8px ${A.red}66`:"none"}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:isVago?A.textMuted:A.textPri,fontSize:12,fontWeight:isVago?400:600,
                    whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.nome}</div>
                  <div style={{color:A.textSec,fontSize:10}}>{s.servico}</div>
                  {s.obs&&<div style={{color:A.textMuted,fontSize:9.5,fontStyle:"italic",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Obs: {s.obs}</div>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  {cliente&&<ScoreDot score={cliente.score}/>}
                  <Badge color={st.color}>{st.label}</Badge>
                </div>
              </div>
            );
          })}
          {DB.agenda.some(s=>s.status==="risco")&&(()=>{
            const rs=DB.agenda.find(s=>s.status==="risco");
            const rc=rs?.clienteId?DB.clientes.find(c=>c.id===rs.clienteId):null;
            if (!rc) return null;
            return (
              <div style={{
                marginTop:S.md, position:"relative", overflow:"hidden",
                background:`${A.amber}08`, border:`1px solid ${A.amber}20`,
                borderRadius:R.md, padding:"10px 13px",
                display:"flex", alignItems:"center", gap:10,
                animation:`fadeUp ${M.base} 0.2s both`,
              }}>
                <div style={{
                  position:"absolute", left:0, top:0, bottom:0,
                  width:3, background:A.amber, borderRadius:`${R.md}px 0 0 ${R.md}px`,
                }}/>
                <div style={{marginLeft:6, display:"flex", alignItems:"center", gap:10, flex:1, minWidth:0}}>
                  <Ico n="warning" size={13} color={A.amber}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:A.textPri,fontSize:10.5,fontWeight:600}}>
                      {rc.nome} — {rc.cancelamentos}× cancelamentos · Ativar sinal parcial?
                    </div>
                    <div style={{color:A.textMuted,fontSize:9,marginTop:2}}>
                      Score {rc.score} · {rc.diasSemVisitar}d sem visitar · {rs.hora}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5,flexShrink:0}}>
                    <Btn variant="ghost" size="sm">Ignorar</Btn>
                    <Btn variant="amber" size="sm" onClick={()=>toast(`Sinal enviado para ${rc.nome} · WhatsApp`, A.amber, "phone")}>Ativar sinal</Btn>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </Card>
  );
};

// ─── CLIENTES EM RISCO ────────────────────────────────────────────────────
const ClientesRisco = () => {
  const loaded = useLoader(900);
  const clientes = DB.clientes.filter(c=>BE.shouldFlagRisk(c)).slice(0,3);
  return (
    <Card>
      <SectionHead title="Clientes em Risco" action={loaded?<Badge color={A.amber} dot>3 alertas</Badge>:null}/>
      {!loaded?(
        <div style={{display:"flex",flexDirection:"column",gap:S.md}}>
          {[1,2,3].map(i=>(
            <div key={i} style={{display:"flex",gap:S.md,alignItems:"center"}}>
              <Skeleton w={32} h={32} r={R.md}/>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
                <Skeleton h={11} w="50%"/><Skeleton h={9} w="70%"/>
              </div>
              <Skeleton h={18} w={32} r="50%"/>
            </div>
          ))}
        </div>
      ):(
        clientes.map((c,i)=>(
          <div key={i} style={{
            display:"flex",alignItems:"center",gap:10,
            padding:"11px 0",
            borderBottom:i<clientes.length-1?`1px solid ${A.border}`:"none",
            animation:`fadeUp ${M.base} ${i*60}ms both`,
          }}>
            <Avatar nome={c.nome} size={32} color={A.red}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:A.textPri,fontSize:12,fontWeight:600}}>{c.nome}</div>
              <div style={{color:A.textSec,fontSize:10}}>
                {c.diasSemVisitar}d sem visitar · {c.visitas} visitas · {c.cancelamentos} cancel.
              </div>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
              <ScoreDot score={c.score}/>
              <Badge color={A.amber}>{BE.prioridade(c.score).label}</Badge>
            </div>
          </div>
        ))
      )}
    </Card>
  );
};

// ─── WAITLIST HOME ────────────────────────────────────────────────────────
const WaitlistHome = () => {
  const loaded = useLoader(1000);
  return (
    <Card>
      <SectionHead title="Fila de Espera" action={loaded?<Badge color={A.purple} dot>5 aguardando</Badge>:null}/>
      {!loaded?(
        <div style={{display:"flex",flexDirection:"column",gap:S.md}}>
          <Skeleton h={36} r={R.md}/>
          {[1,2,3].map(i=>(
            <div key={i} style={{display:"flex",gap:S.md,padding:"8px 0",alignItems:"center"}}>
              <Skeleton w={14} h={14} r="50%"/>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:4}}>
                <Skeleton h={11} w="55%"/><Skeleton h={9} w="40%"/>
              </div>
            </div>
          ))}
        </div>
      ):(
        <div style={{animation:`fadeUp ${M.base}`}}>
          <div style={{
            background:`${A.purple}0A`, border:`1px solid ${A.purple}20`,
            borderRadius:R.md, padding:"8px 11px", marginBottom:S.md,
            color:A.purple, fontSize:10, display:"flex", alignItems:"center", gap:7,
          }}>
            <Ico n="spark" size={11} color={A.purple}/>
            Cancelamento detectado → waitlist ativada automaticamente
          </div>
          {DB.waitlist.slice(0,3).map((f,i)=>{
            const nc=DB.clientes.find(c=>c.id===f.clienteId);
            return (
              <div key={i} style={{
                display:"flex",alignItems:"center",gap:10,
                padding:"10px 0",
                borderBottom:i<2?`1px solid ${A.border}`:"none",
                animation:`fadeUp ${M.base} ${i*60}ms both`,
              }}>
                <div style={{color:A.textMuted,fontSize:10,fontWeight:800,width:14}}>{i+1}</div>
                <Avatar nome={f.nome} size={28} color={NIVEL_COLOR[nc?.nivel]??A.textSec}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:A.textPri,fontSize:11,fontWeight:600}}>{f.nome}</div>
                  <div style={{color:A.textSec,fontSize:9}}>{f.horario} · {f.servico}</div>
                </div>
                {f.ttl&&<Badge color={A.amber}>{f.ttl}m</Badge>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

// ─── RETENCAO CHART ───────────────────────────────────────────────────────
const RetencaoChart = () => {
  const loaded = useLoader(800);
  return (
    <Card>
      <SectionHead title="Retenção" sub="Últimos 7 dias"/>
      {!loaded?<Skeleton h={80}/>:(
        <div style={{animation:`fadeUp ${M.base}`}}>
          <div style={{display:"flex",gap:10,marginBottom:S.md}}>
            <Donut pct={72} color={A.cyan} label="Recorrência"/>
            <Donut pct={87} color={A.green} label="Presença"/>
            <Donut pct={81} color={A.purple} label="Meta"/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:S.xs}}>
            {[{l:"Recorrência",v:72,c:A.cyan},{l:"Presença",v:87,c:A.green},{l:"Meta mensal",v:81,c:A.purple}].map((r,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:A.textSec,fontSize:9,width:70,flexShrink:0}}>{r.l}</span>
                <div style={{flex:1}}><MiniBar pct={r.v} color={r.c} delay={`${i*100}ms`}/></div>
                <span style={{color:r.c,fontSize:9,fontFamily:SHARED.fontMono,width:26,textAlign:"right"}}>{r.v}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

// ─── SCORE DISTRIB ────────────────────────────────────────────────────────
const ScoreDistrib = () => {
  const loaded = useLoader(1100);
  const dist = [0,0,0,0,0,0,0,0,0,0,0];
  DB.clientes.forEach(c=>{ dist[c.score]=(dist[c.score]||0)+1; });
  const max = Math.max(...dist);
  return (
    <Card>
      <SectionHead title="Distribuição de Score" sub="Motor comportamental v2"/>
      {!loaded?<Skeleton h={60}/>:(
        <div style={{animation:`fadeUp ${M.base}`,display:"flex",alignItems:"flex-end",gap:4,height:60}}>
          {dist.map((v,i)=>{
            const pr=BE.prioridade(i);
            return (
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                <div style={{
                  width:"100%",background:v>0?`${pr.color}30`:"transparent",
                  borderRadius:`${R.sm}px ${R.sm}px 0 0`,
                  height:v>0?Math.max(6,(v/max)*44):0,
                  border:v>0?`1px solid ${pr.color}40`:"none",
                  transition:`height 500ms ${M.curve} ${i*40}ms`,
                }}/>
                <span style={{color:A.textMuted,fontSize:7,fontFamily:SHARED.fontMono}}>{i}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

// ─── MÉTRICAS REAIS · gráficos do dashboard (SEÇÃO 41) ─────────────────────
// Consome o endpoint `metricas` do GAS (faturamento/dia, receita por serviço,
// DRE e funil de comparecimento). Sem backend/chave → série demo coerente, no
// mesmo estilo SVG da casa (sem dependências externas tipo Recharts).
// (adminKeyStore agora é definido no topo, junto da infra de dados ao vivo.)

function serieDemoMetricas(dias = 30) {
  const hoje = new Date();
  const serie = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje); d.setDate(d.getDate() - i);
    const dow = d.getDay();
    const base = dow === 0 ? 120 : dow === 6 ? 720 : 380 + (dow * 40);
    const ruido = Math.round((Math.sin(i * 1.7) + 1) * 90);
    const fat = Math.max(0, base + ruido);
    const ag = Math.round(fat / 64);
    serie.push({ dataBR: `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`,
      faturamento: fat, agendamentos: ag, comparecimentos: Math.round(ag*0.86), faltas: Math.round(ag*0.1), cancelamentos: Math.round(ag*0.04) });
  }
  const receitaServico = [
    { servico:"Corte + Barba", receita: 4180, qtd: 64 },
    { servico:"Corte", receita: 2925, qtd: 65 },
    { servico:"Combo VIP", receita: 1980, qtd: 22 },
    { servico:"Barba", receita: 870, qtd: 29 },
    { servico:"Sobrancelha", receita: 360, qtd: 18 },
  ];
  const receita = serie.reduce((s,d)=>s+d.faturamento,0);
  const atend = serie.reduce((s,d)=>s+d.comparecimentos,0);
  const faltas = serie.reduce((s,d)=>s+d.faltas,0);
  const cancel = serie.reduce((s,d)=>s+d.cancelamentos,0);
  return { serie, receitaServico,
    dre: { receita, ticketMedio: atend?Math.round(receita/atend):0, atendimentos:atend, entradasFinanceiro:receita, saidasFinanceiro:Math.round(receita*0.38), resultado:Math.round(receita*0.62) },
    funil: { agendados:atend+faltas+cancel, comparecimentos:atend, faltas, cancelamentos:cancel,
      taxaComparecimento: (atend+faltas)?Math.round(atend/(atend+faltas)*100):0, taxaNoShow:(atend+faltas)?Math.round(faltas/(atend+faltas)*100):0 } };
}

// gráfico de linha em SVG (área + linha + grid), responsivo via viewBox
const LineChartSVG = ({ serie, color=A.cyan, height=150, fmt=(v)=>v }) => {
  const w = 560, h = height, padL = 8, padR = 8, padT = 12, padB = 22;
  const vals = serie.map(d=>d.faturamento);
  const max = Math.max(...vals, 1), min = 0, range = max - min || 1;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const x = (i) => padL + (serie.length<=1?0:(i/(serie.length-1))*innerW);
  const y = (v) => padT + innerH - ((v-min)/range)*innerH;
  const pts = serie.map((d,i)=>`${x(i)},${y(d.faturamento)}`).join(" ");
  const gid = "lc_"+color.replace(/\W/g,"");
  const step = Math.max(1, Math.floor(serie.length/7));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{display:"block",overflow:"visible"}}>
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity="0.24"/><stop offset="100%" stopColor={color} stopOpacity="0"/>
      </linearGradient></defs>
      {[0,0.5,1].map((g,i)=>(<g key={i}>
        <line x1={padL} x2={w-padR} y1={padT+innerH*g} y2={padT+innerH*g} stroke={A.border} strokeWidth="1"/>
        <text x={padL} y={padT+innerH*g-3} fill={A.textMuted} fontSize="8" fontFamily={SHARED.fontMono}>{fmt(Math.round(max*(1-g)))}</text>
      </g>))}
      <polygon points={`${x(0)},${padT+innerH} ${pts} ${x(serie.length-1)},${padT+innerH}`} fill={`url(#${gid})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {serie.map((d,i)=> i%step===0 ? (
        <text key={i} x={x(i)} y={h-6} fill={A.textMuted} fontSize="8" fontFamily={SHARED.fontMono} textAnchor="middle">{d.dataBR}</text>
      ) : null)}
    </svg>
  );
};

const MetricasReais = () => {
  const [dias, setDias] = useState(30);
  const [dados, setDados] = useState(null);
  const [real, setReal] = useState(false);
  const [loading, setLoading] = useState(true);
  const adminKey = useStore(adminKeyStore);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    (async () => {
      if (ENV.hasBackend && adminKey) {
        try {
          const r = await api.metricas(adminKey, dias);
          if (vivo && r && r.success && Array.isArray(r.serie)) { setDados(r); setReal(true); setLoading(false); return; }
        } catch (e) { /* cai p/ demo */ }
      }
      if (vivo) { setDados(serieDemoMetricas(dias)); setReal(false); setLoading(false); }
    })();
    return () => { vivo = false; };
  }, [dias, adminKey]);

  if (loading || !dados) return <Card><SectionHead title="Métricas do negócio" sub="Carregando…"/><Skeleton h={150}/></Card>;
  const { serie, receitaServico, dre, funil } = dados;
  const maxServ = Math.max(...receitaServico.map(s=>s.receita), 1);
  const brl = (v)=>"R$ "+Number(v||0).toLocaleString("pt-BR");

  return (
    <div style={{display:"flex",flexDirection:"column",gap:S.md}}>
      <Card>
        <SectionHead title="Faturamento por dia" sub={`Últimos ${dias} dias · ${real?"dados reais":"demonstração"}`}
          action={
            <div style={{display:"flex",gap:4}}>
              {[7,30,90].map(d=>(
                <button key={d} onClick={()=>setDias(d)} style={{
                  background:dias===d?`${A.cyan}1A`:A.bg3, color:dias===d?A.cyan:A.textSec,
                  border:`1px solid ${dias===d?A.cyan+"40":A.border}`, borderRadius:R.sm,
                  padding:"3px 8px", fontSize:10, fontFamily:SHARED.fontMono, cursor:"pointer" }}>{d}d</button>
              ))}
            </div>
          }/>
        <LineChartSVG serie={serie} color={A.cyan} fmt={(v)=>v>=1000?(v/1000).toFixed(1)+"k":v}/>
      </Card>

      <div style={{display:"flex",gap:S.md,flexWrap:"wrap"}}>
        <Card style={{flex:"1 1 280px"}}>
          <SectionHead title="Receita por serviço" sub="Período selecionado"/>
          <div style={{display:"flex",flexDirection:"column",gap:S.sm}}>
            {receitaServico.slice(0,6).map((s,i)=>{
              const cor = [A.cyan,A.green,A.purple,A.blue,A.amber,A.red][i%6];
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:A.textSec,fontSize:10,width:96,flexShrink:0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.servico}</span>
                  <div style={{flex:1}}><MiniBar pct={Math.round(s.receita/maxServ*100)} color={cor} delay={`${i*80}ms`}/></div>
                  <span style={{color:cor,fontSize:10,fontFamily:SHARED.fontMono,width:64,textAlign:"right"}}>{brl(s.receita)}</span>
                </div>
              );
            })}
          </div>
        </Card>

        <Card style={{flex:"1 1 240px"}}>
          <SectionHead title="DRE do período" sub="Resultado simplificado"/>
          <div style={{display:"flex",flexDirection:"column",gap:S.sm}}>
            {[
              {l:"Receita de serviços",v:brl(dre.receita),c:A.green},
              {l:"Entradas (financeiro)",v:brl(dre.entradasFinanceiro),c:A.cyan},
              {l:"Saídas (financeiro)",v:brl(dre.saidasFinanceiro),c:A.red},
              {l:"Resultado",v:brl(dre.resultado),c:dre.resultado>=0?A.green:A.red},
              {l:"Ticket médio",v:brl(dre.ticketMedio),c:A.purple},
              {l:"Atendimentos",v:String(dre.atendimentos),c:A.textPri},
            ].map((r,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                paddingBottom:S.sm,borderBottom:i<5?`1px solid ${A.border}`:"none"}}>
                <span style={{color:A.textSec,fontSize:11}}>{r.l}</span>
                <span style={{color:r.c,fontSize:12,fontWeight:700,fontFamily:SHARED.fontMono}}>{r.v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <SectionHead title="Funil de comparecimento" sub="Observabilidade de negócio"/>
        <div style={{display:"flex",gap:S.md,alignItems:"center",flexWrap:"wrap"}}>
          <Donut pct={funil.taxaComparecimento} color={A.green} label="Comparecimento"/>
          <Donut pct={funil.taxaNoShow} color={A.red} label="No-show"/>
          <div style={{flex:1,minWidth:180,display:"flex",flexDirection:"column",gap:S.xs}}>
            {[
              {l:"Agendados",v:funil.agendados,c:A.cyan},
              {l:"Compareceram",v:funil.comparecimentos,c:A.green},
              {l:"Faltaram",v:funil.faltas,c:A.amber},
              {l:"Cancelaram",v:funil.cancelamentos,c:A.red},
            ].map((r,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:A.textSec,fontSize:10,width:96}}>{r.l}</span>
                <div style={{flex:1}}><MiniBar pct={funil.agendados?Math.round(r.v/funil.agendados*100):0} color={r.c} delay={`${i*80}ms`}/></div>
                <span style={{color:r.c,fontSize:10,fontFamily:SHARED.fontMono,width:34,textAlign:"right"}}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
};

// ─── FINANCEIRO PAGE (v7: gráfico de barras interativo com tooltip) ────────
const FinanceiroPage = () => {
  const { semana, mes, servicos } = DB.financeiro;
  const max = Math.max(...semana.valores);
  const [hoverBar, setHoverBar] = useState(null);

  return (
    <div style={{display:"flex",flexDirection:"column",gap:S.lg}}>
      <div style={{display:"flex",gap:S.md}}>
        {[
          {l:"Faturado hoje",v:"R$ 487",sub:"Meta R$ 600",c:A.blue,prog:81},
          {l:"Faturado no mês",v:"R$ 11.420",sub:"Meta R$ 14.000",c:A.green,prog:81.6},
          {l:"Ticket médio",v:`R$ ${mes.ticket}`,sub:"Por atendimento",c:A.cyan,prog:null},
          {l:"Recorrência",v:`${mes.recorrencia}%`,sub:"Clientes que voltaram",c:A.purple,prog:null},
        ].map((st,i)=>(
          <Card key={i} style={{flex:1}}>
            <div style={{color:A.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{st.l}</div>
            <div style={{color:st.c,fontSize:20,fontWeight:800,fontFamily:SHARED.fontMono,marginBottom:4}}>{st.v}</div>
            <div style={{color:A.textSec,fontSize:9,marginBottom:st.prog?6:0}}>{st.sub}</div>
            {st.prog&&<MiniBar pct={st.prog} color={st.c}/>}
          </Card>
        ))}
      </div>

      {/* v7: gráfico de barras interativo com hover + tooltip */}
      <Card>
        <SectionHead title="Faturamento — Semana" sub="Seg–Sáb · Valores em R$"/>
        <div style={{display:"flex",alignItems:"flex-end",gap:8,height:120,position:"relative"}}>
          {semana.dias.map((d,i)=>{
            const v=semana.valores[i];
            const pct=(v/max)*100;
            const isToday=i===5;
            const isHover=hoverBar===i;
            return (
              <div key={d}
                onMouseEnter={()=>setHoverBar(i)}
                onMouseLeave={()=>setHoverBar(null)}
                style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:5,cursor:"default",position:"relative"}}
              >
                {/* Tooltip */}
                {isHover&&(
                  <div style={{
                    position:"absolute",bottom:"100%",left:"50%",transform:"translateX(-50%)",
                    background:A.bg4, border:`1px solid ${A.borderHi}`,
                    borderRadius:R.md, padding:"5px 9px", marginBottom:6,
                    zIndex:10, whiteSpace:"nowrap",
                    boxShadow:"0 4px 12px #00000066",
                    animation:`fadeUp 120ms both`,
                  }}>
                    <div style={{color:A.textPri,fontSize:11,fontWeight:700,fontFamily:SHARED.fontMono}}>R$ {v}</div>
                    <div style={{color:A.textMuted,fontSize:9,textAlign:"center"}}>{d}</div>
                  </div>
                )}
                <div style={{
                  width:"100%",
                  height:`${pct}%`,
                  minHeight:4,
                  background:isToday
                    ? `linear-gradient(to top, ${A.blue}, ${A.cyan})`
                    : isHover
                      ? `${A.blue}88`
                      : `${A.blue}30`,
                  border:`1px solid ${isToday?A.blue:isHover?A.blue+"60":A.blue+"20"}`,
                  borderRadius:`${R.sm}px ${R.sm}px 0 0`,
                  transition:`all ${M.micro}`,
                  boxShadow:isToday?`0 0 10px ${A.blue}44`:"none",
                }}/>
                <span style={{
                  color:isToday?A.cyan:isHover?A.textSec:A.textMuted,
                  fontSize:9,fontFamily:SHARED.fontMono,fontWeight:isToday?700:400,
                }}>{d}</span>
              </div>
            );
          })}
        </div>
      </Card>

      <div style={{display:"flex",gap:S.md}}>
        <Card style={{flex:1}}>
          <SectionHead title="Mix de Serviços" sub="Maio 2026 · Receita por categoria"/>
          {servicos.map((sv,i)=>(
            <div key={i} style={{marginBottom:S.md}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{color:A.textPri,fontSize:11,fontWeight:600}}>{sv.nome}</span>
                <div style={{display:"flex",gap:S.sm,alignItems:"center"}}>
                  <span style={{color:A.textSec,fontSize:10}}>{sv.qtd}x</span>
                  <span style={{color:A.green,fontSize:11,fontFamily:SHARED.fontMono}}>R$ {sv.valor}</span>
                </div>
              </div>
              <MiniBar pct={sv.pct} color={[A.blue,A.cyan,A.purple,A.amber][i]} delay={`${i*80}ms`}/>
            </div>
          ))}
        </Card>
        <Card style={{flex:1}}>
          <SectionHead title="Metas — Maio" sub="Progresso em tempo real"/>
          {[
            {l:"Faturamento",atual:11420,meta:14000,c:A.blue},
            {l:"Atendimentos",atual:218,meta:260,c:A.cyan},
            {l:"Novos clientes",atual:14,meta:20,c:A.green},
          ].map((g,i)=>{
            const pct=Math.round((g.atual/g.meta)*100);
            return (
              <div key={i} style={{marginBottom:S.md}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{color:A.textSec,fontSize:10}}>{g.l}</span>
                  <span style={{color:g.c,fontSize:10,fontFamily:SHARED.fontMono}}>{pct}%</span>
                </div>
                <MiniBar pct={pct} color={g.c} delay={`${i*100}ms`}/>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
                  <span style={{color:A.textMuted,fontSize:8.5}}>{g.atual.toLocaleString("pt-BR")}</span>
                  <span style={{color:A.textMuted,fontSize:8.5}}>meta {g.meta.toLocaleString("pt-BR")}</span>
                </div>
              </div>
            );
          })}
        </Card>
      </div>
    </div>
  );
};

// ─── AGENDA PAGE ──────────────────────────────────────────────────────────
const AgendaPage = () => {
  const toast = useToast();
  const [view, setView] = useState("dia");
  const [agendaState, setAgendaState] = useState(DB.agenda);
  const [sinaisAtivos, setSinaisAtivos] = useState({});

  const cfg = {
    realizado: {color:A.green,label:"Realizado"},
    confirmado:{color:A.cyan,label:"Confirmado"},
    aguardando:{color:A.amber,label:"Aguardando"},
    intervalo: {color:A.textMuted,label:"Intervalo"},
    risco:     {color:A.red,label:"Risco"},
    cancelado: {color:A.textMuted,label:"Cancelado"},
    vago:      {color:A.bg4,label:"Vago"},
  };
  const diasSemana = ["Seg","Ter","Qua","Qui","Sex","Sáb"];

  const handleReagendar = (s) => {
    toast(`${s.nome} movido para a fila de reagendamento`, A.cyan, "calendar");
  };
  const handleCancelar = (s) => {
    setAgendaState(prev=>prev.map(x=>x.id===s.id?{...x,status:"cancelado"}:x));
    toast(`${s.nome} — horário ${s.hora} cancelado. Waitlist notificada.`, A.amber, "warning");
  };
  const handleSinal = (s, cliente) => {
    setSinaisAtivos(prev=>({...prev,[s.id]:true}));
    toast(`Sinal enviado para ${cliente?.nome ?? s.nome} · WhatsApp`, A.purple, "phone");
  };

  return (
    <div className="aq-row-stack" style={{display:"flex",gap:S.md}}>
      <div style={{flex:1}}>
        <Card pad={false}>
          <div style={{padding:`${S.md}px ${S.xl}px`,borderBottom:`1px solid ${A.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{color:A.textPri,fontWeight:700,fontSize:13}}>Agenda</div>
              <div style={{color:A.textMuted,fontSize:9.5}}>
                {agendaState.length} horários · {agendaState.filter(x=>["confirmado","realizado"].includes(x.status)).length} confirmados · {agendaState.filter(x=>x.status==="risco").length} risco
              </div>
            </div>
            <div style={{display:"flex",gap:4}}>
              {["dia","semana"].map(v=>(
                <Btn key={v} variant={view===v?"primary":"secondary"} size="sm" onClick={()=>setView(v)}>
                  {v.charAt(0).toUpperCase()+v.slice(1)}
                </Btn>
              ))}
              <Btn variant="secondary" size="sm"><Ico n="plus" size={11} color={A.textSec}/>Novo</Btn>
            </div>
          </div>
          {view==="dia"&&(
            <div style={{padding:`${S.sm}px ${S.md}px`}}>
              {agendaState.map((s,i)=>{
                const st=cfg[s.status]||cfg.vago;
                const isRisco=s.status==="risco";
                const isCancelado=s.status==="cancelado";
                const sinalAtivo=sinaisAtivos[s.id];
                const cliente=s.clienteId?DB.clientes.find(c=>c.id===s.clienteId):null;
                return (
                  <div key={i} style={{
                    display:"flex",alignItems:"center",gap:12,padding:"12px 10px",
                    borderBottom:i<agendaState.length-1?`1px solid ${A.border}`:"none",
                    background:isRisco?`${A.red}07`:isCancelado?`${A.textMuted}05`:"transparent",
                    borderRadius:R.md,
                    opacity:isCancelado?0.5:1,
                    transition:`all ${M.base}`,
                  }}>
                    <div style={{color:A.textMuted,fontSize:11,fontFamily:SHARED.fontMono,width:40,flexShrink:0}}>{s.hora}</div>
                    <div style={{width:3,height:36,borderRadius:2,background:st.color,flexShrink:0,
                      boxShadow:isRisco?`0 0 8px ${A.red}66`:sinalAtivo?`0 0 8px ${A.purple}66`:"none"}}/>
                    <Avatar nome={s.nome==="—"?"  ":s.nome} size={32} color={st.color}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:s.nome==="—"?A.textMuted:A.textPri,fontSize:12,fontWeight:600}}>{s.nome}</div>
                      <div style={{color:A.textSec,fontSize:10}}>{s.servico} · {s.duracao}min</div>
                      {s.obs&&<div style={{color:A.textMuted,fontSize:9.5,fontStyle:"italic",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>Obs: {s.obs}</div>}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      {cliente&&<ScoreDot score={cliente.score}/>}
                      {s.valor>0&&<span style={{color:A.green,fontSize:11,fontFamily:SHARED.fontMono}}>R$ {s.valor}</span>}
                      <Badge color={sinalAtivo?A.purple:st.color}>{sinalAtivo?"Sinal ativo":st.label}</Badge>
                    </div>
                    {!isCancelado&&s.nome!=="—"&&(
                      <div style={{display:"flex",gap:5}}>
                        <Btn variant="secondary" size="sm" onClick={()=>handleReagendar(s)}>Reagendar</Btn>
                        {isRisco&&(
                          <Btn variant={sinalAtivo?"ghost":"amber"} size="sm" onClick={()=>!sinalAtivo&&handleSinal(s,cliente)}>
                            <Ico n="phone" size={10} color={sinalAtivo?A.textMuted:A.amber}/>
                            {sinalAtivo?"Enviado":"Sinal"}
                          </Btn>
                        )}
                        <Btn variant="danger" size="sm" onClick={()=>handleCancelar(s)}>Cancelar</Btn>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {view==="semana"&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:1,background:A.border}}>
              {diasSemana.map((d,di)=>(
                <div key={d} style={{background:A.bg2,padding:`${S.md}px ${S.sm}px`}}>
                  <div style={{color:di===5?A.cyan:A.textMuted,fontSize:10,fontWeight:di===5?700:400,marginBottom:8,textAlign:"center"}}>{d}</div>
                  {DB.agenda.slice(0,di+2).map((s,si)=>{
                    const st=cfg[s.status]||cfg.vago;
                    return (
                      <div key={si} style={{background:`${st.color}12`,border:`1px solid ${st.color}25`,borderRadius:R.sm,padding:"4px 6px",marginBottom:3}}>
                        <div style={{color:A.textPri,fontSize:9,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{s.nome==="—"?"–":s.nome}</div>
                        <div style={{color:A.textMuted,fontSize:8}}>{s.hora}</div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <div style={{width:228,flexShrink:0,display:"flex",flexDirection:"column",gap:S.md}}>
        <Card>
          <SectionHead title="Waitlist" sub={`${DB.waitlist.length} aguardando`} action={<Badge color={A.purple} dot>Ativo</Badge>}/>
          {DB.waitlist.slice(0,3).map((f,i)=>{
            const nc=DB.clientes.find(c=>c.id===f.clienteId);
            return (
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:i<2?`1px solid ${A.border}`:"none"}}>
                <div style={{color:A.textMuted,fontSize:9,fontWeight:700,width:12}}>{i+1}</div>
                <div style={{flex:1}}>
                  <div style={{color:A.textPri,fontSize:11,fontWeight:600}}>{f.nome}</div>
                  <div style={{color:A.textSec,fontSize:9}}>{f.servico}</div>
                </div>
                {f.ttl&&<Badge color={A.amber}>{f.ttl}m</Badge>}
              </div>
            );
          })}
          <div style={{marginTop:10}}>
            <Btn variant="purple" size="sm" style={{width:"100%",justifyContent:"center"}}
              onClick={()=>toast("Waitlist notificada · WhatsApp disparado", A.purple, "spark")}>
              <Ico n="spark" size={10} color={A.purple}/>Disparar para waitlist
            </Btn>
          </div>
        </Card>
        <Card>
          <SectionHead title="Horários vagos" sub="Hoje"/>
          {agendaState.filter(s=>s.status==="vago"||s.status==="cancelado").map((s,i)=>(
            <div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",
              borderBottom:i<2?`1px solid ${A.border}`:"none"}}>
              <div>
                <span style={{color:A.textMuted,fontSize:11,fontFamily:SHARED.fontMono}}>{s.hora}</span>
                {s.status==="cancelado"&&<Badge color={A.textMuted} size="sm" style={{marginLeft:5}}>Liberado</Badge>}
              </div>
              <Btn variant="secondary" size="sm"
                onClick={()=>toast(`${s.hora} — aguardando confirmação do próximo da fila`, A.cyan, "calendar")}>
                Preencher
              </Btn>
            </div>
          ))}
        </Card>
      </div>
    </div>

  );
};

// ─── CLIENTES PAGE ────────────────────────────────────────────────────────
const ClientesPage = () => {
  const toast = useToast();
  const [filter, setFilter] = useState("todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const filters=[
    {id:"todos",label:"Todos",count:DB.clientes.length},
    {id:"vip",label:"VIP",count:DB.clientes.filter(c=>c.nivel==="VIP").length},
    {id:"risco",label:"Risco",count:DB.clientes.filter(c=>BE.shouldFlagRisk(c)).length},
    {id:"reativacao",label:"Reativar",count:DB.clientes.filter(c=>BE.shouldSuggestRecurrence(c)).length},
  ];
  const filtered = DB.clientes
    .filter(c=>{
      if(filter==="vip")       return c.nivel==="VIP";
      if(filter==="risco")     return BE.shouldFlagRisk(c);
      if(filter==="reativacao")return BE.shouldSuggestRecurrence(c);
      return true;
    })
    .filter(c=>!search||c.nome.toLowerCase().includes(search.toLowerCase()));
  const sel=selected?DB.clientes.find(c=>c.id===selected):null;
  return (
    <div className="aq-row-stack" style={{display:"flex",gap:S.md}}>
      <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:S.md}}>
        <div style={{display:"flex",gap:S.md}}>
          {[{label:"Ativos",v:String(DB.clientes.length),c:A.blue},{label:"VIPs",v:DB.clientes.filter(c=>c.nivel==="VIP").length,c:A.cyan},
            {label:"Em risco",v:DB.clientes.filter(c=>BE.shouldFlagRisk(c)).length,c:A.red},{label:"Ticket médio",v:"R$ 64",c:A.green}].map((st,i)=>(
            <Card key={i} style={{flex:1}}>
              <div style={{color:A.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{st.label}</div>
              <div style={{color:st.c,fontSize:20,fontWeight:800,fontFamily:SHARED.fontMono}}>{st.v}</div>
            </Card>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:S.sm}}>
          <div style={{display:"flex",gap:4}}>
            {filters.map(f=>(
              <Btn key={f.id} variant={filter===f.id?"primary":"ghost"} size="sm" onClick={()=>setFilter(f.id)}>
                {f.label} <span style={{color:filter===f.id?"rgba(255,255,255,0.5)":A.textMuted,fontSize:9}}>{f.count}</span>
              </Btn>
            ))}
          </div>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:7,background:A.bg2,border:`1px solid ${A.border}`,borderRadius:R.md,padding:"6px 11px"}}>
            <Ico n="search" size={12} color={A.textMuted}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente…"
              style={{background:"none",border:"none",outline:"none",color:A.textPri,fontSize:11,flex:1,fontFamily:SHARED.fontAdmin}}/>
          </div>
        </div>
        <Card pad={false}>
          <div style={{padding:`${S.sm}px ${S.xl}px`,borderBottom:`1px solid ${A.border}`,display:"flex",gap:12}}>
            {["Cliente","Nível","Score","Última visita","Total","Próximo",""].map((h,i)=>(
              <div key={i} style={{color:A.textMuted,fontSize:9.5,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",flex:i===0?2:1,minWidth:0}}>{h}</div>
            ))}
          </div>
          <div style={{overflowY:"auto",maxHeight:400}}>
            {filtered.map((c,i)=>(
              <div key={c.id} onClick={()=>setSelected(selected===c.id?null:c.id)}
                style={{
                  display:"flex",alignItems:"center",gap:12,padding:"11px 20px",cursor:"pointer",
                  background:selected===c.id?`${A.blue}08`:i%2===0?"transparent":A.bg1,
                  borderBottom:`1px solid ${A.border}`,transition:`background ${M.micro}`,
                }}
                onMouseEnter={e=>selected!==c.id&&(e.currentTarget.style.background=A.bg3)}
                onMouseLeave={e=>selected!==c.id&&(e.currentTarget.style.background=i%2===0?"transparent":A.bg1)}
              >
                <div style={{flex:2,display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                  <Avatar nome={c.nome} size={30} color={BE.prioridade(c.score).color}/>
                  <div style={{minWidth:0}}>
                    <div style={{color:A.textPri,fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.nome}</div>
                    <div style={{color:A.textMuted,fontSize:9}}>{c.visitas} visitas · {c.cancelamentos} cancel.</div>
                  </div>
                </div>
                <div style={{flex:1}}><Badge color={NIVEL_COLOR[c.nivel]??A.textSec}>{c.nivel}</Badge></div>
                <div style={{flex:1}}><ScoreDot score={c.score}/></div>
                <div style={{flex:1,color:A.textSec,fontSize:11}}>{c.diasSemVisitar}d atrás</div>
                <div style={{flex:1,color:A.green,fontSize:11,fontFamily:SHARED.fontMono}}>R$ {c.gasto}</div>
                <div style={{flex:1,color:c.proximo==="—"?A.textMuted:A.cyan,fontSize:11}}>{c.proximo}</div>
                <div style={{flex:1,display:"flex",gap:4}}>
                  {BE.shouldSuggestRecurrence(c)&&<Badge color={A.purple} dot>Reativar</Badge>}
                  {BE.shouldActivateSinal(c)&&<Badge color={A.red} dot>Sinal</Badge>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {sel&&(
        <div style={{width:270,flexShrink:0,display:"flex",flexDirection:"column",gap:S.md,animation:`slideIn ${M.base}`}}>
          <Card>
            <div style={{display:"flex",gap:12,marginBottom:S.md}}>
              <Avatar nome={sel.nome} size={44} color={BE.prioridade(sel.score).color}/>
              <div>
                <div style={{color:A.textPri,fontSize:14,fontWeight:700}}>{sel.nome}</div>
                <Badge color={NIVEL_COLOR[sel.nivel]??A.textSec}>{sel.nivel}</Badge>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:S.md}}>
              <Stat label="Score" value={sel.score} color={BE.prioridade(sel.score).color}/>
              <Stat label="Visitas" value={sel.visitas}/>
              <Stat label="Gasto total" value={`R$ ${sel.gasto}`} color={A.green}/>
              <Stat label="Cancelamentos" value={sel.cancelamentos} color={sel.cancelamentos>1?A.red:A.textSec}/>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:A.bg3,borderRadius:R.md,padding:"7px 11px",marginBottom:S.md}}>
              <span style={{color:A.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.06em"}}>Último lembrete</span>
              <span style={{color:sel.ultimoLembrete==="Nunca enviado"?A.amber:A.textPri,fontSize:10.5,fontWeight:600}}>{sel.ultimoLembrete}</span>
            </div>
            {BE.shouldSuggestRecurrence(sel)&&(
              <div style={{background:`${A.purple}0A`,border:`1px solid ${A.purple}20`,borderRadius:R.md,padding:"8px 10px",marginBottom:S.xs}}>
                <div style={{color:A.purple,fontSize:10.5,fontWeight:600,marginBottom:3}}>Sugerir recorrência</div>
                <div style={{color:A.textSec,fontSize:9.5}}>{sel.diasSemVisitar}d sem visitar. Score alto — ideal para reativar.</div>
                <div style={{marginTop:6,display:"flex",gap:5}}>
                  <Btn variant="secondary" size="sm" style={{flex:1,justifyContent:"center"}} onClick={()=>toast(`Sugestão de recorrência ignorada para ${sel.nome}`, A.textSec, "check")}>Ignorar</Btn>
                  <Btn size="sm" style={{flex:1,justifyContent:"center",background:`${A.purple}20`,color:A.purple,borderColor:`${A.purple}30`}} onClick={async ()=>{
                    const r = await api.enviarLembrete(sel.tel ?? null, sel.id);
                    toast(r?._demo
                      ? `Demo: proposta de recorrência simulada para ${sel.nome}`
                      : `Proposta de recorrência enviada para ${sel.nome} · WhatsApp`, A.purple, "phone");
                  }}>Enviar</Btn>
                </div>
              </div>
            )}
            {BE.shouldActivateSinal(sel)&&(
              <div style={{background:`${A.red}07`,border:`1px solid ${A.red}20`,borderRadius:R.md,padding:"8px 10px"}}>
                <div style={{color:A.red,fontSize:10.5,fontWeight:600,marginBottom:3}}>Score baixo · Sinal parcial</div>
                <div style={{color:A.textSec,fontSize:9.5}}>Histórico de risco. Confirmar antecipado?</div>
                <div style={{marginTop:6,display:"flex",gap:5}}>
                  <Btn variant="secondary" size="sm" style={{flex:1,justifyContent:"center"}} onClick={()=>toast("Sinal não solicitado", A.textSec, "check")}>Não</Btn>
                  <Btn variant="danger" size="sm" style={{flex:1,justifyContent:"center"}} onClick={async ()=>{
                    const valor = Math.round((configStore.get()?.operacao?.sinalPct ?? 30));
                    const r = await api.enviarSinal(sel.tel ?? null, sel.id, valor);
                    toast(r?._demo
                      ? `Demo: cobrança de sinal (${valor}%) simulada para ${sel.nome}`
                      : `Sinal de ${valor}% solicitado a ${sel.nome} · WhatsApp`, A.red, "phone");
                  }}>Ativar</Btn>
                </div>
              </div>
            )}
          </Card>
          <Card>
            <SectionHead title="Histórico" sub={`${sel.historico.length} últimas visitas`}
              action={<Btn variant="secondary" size="sm" onClick={()=>{
                exportCSV(`historico_${sel.nome.toLowerCase().replace(/\s+/g,"_")}.csv`,["Data","Serviço","Valor (R$)"],sel.historico.map(h=>[h.d,h.s,h.v]));
                toast(`Histórico de ${sel.nome} exportado`, A.green, "check");
              }}>CSV</Btn>}/>
            {sel.historico.map((h,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:i<sel.historico.length-1?`1px solid ${A.border}`:"none"}}>
                <div>
                  <div style={{color:A.textPri,fontSize:11,fontWeight:600}}>{h.s}</div>
                  <div style={{color:A.textMuted,fontSize:9}}>{h.d}</div>
                </div>
                <span style={{color:A.green,fontSize:11,fontFamily:SHARED.fontMono}}>R$ {h.v}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
};

// ─── CRM PAGE ─────────────────────────────────────────────────────────────
const CRMPage = () => {
  const toast = useToast();
  const [seg, setSeg] = useState("risco");
  const segmentos=[
    {id:"risco",label:"Em Risco",count:DB.clientes.filter(c=>BE.shouldFlagRisk(c)).length,color:A.red,desc:"Score < 5 ou cancelamentos recorrentes"},
    {id:"reativacao",label:"Reativar",count:DB.clientes.filter(c=>BE.shouldSuggestRecurrence(c)).length,color:A.purple,desc:"+30 dias sem visitar, score alto"},
    {id:"vip",label:"VIP",count:DB.clientes.filter(c=>c.nivel==="VIP").length,color:A.cyan,desc:"Score 8+ e 20+ visitas"},
    {id:"novos",label:"Novos",count:DB.clientes.filter(c=>c.visitas<4).length,color:A.green,desc:"Primeiras 3 visitas"},
  ];
  const getClientes=(id)=>{
    if(id==="risco")      return DB.clientes.filter(c=>BE.shouldFlagRisk(c));
    if(id==="reativacao") return DB.clientes.filter(c=>BE.shouldSuggestRecurrence(c));
    if(id==="vip")        return DB.clientes.filter(c=>c.nivel==="VIP");
    return DB.clientes.filter(c=>c.visitas<4);
  };
  const automacoes=[
    {status:"ativo",titulo:"Lembrete 24h antes",disparo:"Automático",ultima:"Hoje 08:00",enviados:7},
    {status:"ativo",titulo:"Pós-visita — NPS + reagendamento",disparo:"30min depois",ultima:"Hoje 09:45",enviados:3},
    {status:"ativo",titulo:"Reativação VIP (score 8+)",disparo:"+35 dias",ultima:"Ontem",enviados:1},
    {status:"pausado",titulo:"Sinal parcial (score < 4)",disparo:"Manhã do dia",ultima:"Quinta",enviados:2},
  ];
  return (
    <div style={{display:"flex",flexDirection:"column",gap:S.lg}}>
      <div style={{display:"flex",gap:S.md}}>
        {[{l:"Retenção",v:"87%",c:A.green,d:"+3% mês"},{l:"Reativações",v:"8",c:A.purple,d:"Este mês"},
          {l:"No-show",v:"4.2%",c:A.amber,d:"-1% mês"},{l:"Automações",v:"3",c:A.cyan,d:"1 pausada"}].map((st,i)=>(
          <Card key={i} style={{flex:1}}>
            <div style={{color:A.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{st.l}</div>
            <div style={{color:st.c,fontSize:20,fontWeight:800,fontFamily:SHARED.fontMono}}>{st.v}</div>
            <div style={{color:A.textMuted,fontSize:9,marginTop:3}}>{st.d}</div>
          </Card>
        ))}
      </div>
      <div style={{display:"flex",gap:S.md}}>
        <div style={{flex:1}}>
          <Card pad={false}>
            <div style={{padding:`${S.md}px ${S.xl}px`,borderBottom:`1px solid ${A.border}`}}>
              <div style={{color:A.textPri,fontWeight:700,fontSize:13}}>Segmentação Inteligente</div>
              <div style={{color:A.textMuted,fontSize:10,marginTop:2}}>Classificação automática por comportamento · Motor ativo</div>
            </div>
            <div style={{display:"flex",borderBottom:`1px solid ${A.border}`}}>
              {segmentos.map(s=>(
                <div key={s.id} onClick={()=>setSeg(s.id)} style={{flex:1,padding:"10px 12px",cursor:"pointer",textAlign:"center",
                  borderBottom:`2px solid ${seg===s.id?s.color:"transparent"}`,
                  background:seg===s.id?`${s.color}07`:"transparent",transition:`all ${M.micro}`}}>
                  <div style={{color:seg===s.id?s.color:A.textSec,fontSize:11,fontWeight:seg===s.id?700:400}}>{s.label}</div>
                  <div style={{color:seg===s.id?s.color:A.textMuted,fontSize:18,fontWeight:800,fontFamily:SHARED.fontMono}}>{s.count}</div>
                </div>
              ))}
            </div>
            <div style={{padding:`${S.sm}px ${S.xl}px`}}>
              <div style={{color:A.textMuted,fontSize:10,marginBottom:S.sm}}>{segmentos.find(s=>s.id===seg)?.desc}</div>
              {getClientes(seg).map((c,i)=>{
                const pr=BE.prioridade(c.score);
                return (
                  <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<getClientes(seg).length-1?`1px solid ${A.border}`:"none"}}>
                    <Avatar nome={c.nome} size={32} color={pr.color}/>
                    <div style={{flex:1}}>
                      <div style={{color:A.textPri,fontSize:12,fontWeight:600}}>{c.nome}</div>
                      <div style={{color:A.textSec,fontSize:10}}>{c.visitas} visitas · {c.diasSemVisitar}d sem visitar</div>
                    </div>
                    <ScoreDot score={c.score}/>
                    <Btn variant="secondary" size="sm" onClick={()=>{
                      const msgs={risco:`Sinal enviado para ${c.nome}`,reativacao:`Proposta de recorrência enviada para ${c.nome}`,vip:`Oferta VIP enviada para ${c.nome}`,novos:`Boas-vindas enviado para ${c.nome}`};
                      toast(msgs[seg]||`Ação enviada para ${c.nome}`, seg==="risco"?A.red:seg==="vip"?A.cyan:A.purple,"spark");
                    }}>Ação</Btn>
                  </div>
                );
              })}
              {getClientes(seg).length===0&&<div style={{color:A.textMuted,fontSize:11,padding:"12px 0",textAlign:"center"}}>Nenhum cliente neste segmento.</div>}
            </div>
          </Card>
        </div>
        <div style={{width:310,flexShrink:0}}>
          <Card>
            <SectionHead title="Automações" sub="Motor comportamental" action={<Btn variant="secondary" size="sm">+ Nova</Btn>}/>
            <div style={{display:"flex",flexDirection:"column",gap:S.sm}}>
              {automacoes.map((a,i)=>(
                <div key={i} style={{background:A.bg3,border:`1px solid ${a.status==="ativo"?A.green+"20":A.border}`,borderRadius:R.md,padding:"10px 12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
                    <div style={{color:A.textPri,fontSize:11,fontWeight:600,flex:1,marginRight:8}}>{a.titulo}</div>
                    <Badge color={a.status==="ativo"?A.green:A.amber} dot>{a.status==="ativo"?"Ativo":"Pausado"}</Badge>
                  </div>
                  <div style={{color:A.textMuted,fontSize:9}}>Disparo: {a.disparo} · Última: {a.ultima} · {a.enviados} enviados</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

// ─── LOYALTY PAGE ─────────────────────────────────────────────────────────
const LoyaltyPage = () => {
  const toast = useToast();
  useStore(configStore);                    // re-renderiza quando a config muda
  const [aba, setAba] = useState("niveis");
  const fid = getFidelidade();              // fonte única (mesma do cliente)

  // atalho para salvar a fidelidade no store persistente (cai no cliente na hora)
  const setFid = (patch) => configStore.set(c => ({ ...c, fidelidade: { ...getFidelidade(), ...patch } }));

  const niveisConfig = fid.niveis;
  const recompensas  = fid.recompensas;
  const [editNivel, setEditNivel] = useState(null);
  const [editRecomp, setEditRecomp] = useState(null);
  const topClientes = DB.clientes.slice().sort((a,b)=>b.gasto-a.gasto).slice(0,5);

  // liga/desliga o programa inteiro (oculta tudo do cliente)
  const togglePrograma = () => {
    setFid({ ativo: !fid.ativo });
    toast(fid.ativo ? "Fidelidade DESATIVADA (oculta do cliente)" : "Fidelidade ATIVADA (visível ao cliente)", fid.ativo ? A.amber : A.green, fid.ativo ? "lock" : "check");
  };
  const toggleRebaixamento = () => {
    setFid({ rebaixamentoAtivo: !fid.rebaixamentoAtivo });
    toast(fid.rebaixamentoAtivo ? "Rebaixamento por falta desligado" : "Rebaixamento por falta ligado", A.cyan, "check");
  };

  const salvarNivel = (idx, campo, valor) => {
    const niveis = niveisConfig.map((n,i) => i===idx ? { ...n, [campo]: campo==="min" ? Number(valor) : valor } : n);
    setFid({ niveis });
  };
  const salvarBeneficios = (idx, textoLinhas) => {
    const arr = String(textoLinhas).split("\n").map(s=>s.trim()).filter(Boolean);
    const niveis = niveisConfig.map((n,i)=> i===idx ? { ...n, beneficios: arr } : n);
    setFid({ niveis });
  };
  const salvarRebaixRegra = (campo, valor) => {
    setFid({ rebaixamento: { ...fid.rebaixamento, [campo]: Number(valor) } });
  };

  const toggleRecompensa = (id) => {
    const r = recompensas.find(r=>r.id===id);
    setFid({ recompensas: recompensas.map(x => x.id===id ? { ...x, ativo:!x.ativo } : x) });
    toast(r?.ativo ? "Recompensa bloqueada (some do cliente)" : "Recompensa ativada", r?.ativo ? A.amber : A.green, r?.ativo ? "lock" : "check");
  };
  const salvarRecompensa = (id, campo, valor) => {
    setFid({ recompensas: recompensas.map(r => r.id===id ? { ...r, [campo]:valor } : r) });
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:S.lg}}>
      <div style={{display:"flex",gap:S.md}}>
        {[{l:"Diamond VIP",v:DB.clientes.filter(c=>c.nivel==="Diamond VIP").length,c:A.cyan},
          {l:"Ouro",v:DB.clientes.filter(c=>c.nivel==="Ouro").length,c:A.amber},
          {l:"Prata",v:DB.clientes.filter(c=>c.nivel==="Prata").length,c:A.textSec},
          {l:"Bronze",v:DB.clientes.filter(c=>c.nivel==="Bronze").length,c:"#B0814F"}].map((st,i)=>(
          <Card key={i} style={{flex:1}}>
            <div style={{color:A.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{st.l}</div>
            <div style={{color:st.c,fontSize:22,fontWeight:800,fontFamily:SHARED.fontMono}}>{st.v}</div>
          </Card>
        ))}
      </div>

      {/* CONTROLE MESTRE — liga/desliga o programa + regra de rebaixamento */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:S.md}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div onClick={togglePrograma} style={{cursor:"pointer",width:46,height:26,borderRadius:R.pill,position:"relative",
              background:fid.ativo?A.green:A.border,transition:"all .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:3,left:fid.ativo?23:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"all .2s"}}/>
            </div>
            <div>
              <div style={{color:A.textPri,fontWeight:700,fontSize:13}}>Programa de Fidelidade {fid.ativo?"ATIVO":"DESATIVADO"}</div>
              <div style={{color:A.textMuted,fontSize:10}}>{fid.ativo?"Níveis e recompensas aparecem para o cliente":"Tudo oculto do cliente — nada de fidelidade aparece no app"}</div>
            </div>
          </div>
        </div>
        {fid.ativo && (
          <div style={{marginTop:S.md,paddingTop:S.md,borderTop:`1px solid ${A.border}`,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
            <div onClick={toggleRebaixamento} style={{cursor:"pointer",width:40,height:22,borderRadius:R.pill,position:"relative",
              background:fid.rebaixamentoAtivo?A.cyan:A.border,transition:"all .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:2,left:fid.rebaixamentoAtivo?20:2,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"all .2s"}}/>
            </div>
            <div style={{color:A.textPri,fontSize:12,fontWeight:600}}>Rebaixar por falta</div>
            {fid.rebaixamentoAtivo && (
              <div style={{display:"flex",alignItems:"center",gap:8,color:A.textMuted,fontSize:11}}>
                <span>A cada</span>
                <input type="number" min="1" value={fid.rebaixamento.faltas} onChange={e=>salvarRebaixRegra("faltas",e.target.value)}
                  style={{width:52,background:A.bg3,border:`1px solid ${A.border}`,borderRadius:R.sm,padding:"4px 8px",color:A.textPri,fontSize:12,fontFamily:SHARED.fontMono}}/>
                <span>falta(s) em</span>
                <input type="number" min="1" value={fid.rebaixamento.dias} onChange={e=>salvarRebaixRegra("dias",e.target.value)}
                  style={{width:52,background:A.bg3,border:`1px solid ${A.border}`,borderRadius:R.sm,padding:"4px 8px",color:A.textPri,fontSize:12,fontFamily:SHARED.fontMono}}/>
                <span>dias → cai 1 nível</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Abas */}
      <div style={{display:"flex",gap:6}}>
        {[["niveis","🏆 Níveis"],["recompensas","🎁 Recompensas"],["top","⭐ Top Clientes"]].map(([id,label])=>(
          <button key={id} onClick={()=>setAba(id)} style={{
            padding:"7px 16px",borderRadius:R.md,border:`1px solid ${aba===id?A.amber:A.border}`,
            background:aba===id?`${A.amber}15`:A.bg3,color:aba===id?A.amber:A.textSec,
            fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:SHARED.fontSans}}>
            {label}
          </button>
        ))}
      </div>

      {/* ABA NÍVEIS */}
      {aba==="niveis" && (
        <div style={{display:"flex",gap:S.md}}>
          <Card style={{flex:1}}>
            <SectionHead title="Configuração de Níveis" sub="Edite visitas mínimas, benefícios e penalidades por falta"/>
            <div style={{display:"flex",flexDirection:"column",gap:S.sm}}>
              {niveisConfig.map((n,i)=>{
                const count=DB.clientes.filter(c=>c.nivel===n.label).length;
                const isEdit = editNivel===i;
                return (
                  <div key={i} style={{background:A.bg3,border:`1px solid ${n.cor}20`,borderRadius:R.lg,padding:"13px 15px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:36,height:36,borderRadius:R.md,background:`${n.cor}15`,border:`1px solid ${n.cor}30`,
                          display:"flex",alignItems:"center",justifyContent:"center",color:n.cor,fontSize:16}}>{n.icon}</div>
                        <div>
                          <div style={{color:n.cor,fontWeight:700,fontSize:13}}>{n.label}</div>
                          {!isEdit && <div style={{color:A.textMuted,fontSize:9}}>A partir de {n.min} visitas</div>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center"}}>
                        <div style={{textAlign:"right",marginRight:8}}>
                          <div style={{color:A.textPri,fontSize:18,fontWeight:800,fontFamily:SHARED.fontMono}}>{count}</div>
                          <div style={{color:A.textMuted,fontSize:9}}>clientes</div>
                        </div>
                        <button onClick={()=>setEditNivel(isEdit?null:i)} style={{
                          padding:"4px 10px",borderRadius:R.sm,border:`1px solid ${isEdit?A.green:A.border}`,
                          background:isEdit?`${A.green}15`:A.bg2,color:isEdit?A.green:A.textSec,
                          fontSize:10,cursor:"pointer",fontFamily:SHARED.fontSans}}>
                          {isEdit?"✓ Salvar":"✏️ Editar"}
                        </button>
                      </div>
                    </div>
                    {isEdit && (
                      <div style={{background:A.bg2,borderRadius:R.md,padding:"12px",marginBottom:10,display:"flex",gap:12,flexWrap:"wrap"}}>
                        <div>
                          <div style={{color:A.textMuted,fontSize:9,marginBottom:4}}>Visitas mínimas</div>
                          <input type="number" value={n.min} onChange={e=>salvarNivel(i,"min",e.target.value)}
                            style={{width:70,background:A.bg3,border:`1px solid ${A.border}`,borderRadius:R.sm,
                              padding:"5px 8px",color:A.textPri,fontSize:12,fontFamily:SHARED.fontMono}}/>
                        </div>
                        <div style={{flex:1,minWidth:120}}>
                          <div style={{color:A.textMuted,fontSize:9,marginBottom:4}}>Benefícios (separados por vírgula)</div>
                          <input type="text" value={n.beneficios.join(", ")}
                            onChange={e=>salvarNivel(i,"beneficios",e.target.value.split(",").map(b=>b.trim()).filter(Boolean))}
                            style={{width:"100%",boxSizing:"border-box",background:A.bg3,border:`1px solid ${A.border}`,borderRadius:R.sm,
                              padding:"5px 8px",color:A.textPri,fontSize:11,fontFamily:SHARED.fontSans}}/>
                        </div>
                      </div>
                    )}
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {n.beneficios.map((b,bi)=><Badge key={bi} color={n.cor} size="sm">{b}</Badge>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ABA RECOMPENSAS */}
      {aba==="recompensas" && (
        <Card>
          <SectionHead title="Recompensas por Marco" sub="Configure, bloqueie ou edite cada recompensa · Visível na área do cliente"/>
          <div style={{display:"flex",flexDirection:"column",gap:S.sm}}>
            {recompensas.map((r,i)=>{
              const isEdit = editRecomp===r.id;
              return (
                <div key={r.id} style={{background:A.bg3,border:`1px solid ${r.ativo?A.border:A.red+"30"}`,borderRadius:R.lg,padding:"13px 15px",opacity:r.ativo?1:0.6}}>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{fontSize:22}}>{r.icon}</div>
                    <div style={{flex:1}}>
                      {isEdit ? (
                        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                          <input value={r.marco} onChange={e=>salvarRecompensa(r.id,"marco",e.target.value)}
                            placeholder="Marco (ex: 5ª visita)"
                            style={{width:100,background:A.bg2,border:`1px solid ${A.border}`,borderRadius:R.sm,padding:"4px 8px",color:A.textPri,fontSize:11,fontFamily:SHARED.fontSans}}/>
                          <input value={r.descricao} onChange={e=>salvarRecompensa(r.id,"descricao",e.target.value)}
                            placeholder="Descrição"
                            style={{flex:1,minWidth:120,background:A.bg2,border:`1px solid ${A.border}`,borderRadius:R.sm,padding:"4px 8px",color:A.textPri,fontSize:11,fontFamily:SHARED.fontSans}}/>
                          <input value={r.icon} onChange={e=>salvarRecompensa(r.id,"icon",e.target.value)}
                            placeholder="Ícone"
                            style={{width:50,background:A.bg2,border:`1px solid ${A.border}`,borderRadius:R.sm,padding:"4px 8px",color:A.textPri,fontSize:14,textAlign:"center"}}/>
                        </div>
                      ) : (
                        <>
                          <div style={{color:A.textPri,fontSize:12,fontWeight:600}}>{r.descricao}</div>
                          <div style={{color:A.textMuted,fontSize:9,marginTop:2}}>{r.marco}</div>
                        </>
                      )}
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <button onClick={()=>setEditRecomp(isEdit?null:r.id)} style={{
                        padding:"4px 10px",borderRadius:R.sm,border:`1px solid ${isEdit?A.green:A.border}`,
                        background:isEdit?`${A.green}15`:A.bg2,color:isEdit?A.green:A.textSec,
                        fontSize:10,cursor:"pointer",fontFamily:SHARED.fontSans}}>
                        {isEdit?"✓ Salvar":"✏️ Editar"}
                      </button>
                      <button onClick={()=>toggleRecompensa(r.id)} style={{
                        padding:"4px 10px",borderRadius:R.sm,
                        border:`1px solid ${r.ativo?A.red+"60":A.green+"60"}`,
                        background:r.ativo?`${A.red}10`:`${A.green}10`,
                        color:r.ativo?A.red:A.green,
                        fontSize:10,cursor:"pointer",fontFamily:SHARED.fontSans}}>
                        {r.ativo?"🔒 Bloquear":"🔓 Ativar"}
                      </button>
                    </div>
                  </div>
                  {!r.ativo && <div style={{color:A.red,fontSize:9,marginTop:6}}>⚠ Bloqueada — não aparece para o cliente</div>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ABA TOP CLIENTES */}
      {aba==="top" && (
        <Card>
          <SectionHead title="Top Clientes" sub="Por faturamento e lealdade"/>
          {topClientes.map((c,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<topClientes.length-1?`1px solid ${A.border}`:"none"}}>
              <div style={{color:A.textMuted,fontSize:11,fontWeight:800,width:18,textAlign:"center",fontFamily:SHARED.fontMono}}>#{i+1}</div>
              <Avatar nome={c.nome} size={32} color={NIVEL_COLOR[c.nivel]??A.textSec}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:A.textPri,fontSize:12,fontWeight:600}}>{c.nome}</div>
                <div style={{color:A.textSec,fontSize:9}}>{c.visitas} visitas · {c.diasSemVisitar}d atrás</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{color:A.green,fontSize:11,fontFamily:SHARED.fontMono}}>R$ {c.gasto}</div>
                <Badge color={NIVEL_COLOR[c.nivel]??A.textSec}>{c.nivel}</Badge>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

// ─── WAITLIST PAGE ────────────────────────────────────────────────────────
const WaitlistPage = () => {
  const toast = useToast();
  const [fila, setFila] = useState(DB.waitlist);
  const [promovido, setPromovido] = useState(null);
  const promover=(id)=>{
    const item = fila.find(f=>f.id===id);
    setPromovido(id);
    setTimeout(()=>{ setFila(f=>f.filter(item=>item.id!==id)); setPromovido(null); },400);
    if(item) toast(`${item.nome} confirmado · Horário garantido`, A.green, "check");
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:S.lg}}>
      <div style={{display:"flex",gap:S.md}}>
        {[{l:"Aguardando",v:fila.length,c:A.purple},{l:"TTL ativo",v:"1",c:A.amber,sub:"18min restantes"},
          {l:"Convertidos hoje",v:"2",c:A.green},{l:"Taxa conversão",v:"73%",c:A.cyan}].map((st,i)=>(
          <Card key={i} style={{flex:1}}>
            <div style={{color:A.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{st.l}</div>
            <div style={{color:st.c,fontSize:22,fontWeight:800,fontFamily:SHARED.fontMono}}>{st.v}</div>
            {st.sub&&<div style={{color:A.amber,fontSize:9,marginTop:2}}>{st.sub}</div>}
          </Card>
        ))}
      </div>
      <div style={{display:"flex",gap:S.md}}>
        <div style={{flex:1}}>
          <Card>
            <SectionHead title="Fila de Espera"
              sub={`${fila.length} aguardando · Ordenado por nível + prioridade IPE`}
              action={<Btn variant="secondary" size="sm" style={{color:A.purple,background:`${A.purple}18`,borderColor:`${A.purple}30`}}>
                <Ico n="spark" size={11} color={A.purple}/>Disparar todos
              </Btn>}
            />
            <div style={{background:`${A.purple}0A`,border:`1px solid ${A.purple}20`,borderRadius:R.md,padding:"10px 13px",marginBottom:S.md,
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <Ico n="spark" size={13} color={A.purple}/>
                <div>
                  <div style={{color:A.purple,fontSize:11,fontWeight:600}}>Cancelamento detectado — 15:30</div>
                  <div style={{color:A.textSec,fontSize:10}}>Waitlist ativada. Felipe Gomes notificado automaticamente.</div>
                </div>
              </div>
              <Badge color={A.purple} dot>Automático</Badge>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:S.sm}}>
              {fila.map((f)=>{
                const nc=DB.clientes.find(c=>c.id===f.clienteId);
                return (
                  <div key={f.id} style={{
                    display:"flex",alignItems:"center",gap:12,padding:"13px 14px",
                    background:A.bg3,border:`1px solid ${A.border}`,borderRadius:R.lg,
                    opacity:promovido===f.id?0:1,
                    transform:promovido===f.id?"translateX(-14px)":"translateX(0)",
                    transition:`all 360ms ${M.curve}`,
                  }}>
                    <div style={{color:A.textMuted,fontSize:12,fontWeight:800,width:20,textAlign:"center",fontFamily:SHARED.fontMono}}>#{f.posicao}</div>
                    <Avatar nome={f.nome} size={36} color={NIVEL_COLOR[nc?.nivel]??A.textSec}/>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                        <span style={{color:A.textPri,fontSize:13,fontWeight:600}}>{f.nome}</span>
                        <Badge color={NIVEL_COLOR[nc?.nivel]??A.textSec}>{nc?.nivel}</Badge>
                        {f.ttl&&<Badge color={A.amber} dot>{f.ttl}min TTL</Badge>}
                      </div>
                      <div style={{color:A.textSec,fontSize:10}}>{f.horario} · {f.servico}</div>
                    </div>
                    <div style={{display:"flex",gap:6}}>
                      <Btn variant="secondary" size="sm" onClick={()=>toast(`${f.nome} notificado via WhatsApp`, A.purple, "phone")}>Notificar</Btn>
                      <Btn size="sm" onClick={()=>promover(f.id)} style={{background:`${A.green}15`,color:A.green,borderColor:`${A.green}28`}}>
                        <Ico n="check" size={10} color={A.green}/>Confirmar
                      </Btn>
                    </div>
                  </div>
                );
              })}
              {fila.length===0&&(
                <div style={{padding:24,textAlign:"center",animation:`scaleIn ${M.spring}`}}>
                  <div style={{color:A.green,fontSize:22,marginBottom:8}}>✓</div>
                  <div style={{color:A.textSec,fontSize:12}}>Fila vazia. Todos os horários preenchidos.</div>
                </div>
              )}
            </div>
          </Card>
        </div>
        <div style={{width:250,flexShrink:0,display:"flex",flexDirection:"column",gap:S.md}}>
          <Card>
            <SectionHead title="TTL por Nível" sub="Time-to-live configurado"/>
            {[{n:"VIP",t:"60min",c:A.cyan},{n:"Ouro",t:"30min",c:A.amber},{n:"Prata",t:"20min",c:"#B8C4D0"},{n:"Bronze",t:"15min",c:"#B0814F"}].map((c,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:i<3?`1px solid ${A.border}`:"none"}}>
                <Badge color={NIVEL_COLOR[c.n]??A.textSec}>{c.n}</Badge>
                <span style={{color:A.textSec,fontSize:11,fontFamily:SHARED.fontMono}}>{c.t}</span>
              </div>
            ))}
          </Card>
          <Card>
            <SectionHead title="Governança" sub="Limites do motor"/>
            {[["Sugestões ativas","máx. 3"],["Cooldown","4h"],["Auto-silenciar após","2 ignores"],
              ["TTL VIP","60 min"],["Conflito de agenda","bloqueado"]].map((g,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:i<4?`1px solid ${A.border}`:"none"}}>
                <span style={{color:A.textSec,fontSize:10}}>{g[0]}</span>
                <span style={{color:A.cyan,fontSize:10,fontWeight:600,fontFamily:SHARED.fontMono}}>{g[1]}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
};

// ─── RELATÓRIOS PAGE ──────────────────────────────────────────────────────
const RelatoriosPage = () => {
  const toast = useToast();
  const cfg = useStore(configStore);

  // Datasets reais derivados do DB / config — exportados de verdade.
  const datasets = {
    "Relatório Mensal — Maio 2026": {
      tipo:"Financeiro",
      headers:["Serviço","Quantidade","Faturamento (R$)","% do total"],
      rows: DB.financeiro.servicos.map(s=>[s.nome, s.qtd, s.valor, `${s.pct}%`]),
    },
    "Análise de Retenção — Q2": {
      tipo:"CRM",
      headers:["Cliente","Nível","Visitas","Dias s/ visitar","Score"],
      rows: DB.clientes.map(c=>[c.nome, c.nivel, c.visitas, c.diasSemVisitar, c.score]),
    },
    "Performance por Serviço": {
      tipo:"Analytics",
      headers:["Serviço","Preço (R$)","Duração (min)","Ativo"],
      rows: cfg.servicos.map(s=>[s.nome, s.preco, s.duracao, s.ativo?"Sim":"Não"]),
    },
    "Score de Clientes — Histórico": {
      tipo:"CRM",
      headers:["Cliente","Score","Cancelamentos","Gasto total (R$)","Último lembrete"],
      rows: DB.clientes.map(c=>[c.nome, c.score, c.cancelamentos, c.gasto, c.ultimoLembrete]),
    },
    "Projeção Junho 2026": {
      tipo:"Financeiro",
      headers:["Métrica","Valor"],
      rows:[["Faturamento projetado","R$ 12.800"],["Ticket médio","R$ 66,40"],["Recorrência","74%"]],
    },
  };

  const relatorios=[
    {titulo:"Relatório Mensal — Maio 2026", atualizado:"Hoje",  status:"pronto"},
    {titulo:"Análise de Retenção — Q2",     atualizado:"Ontem", status:"pronto"},
    {titulo:"Performance por Serviço",      atualizado:"Hoje",  status:"pronto"},
    {titulo:"Score de Clientes — Histórico",atualizado:"Seg",   status:"pronto"},
    {titulo:"Projeção Junho 2026",          atualizado:"—",     status:"gerando"},
  ];

  const slug = (t)=>t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"");
  const doCSV = (titulo)=>{
    const d=datasets[titulo]; if(!d) return;
    const ok=exportCSV(`${slug(titulo)}.csv`, d.headers, d.rows);
    toast(ok?`CSV exportado: ${titulo}`:"Falha ao exportar CSV", ok?A.green:A.red, ok?"check":"warning");
  };
  const doPDF = (titulo)=>{
    const d=datasets[titulo]; if(!d) return;
    const ok=exportPDF(titulo, d.headers, d.rows);
    toast(ok?`PDF aberto p/ impressão: ${titulo}`:"Pop-up bloqueado — libere para gerar PDF", ok?A.cyan:A.amber, ok?"reports":"warning");
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:S.lg}}>
      <div style={{display:"flex",gap:S.md}}>
        {[{l:"Gerados",v:"24",c:A.blue},{l:"Este mês",v:"8",c:A.cyan},{l:"Exportações",v:"12",c:A.green}].map((st,i)=>(
          <Card key={i} style={{flex:1}}>
            <div style={{color:A.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{st.l}</div>
            <div style={{color:st.c,fontSize:22,fontWeight:800,fontFamily:SHARED.fontMono}}>{st.v}</div>
          </Card>
        ))}
        <Card style={{flex:2}}>
          <div style={{color:A.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:8}}>Exportar tudo</div>
          <div style={{display:"flex",gap:6}}>
            <Btn variant="secondary" size="sm" onClick={()=>{
              const headers=["Relatório","Tipo","Linhas"];
              const rows=Object.entries(datasets).map(([t,d])=>[t,d.tipo,d.rows.length]);
              exportCSV("aquino_relatorios_indice.csv", headers, rows);
              toast("Índice de relatórios exportado (CSV)", A.green, "check");
            }}><Ico n="reports" size={11} color={A.textSec}/>Índice CSV</Btn>
            <Btn variant="secondary" size="sm" onClick={()=>doCSV("Relatório Mensal — Maio 2026")}>Financeiro CSV</Btn>
            <Btn variant="secondary" size="sm" onClick={()=>doCSV("Análise de Retenção — Q2")}>CRM CSV</Btn>
          </div>
        </Card>
      </div>
      <Card pad={false}>
        <div style={{padding:`${S.sm}px ${S.xl}px`,borderBottom:`1px solid ${A.border}`,display:"flex",gap:12}}>
          {["Relatório","Tipo","Atualizado","Status",""].map((h,i)=>(
            <div key={i} style={{color:A.textMuted,fontSize:9.5,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",flex:i===0?2:1}}>{h}</div>
          ))}
        </div>
        {relatorios.map((r,i)=>{
          const d=datasets[r.titulo];
          return (
          <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 20px",borderBottom:i<relatorios.length-1?`1px solid ${A.border}`:"none"}}>
            <div style={{flex:2}}>
              <div style={{color:A.textPri,fontSize:12,fontWeight:600}}>{r.titulo}</div>
              <div style={{color:A.textMuted,fontSize:9}}>{d?`${d.rows.length} linhas`:"—"}</div>
            </div>
            <div style={{flex:1}}><Badge color={A.blue}>{d?.tipo??"—"}</Badge></div>
            <div style={{flex:1,color:A.textSec,fontSize:11}}>{r.atualizado}</div>
            <div style={{flex:1}}>{r.status==="pronto"?<Badge color={A.green} dot>Pronto</Badge>:<Badge color={A.amber} dot>Gerando…</Badge>}</div>
            <div style={{flex:1,display:"flex",gap:6}}>
              <Btn variant="secondary" size="sm" disabled={r.status!=="pronto"} onClick={()=>doCSV(r.titulo)}>CSV</Btn>
              <Btn variant="secondary" size="sm" disabled={r.status!=="pronto"} onClick={()=>doPDF(r.titulo)}>PDF</Btn>
            </div>
          </div>
        );})}
      </Card>
    </div>
  );
};

// ─── SISTEMA PAGE (v7: painel de saúde interativo) ────────────────────────
const SystemPage = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("health");
  const now = useLiveTime();

  // Simula uptime dinâmico
  const [uptimeSeconds, setUptimeSeconds] = useState(14283);
  useEffect(()=>{ const t=setInterval(()=>setUptimeSeconds(s=>s+1),1000); return ()=>clearInterval(t); },[]);
  const fmtUptime = (s) => {
    const h=Math.floor(s/3600), m=Math.floor((s%3600)/60), sec=s%60;
    return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  };

  const services = [
    {name:"Motor Comportamental v2",key:"be",status:"online",latency:2,icon:"cpu"},
    {name:"IPE — Priorização",key:"ipe",status:"online",latency:1,icon:"activity"},
    {name:"Suggestion Governance",key:"gov",status:"online",latency:3,icon:"settings"},
    {name:"DB Central",key:"db",status:"online",latency:4,icon:"database"},
    {name:"Sistema de Notificações",key:"notif",status:"online",latency:7,icon:"bell"},
    {name:"Integração Meta API",key:"meta",status:"online",latency:28,icon:"wifi"},
    {name:"Calendar Sync",key:"cal",status:"online",latency:12,icon:"calendar"},
    {name:"WhatsApp Gateway",key:"wpp",status:"degraded",latency:145,icon:"phone"},
  ];

  const tabs=[{id:"health",label:"Saúde"},{id:"integr",label:"Integrações & Dados"},{id:"tokens",label:"Design Tokens"},{id:"motor",label:"Motor"}];

  return (
    <div style={{display:"flex",flexDirection:"column",gap:S.lg}}>
      <div>
        <div style={{color:A.textPri,fontSize:22,fontWeight:700,letterSpacing:"-0.02em"}}>Sistema</div>
        <div style={{color:A.textSec,fontSize:12,marginTop:4}}>
          AQUINO SaaS v9 · Persistência localStorage · Credenciais via .env · Motor Comportamental v2 · IPE
        </div>
      </div>

      {/* v7: tabs para não mostrar tudo de uma vez */}
      <div style={{display:"flex",gap:4,borderBottom:`1px solid ${A.border}`,paddingBottom:0}}>
        {tabs.map(t=>(
          <div key={t.id} onClick={()=>setActiveTab(t.id)} style={{
            padding:"8px 16px",cursor:"pointer",fontSize:11,fontWeight:activeTab===t.id?700:400,
            color:activeTab===t.id?A.textPri:A.textSec,
            borderBottom:`2px solid ${activeTab===t.id?A.cyan:"transparent"}`,
            transition:`all ${M.micro}`,
          }}>{t.label}</div>
        ))}
      </div>

      {/* ABA: Saúde — v7 novidade */}
      {activeTab==="health"&&(
        <div style={{display:"flex",flexDirection:"column",gap:S.md,animation:`fadeUp ${M.base}`}}>
          {/* Resumo de saúde */}
          <div style={{display:"flex",gap:S.md}}>
            {[
              {l:"Status geral",v:"Operacional",c:A.green,icon:"check"},
              {l:"Uptime",v:fmtUptime(uptimeSeconds),c:A.cyan,icon:"activity"},
              {l:"Serviços online",v:`${services.filter(s=>s.status==="online").length}/${services.length}`,c:A.blue,icon:"cpu"},
              {l:"Degradados",v:services.filter(s=>s.status==="degraded").length,c:A.amber,icon:"warning"},
            ].map((st,i)=>(
              <Card key={i} style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{color:A.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:4}}>{st.l}</div>
                    <div style={{color:st.c,fontSize:i===1?13:18,fontWeight:800,fontFamily:SHARED.fontMono}}>{st.v}</div>
                  </div>
                  <div style={{width:28,height:28,borderRadius:R.md,background:`${st.c}12`,border:`1px solid ${st.c}20`,
                    display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <Ico n={st.icon} size={12} color={st.c}/>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Lista de serviços */}
          <Card>
            <SectionHead title="Serviços" sub={`Atualizado às ${formatTimeBR(now)}`}
              action={<Badge color={A.green} dot>Todos monitorados</Badge>}/>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              {services.map((sv,i)=>{
                const isDeg=sv.status==="degraded";
                return (
                  <div key={sv.key} style={{
                    display:"flex",alignItems:"center",gap:12,
                    padding:"10px 12px",borderRadius:R.md,
                    background:isDeg?`${A.amber}07`:"transparent",
                    border:`1px solid ${isDeg?A.amber+"20":"transparent"}`,
                    transition:`background ${M.micro}`,
                    animation:`fadeUp ${M.base} ${i*40}ms both`,
                  }}
                    onMouseEnter={e=>!isDeg&&(e.currentTarget.style.background=A.bg3)}
                    onMouseLeave={e=>!isDeg&&(e.currentTarget.style.background="transparent")}
                  >
                    <div style={{width:28,height:28,borderRadius:R.md,background:`${isDeg?A.amber:A.green}10`,
                      border:`1px solid ${isDeg?A.amber:A.green}20`,
                      display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <Ico n={sv.icon} size={12} color={isDeg?A.amber:A.green}/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{color:A.textPri,fontSize:11.5,fontWeight:600}}>{sv.name}</div>
                      <div style={{color:A.textMuted,fontSize:9}}>latência {sv.latency}ms</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{
                        width:80, height:4, background:`${isDeg?A.amber:A.green}18`,
                        borderRadius:2, overflow:"hidden",
                      }}>
                        <div style={{
                          height:"100%",
                          width:`${Math.min((sv.latency/200)*100,100)}%`,
                          background:isDeg?A.amber:sv.latency<10?A.green:sv.latency<50?A.cyan:A.amber,
                          borderRadius:2,
                        }}/>
                      </div>
                      <Badge color={isDeg?A.amber:A.green} dot>{isDeg?"Degradado":"Online"}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ABA: Integrações & Dados (v9) */}
      {activeTab==="integr"&&(
        <div style={{display:"flex",flexDirection:"column",gap:S.md,animation:`fadeUp ${M.base}`}}>
          <Card>
            <SectionHead title="Credenciais · via .env (P0 segurança)" sub="Nenhum segredo fica no código. Valores lidos de import.meta.env.VITE_*"/>
            {[
              {k:"VITE_GAS_URL",   label:"Backend Google Apps Script", val:ENV.GAS_URL},
              {k:"VITE_SITE_TOKEN",label:"Token de origem site↔GAS",   val:ENV.SITE_TOKEN==="aq2025site"?"":ENV.SITE_TOKEN},
              {k:"ADMIN_KEY",      label:"Senha admin (Script Properties · server-side)", val:""},
            ].map((row,i)=>{
              const set=!!row.val;
              return (
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:i<2?`1px solid ${A.border}`:"none"}}>
                  <div style={{flex:1}}>
                    <div style={{color:A.textPri,fontSize:11.5,fontWeight:600}}>{row.label}</div>
                    <div style={{color:A.textMuted,fontSize:9,fontFamily:SHARED.fontMono}}>{row.k}</div>
                  </div>
                  <span style={{color:set?A.green:A.amber,fontSize:9.5,fontFamily:SHARED.fontMono}}>
                    {set?"•••••••• definido":"não configurado"}
                  </span>
                  <Badge color={set?A.green:A.amber} dot>{set?"Conectado":"Pendente"}</Badge>
                </div>
              );
            })}
            <div style={{marginTop:S.md,background:`${A.amber}0A`,border:`1px solid ${A.amber}20`,borderRadius:R.md,padding:"10px 12px",color:A.textSec,fontSize:10.5,lineHeight:1.6}}>
              Crie um arquivo <b style={{color:A.amber,fontFamily:SHARED.fontMono}}>.env.local</b> na raiz (modelo em <b style={{fontFamily:SHARED.fontMono}}>.env.example</b>) e adicione-o ao <b style={{fontFamily:SHARED.fontMono}}>.gitignore</b>.
              A senha de admin é validada no backend — nunca trafega no front.
            </div>
          </Card>

          <Card>
            <SectionHead title="Persistência de dados" sub="Estado salvo em localStorage — sobrevive ao reload"/>
            <div style={{display:"flex",gap:S.md,marginBottom:S.md}}>
              {[
                {l:"Configurações",v:"persistido",c:A.green},
                {l:"Backend GAS",v:ENV.hasBackend?"online":"local-only",c:ENV.hasBackend?A.green:A.amber},
                {l:"Modo",v:ENV.hasBackend?"Produção":"Demonstração",c:A.cyan},
              ].map((st,i)=>(
                <div key={i} style={{flex:1,background:A.bg3,borderRadius:R.md,padding:"10px 12px"}}>
                  <div style={{color:A.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>{st.l}</div>
                  <div style={{color:st.c,fontSize:13,fontWeight:700}}>{st.v}</div>
                </div>
              ))}
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <Btn variant="secondary" size="sm" onClick={async()=>{
                if(!ENV.hasBackend){ toast("Modo demonstração — defina VITE_GAS_URL p/ conectar", A.amber, "warning"); return; }
                toast("Testando conexão com o GAS…", A.cyan, "wifi");
                const r = await api.ping();
                if (r.ok)        toast(`GAS respondeu ✓ (${r.ms}ms)`, A.green, "wifi");
                else if (r.error) toast("Falha de rede ao chamar o GAS", A.red, "warning");
                else             toast("GAS acessível, mas exige chave admin válida", A.amber, "wifi");
              }}><Ico n="wifi" size={11} color={A.textSec}/>Testar conexão GAS</Btn>
              <Btn variant="danger" size="sm" onClick={()=>{ lsClearAll(); configStore.set(DEFAULT_CONFIG); toast("Dados locais limpos e restaurados ao padrão", A.amber, "warning"); }}>
                <Ico n="warning" size={11} color={A.red}/>Restaurar dados
              </Btn>
            </div>
          </Card>

          <Card>
            <SectionHead title="WhatsApp Gateway" sub="Configurável em Configurações → Barbearia"/>
            <div style={{color:A.textSec,fontSize:11,lineHeight:1.6}}>
              O status do gateway depende do <b style={{fontFamily:SHARED.fontMono,color:A.textPri}}>WHATSAPP_TOKEN</b> (Script Properties do GAS, server-side).
              Sem backend (VITE_GAS_URL) o sistema opera em modo demonstração: agendar/cancelar/enviar
              são simulados (toast), sem chamadas reais à Meta Cloud API.
            </div>
          </Card>
        </div>
      )}

      {/* ABA: Design Tokens */}
      {activeTab==="tokens"&&(
        <div style={{display:"flex",gap:S.md,animation:`fadeUp ${M.base}`}}>
          <Card style={{flex:1}}>
            <SectionHead title="Paleta — Admin" sub="Enterprise Silence"/>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {[{c:A.blue,n:"Blue"},{c:A.cyan,n:"Cyan"},{c:A.green,n:"Green"},{c:A.amber,n:"Amber"},
                {c:A.red,n:"Red"},{c:A.purple,n:"Purple"},{c:A.textPri,n:"TextPri"},{c:A.textSec,n:"TextSec"},{c:A.bg3,n:"Surface"}].map(({c,n})=>(
                <div key={n} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{width:32,height:32,borderRadius:R.md,background:c,border:`1px solid ${c}44`}}/>
                  <span style={{color:A.textSec,fontSize:8,fontFamily:SHARED.fontMono}}>{n}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card style={{flex:1}}>
            <SectionHead title="Paleta — Cliente" sub="Luxury Silence"/>
            <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
              {[{c:C.bg0,n:"bg-0"},{c:C.bg2,n:"bg-2"},{c:C.gold,n:"gold"},{c:C.bronze,n:"bronze"},{c:C.white,n:"white"},{c:C.muted,n:"muted"}].map(({c,n})=>(
                <div key={n} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{width:32,height:32,borderRadius:R.md,background:c,border:"1px solid #333"}}/>
                  <span style={{color:A.textSec,fontSize:8,fontFamily:SHARED.fontMono}}>{n}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card style={{flex:1}}>
            <SectionHead title="System Rhythm" sub="Motion tokens"/>
            {[["micro","120ms · hover, focus"],["base","220ms · estado→estado"],["enter","380ms · entrada"],
              ["spring","360ms · confirmações"]].map(([k,v],i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:`1px solid ${A.border}`}}>
                <span style={{color:A.textSec,fontSize:10}}>{k}</span>
                <span style={{color:A.cyan,fontSize:9,fontFamily:SHARED.fontMono}}>{v}</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ABA: Motor */}
      {activeTab==="motor"&&(
        <div style={{display:"flex",gap:S.md,animation:`fadeUp ${M.base}`}}>
          <Card style={{flex:1}}>
            <SectionHead title="Motor Comportamental v2" sub="Regras de pontuação"/>
            {[["Score inicial","10 pts"],["Dias > 60 sem visitar","-4 pts"],["Dias > 30 sem visitar","-2 pts"],
              ["Cancelamentos > 2","-3 pts"],["Cancelamentos > 0","-1 pt"],
              ["Visitas > 20","+2 pts"],["Visitas > 10","+1 pt"]].map(([k,v],i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${A.border}`}}>
                <span style={{color:A.textSec,fontSize:10}}>{k}</span>
                <span style={{
                  color:v.startsWith("-")?A.red:v.startsWith("+")?A.green:A.amber,
                  fontSize:10,fontWeight:700,fontFamily:SHARED.fontMono
                }}>{v}</span>
              </div>
            ))}
          </Card>
          <Card style={{flex:1}}>
            <SectionHead title="IPE — Pesos" sub="Priorização por impacto"/>
            {[
              {tipo:"faltaHoje",score:95,fin:65},
              {tipo:"vagoPremium",score:80,fin:90},
              {tipo:"vipReativacao",score:70,fin:80},
              {tipo:"waitlistAtiva",score:65,fin:55},
            ].map((w,i)=>(
              <div key={i} style={{padding:"9px 0",borderBottom:i<3?`1px solid ${A.border}`:"none"}}>
                <div style={{color:A.textPri,fontSize:11,fontWeight:600,marginBottom:5}}>{w.tipo}</div>
                <div style={{display:"flex",gap:S.md}}>
                  <div style={{flex:1}}>
                    <div style={{color:A.textMuted,fontSize:8,marginBottom:3}}>Score (40%)</div>
                    <MiniBar pct={w.score} color={A.cyan} height={3}/>
                    <span style={{color:A.cyan,fontSize:8,fontFamily:SHARED.fontMono}}>{w.score}</span>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{color:A.textMuted,fontSize:8,marginBottom:3}}>Financeiro (60%)</div>
                    <MiniBar pct={w.fin} color={A.green} height={3}/>
                    <span style={{color:A.green,fontSize:8,fontFamily:SHARED.fontMono}}>{w.fin}</span>
                  </div>
                  <div style={{flexShrink:0,textAlign:"right"}}>
                    <div style={{color:A.textMuted,fontSize:8,marginBottom:3}}>Final</div>
                    <span style={{color:A.amber,fontSize:10,fontWeight:700,fontFamily:SHARED.fontMono}}>
                      {((w.score*.4)+(w.fin*.6)).toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </Card>
          <Card style={{flex:1}}>
            <SectionHead title="Scores Atuais" sub="DB calculado dinamicamente"/>
            <div style={{overflowY:"auto",maxHeight:300}}>
              {DB.clientes.sort((a,b)=>b.score-a.score).map((c,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",
                  borderBottom:i<DB.clientes.length-1?`1px solid ${A.border}`:"none"}}>
                  <Avatar nome={c.nome} size={26} color={BE.prioridade(c.score).color}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:A.textPri,fontSize:10.5,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.nome}</div>
                  </div>
                  <ScoreDot score={c.score}/>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// ─── CONFIG PAGE (v9 · P0 — pré-requisito de produção) ────────────────────
const Field = ({ label, children }) => (
  <div style={{display:"flex",flexDirection:"column",gap:5}}>
    <span style={{color:A.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</span>
    {children}
  </div>
);
const TextInput = ({ value, onChange, placeholder, type="text", style:sx={} }) => (
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} type={type}
    style={{background:A.bg1,border:`1px solid ${A.border}`,borderRadius:R.md,padding:"8px 11px",
      color:A.textPri,fontSize:12,fontFamily:SHARED.fontAdmin,outline:"none",width:"100%",...sx}}
    onFocus={e=>e.target.style.borderColor=A.blue+"66"}
    onBlur={e=>e.target.style.borderColor=A.border}/>
);

const ConfigPage = () => {
  const toast = useToast();
  const cfg = useStore(configStore);
  const [tab, setTab] = useState("servicos");
  // P1-1: ao abrir o painel, puxa a config rica do backend (serviços/barbeiros/barbearia/horários)
  // para o dono editar a FONTE REAL que o portal lê — não mais só o estado do navegador.
  useEffect(() => {
    if (!ENV.hasBackend) return;
    let vivo = true;
    api.getConfig().then(r => {
      const c = r && (r.config || null);
      if (vivo && c && typeof c === "object") {
        configStore.set(prev => ({ ...prev, ...c,
          fidelidade: { ...(prev.fidelidade||{}), ...(c.fidelidade||{}) } }));
      }
    }).catch(()=>{});
    return () => { vivo = false; };
  }, []);
  const tabs=[
    {id:"servicos",label:"Serviços & Preços"},
    {id:"barbeiros",label:"Barbeiros"},
    {id:"horarios",label:"Horários"},
    {id:"operacao",label:"Operação"},
    {id:"barbearia",label:"Barbearia"},
  ];

  // ── Serviços ──
  const [novo, setNovo] = useState({nome:"",preco:"",duracao:""});
  const addServico = () => {
    if(!novo.nome.trim()){ toast("Informe o nome do serviço", A.amber, "warning"); return; }
    const id = Math.max(0,...cfg.servicos.map(s=>s.id))+1;
    configStore.set(c=>({...c, servicos:[...c.servicos,{
      id, nome:novo.nome.trim(), preco:Number(novo.preco)||0, duracao:Number(novo.duracao)||30, ativo:true,
    }]}));
    setNovo({nome:"",preco:"",duracao:""});
    toast(`Serviço "${novo.nome.trim()}" adicionado`, A.green, "check");
  };
  const updServico = (id,patch)=>configStore.set(c=>({...c,servicos:c.servicos.map(s=>s.id===id?{...s,...patch}:s)}));
  const delServico = (id)=>{ configStore.set(c=>({...c,servicos:c.servicos.filter(s=>s.id!==id)})); toast("Serviço removido", A.textSec, "check"); };

  // ── Barbeiros ──
  const [novoBarbeiro, setNovoBarbeiro] = useState("");
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState("");
  const barbeiros = cfg.barbeiros || [];
  const addBarbeiro = () => {
    if(!novoBarbeiro.trim()){ toast("Informe o nome do barbeiro", A.amber, "warning"); return; }
    const id = Math.max(0,...barbeiros.map(b=>b.id))+1;
    configStore.set(c=>({...c, barbeiros:[...(c.barbeiros||[]),{ id, nome:novoBarbeiro.trim(), ativo:true }]}));
    setNovoBarbeiro("");
    toast(`Barbeiro "${novoBarbeiro.trim()}" adicionado`, A.green, "check");
  };
  const updBarbeiro = (id,patch)=>configStore.set(c=>({...c,barbeiros:(c.barbeiros||[]).map(b=>b.id===id?{...b,...patch}:b)}));
  const salvarEdicao = (id)=>{
    if(!editNome.trim()){ toast("O nome não pode ficar vazio", A.amber, "warning"); return; }
    updBarbeiro(id,{nome:editNome.trim()}); setEditId(null); setEditNome("");
    toast("Nome atualizado", A.green, "check");
  };
  const delBarbeiro = (id)=>{
    const b = barbeiros.find(x=>x.id===id);
    configStore.set(c=>({...c,barbeiros:(c.barbeiros||[]).filter(x=>x.id!==id)}));
    toast(`Barbeiro "${b?.nome||""}" removido`, A.textSec, "check");
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:S.lg}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{color:A.textPri,fontSize:22,fontWeight:700,letterSpacing:"-0.02em"}}>Configurações</div>
          <div style={{color:A.textSec,fontSize:12,marginTop:4}}>
            Tudo aqui é persistido localmente e usado em toda a operação · {cfg.servicos.filter(s=>s.ativo).length} serviços ativos
          </div>
        </div>
        <Badge color={A.green} dot>Salvo automaticamente</Badge>
      </div>

      <div style={{display:"flex",gap:4,borderBottom:`1px solid ${A.border}`}}>
        {tabs.map(t=>(
          <div key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:"8px 16px",cursor:"pointer",fontSize:11,fontWeight:tab===t.id?700:400,
            color:tab===t.id?A.textPri:A.textSec,
            borderBottom:`2px solid ${tab===t.id?A.cyan:"transparent"}`,transition:`all ${M.micro}`,
          }}>{t.label}</div>
        ))}
      </div>

      {/* SERVIÇOS */}
      {tab==="servicos"&&(
        <div style={{display:"flex",flexDirection:"column",gap:S.md,animation:`fadeUp ${M.base}`}}>
          <Card>
            <SectionHead title="Novo serviço" sub="Adicione os serviços que sua barbearia oferece"/>
            <div style={{display:"flex",gap:S.sm,alignItems:"flex-end"}}>
              <div style={{flex:2}}><Field label="Nome"><TextInput value={novo.nome} onChange={v=>setNovo({...novo,nome:v})} placeholder="Ex.: Pézinho"/></Field></div>
              <div style={{flex:1}}><Field label="Preço (R$)"><TextInput type="number" value={novo.preco} onChange={v=>setNovo({...novo,preco:v})} placeholder="40"/></Field></div>
              <div style={{flex:1}}><Field label="Duração (min)"><TextInput type="number" value={novo.duracao} onChange={v=>setNovo({...novo,duracao:v})} placeholder="30"/></Field></div>
              <Btn onClick={addServico}><Ico n="plus" size={12} color="#fff"/>Adicionar</Btn>
            </div>
          </Card>
          <Card pad={false}>
            <div style={{padding:`${S.sm}px ${S.xl}px`,borderBottom:`1px solid ${A.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{color:A.textPri,fontWeight:700,fontSize:13}}>Serviços cadastrados <span style={{color:A.textMuted,fontWeight:400}}>· {cfg.servicos.length}</span></div>
              <Btn variant="secondary" size="sm" onClick={()=>{
                exportCSV("aquino_servicos.csv",["Nome","Preço (R$)","Duração (min)","Ativo"],
                  cfg.servicos.map(s=>[s.nome,s.preco,s.duracao,s.ativo?"Sim":"Não"]));
                toast("Serviços exportados (CSV)", A.green, "check");
              }}>Exportar CSV</Btn>
            </div>
            <div style={{padding:`${S.xs}px ${S.md}px`}}>
              {cfg.servicos.map((s)=>(
                <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 8px",borderBottom:`1px solid ${A.border}`,opacity:s.ativo?1:0.5}}>
                  <div style={{width:30,height:30,borderRadius:R.md,background:`${A.cyan}14`,border:`1px solid ${A.cyan}26`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <Ico n="cut" size={13} color={A.cyan}/>
                  </div>
                  <div style={{flex:2,minWidth:0}}>
                    <TextInput value={s.nome} onChange={v=>updServico(s.id,{nome:v})} style={{padding:"5px 9px",fontSize:11.5}}/>
                  </div>
                  <div style={{flex:1,display:"flex",alignItems:"center",gap:5}}>
                    <span style={{color:A.textMuted,fontSize:10}}>R$</span>
                    <TextInput type="number" value={s.preco} onChange={v=>updServico(s.id,{preco:Number(v)||0})} style={{padding:"5px 9px",fontSize:11.5}}/>
                  </div>
                  <div style={{flex:1,display:"flex",alignItems:"center",gap:5}}>
                    <TextInput type="number" value={s.duracao} onChange={v=>updServico(s.id,{duracao:Number(v)||0})} style={{padding:"5px 9px",fontSize:11.5}}/>
                    <span style={{color:A.textMuted,fontSize:10}}>min</span>
                  </div>
                  <Btn variant={s.ativo?"secondary":"amber"} size="sm" onClick={()=>updServico(s.id,{ativo:!s.ativo})}>{s.ativo?"Ativo":"Inativo"}</Btn>
                  <Btn variant="danger" size="sm" onClick={()=>delServico(s.id)}><Ico n="close" size={11} color={A.red}/></Btn>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* BARBEIROS */}
      {tab==="barbeiros"&&(
        <div style={{display:"flex",flexDirection:"column",gap:S.md,animation:`fadeUp ${M.base}`}}>
          <Card>
            <SectionHead title="Adicionar barbeiro" sub="Cadastre os profissionais que atendem. O cliente escolhe o barbeiro ao agendar online."/>
            <div style={{display:"flex",gap:S.sm,alignItems:"flex-end"}}>
              <div style={{flex:1}}><Field label="Nome do barbeiro"><TextInput value={novoBarbeiro} onChange={setNovoBarbeiro} placeholder="Ex.: João Silva"/></Field></div>
              <Btn onClick={addBarbeiro}><Ico n="plus" size={12} color="#fff"/>Adicionar</Btn>
            </div>
          </Card>
          <Card pad={false}>
            <div style={{padding:`${S.sm}px ${S.xl}px`,borderBottom:`1px solid ${A.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{color:A.textPri,fontWeight:700,fontSize:13}}>Barbeiros cadastrados <span style={{color:A.textMuted,fontWeight:400}}>· {barbeiros.length}</span></div>
            </div>
            <div style={{padding:`${S.xs}px ${S.md}px`}}>
              {barbeiros.length===0&&(
                <div style={{padding:`${S.xl}px`,textAlign:"center",color:A.textMuted,fontSize:12}}>
                  Nenhum barbeiro cadastrado ainda. Adicione o primeiro acima.
                </div>
              )}
              {barbeiros.map((b)=>(
                <div key={b.id} style={{display:"flex",alignItems:"center",gap:S.md,padding:`${S.md}px ${S.sm}px`,borderBottom:`1px solid ${A.border}`}}>
                  <Avatar nome={b.nome} size={36}/>
                  <div style={{flex:1,minWidth:0}}>
                    {editId===b.id?(
                      <div style={{display:"flex",gap:S.sm,alignItems:"center"}}>
                        <div style={{flex:1,maxWidth:280}}>
                          <TextInput value={editNome} onChange={setEditNome} placeholder="Nome do barbeiro"/>
                        </div>
                        <Btn size="sm" onClick={()=>salvarEdicao(b.id)}>Salvar</Btn>
                        <Btn size="sm" variant="secondary" onClick={()=>{setEditId(null);setEditNome("");}}>Cancelar</Btn>
                      </div>
                    ):(
                      <>
                        <div style={{color:A.textPri,fontWeight:600,fontSize:13}}>{b.nome}</div>
                        <div style={{color:A.textMuted,fontSize:11,marginTop:2}}>{b.ativo!==false?"Disponível para agendamento":"Inativo (não aparece no portal)"}</div>
                      </>
                    )}
                  </div>
                  {editId!==b.id&&(
                    <div style={{display:"flex",gap:S.xs,alignItems:"center"}}>
                      <div onClick={()=>updBarbeiro(b.id,{ativo:b.ativo===false})} title={b.ativo!==false?"Desativar":"Ativar"} style={{
                        cursor:"pointer",width:38,height:22,borderRadius:R.pill,position:"relative",
                        background:b.ativo!==false?A.green:A.border,transition:`all ${M.base}`,flexShrink:0,
                      }}>
                        <div style={{position:"absolute",top:2,left:b.ativo!==false?18:2,width:18,height:18,borderRadius:"50%",background:"#fff",transition:`all ${M.base}`}}/>
                      </div>
                      <Btn size="sm" variant="secondary" onClick={()=>{setEditId(b.id);setEditNome(b.nome);}}>Editar</Btn>
                      <Btn size="sm" variant="danger" onClick={()=>delBarbeiro(b.id)}>Excluir</Btn>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* HORÁRIOS */}
      {tab==="horarios"&&(
        <Card style={{animation:`fadeUp ${M.base}`}}>
          <SectionHead title="Horários de funcionamento" sub="Defina quando a barbearia atende em cada dia"/>
          <div style={{display:"flex",flexDirection:"column",gap:2}}>
            {cfg.horarios.map((h,i)=>(
              <div key={h.dia} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 0",borderBottom:i<cfg.horarios.length-1?`1px solid ${A.border}`:"none"}}>
                <div style={{width:90,color:A.textPri,fontSize:12,fontWeight:600}}>{h.dia}</div>
                <Btn variant={h.fechado?"danger":"secondary"} size="sm"
                  onClick={()=>configStore.set(c=>({...c,horarios:c.horarios.map(x=>x.dia===h.dia?{...x,fechado:!x.fechado}:x)}))}>
                  {h.fechado?"Fechado":"Aberto"}
                </Btn>
                {!h.fechado&&(
                  <div style={{display:"flex",alignItems:"center",gap:8,flex:1}}>
                    <input type="time" value={h.abre==="—"?"09:00":h.abre}
                      onChange={e=>configStore.set(c=>({...c,horarios:c.horarios.map(x=>x.dia===h.dia?{...x,abre:e.target.value}:x)}))}
                      style={{background:A.bg1,border:`1px solid ${A.border}`,borderRadius:R.md,padding:"6px 9px",color:A.textPri,fontSize:11,fontFamily:SHARED.fontMono,outline:"none",colorScheme:"dark"}}/>
                    <span style={{color:A.textMuted,fontSize:11}}>até</span>
                    <input type="time" value={h.fecha==="—"?"19:00":h.fecha}
                      onChange={e=>configStore.set(c=>({...c,horarios:c.horarios.map(x=>x.dia===h.dia?{...x,fecha:e.target.value}:x)}))}
                      style={{background:A.bg1,border:`1px solid ${A.border}`,borderRadius:R.md,padding:"6px 9px",color:A.textPri,fontSize:11,fontFamily:SHARED.fontMono,outline:"none",colorScheme:"dark"}}/>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* OPERAÇÃO */}
      {tab==="operacao"&&(
        <Card style={{animation:`fadeUp ${M.base}`}}>
          <SectionHead title="Regras de operação" sub="Como a agenda e os sinais se comportam"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:S.lg}}>
            <Field label="Intervalo mínimo entre horários (min)">
              <TextInput type="number" value={cfg.operacao.slotMin} onChange={v=>configStore.set(c=>({...c,operacao:{...c.operacao,slotMin:Number(v)||0}}))}/>
            </Field>
            <Field label="Antecedência mínima p/ agendar (min)">
              <TextInput type="number" value={cfg.operacao.antecedencia} onChange={v=>configStore.set(c=>({...c,operacao:{...c.operacao,antecedencia:Number(v)||0}}))}/>
            </Field>
            <Field label="Sinal antecipado (%)">
              <TextInput type="number" value={cfg.operacao.sinalPct} onChange={v=>configStore.set(c=>({...c,operacao:{...c.operacao,sinalPct:Number(v)||0}}))}/>
            </Field>
            <Field label="Janela de cancelamento sem multa (h)">
              <TextInput type="number" value={cfg.operacao.cancelamentoH} onChange={v=>configStore.set(c=>({...c,operacao:{...c.operacao,cancelamentoH:Number(v)||0}}))}/>
            </Field>
            <Field label="Intervalo ideal de retorno (dias) · recorrência">
              <TextInput type="number" value={cfg.operacao.intervaloRetornoDias ?? 15} onChange={v=>configStore.set(c=>({...c,operacao:{...c.operacao,intervaloRetornoDias:Number(v)||0}}))}/>
            </Field>
          </div>
          <div style={{marginTop:S.md,background:`${A.cyan}0A`,border:`1px solid ${A.cyan}20`,borderRadius:R.md,padding:"10px 12px",color:A.textSec,fontSize:10.5}}>
            Com sinal de <b style={{color:A.cyan}}>{cfg.operacao.sinalPct}%</b>, um Combo VIP de R$ 90 exige
            <b style={{color:A.cyan}}> R$ {(90*cfg.operacao.sinalPct/100).toFixed(2)}</b> antecipado para confirmar.
          </div>
        </Card>
      )}

      {/* BARBEARIA */}
      {tab==="barbearia"&&(
        <Card style={{animation:`fadeUp ${M.base}`}}>
          <SectionHead title="Dados da barbearia" sub="Aparecem no app do cliente e nos relatórios"/>
          <div style={{display:"flex",gap:S.lg}}>
            <div style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
              <div style={{width:80,height:80,borderRadius:R.xl,background:cfg.barbearia.logoUrl?`url(${cfg.barbearia.logoUrl}) center/cover`:`linear-gradient(135deg,${A.blue}CC,${A.cyan}88)`,
                display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 16px ${A.blue}30`}}>
                {!cfg.barbearia.logoUrl&&<Ico n="cut" size={28} color="#fff"/>}
              </div>
              <span style={{color:A.textMuted,fontSize:9}}>Logo</span>
            </div>
            <div style={{flex:1,display:"grid",gridTemplateColumns:"1fr 1fr",gap:S.md}}>
              <Field label="Nome"><TextInput value={cfg.barbearia.nome} onChange={v=>configStore.set(c=>({...c,barbearia:{...c.barbearia,nome:v}}))}/></Field>
              <Field label="Cidade / UF"><TextInput value={cfg.barbearia.cidade} onChange={v=>configStore.set(c=>({...c,barbearia:{...c.barbearia,cidade:v}}))}/></Field>
              <Field label="Endereço"><TextInput value={cfg.barbearia.endereco} onChange={v=>configStore.set(c=>({...c,barbearia:{...c.barbearia,endereco:v}}))}/></Field>
              <Field label="Telefone / WhatsApp"><TextInput value={cfg.barbearia.telefone} onChange={v=>configStore.set(c=>({...c,barbearia:{...c.barbearia,telefone:v}}))}/></Field>
              <div style={{gridColumn:"1 / -1"}}><Field label="URL do logo (https://…)"><TextInput value={cfg.barbearia.logoUrl} onChange={v=>configStore.set(c=>({...c,barbearia:{...c.barbearia,logoUrl:v}}))} placeholder="https://…/logo.png"/></Field></div>
            </div>
          </div>
          <div style={{marginTop:S.md,display:"flex",gap:8,justifyContent:"flex-end"}}>
            <Btn variant="secondary" size="sm" onClick={()=>{ configStore.set(DEFAULT_CONFIG); toast("Configurações restauradas ao padrão", A.amber, "warning"); }}>Restaurar padrão</Btn>
            <Btn size="sm" onClick={async()=>{
              // P1-1: envia a CONFIG RICA (serviços, barbeiros, dados da barbearia e horário
              // POR DIA). O backend (actionSalvarConfig_) detecta o shape rico, persiste em
              // CONFIG_JSON e deriva os campos legados sozinho — assim o que o dono edita aqui
              // CHEGA ao portal do cliente (que lê serviços/barbeiros do backend).
              const gasConfig = {
                barbearia:  cfg.barbearia,
                servicos:   cfg.servicos,
                barbeiros:  cfg.barbeiros || [],
                horarios:   cfg.horarios,
                operacao:   cfg.operacao,
                fidelidade: cfg.fidelidade,
              };
              if(!ENV.hasBackend){
                toast("Salvo localmente (modo demonstração)", A.green, "check");
                return;
              }
              const key = window.prompt("Chave de admin (ADMIN_KEY do GAS) para salvar no backend:");
              if(!key) { toast("Salvamento no backend cancelado", A.textSec, "warning"); return; }
              try {
                const r = await api.salvarConfig(key, gasConfig);
                toast(r&&r.success?"Configuração salva no GAS ✓ (serviços, barbeiros e horários já valem no portal)":(r&&(r.error||r.erro))||"GAS recusou a chave admin", r&&r.success?A.green:A.amber, r&&r.success?"check":"warning");
              } catch(e){ toast("Falha de rede ao salvar no GAS", A.red, "warning"); }
            }}><Ico n="check" size={11} color="#fff"/>Salvar</Btn>
          </div>
        </Card>
      )}
    </div>
  );
};

// ─── MOBILE APP ───────────────────────────────────────────────────────────
const MobileHome = ({ setScreen }) => (
  <div style={{background:C.bg0,height:"100%",overflowY:"auto",fontFamily:SHARED.fontClient}}>
    <div style={{padding:"38px 16px 14px",background:`linear-gradient(180deg, ${C.bg1} 0%, ${C.bg0} 100%)`}}>
      <div style={{color:C.muted,fontSize:8.5,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:3}}>Olá, Carlos</div>
      <div style={{color:C.white,fontWeight:800,fontSize:17,letterSpacing:"-0.02em"}}>Seu próximo horário</div>
    </div>
    <div style={{padding:"12px 14px"}}>
      <div style={{background:`linear-gradient(135deg, #161006, ${C.bg2})`,border:`1px solid ${C.gold}25`,borderRadius:14,padding:"14px",marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div>
            <div style={{color:C.gold,fontSize:8.5,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:3}}>Confirmado</div>
            <div style={{color:C.white,fontWeight:700,fontSize:13}}>Corte de Cabelo</div>
            <div style={{color:C.muted,fontSize:9,marginTop:3}}>Seg, 12 mai · 14:00 · Carlos Lima</div>
          </div>
          <div style={{width:36,height:36,borderRadius:10,background:`${C.gold}12`,border:`1px solid ${C.gold}28`,
            display:"flex",alignItems:"center",justifyContent:"center",color:C.gold,fontSize:16}}>✂</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <div onClick={()=>setScreen(1)} style={{background:C.gold,borderRadius:8,padding:"8px",textAlign:"center",cursor:"pointer"}}>
            <div style={{color:"#0C0C0C",fontSize:10,fontWeight:700}}>Reagendar</div>
          </div>
          <div style={{background:C.bg3,borderRadius:8,padding:"8px",textAlign:"center",cursor:"pointer"}}>
            <div style={{color:C.muted,fontSize:10}}>Cancelar</div>
          </div>
        </div>
      </div>
      <div onClick={()=>setScreen(5)} style={{cursor:"pointer",background:`linear-gradient(135deg, #0d0d18, ${C.bg2})`,border:`1px solid ${A.purple}14`,borderRadius:14,padding:"12px 14px",marginBottom:10}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
          <div style={{color:C.gold,fontSize:10,fontWeight:700}}>✦ Nível Ouro</div>
          <div style={{color:C.muted,fontSize:8.5}}>13 visitas</div>
        </div>
        <MiniBar pct={65} color={C.gold} height={3}/>
        <div style={{color:C.muted,fontSize:8,marginTop:4}}>7 visitas para Diamond VIP ✦</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
        {[{icon:"📅",label:"Agendar",action:1},{icon:"✂",label:"Serviços",action:1},{icon:"★",label:"Fidelidade",action:5},{icon:"📋",label:"Histórico",action:3}].map((a,i)=>(
          <div key={i} onClick={()=>a.action!==null&&setScreen(a.action)}
            style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 12px",
              cursor:a.action!==null?"pointer":"default",transition:`border-color ${M.micro}, transform ${M.micro}`}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=`${C.gold}35`;e.currentTarget.style.transform="translateY(-1px)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.transform="translateY(0)";}}
          >
            <div style={{fontSize:16,marginBottom:4}}>{a.icon}</div>
            <div style={{color:C.white,fontSize:10,fontWeight:600}}>{a.label}</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const MobileAgendar = ({ setScreen }) => {
  const [sel, setSel] = useState(1);
  const [hora, setHora] = useState(null);
  const [email, setEmail] = useState("");
  const servicos=[{n:"Corte",p:"R$ 45",d:"45 min"},{n:"Corte + Barba",p:"R$ 65",d:"90 min"},{n:"Barba",p:"R$ 30",d:"30 min"},{n:"Combo VIP",p:"R$ 90",d:"120 min"}];
  const horarios=["09:00","10:00","11:30","14:00","15:30","17:00"];
  return (
    <div style={{background:C.bg0,height:"100%",overflowY:"auto",fontFamily:SHARED.fontClient}}>
      <div style={{padding:"36px 14px 12px",background:C.bg1,borderBottom:`1px solid ${C.border}`}}>
        <div style={{color:C.muted,fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:2}}>Agendar</div>
        <div style={{color:C.white,fontWeight:700,fontSize:14}}>Escolha o serviço</div>
      </div>
      <div style={{padding:"12px 14px"}}>
        <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:12}}>
          {servicos.map((s,i)=>(
            <div key={i} onClick={()=>setSel(i)} style={{
              background:sel===i?`${C.gold}10`:C.bg2,
              border:`1px solid ${sel===i?C.gold+"42":"#282828"}`,
              borderRadius:10,padding:"9px 11px",cursor:"pointer",
              display:"flex",justifyContent:"space-between",alignItems:"center",
              transition:`all ${M.micro}`,
              transform:sel===i?"translateX(2px)":"translateX(0)",
            }}>
              <div>
                <div style={{color:C.white,fontSize:11,fontWeight:600}}>{s.n}</div>
                <div style={{color:C.muted,fontSize:8.5}}>{s.d}</div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{color:sel===i?C.gold:C.muted,fontSize:11,fontWeight:700}}>{s.p}</span>
                {sel===i&&<span style={{color:C.gold,fontSize:11}}>✓</span>}
              </div>
            </div>
          ))}
        </div>
        <div style={{color:C.muted,fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:7}}>Horários · Amanhã</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:5,marginBottom:12}}>
          {horarios.map(h=>(
            <div key={h} onClick={()=>setHora(h)} style={{
              background:hora===h?C.gold:C.bg2,
              border:`1px solid ${hora===h?C.gold:"#282828"}`,
              borderRadius:8,padding:"7px 4px",textAlign:"center",cursor:"pointer",
              color:hora===h?"#0C0C0C":C.white,
              fontSize:10,fontWeight:hora===h?700:400,
              transition:`all 150ms ${M.curve}`,
              transform:hora===h?"scale(1.04)":"scale(1)",
              boxShadow:hora===h?`0 0 10px ${C.gold}44`:"none",
            }}>{h}</div>
          ))}
        </div>
        {/* SEÇÃO 32.7 — e-mail opcional + incentivo ao convite no Google Calendar.
            O contrato api.agendar({...payload}) já repassa `email` ao GAS. */}
        <div style={{color:C.muted,fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:5}}>Seu e-mail (opcional)</div>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="voce@email.com"
          style={{width:"100%",boxSizing:"border-box",background:C.bg2,border:`1px solid ${email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?C.gold:"#282828"}`,
            borderRadius:8,padding:"8px 10px",color:C.white,fontSize:11,outline:"none",marginBottom:6,fontFamily:SHARED.fontClient}}/>
        <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:12,color:C.gold,fontSize:8.5}}>
          <span>📅</span><span>Receba o convite no seu Google Calendar — difícil esquecer!</span>
        </div>
        <div onClick={()=>hora&&setScreen(2)} style={{
          background:hora?C.gold:C.bg3,borderRadius:10,padding:10,textAlign:"center",
          color:hora?"#0C0C0C":C.muted,fontWeight:700,fontSize:11,
          cursor:hora?"pointer":"default",transition:`all ${M.base}`,
          boxShadow:hora?`0 0 16px ${C.gold}44`:"none",
          transform:hora?"translateY(-1px)":"translateY(0)",
        }}>
          {hora?`Confirmar — ${hora}`:"Selecione um horário"}
        </div>
      </div>
    </div>
  );
};

const MobileConfirm = () => (
  <div style={{background:C.bg0,height:"100%",display:"flex",flexDirection:"column",
    alignItems:"center",justifyContent:"center",padding:20,fontFamily:SHARED.fontClient}}>
    <div style={{width:52,height:52,borderRadius:"50%",background:`${C.gold}15`,border:`2px solid ${C.gold}`,
      display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,marginBottom:12,
      boxShadow:`0 0 24px ${C.gold}30`,color:C.gold,animation:`scaleIn ${M.spring}`}}>✓</div>
    <div style={{color:C.white,fontWeight:800,fontSize:14,marginBottom:3,animation:`fadeUp ${M.base} 0.1s both`}}>Agendado!</div>
    <div style={{color:C.gold,fontSize:9.5,marginBottom:14,animation:`fadeUp ${M.base} 0.2s both`}}>Confirmação no WhatsApp</div>
    <div style={{background:C.bg2,border:`1px solid ${C.gold}18`,borderRadius:12,padding:"12px 14px",
      width:"100%",animation:`fadeUp ${M.base} 0.3s both`}}>
      {[["Serviço","Corte + Barba"],["Data","Seg, 12 mai"],["Horário","14:00"],
        ["Profissional","Carlos Lima"],["Valor","R$ 65,00"]].map(([k,v])=>(
        <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"4px 0",borderBottom:`1px solid ${C.bg1}`}}>
          <span style={{color:C.muted,fontSize:9}}>{k}</span>
          <span style={{color:C.white,fontSize:9,fontWeight:600}}>{v}</span>
        </div>
      ))}
    </div>
    <div style={{color:C.muted,fontSize:8,marginTop:10,textAlign:"center",lineHeight:1.7,animation:`fadeUp ${M.base} 0.4s both`}}>
      Lembrete automático 24h antes<br/>Responda <b style={{color:C.gold}}>C</b> para confirmar
    </div>
  </div>
);

const MobileHistorico = ({ setScreen }) => {
  const visitas=[
    {d:"03 Mai 2026",s:"Corte + Barba",v:65,prof:"Carlos Lima"},
    {d:"15 Abr 2026",s:"Corte",v:45,prof:"Carlos Lima"},
    {d:"28 Mar 2026",s:"Barba",v:30,prof:"João P."},
    {d:"10 Mar 2026",s:"Combo VIP",v:90,prof:"Carlos Lima"},
    {d:"22 Fev 2026",s:"Corte",v:45,prof:"Carlos Lima"},
  ];
  const total=visitas.reduce((a,b)=>a+b.v,0);
  return (
    <div style={{background:C.bg0,height:"100%",overflowY:"auto",fontFamily:SHARED.fontClient}}>
      <div style={{padding:"36px 14px 12px",background:C.bg1,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
        <div onClick={()=>setScreen(0)} style={{cursor:"pointer",color:C.gold,fontSize:16}}>‹</div>
        <div>
          <div style={{color:C.muted,fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase"}}>Histórico</div>
          <div style={{color:C.white,fontWeight:700,fontSize:14}}>Suas visitas</div>
        </div>
      </div>
      <div style={{padding:"12px 14px"}}>
        <div style={{display:"flex",gap:7,marginBottom:12}}>
          <div style={{flex:1,background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px"}}>
            <div style={{color:C.muted,fontSize:8,textTransform:"uppercase"}}>Visitas</div>
            <div style={{color:C.gold,fontSize:18,fontWeight:800}}>{visitas.length}</div>
          </div>

        </div>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {visitas.map((v,i)=>(
            <div key={i} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:C.white,fontSize:11,fontWeight:600}}>{v.s}</div>
                <div style={{color:C.muted,fontSize:8.5,marginTop:2}}>{v.d} · {v.prof}</div>
              </div>

            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const MobilePerfil = ({ setScreen }) => (
  <div style={{background:C.bg0,height:"100%",overflowY:"auto",fontFamily:SHARED.fontClient}}>
    <div style={{padding:"36px 14px 12px",background:C.bg1,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
      <div onClick={()=>setScreen(0)} style={{cursor:"pointer",color:C.gold,fontSize:16}}>‹</div>
      <div>
        <div style={{color:C.muted,fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase"}}>Perfil</div>
        <div style={{color:C.white,fontWeight:700,fontSize:14}}>Minha conta</div>
      </div>
    </div>
    <div style={{padding:"16px 14px"}}>
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,marginBottom:16}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:`linear-gradient(135deg,${C.gold},${C.bronze})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#0C0C0C",fontWeight:800,fontSize:22}}>C</div>
        <div style={{textAlign:"center"}}>
          <div style={{color:C.white,fontWeight:700,fontSize:14}}>Carlos Mendes</div>
          <div style={{color:C.gold,fontSize:9.5,marginTop:2}}>✦ Nível Ouro · 13 visitas</div>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:6}}>
        {[["Telefone","(31) 98888-1234"],["E-mail","carlos@email.com"],["Cliente desde","Jan 2024"],["Lembretes","WhatsApp ativo"]].map(([k,v])=>(
          <div key={k} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,padding:"11px 12px",display:"flex",justifyContent:"space-between"}}>
            <span style={{color:C.muted,fontSize:10}}>{k}</span>
            <span style={{color:C.white,fontSize:10,fontWeight:600}}>{v}</span>
          </div>
        ))}
      </div>
      <div onClick={()=>setScreen(3)} style={{marginTop:12,background:C.bg3,borderRadius:10,padding:11,textAlign:"center",cursor:"pointer",color:C.gold,fontSize:11,fontWeight:600}}>Ver histórico de visitas</div>
    </div>
  </div>
);

const MobileFidelidade = ({ setScreen }) => {
  useStore(configStore);
  const fid = getFidelidade();
  // Programa desligado → não mostra nada de fidelidade ao cliente
  if (!fid.ativo) {
    return (
      <div style={{background:C.bg0,height:"100%",overflowY:"auto",fontFamily:SHARED.fontClient}}>
        <div style={{padding:"36px 14px 12px",background:C.bg1,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
          <div onClick={()=>setScreen(0)} style={{cursor:"pointer",color:C.gold,fontSize:16}}>‹</div>
          <div style={{color:C.white,fontWeight:700,fontSize:14}}>Fidelidade</div>
        </div>
        <div style={{padding:"40px 20px",textAlign:"center",color:C.muted,fontSize:12}}>
          Programa de fidelidade indisponível no momento.
        </div>
      </div>
    );
  }
  const visitasDemo = 8; // no app real virá do cadastro do cliente
  const niveisAsc = [...fid.niveis].sort((a,b)=>a.min-b.min);
  const atual = nivelPorVisitas(visitasDemo);
  const idxAtual = niveisAsc.findIndex(n=>n.label===atual.label);
  const prox = niveisAsc[idxAtual+1];
  const faltam = prox ? Math.max(0, prox.min - visitasDemo) : 0;
  const pct = prox ? Math.min(100, Math.round((visitasDemo/prox.min)*100)) : 100;
  const recompensasVisiveis = fid.recompensas.filter(r=>r.ativo);
  return (
    <div style={{background:C.bg0,height:"100%",overflowY:"auto",fontFamily:SHARED.fontClient}}>
      <div style={{padding:"36px 14px 12px",background:C.bg1,borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
        <div onClick={()=>setScreen(0)} style={{cursor:"pointer",color:C.gold,fontSize:16}}>‹</div>
        <div>
          <div style={{color:C.muted,fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase"}}>Fidelidade</div>
          <div style={{color:C.white,fontWeight:700,fontSize:14}}>Seu nível</div>
        </div>
      </div>
      <div style={{padding:"14px"}}>
        <div style={{background:`linear-gradient(135deg, #161006, ${C.bg2})`,border:`1px solid ${C.gold}25`,borderRadius:14,padding:"16px",marginBottom:14,textAlign:"center"}}>
          <div style={{color:C.gold,fontSize:9,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Nível atual</div>
          <div style={{color:C.white,fontWeight:800,fontSize:20}}>{atual.icon} {atual.label}</div>
          {prox && <>
            <div style={{margin:"12px 0 6px"}}><MiniBar pct={pct} color={C.gold} height={5}/></div>
            <div style={{color:C.muted,fontSize:9}}>{faltam} {faltam===1?"visita":"visitas"} para {prox.label}</div>
          </>}
        </div>
        {/* Benefícios do nível atual */}
        {atual.beneficios?.length>0 && <>
          <div style={{color:C.muted,fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Seus benefícios</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
            {atual.beneficios.map((b,i)=>(
              <span key={i} style={{background:`${C.gold}12`,border:`1px solid ${C.gold}30`,color:C.gold,borderRadius:8,padding:"5px 10px",fontSize:10,fontWeight:600}}>{b}</span>
            ))}
          </div>
        </>}
        <div style={{color:C.muted,fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Trilha de níveis</div>
        <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
          {[...fid.niveis].sort((a,b)=>a.min-b.min).map((nv,i)=>(
            <div key={i} style={{background:C.bg2,border:`1px solid ${nv.label===atual.label?nv.cor+"55":C.border}`,borderRadius:10,padding:"10px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:nv.cor}}/>
                <span style={{color:C.white,fontSize:11,fontWeight:600}}>{nv.icon} {nv.label}</span>
              </div>
              <span style={{color:C.muted,fontSize:9}}>{nv.min}+ visitas</span>
            </div>
          ))}
        </div>
        {recompensasVisiveis.length>0 && <>
          <div style={{color:C.muted,fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>Recompensas</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {recompensasVisiveis.map((r,i)=>(
              <div key={r.id} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{fontSize:16}}>{r.icon}</div>
                <div style={{flex:1}}><div style={{color:C.white,fontSize:11,fontWeight:600}}>{r.descricao}</div><div style={{color:C.muted,fontSize:8.5}}>{r.marco}</div></div>
              </div>
            ))}
          </div>
        </>}
      </div>
    </div>
  );
};

const MobilePreview = () => {
  const [screen, setScreen] = useState(0);
  const screens=["Home","Agendar","OK","Hist.","Perfil","Pontos"];
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
      <div style={{
        width:238,height:478,borderRadius:32,background:"#080808",border:"2px solid #252525",
        boxShadow:`0 0 0 1px #111, 0 24px 48px #00000099, 0 0 40px ${C.gold}14`,
        overflow:"hidden",display:"flex",flexDirection:"column",position:"relative",
      }}>
        <div style={{position:"absolute",top:0,left:"50%",transform:"translateX(-50%)",
          width:68,height:18,background:"#080808",borderRadius:"0 0 12px 12px",zIndex:10,
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{width:28,height:3.5,borderRadius:2,background:"#1a1a1a"}}/>
        </div>
        <div style={{flex:1,overflow:"hidden",position:"relative"}}>
          {screen===0&&<MobileHome setScreen={setScreen}/>}
          {screen===1&&<MobileAgendar setScreen={setScreen}/>}
          {screen===2&&<MobileConfirm/>}
          {screen===3&&<MobileHistorico setScreen={setScreen}/>}
          {screen===4&&<MobilePerfil setScreen={setScreen}/>}
          {screen===5&&<MobileFidelidade setScreen={setScreen}/>}
        </div>
        <div style={{background:C.bg1,borderTop:`1px solid ${C.border}`,padding:"8px 0",display:"flex",justifyContent:"center",gap:5}}>
          {screens.map((s,i)=>(
            <div key={i} onClick={()=>setScreen(i)} style={{cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
              <div style={{width:i===screen?16:4,height:3,borderRadius:2,background:i===screen?C.gold:"#2e2e2e",
                transition:`all ${M.base}`}}/>
              <span style={{color:i===screen?C.gold:"#333",fontSize:6.5,fontWeight:i===screen?600:400}}>{s}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{color:A.textMuted,fontSize:8,letterSpacing:"0.1em",textTransform:"uppercase"}}>Área do Cliente · Mobile First</div>
    </div>
  );
};

// ─── HOME PAGE ────────────────────────────────────────────────────────────
const HomePage = () => (
  <div style={{display:"flex",flexDirection:"column",gap:S.lg}}>
    <MorningBriefing/>
    <KPIStrip/>
    <div className="aq-row-stack" style={{display:"flex",gap:S.md,alignItems:"flex-start"}}>
      <div className="aq-fixed-auto" style={{flex:"0 0 340px",width:"100%",maxWidth:"100%"}}><AgendaDia/></div>
      <div style={{flex:1,display:"flex",flexDirection:"column",gap:S.md,minWidth:0,width:"100%"}}>
        <div className="aq-row-stack" style={{display:"flex",gap:S.md}}>
          <div style={{flex:1}}><RetencaoChart/></div>
          <div style={{flex:1}}><ScoreDistrib/></div>
        </div>
        <div className="aq-row-stack" style={{display:"flex",gap:S.md}}>
          <div style={{flex:1}}><ClientesRisco/></div>
          <div style={{flex:1}}><WaitlistHome/></div>
        </div>
        <MetricasReais/>
      </div>
      <div className="aq-hide-mobile" style={{flexShrink:0}}><MobilePreview/></div>
    </div>
  </div>
);

// ─── ONBOARDING · PRIMEIRO ACESSO (v9.1 · wizard 3 passos) ────────────────
// Aparece só na 1ª execução (flag em localStorage). Captura o essencial e
// grava no configStore real — depois some. "Pular" usa os defaults.
const ONBOARD_KEY = "onboarded_v9";
const isOnboarded = () => !!lsGet(ONBOARD_KEY, false);

const Onboarding = ({ onDone }) => {
  const toast = useToast();
  const base = configStore.get();
  const [step, setStep] = useState(0);
  const [biz, setBiz] = useState({ ...base.barbearia });
  const [hora, setHora] = useState({ abre: "09:00", fecha: "19:00" });
  const [serv, setServ] = useState({ nome: base.servicos?.[0]?.nome ?? "Corte", preco: String(base.servicos?.[0]?.preco ?? 45), duracao: String(base.servicos?.[0]?.duracao ?? 45) });

  const finish = (skip = false) => {
    if (!skip) {
      configStore.set(prev => ({
        ...prev,
        barbearia: { ...prev.barbearia, ...biz },
        horarios: prev.horarios.map(h => h.fechado ? h : { ...h, abre: hora.abre, fecha: hora.fecha }),
        servicos: [
          { id: 1, nome: serv.nome || "Corte", preco: Number(serv.preco) || 45, duracao: Number(serv.duracao) || 45, ativo: true },
          ...prev.servicos.slice(1),
        ],
      }));
    }
    lsSet(ONBOARD_KEY, true);
    toast(skip ? "Configuração padrão aplicada" : `Bem-vindo, ${biz.nome || "barbearia"} — tudo pronto`, A.green, "check");
    onDone();
  };

  const steps = [
    { t: "Dados da barbearia", s: "Como seus clientes te encontram" },
    { t: "Horário de funcionamento", s: "Aplicado aos dias úteis (ajusta depois em Config)" },
    { t: "Serviço principal", s: "Seu carro-chefe — adicione os demais depois" },
  ];
  const last = step === steps.length - 1;

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9999, background:`${A.bg0}F2`, backdropFilter:"blur(6px)",
      display:"flex", alignItems:"center", justifyContent:"center", padding:S.xl,
      fontFamily:SHARED.fontAdmin, animation:`overlayIn ${M.base}`,
    }}>
      <div style={{ width:440, maxWidth:"100%", animation:`fadeUp ${M.enter} both` }}>
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:S.lg}}>
            {steps.map((_,i)=>(
              <div key={i} style={{
                flex:1, height:3, borderRadius:R.pill,
                background: i<=step ? A.cyan : A.border,
                transition:`background ${M.base}`,
              }}/>
            ))}
          </div>
          <div style={{color:A.textMuted,fontSize:9,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>
            Passo {step+1} de {steps.length}
          </div>
          <div style={{color:A.textPri,fontSize:18,fontWeight:800,marginBottom:3}}>{steps[step].t}</div>
          <div style={{color:A.textSec,fontSize:11,marginBottom:S.lg}}>{steps[step].s}</div>

          {step===0 && (
            <div style={{display:"flex",flexDirection:"column",gap:S.sm}}>
              <Field label="Nome"><TextInput value={biz.nome} onChange={v=>setBiz({...biz,nome:v})} placeholder="Aquino Barbearia"/></Field>
              <Field label="Telefone / WhatsApp"><TextInput value={biz.telefone} onChange={v=>setBiz({...biz,telefone:v})} placeholder="(31) 99999-0000"/></Field>
              <Field label="Cidade"><TextInput value={biz.cidade} onChange={v=>setBiz({...biz,cidade:v})} placeholder="Ipatinga · MG"/></Field>
            </div>
          )}
          {step===1 && (
            <div style={{display:"flex",gap:S.sm}}>
              <Field label="Abre"><TextInput value={hora.abre} onChange={v=>setHora({...hora,abre:v})} placeholder="09:00"/></Field>
              <Field label="Fecha"><TextInput value={hora.fecha} onChange={v=>setHora({...hora,fecha:v})} placeholder="19:00"/></Field>
            </div>
          )}
          {step===2 && (
            <div style={{display:"flex",flexDirection:"column",gap:S.sm}}>
              <Field label="Serviço"><TextInput value={serv.nome} onChange={v=>setServ({...serv,nome:v})} placeholder="Corte"/></Field>
              <div style={{display:"flex",gap:S.sm}}>
                <Field label="Preço (R$)"><TextInput value={serv.preco} onChange={v=>setServ({...serv,preco:v})} type="number" placeholder="45"/></Field>
                <Field label="Duração (min)"><TextInput value={serv.duracao} onChange={v=>setServ({...serv,duracao:v})} type="number" placeholder="45"/></Field>
              </div>
            </div>
          )}

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:S.xl}}>
            <Btn variant="ghost" size="sm" onClick={()=> step===0 ? finish(true) : setStep(step-1)}>
              {step===0 ? "Pular" : "Voltar"}
            </Btn>
            <Btn size="md" onClick={()=> last ? finish(false) : setStep(step+1)}>
              {last ? "Concluir" : "Continuar"}
            </Btn>
          </div>
        </Card>
        <div style={{textAlign:"center",color:A.textMuted,fontSize:8.5,marginTop:S.sm}}>
          Pode reconfigurar tudo depois em Configurações · dados salvos localmente
        </div>
      </div>
    </div>
  );
};

// ─── APP ROOT ─────────────────────────────────────────────────────────────
// ─── RESPONSIVO · detector de celular ─────────────────────────────────────
const useIsMobile = (bp = 820) => {
  const [m, setM] = useState(() => (typeof window !== "undefined" ? window.innerWidth < bp : false));
  useEffect(() => {
    const on = () => setM(window.innerWidth < bp);
    window.addEventListener("resize", on); on();
    return () => window.removeEventListener("resize", on);
  }, [bp]);
  return m;
};

// ─── ESTILO DE TEMA · cores dinâmicas + regras responsivas ────────────────
// Injeta as cores que dependem do tema (fundo, placeholder, scrollbar) e as
// regras @media que tornam o painel usável no celular. Assina o themeStore
// para reescrever tudo ao trocar de tema.
const ThemeStyle = () => {
  useStore(themeStore);
  const light = isLight();
  return (
    <style>{`
      html, body { background:${A.bg0}; margin:0; }
      input::placeholder, textarea::placeholder { color:${A.textMuted}; }
      *::-webkit-scrollbar-thumb { background:${A.bg4}; border-radius:3px; }
      input, textarea, select { color-scheme:${light ? "light" : "dark"}; }
      @media (max-width: 820px) {
        .aq-row-stack { flex-direction:column !important; }
        .aq-hide-mobile { display:none !important; }
        .aq-grid-1 { grid-template-columns:1fr !important; }
        .aq-fixed-auto { flex:1 1 auto !important; }
      }
    `}</style>
  );
};

// ─── CARREGANDO (splash) ──────────────────────────────────────────────────
const SplashLoading = () => (
  <div style={{
    minHeight:"100vh", background:A.bg0, color:A.textPri, fontFamily:SHARED.fontAdmin,
    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16,
  }}>
    <div style={{
      width:46, height:46, borderRadius:R.lg,
      background:`linear-gradient(135deg, ${A.blue}CC, ${A.cyan}88)`,
      display:"flex", alignItems:"center", justifyContent:"center",
      boxShadow:`0 0 22px ${A.blue}40`, animation:"pulse 1.6s ease-in-out infinite",
    }}><Ico n="cut" size={22} color="#fff"/></div>
    <div style={{color:A.textSec,fontSize:12}}>Carregando o painel…</div>
  </div>
);

// ─── LOGIN ────────────────────────────────────────────────────────────────
// Pede a chave de acesso (ADMIN_KEY). Ao entrar, valida no backend; se a chave
// for boa, o painel abre com os DADOS REAIS. A chave fica salva só no aparelho.
const LoginScreen = ({ onLogin, error }) => {
  useStore(themeStore);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!key.trim() || busy) return;
    setBusy(true);
    await onLogin(key.trim());
    setBusy(false);
  };
  return (
    <div style={{
      minHeight:"100vh", background:A.bg0, color:A.textPri, fontFamily:SHARED.fontAdmin,
      display:"flex", alignItems:"center", justifyContent:"center", padding:S.xl,
    }}>
      <div style={{ width:360, maxWidth:"100%", animation:`fadeUp ${M.enter} both` }}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",marginBottom:S.xl}}>
          <div style={{
            width:52, height:52, borderRadius:R.lg,
            background:`linear-gradient(135deg, ${A.blue}CC, ${A.cyan}88)`,
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:`0 0 22px ${A.blue}40`, marginBottom:12,
          }}><Ico n="cut" size={24} color="#fff"/></div>
          <div style={{color:A.textPri,fontWeight:800,fontSize:18,letterSpacing:"0.02em"}}>AQUINO</div>
          <div style={{color:A.textMuted,fontSize:10,letterSpacing:"0.08em",textTransform:"uppercase"}}>Painel de gestão</div>
        </div>
        <Card>
          <div style={{color:A.textPri,fontSize:15,fontWeight:700,marginBottom:4}}>Entrar</div>
          <div style={{color:A.textSec,fontSize:11,marginBottom:S.lg}}>Digite a chave de acesso do painel.</div>
          <Field label="Chave de acesso">
            <input
              type="password" value={key} autoFocus
              onChange={e=>setKey(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter") submit(); }}
              placeholder="••••••••"
              style={{
                width:"100%", background:A.bg1, color:A.textPri,
                border:`1px solid ${error?A.red:A.border}`, borderRadius:R.md,
                padding:"10px 12px", fontSize:13, outline:"none", fontFamily:SHARED.fontAdmin,
              }}
            />
          </Field>
          {error && (
            <div style={{display:"flex",alignItems:"center",gap:6,color:A.red,fontSize:10.5,marginTop:8}}>
              <Ico n="warning" size={12} color={A.red}/> {error}
            </div>
          )}
          <div style={{marginTop:S.lg}}>
            <Btn variant="primary" size="lg" disabled={busy} onClick={submit} style={{width:"100%",justifyContent:"center"}}>
              {busy ? "Verificando…" : "Entrar"}
            </Btn>
          </div>
        </Card>
        <div style={{textAlign:"center",color:A.textMuted,fontSize:8.5,marginTop:S.md}}>
          Acesso restrito · a chave fica salva só neste aparelho
        </div>
      </div>
    </div>
  );
};

function AppInner() {
  useStore(themeStore);                 // re-renderiza (cascata) ao trocar tema
  const live = useLive();
  const mobile = useIsMobile();
  const [drawer, setDrawer] = useState(false);

  const [activeNav, setActiveNav] = useState("dash");
  const [showOnboard, setShowOnboard] = useState(() => !isOnboarded());
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifsOpen, setNotifsOpen] = useState(false);
  const [notifsList, setNotifsList] = useState(NOTIFS_DATA);
  const unreadCount = notifsList.filter(n=>n.unread).length;

  // v8: ZeroThink com persistência de sessão
  const DISMISS_KEY = "aquino_zerothink_dismissed_v8";
  const [zeroThinkTrigger, setZeroThinkTrigger] = useState(null);

  const handleDismiss = useCallback(() => {
    setZeroThinkTrigger(null);
    try { sessionStorage.setItem(DISMISS_KEY, "1"); } catch(e) {}
  }, []);

  // v8: Keyboard shortcuts globais — ⌘K busca, Esc fecha
  useEffect(()=>{
    const handler=(e)=>{
      if((e.metaKey||e.ctrlKey)&&e.key==="k"){ e.preventDefault(); setSearchOpen(true); setNotifsOpen(false); }
      if(e.key==="Escape"){ setSearchOpen(false); setNotifsOpen(false); setDrawer(false); }
    };
    window.addEventListener("keydown",handler);
    return ()=>window.removeEventListener("keydown",handler);
  },[]);

  // ZeroThink só no modo demonstração (usa clientes de exemplo; no real os IDs diferem)
  useEffect(()=>{
    if (activeNav !== "dash") return;
    if (live.mode !== "demo") return;
    try { if (sessionStorage.getItem(DISMISS_KEY)) return; } catch(e) {}
    const t=setTimeout(()=>{
      setZeroThinkTrigger({
        slot:"15:30", client:"Marcos Duarte",
        waitlist:[
          { nome:"Felipe Gomes", nivel:"Bronze", score:BE.calcScore(MOCK_DB.clientes.find(c=>c.id===9)) },
          { nome:"Roberto Melo",  nivel:"Prata",  score:BE.calcScore(MOCK_DB.clientes.find(c=>c.id===10)) },
        ],
      });
    },5000);
    return ()=>clearTimeout(t);
  },[activeNav, live.mode]);

  const navigate = useCallback((nav)=>{
    setActiveNav(nav);
    setSearchOpen(false);
  },[]);

  const topbar={
    dash:    {title:"Hoje",         subtitle:"Briefing operacional · Ipatinga/MG · Motor comportamental v2 ativo"},
    agenda:  {title:"Agenda",       subtitle:`Visão do dia · ${DB.agenda.length} horários · ${DB.agenda.filter(x=>["confirmado","realizado"].includes(x.status)).length} confirmados`},
    clients: {title:"Clientes",     subtitle:`${DB.clientes.length} ativos · ${DB.clientes.filter(c=>BE.shouldFlagRisk(c)).length} em atenção · Score calculado dinamicamente`},
    crm:     {title:"CRM",          subtitle:"Segmentação inteligente · 4 automações · Motor ativo"},
    finance: {title:"Financeiro",   subtitle:"Maio 2026 · R$ 11.420 acumulado · Meta 81%"},
    loyalty: {title:"Fidelização",  subtitle:"Nível calculado por visitas reais · 4 automações"},
    waitlist:{title:"Waitlist",     subtitle:`${DB.waitlist.length} aguardando · TTL por nível · Governança ativa`},
    reports: {title:"Relatórios",   subtitle:"5 relatórios · Export CSV e PDF reais (Blob)"},
    config:  {title:"Configurações",subtitle:"Serviços · preços · horários · sinal · dados da barbearia · persistido"},
    system:  {title:"Sistema",      subtitle:"v9 · Saúde em tempo real · Persistência · .env · Motor v2 · IPE · Governança"},
  };

  const renderPage=()=>{
    switch(activeNav){
      case "dash":     return <HomePage/>;
      case "agenda":   return <AgendaPage/>;
      case "clients":  return <ClientesPage/>;
      case "crm":      return <CRMPage/>;
      case "finance":  return <FinanceiroPage/>;
      case "loyalty":  return <LoyaltyPage/>;
      case "waitlist": return <WaitlistPage/>;
      case "reports":  return <RelatoriosPage/>;
      case "config":   return <ConfigPage/>;
      case "system":   return <SystemPage/>;
      default:         return <HomePage/>;
    }
  };

  return (
    <>
      <style>{KEYFRAMES}</style>

      {showOnboard && <Onboarding onDone={()=>setShowOnboard(false)}/>}

      {/* v8: Busca global funcional */}
      <SearchModal open={searchOpen} onClose={()=>setSearchOpen(false)} onNavigate={navigate}/>

      {/* v8: Painel de notificações */}
      <NotificationsPanel open={notifsOpen} onClose={()=>setNotifsOpen(false)}/>

      {live.mode==="demo" && <ZeroThinkBanner trigger={zeroThinkTrigger} onDismiss={handleDismiss}/>}

      <div style={{
        minHeight:"100vh", background:A.bg0, color:A.textPri,
        fontFamily:SHARED.fontAdmin, display:"flex", flexDirection:"column",
      }}>
        <div style={{display:"flex",flex:1,minHeight:0}}>
          {/* Desktop: barra lateral fixa. Celular: gaveta deslizante. */}
          {!mobile && <Sidebar active={activeNav} setActive={setActiveNav}/>}
          {mobile && drawer && (
            <div onClick={()=>setDrawer(false)} style={{
              position:"fixed", inset:0, zIndex:400, background:"rgba(0,0,0,0.5)",
              animation:`overlayIn ${M.base}`,
            }}>
              <div onClick={e=>e.stopPropagation()} style={{
                height:"100%", width:230, boxShadow:"2px 0 24px rgba(0,0,0,0.45)",
                animation:`slideInLeft ${M.base}`,
              }}>
                <Sidebar active={activeNav} setActive={(id)=>{ setActiveNav(id); setDrawer(false); }}/>
              </div>
            </div>
          )}
          <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"auto"}}>
            <Topbar
              {...topbar[activeNav]}
              mobile={mobile}
              onMenu={()=>setDrawer(true)}
              onSearchOpen={()=>{ setSearchOpen(true); setNotifsOpen(false); }}
              onNotifsOpen={()=>setNotifsOpen(v=>!v)}
              notifsOpen={notifsOpen}
              unreadCount={unreadCount}
            />
            <div
              key={activeNav}
              style={{
                padding: mobile ? `${S.md}px ${S.md}px ${S.xl}px` : `${S.xl}px ${S.xxl}px ${S.xxl}px`,
                animation:`pageEnter ${M.enter} both`, minWidth:0,
              }}
            >
              {renderPage()}
            </div>
          </div>
        </div>
        <div style={{
          padding: mobile ? "7px 14px" : "7px 24px", background:A.bg1, borderTop:`1px solid ${A.border}`,
          display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0, gap:8,
        }}>
          <span style={{color:A.textMuted,fontSize:8.5,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            AQUINO Barbearia & Estética · Painel de gestão
          </span>
          <span style={{
            color: live.mode==="real" ? A.green : A.amber, fontSize:8.5, flexShrink:0,
            display:"flex", alignItems:"center", gap:5,
          }}>
            <span style={{width:5,height:5,borderRadius:"50%",
              background:live.mode==="real"?A.green:A.amber,
              boxShadow:`0 0 4px ${live.mode==="real"?A.green:A.amber}88`,
              animation:"pulse 2s ease-in-out infinite"}}/>
            {live.mode==="real" ? `Conectado${live.perfil ? ` · ${live.perfil}` : ""}` : "Modo demonstração"}
          </span>
        </div>
      </div>
    </>
  );
}

// ─── CÉREBRO · decide entre LOGIN e PAINEL, busca os dados reais ──────────
function AppShell() {
  useStore(themeStore);
  useStore(adminKeyStore);
  const [status, setStatus] = useState("checking");   // checking | login | ready
  const [error, setError]   = useState("");
  const [meta, setMeta]     = useState({ mode:"demo", perfil:null, permissoes:null });

  // tenta abrir o painel com a chave atual (no 1º carregamento e no refresh)
  const load = useCallback(async () => {
    const k = adminKeyStore.get();
    if (!ENV.hasBackend) {                 // sem backend configurado → demonstração
      liveDataStore.set(null);
      setMeta({ mode:"demo", perfil:null, permissoes:null });
      setStatus("ready");
      return;
    }
    if (!k) { setStatus("login"); return; }
    setStatus("checking");
    try {
      const r = await api.dashboard(k);
      if (r && r.success && r.autenticado) {
        liveDataStore.set(adaptDashboard(r));
        setMeta({ mode:"real", perfil:r.perfil||null, permissoes:r.permissoes||null });
        setError(""); setStatus("ready"); return;
      }
      adminKeyStore.set("");
      setError("Chave incorreta. Tente novamente.");
      setStatus("login");
    } catch (e) {
      setError("Não consegui falar com o servidor. Verifique a conexão.");
      setStatus("login");
    }
  }, []);

  useEffect(() => { load(); /* 1ª vez */ }, [load]);

  // chamado pela tela de login
  const doLogin = useCallback(async (k) => {
    setError("");
    try {
      const r = await api.dashboard(k);
      if (r && r.success && r.autenticado) {
        adminKeyStore.set(k);                 // persiste só neste aparelho
        liveDataStore.set(adaptDashboard(r));
        setMeta({ mode:"real", perfil:r.perfil||null, permissoes:r.permissoes||null });
        setStatus("ready");
        return true;
      }
      setError("Chave incorreta. Tente novamente.");
      return false;
    } catch (e) {
      setError("Não consegui falar com o servidor. Verifique a conexão e tente de novo.");
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    adminKeyStore.set("");
    liveDataStore.set(null);
    setMeta({ mode:"demo", perfil:null, permissoes:null });
    setStatus("login");
  }, []);

  const refresh = useCallback(() => { load(); }, [load]);

  if (status === "checking") return <SplashLoading/>;
  if (status === "login" && ENV.hasBackend) return <LoginScreen onLogin={doLogin} error={error}/>;

  return (
    <LiveCtx.Provider value={{ ...meta, refresh, logout }}>
      <AppInner/>
    </LiveCtx.Provider>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ThemeStyle/>
      <AppShell/>
    </ToastProvider>
  );
}
