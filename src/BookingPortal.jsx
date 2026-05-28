import { useState, useEffect, useRef, createContext, useContext } from "react";

/* ════════════════════════════════════════════════════════════════════════
   AQUINO · Portal do Cliente (agendamento + área do cliente)
   ------------------------------------------------------------------------
   - Tema escuro/claro com botão de troca (preferência salva no aparelho).
   - Cliente conhecido → Área do Cliente (próximo horário + fidelidade reais).
   - Cliente novo → fluxo de agendamento.
   - Reagendar e Cancelar falam com o backend de verdade.
   - Sem backend → modo demonstração (dados mock, sem rede).
   ════════════════════════════════════════════════════════════════════════ */

// ─── ENV / API ──────────────────────────────────────────────────────────
const readEnv = (k, fb = "") => {
  try { if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env[k] != null) return import.meta.env[k]; } catch (e) {}
  return fb;
};
const ENV = {
  GAS_URL: readEnv("VITE_GAS_URL", ""),
  SITE_TOKEN: readEnv("VITE_SITE_TOKEN", "aq2025site"),
  get hasBackend() { return !!readEnv("VITE_GAS_URL", ""); },
};
const api = {
  async _get(params) {
    if (!ENV.hasBackend) return { _demo: true };
    const qs = new URLSearchParams({ ...params, token: ENV.SITE_TOKEN }).toString();
    const r = await fetch(`${ENV.GAS_URL}?${qs}`); return r.json();
  },
  async _post(body) {
    if (!ENV.hasBackend) return { _demo: true };
    const r = await fetch(ENV.GAS_URL, { method: "POST", body: JSON.stringify({ token: ENV.SITE_TOKEN, ...body }) });
    return r.json();
  },
  listarServicos:  () => api._get({ action: "listarServicos" }),
  listarBarbeiros: () => api._get({ action: "listarBarbeiros" }),
  verificarCliente:(tel) => api._get({ action: "verificarCliente", tel }),
  meusAgendamentos:(tel) => api._get({ action: "meusAgendamentos", tel }),
  slots:    (data, duracao) => api._get({ action: "slots", data, duracao }),
  agendar:  (payload) => api._post({ action: "agendamento", requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2,9)}`, ...payload }),
  cancelar: (agendamentoId, tel) => api._post({ action: "cancelar", agendamentoId, tel }),
  reagendar:(agendamentoId, data, hora, tel) => api._post({ action: "reagendar", agendamentoId, novoHorario: { data, hora }, tel }),
  atualizarPerfil: (payload) => api._post({ action: "atualizarPerfil", ...payload }),
  uploadFoto: (imagem) => api._post({ action: "uploadFoto", imagem }),
};

// ─── DADOS DEMO (sem backend) ───────────────────────────────────────────
const DEMO_SERVICOS = [
  { id:1, nome:"Corte", preco:40, duracao:60, ativo:true },
  { id:2, nome:"Barba", preco:35, duracao:35, ativo:true },
  { id:3, nome:"Acabamento", preco:15, duracao:15, ativo:true },
  { id:4, nome:"Sobrancelha Navalha", preco:15, duracao:15, ativo:true },
  { id:5, nome:"Sobrancelha Pinça", preco:35, duracao:45, ativo:true },
  { id:6, nome:"Corte e Barba", preco:65, duracao:90, ativo:true },
  { id:7, nome:"Corte + Barba + Sobrancelha", preco:75, duracao:105, ativo:true },
  { id:8, nome:"Corte e Sobrancelha", preco:50, duracao:75, ativo:true },
  { id:11, nome:"Relaxamento", preco:40, duracao:30, ativo:true },
  { id:12, nome:"Hidratação", preco:35, duracao:45, ativo:true },
];
const DEMO_BARBEIROS = [{ id:1, nome:"Vinícius Aquino", ativo:true }];
const DEMO_SLOTS = ["09:00","09:30","10:00","10:30","11:00","14:00","14:30","15:00","15:30","16:00","16:30","17:00"];

const BARBEARIA = {
  nome: "AQUINO",
  sub: "Barbearia & Estética",
  endereco: "R. Carlos Gomes, 256 — Ideal, Ipatinga/MG",
  instagram: "@aquino.inbeleza",
};

// ─── TEMAS (escuro + claro) ─────────────────────────────────────────────
const FONTS = { serif:"'Fraunces', Georgia, serif", sans:"'Hanken Grotesk', system-ui, sans-serif" };
const THEMES = {
  dark: {
    name:"dark",
    bg:"#0A0A0B", bg1:"#141416", card:"#161618", card2:"#1d1d20", line:"#2a2a2e",
    ink:"#FFFFFF", ink2:"#D8D2C8", muted:"#8C8475",
    brass:"#C18A3D", brassDeep:"#9C6C25", brassTint:"rgba(193,138,61,0.12)", brassLine:"rgba(193,138,61,0.28)",
    wa:"#1FA855", ok:"#39B36B", danger:"#E0654A",
    shadowBtn:"0 12px 24px -8px rgba(193,138,61,.45)",
    ...FONTS,
  },
  light: {
    name:"light",
    bg:"#F6F1E9", bg1:"#EFE8DC", card:"#FFFFFF", card2:"#FBF7EF", line:"#E7DECF",
    ink:"#19150F", ink2:"#3A342B", muted:"#8C8475",
    brass:"#C18A3D", brassDeep:"#9C6C25", brassTint:"#F4EAD7", brassLine:"rgba(193,138,61,0.40)",
    wa:"#1FA855", ok:"#2F8F5B", danger:"#C0492F",
    shadowBtn:"0 12px 24px -8px rgba(193,138,61,.55)",
    ...FONTS,
  },
};
const ThemeCtx = createContext(THEMES.dark);
const useT = () => useContext(ThemeCtx);
const TEMA_KEY = "aquino_portal_tema";
const lerTema = () => { try { const v = localStorage.getItem(TEMA_KEY); return v === "light" ? "light" : "dark"; } catch (e) { return "dark"; } };
const salvarTema = (t) => { try { localStorage.setItem(TEMA_KEY, t); } catch (e) {} };

// ─── HELPERS ────────────────────────────────────────────────────────────
const money = (v) => `R$ ${Number(v||0).toFixed(2).replace(".",",")}`;
const maskTel = (v) => {
  const d = String(v).replace(/\D/g,"").slice(0,11);
  if (d.length<=2) return d;
  if (d.length<=7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
};
const telLimpo = (v) => String(v).replace(/\D/g,"");
const primeiroNome = (n) => String(n||"").trim().split(/\s+/)[0] || "";

const DIAS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const MESES_L = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const proximosDias = (n=14) => {
  const out=[]; const hoje=new Date(); hoje.setHours(0,0,0,0);
  for(let i=0;i<n;i++){ const d=new Date(hoje); d.setDate(hoje.getDate()+i); out.push(d); }
  return out;
};
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const hojeISO = () => isoDate(new Date());
// "2026-05-26" → "Ter, 26 mai"
const labelData = (iso) => {
  if (!iso) return "";
  const p = String(iso).split("-"); if (p.length<3) return iso;
  const d = new Date(Number(p[0]), Number(p[1])-1, Number(p[2]));
  if (isNaN(d.getTime())) return iso;
  return `${DIAS[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
};
// normaliza data de várias formas (YYYY-MM-DD, dd/mm/yyyy, ISO) → "YYYY-MM-DD"
const normData = (v) => {
  if (!v) return "";
  const s = String(v);
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) { try { return d.toLocaleDateString("en-CA",{timeZone:"America/Sao_Paulo"}); } catch(e) { return isoDate(d); } }
  return "";
};
// extrai "HH:MM" de "HH:MM", "HH:MM:SS" ou ISO de célula de hora do Sheets
const normHora = (v) => {
  if (!v && v!==0) return "";
  const s = String(v);
  let m = s.match(/^(\d{1,2}):(\d{2})/); if (m) return `${m[1].padStart(2,"0")}:${m[2]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    try { return d.toLocaleTimeString("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",hour12:false}); } catch(e) {}
    return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  }
  return s;
};
// data/hora de um agendamento, já normalizadas (prioriza dataBR vinda do backend)
const agData = (a) => normData(a && (a.dataBR || a.data));
const agHora = (a) => normHora(a && a.horario);
// contagem de visitas saudável (ignora valores corrompidos no cadastro)
const visitasSeguras = (cli, fallback) => {
  let v = Number(cli && cli.totalVisitas);
  if (!isFinite(v) || v < 0 || v > 5000) v = Number(fallback) || 0;
  return v;
};

// ─── DATA DE NASCIMENTO (R2) ────────────────────────────────────────────
// Backend grava como "DD/MM/AAAA" (linha 1048 do Codigo.gs). O <input type="date">
// trabalha com "YYYY-MM-DD". Estes dois helpers fazem a ponte sem perder formato.
const nascParaInput = (v) => {              // o que veio do backend → valor do input
  if (!v) return "";
  const s = String(v).trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);        if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return "";
};
const nascParaBackend = (v) => {            // valor do input → o que vai pro backend
  if (!v) return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};
const nascValido = (v) => {                  // valida data plausível (não futura, idade 5-110)
  if (!v) return false;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  if (isNaN(d.getTime())) return false;
  const hj = new Date(); hj.setHours(0,0,0,0);
  if (d > hj) return false;                  // data no futuro
  const anos = (hj - d) / (1000*60*60*24*365.25);
  return anos >= 5 && anos <= 110;
};

// ─── PERFIL: NOME + SOBRENOME + EMAIL ───────────────────────────────────
// O backend tem só uma coluna NOME. Pra UX, dividimos em dois campos no portal
// e juntamos novamente antes de enviar. Email tem validação simples (não exagerada).
const dividirNome = (nomeCompleto) => {       // "Vinícius Aquino Silva" → ["Vinícius","Aquino Silva"]
  const partes = String(nomeCompleto||"").trim().split(/\s+/);
  if (partes.length === 0 || partes[0] === "") return ["",""];
  if (partes.length === 1) return [partes[0], ""];
  return [partes[0], partes.slice(1).join(" ")];
};
const emailValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||"").trim());

// ─── FOTO DO CLIENTE ────────────────────────────────────────────────────
// Reduz a imagem escolhida (câmera ou galeria) para no máx 512px e devolve
// um data URL JPEG leve, pronto pra enviar ao backend (que salva no Drive).
const reduzirImagem = (file, max = 512, q = 0.82) => new Promise((resolve, reject) => {
  if (!file || !/^image\//.test(file.type)) { reject(new Error("arquivo_invalido")); return; }
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("leitura_falhou"));
  reader.onload = () => {
    const img = new Image();
    img.onerror = () => reject(new Error("imagem_invalida"));
    img.onload = () => {
      let { width: w, height: h } = img;
      if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
      else if (h >= w && h > max) { w = Math.round(w * max / h); h = max; }
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", q));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

// ─── DEPENDENTES (filhos) ───────────────────────────────────────────────
// No estado guardamos nascimento como "yyyy-mm-dd" (formato do <input date>).
// Pro backend convertemos cada um para "DD/MM/AAAA".
const calcIdade = (nascISO) => {              // "yyyy-mm-dd" → "7 anos" / "8 meses" / ""
  if (!nascISO) return "";
  const m = String(nascISO).match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return "";
  const n = new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  if (isNaN(n.getTime())) return "";
  const hj = new Date(); hj.setHours(0,0,0,0);
  if (n > hj) return "";
  let anos = hj.getFullYear() - n.getFullYear();
  const fezAniv = (hj.getMonth() > n.getMonth()) || (hj.getMonth() === n.getMonth() && hj.getDate() >= n.getDate());
  if (!fezAniv) anos--;
  if (anos >= 2) return `${anos} anos`;
  if (anos === 1) return "1 ano";
  let meses = (hj.getFullYear()-n.getFullYear())*12 + (hj.getMonth()-n.getMonth());
  if (hj.getDate() < n.getDate()) meses--;
  meses = Math.max(0, meses);
  return meses === 1 ? "1 mês" : `${meses} meses`;
};
const depsParaBackend = (arr) => (Array.isArray(arr) ? arr : [])
  .filter(d => d && String(d.nome||"").trim())
  .map(d => ({ nome: String(d.nome).trim(), nascimento: nascParaBackend(d.nascimento) }));
const depsParaEstado = (arr) => (Array.isArray(arr) ? arr : [])
  .filter(d => d && String(d.nome||"").trim())
  .map(d => ({ nome: String(d.nome).trim(), nascimento: nascParaInput(d.nascimento) }));


// ─── INSPIRAÇÃO DO DIA ──────────────────────────────────────────────────
const DIAS_L = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
const dataExtenso = (d) => `${DIAS_L[d.getDay()]}, ${d.getDate()} de ${MESES_L[d.getMonth()]} de ${d.getFullYear()}`;

// signo solar (datas padrão)
const signoDe = (d) => {
  const md = (d.getMonth()+1)*100 + d.getDate();
  if (md>=1222 || md<=119) return "Capricórnio";
  if (md<=218) return "Aquário";
  if (md<=320) return "Peixes";
  if (md<=419) return "Áries";
  if (md<=520) return "Touro";
  if (md<=620) return "Gêmeos";
  if (md<=722) return "Câncer";
  if (md<=822) return "Leão";
  if (md<=922) return "Virgem";
  if (md<=1022) return "Libra";
  if (md<=1121) return "Escorpião";
  return "Sagitário";
};
// estação (hemisfério sul — Brasil)
const estacaoDe = (d) => {
  const md = (d.getMonth()+1)*100 + d.getDate();
  if (md>=1221 || md<=319) return "Verão";
  if (md<=620) return "Outono";
  if (md<=922) return "Inverno";
  if (md<=1220) return "Primavera";
  return "Verão";
};
// fase da lua (aproximada) — 4 fases, como na agenda de papel
const faseLuaDe = (d) => {
  const sinodico = 2551442.8; // segundos (~29,53 dias)
  const novaRef = Date.UTC(2000,0,6,18,14,0); // lua nova de referência
  const diff = (d.getTime() - novaRef) / 1000;
  let frac = ((diff % sinodico) + sinodico) % sinodico / sinodico; // 0..1
  if (frac < 0.125 || frac >= 0.875) return "Lua Nova";
  if (frac < 0.375) return "Lua Crescente";
  if (frac < 0.625) return "Lua Cheia";
  return "Lua Minguante";
};
// datas comemoradas — lista original restaurada com consertos cirúrgicos:
// (1) entradas cortadas pela metade foram removidas/completadas; (2) o lixo
// "FIxAS" foi removido sem apagar a data; (3) entradas grudadas foram separadas;
// (4) Dia da Bandeira foi movido do 18/11 para o 19/11 (a data correta);
// (5) foram acrescentadas datas conhecidas (feriados, festas juninas, Dia da
// Pizza, Dia do Rock, Dia das Crianças, Outubro Rosa, Novembro Azul, etc.).
const COMEMORACOES = {
  // ── Janeiro ──
  "01-01":["Confraternização Universal"],
  "01-04":["Dia da Abreugrafia"],
  "01-06":["Dia de Reis"],
  "01-09":["Dia do Astronauta","Dia do Fico"],
  "01-12":["Dia Nacional do Jogo"],
  "01-17":["Dia Nacional do Cabeleireiro, Barbeiro, Esteticista, Manicure, Pedicure"],
  "01-18":["Dia Nacional do Krav Maga","Dia Nacional do Farmacêutico"],
  "01-20":["Dia Nacional da Parteira Tradicional","Dia de São Sebastião"],
  "01-24":["Dia Nacional do Aposentado","Dia Nacional da Bossa Nova"],
  "01-25":["Dia Nacional de Segurança da Vida nas Áreas de Barragens","Aniversário de São Paulo"],
  "01-28":["Dia Nacional de Combate ao Trabalho Escravo","Dia Nacional do Exportador","Dia Nacional das Reservas"],
  "01-30":["Dia da Saudade","Dia Mundial da Não-Violência e da Paz"],
  "01-31":["Campanha Janeiro Branco — Saúde Mental"],
  // ── Fevereiro ──
  "02-02":["Dia de Iemanjá","Dia de Nossa Senhora dos Navegantes"],
  "02-05":["Dia Nacional da Mamografia"],
  "02-09":["Dia Nacional do Cerco da Lapa"],
  "02-14":["Dia Nacional do Brega","Dia da Amizade"],
  "02-17":["Dia Nacional da Axé-Music","Dia Nacional da Criança"],
  "02-21":["Dia Internacional da Língua Materna"],
  "02-23":["Dia Nacional do Rotary","Dia da Conquista do Voto"],
  // ── Março ──
  "03-08":["Dia Internacional da Mulher"],
  "03-12":["Dia do Bibliotecário"],
  "03-14":["Dia Nacional dos Animais"],
  "03-15":["Dia Nacional do Consumidor","Dia Nacional de Conscientização sobre as Mudanças Climáticas"],
  "03-16":["Dia Nacional do Ouvidor","Dia Nacional do Teatro do Oprimido","Dia Nacional da Imigração Judaica"],
  "03-18":["Dia do Demolay"],
  "03-19":["Dia Nacional do Artesão","Dia Nacional do Teatro para a Infância e Juventude","Dia de São José"],
  "03-20":["Dia Nacional da Aquicultura"],
  "03-21":["Dia Nacional das Tradições das Raízes de Matrizes Africanas e Nações do Candomblé","Dia Internacional contra a Discriminação Racial","Dia Mundial da Poesia"],
  "03-22":["Dia Nacional da Água","Dia Nacional do Piso"],
  "03-23":["Dia Nacional da Comunidade Árabe","Dia Mundial da Meteorologia"],
  "03-24":["Dia Mundial de Combate à Tuberculose"],
  "03-25":["Dia Nacional do Oficial de Justiça"],
  "03-27":["Dia Mundial do Teatro","Dia do Circo"],
  "03-29":["Dia Nacional do Coração"],
  // ── Abril ──
  "04-01":["Dia da Mentira"],
  "04-02":["Dia Mundial de Conscientização do Autismo","Dia Internacional do Livro Infantil"],
  "04-05":["Dia Nacional da Polícia Civil"],
  "04-07":["Dia Mundial da Saúde","Dia do Jornalista"],
  "04-08":["Dia Nacional do Sistema Braille","Dia Nacional do Humorista"],
  "04-12":["Dia da Celebração da Amizade Brasil-Israel"],
  "04-13":["Dia Pan-Americano","Dia do Beijo","Dia do Hino Nacional"],
  "04-14":["Dia Nacional de Prevenção ao Afogamento Infantil"],
  "04-15":["Dia Nacional da Voz","Dia Mundial da Arte","Dia do Desenhista"],
  "04-16":["Dia Nacional da Lembrança do Holocausto","Dia Nacional da Botânica"],
  "04-17":["Dia Nacional de Luta pela Reforma Agrária","Dia Nacional do Livro Infantil"],
  "04-18":["Dia Nacional do Espiritismo","Dia de Monteiro Lobato"],
  "04-19":["Dia dos Povos Indígenas"],
  "04-20":["Dia do Diplomata","Dia das Polícias Civis e Militares"],
  "04-21":["Tiradentes","Dia Consagrado ao Funcionário Policial Civil"],
  "04-22":["Descobrimento do Brasil","Dia da Comunidade Luso-Brasileira","Dia Nacional do Choro","Dia Nacional do Escotismo","Dia do Planeta Terra"],
  "04-23":["Dia Nacional de Conscientização da Fibrodisplasia Ossificante Progressiva (FOP)","Dia Mundial do Livro"],
  "04-27":["Dia da Empregada Doméstica"],
  "04-28":["Dia Nacional da Conscientização sobre a Doença de Fabry","Dia da Educação","Dia da Sogra"],
  "04-30":["Dia Nacional da Mulher"],
  // ── Maio ──
  "05-01":["Dia do Trabalho","Dia do Parlamento","Dia do Pau-Brasil"],
  "05-03":["Dia Nacional de Combate à Violência Doméstica e Familiar contra a Criança e o Adolescente","Dia Mundial da Liberdade de Imprensa"],
  "05-04":["Dia Nacional do Líder Comunitário","Dia do Carteiro","Dia Internacional do Bombeiro"],
  "05-05":["Dia Nacional da Pessoa com Visão Monocular"],
  "05-06":["Dia Nacional da Matemática","Dia Nacional do Turismo"],
  "05-08":["Dia Nacional das Hemoglobinopatias","Dia Nacional do Guia","Dia da Vitória (fim da 2ª Guerra na Europa)"],
  "05-10":["Dia Nacional do Frei Sant’Anna Galvão"],
  "05-11":["Dia Nacional do Reggae","Dia Nacional dos Agentes de Trânsito"],
  "05-12":["Dia Internacional da Enfermagem"],
  "05-13":["Dia do Automóvel e da Estrada de Rodagem","Dia Nacional do Zootecnista","Abolição da Escravatura (Lei Áurea)"],
  "05-14":["Dia Nacional do Controle das Infecções Hospitalares","Dia Nacional de Conscientização quanto à Mucopolissacaridose"],
  "05-15":["Dia Nacional da Educação Legislativa","Dia Nacional de Conscientização sobre a Esclerose Tuberosa","Dia Internacional da Família","Dia do Assistente Social"],
  "05-17":["Dia Nacional de Combate ao Abuso e à Exploração Sexual","Dia Internacional contra a Homofobia, a Transfobia e a Bifobia"],
  "05-18":["Dia Nacional do Museu","Dia Internacional dos Museus"],
  "05-19":["Dia Nacional de Doação de Leite Humano","Dia Nacional do Físico"],
  "05-20":["Dia Nacional do Pedagogo","Dia do Telegrafista","Dia Nacional do Cigano","Dia Nacional do Calcário Agrícola"],
  "05-22":["Dia do Apicultor","Dia Internacional da Biodiversidade"],
  "05-24":["Dia Nacional do Milho","Dia Nacional de Conscientização sobre a Esquizofrenia","Dia Nacional do Metodismo Wesleyano","Dia do Trabalhador Rural"],
  "05-25":["Dia da Indústria","Dia da Costureira","Dia do Massagista","Dia Nacional do Respeito ao Contribuinte"],
  "05-26":["Dia Nacional do Sanfoneiro","Dia da Mata Atlântica"],
  "05-27":["Dia Nacional do Engenheiro de Custos"],
  "05-28":["Dia Nacional do Brincar"],
  "05-29":["Dia do Ibgeano","Campanha Maio Laranja"],
  "05-31":["Dia Mundial sem Tabaco","Maio Amarelo — Trânsito Seguro"],
  // ── Junho ──
  "06-01":["Dia da Imprensa"],
  "06-05":["Dia Nacional da Reciclagem","Dia Nacional do Teste do Pezinho","Dia Nacional de Luta contra Queimaduras","Dia Mundial do Meio Ambiente"],
  "06-06":["Dia Nacional do Profissional de Logística","Dia Nacional da Doceira","Dia de Anchieta"],
  "06-08":["Dia Mundial dos Oceanos"],
  "06-09":["Dia Nacional da Música Gospel"],
  "06-10":["Dia da Língua Portuguesa (Camões)"],
  "06-12":["Dia dos Namorados"],
  "06-13":["Dia de Santo Antônio"],
  "06-15":["Dia Nacional da Imigração Japonesa"],
  "06-18":["Dia do Tambor de Crioula"],
  "06-20":["Dia Nacional do Vigilante","Dia Nacional de Luta contra a Esclerose Lateral Amiotrófica (ELA)"],
  "06-21":["Dia Nacional do Artista Vidreiro","Início do Inverno"],
  "06-23":["Dia do Policial Legislativo","Dia Nacional do Esporte","Dia Nacional da Araucária"],
  "06-24":["Dia Nacional de Conscientização sobre a Fissura Labiopalatina","Dia de São João","Festa Junina"],
  "06-26":["Dia Internacional de Combate às Drogas"],
  "06-27":["Dia Nacional da Aviação de Segurança Pública do Brasil"],
  "06-28":["Dia do Orgulho LGBTQIA+"],
  "06-29":["Dia do Pescador Amador","Dia Nacional do Bumba Meu Boi","Dia de São Pedro"],
  "06-30":["Dia Nacional do Fiscal Federal Agropecuário"],
  // ── Julho ──
  "07-02":["Independência do Brasil no Estado da Bahia","Dia Nacional da Ciência"],
  "07-08":["Dia Nacional do Pesquisador","Dia Nacional do Produtor de Leite","Dia do Panificador"],
  "07-09":["Revolução Constitucionalista de 1932"],
  "07-10":["Dia da Pizza"],
  "07-12":["Dia Nacional do Funk","Dia do Engenheiro de Saneamento"],
  "07-13":["Dia Nacional da Música e Viola Caipira","Dia Mundial do Rock"],
  "07-14":["Dia da Liberdade de Pensamento"],
  "07-15":["Dia Nacional do Pecuarista"],
  "07-16":["Dia do Comerciante"],
  "07-19":["Dia da Caridade"],
  "07-20":["Dia do Amigo","Dia Internacional da Amizade","Dia do Futebol"],
  "07-21":["Dia Nacional do Garimpeiro"],
  "07-24":["Dia Nacional do Suinocultor"],
  "07-25":["Dia Nacional de Tereza de Benguela e da Mulher Negra","Dia Nacional do Arqueólogo","Dia do Motorista"],
  "07-26":["Dia Nacional do Coco de Roda, da Ciranda e da Marzuca","Dia dos Avós"],
  "07-27":["Dia Nacional do Motociclista"],
  "07-28":["Dia do Agricultor"],
  // ── Agosto ──
  "08-01":["Dia Nacional do Maracatu","Dia Nacional dos Rosacruzes","Início do Agosto Dourado (Aleitamento Materno)"],
  "08-02":["Dia Nacional da Natação","Dia Nacional da Saúde"],
  "08-06":["Dia Nacional do Elos Internacional da Comunidade Lusíada"],
  "08-08":["Dia Nacional da Pessoa com Atrofia Muscular Espinhal (AME)"],
  "08-09":["Dia Nacional da Equoterapia"],
  "08-10":["Dia Nacional da Eubiose","Dia do Magistrado"],
  "08-11":["Dia Nacional do Laringectomizado","Dia do Advogado","Dia do Estudante"],
  "08-12":["Dia Nacional dos Direitos Humanos","Dia Internacional da Juventude"],
  "08-13":["Dia Internacional dos Canhotos"],
  "08-14":["Dia Nacional das Santas Casas de Misericórdia"],
  "08-15":["Dia Nacional da Imigração Chinesa","Dia Nacional da Mulher","Dia da Informática"],
  "08-18":["Dia Nacional do Campo Limpo","Dia Nacional da Aviação Agrícola","Dia da Integração Jurídica Latino-Americana"],
  "08-19":["Dia Nacional do Historiador","Dia Nacional do Ciclista","Dia da Luta da População em Situação de Rua","Dia Mundial da Fotografia","Dia do Fotógrafo"],
  "08-22":["Dia do Folclore"],
  "08-24":["Dia da Legalidade"],
  "08-25":["Dia Nacional da Educação Infantil","Dia do Soldado","Dia do Feirante"],
  "08-27":["Dia Nacional do Psicólogo","Dia Nacional dos Bancários","Dia Nacional do Voluntariado"],
  "08-28":["Dia Nacional de Combate e Prevenção ao Escalpelamento","Dia Nacional de Combate ao Fumo"],
  "08-29":["Dia Nacional do Vaqueiro","Dia Nacional de Conscientização sobre a Esclerose Múltipla"],
  "08-30":["Dia Nacional do Perdão","Dia Nacional do Conselheiro Comunitário de Segurança"],
  "08-31":["Dia da Nutricionista"],
  // ── Setembro ──
  "09-01":["Dia Nacional do Endocrinologista"],
  "09-03":["Dia do Guarda Civil","Dia do Oficial de Farmácia","Dia da Amazônia"],
  "09-05":["Dia Nacional de Conscientização e Divulgação da Fibrose Cística"],
  "09-07":["Independência do Brasil","Dia Nacional da Alfabetização"],
  "09-08":["Dia Nacional do Terço dos Homens","Dia Mundial da Alfabetização"],
  "09-09":["Dia Nacional do Administrador","Dia do Médico Veterinário"],
  "09-11":["Dia Nacional do Cerrado"],
  "09-13":["Dia do Programador","Dia da Cachaça"],
  "09-15":["Dia do Cliente"],
  "09-16":["Dia Nacional da Identidade Civil","Dia Nacional do Transportador Rodoviário de Carga","Dia Internacional da Camada de Ozônio"],
  "09-17":["Dia Nacional de Conscientização sobre as Distrofias Musculares","Dia da Televisão"],
  "09-18":["Dia Nacional do Teatro Acessível: Arte, Prazer e Direitos"],
  "09-19":["Dia Nacional do Educador Social","Dia de São Januário"],
  "09-20":["Dia Nacional de Luta da Pessoa Portadora de Deficiência"],
  "09-21":["Dia Nacional do Imigrante Grego","Dia da Árvore","Dia do Fazendeiro"],
  "09-22":["Dia Nacional dos Profissionais de Nível Técnico","Dia Nacional dos Agentes da Autoridade de Trânsito","Dia Nacional da Educação","Dia Mundial sem Carro"],
  "09-23":["Dia Nacional da Conscientização sobre a Dermatite Atópica","Dia Nacional da Ikebana","Início da Primavera"],
  "09-25":["Dia Nacional do Rádio","Dia Nacional do Trânsito"],
  "09-26":["Dia Nacional dos Surdos","Dia Nacional do Turismólogo e dos Profissionais do Turismo","Dia Nacional dos Vicentinos"],
  "09-27":["Dia Nacional da Doação de Órgãos","Dia Nacional da Doença de Huntington","Dia Mundial do Turismo"],
  "09-28":["Lei do Ventre Livre","Dia Mundial de Combate à Raiva"],
  "09-29":["Dia do Anjo da Guarda"],
  "09-30":["Dia da Secretária","Dia da Bíblia"],
  // ── Outubro ──
  "10-01":["Dia Nacional do Idoso","Dia Nacional do Pacifismo"],
  "10-02":["Dia Internacional da Não-Violência"],
  "10-03":["Dia Nacional da Agroecologia","Dia Nacional do Agente Comunitário de Saúde","Dia Nacional do Paisagista"],
  "10-04":["Dia Nacional do Rodeio","Dia Nacional do Agente de Segurança Socioeducativo","Dia da Ave","Dia de São Francisco de Assis","Dia dos Animais"],
  "10-05":["Dia Nacional da Cidadania","Dia Nacional do Rosário","Dia Mundial do Professor"],
  "10-07":["Dia Nacional do Combate a Cartéis"],
  "10-08":["Dia Nacional de Doação de Cordão Umbilical"],
  "10-10":["Dia Nacional dos Direitos Fundamentais da Pessoa com Transtornos Mentais","Dia Nacional do Condutor de Ambulância"],
  "10-11":["Dia de Festa da Criança"],
  "10-12":["Dia das Crianças","Nossa Senhora Aparecida, Padroeira do Brasil","Dia Nacional da Leitura","Dia Nacional do Fisioterapeuta"],
  "10-13":["Dia do Fisioterapeuta e do Terapeuta Ocupacional"],
  "10-15":["Dia do Professor"],
  "10-16":["Dia Nacional da Alimentação","Dia Nacional da Música","Dia do Anestesiologista"],
  "10-18":["Dia da Inovação","Dia do Médico"],
  "10-19":["Dia Nacional do Leiloeiro","Dia do Profissional de Informática"],
  "10-20":["Dia Nacional da Filantropia"],
  "10-21":["Dia do Aviador"],
  "10-23":["Dia Nacional do Plantio Direto","Dia Nacional da Saúde Bucal","Dia Nacional do Macarrão","Dia da Aviação (Santos Dumont)"],
  "10-24":["Dia das Nações Unidas"],
  "10-25":["Dia Nacional de Combate ao Preconceito contra as Pessoas com Nanismo","Dia Nacional dos Trabalhadores Metroviários"],
  "10-26":["Dia do Movimento Pestalozziano no Brasil"],
  "10-28":["Dia do Servidor Público"],
  "10-29":["Dia Nacional de Prevenção ao Acidente Vascular Cerebral (AVC)","Dia Nacional do Hematologista e do Hemoterapeuta"],
  "10-30":["Dia do Comerciário","Dia Nacional da Poesia","Dia do Balconista"],
  "10-31":["Dia Nacional da Proclamação do Evangelho","Campanha Outubro Rosa","Dia das Bruxas (Halloween)","Dia da Reforma Protestante"],
  // ── Novembro ──
  "11-02":["Finados","Dia Nacional do Quilo"],
  "11-03":["Dia Nacional da Saúde Única","Dia da Cultura e da Ciência","Dia Nacional do Design","Dia do Cinema Brasileiro"],
  "11-05":["Dia do Técnico Agrícola","Dia Nacional do Interactiano"],
  "11-07":["Dia do Radialista","Dia Nacional do Urbanismo"],
  "11-08":["Dia Nacional do Médico Radiologista","Dia Nacional dos Clubes"],
  "11-10":["Dia do Intensivista","Dia Nacional do Inventor","Dia Nacional da Liberdade"],
  "11-12":["Dia Nacional da Pessoa com Surdocegueira"],
  "11-14":["Dia Mundial do Diabetes"],
  "11-15":["Proclamação da República","Dia Nacional da Umbanda"],
  "11-16":["Dia Nacional da Amazônia Azul","Dia Nacional do Conselheiro Tutelar","Dia Internacional da Tolerância"],
  "11-18":["Dia Nacional do Notário e do Registrador"],
  "11-19":["Dia da Bandeira","Dia do Rei Pelé","Dia Nacional do Biomédico"],
  "11-20":["Dia da Consciência Negra","Dia Nacional de Zumbi e da Consciência Negra"],
  "11-21":["Dia da Música","Dia Mundial da Televisão"],
  "11-22":["Dia da Comunidade Libanesa no Brasil","Dia Nacional de Combate ao Câncer Infantil","Dia do Músico (Santa Cecília)"],
  "11-23":["Dia Nacional do Engenheiro Eletricista"],
  "11-25":["Dia Nacional do Samba de Roda","Dia do Doador de Sangue","Dia Internacional pela Eliminação da Violência contra a Mulher"],
  "11-26":["Dia Nacional de Luta contra o Câncer de Mama"],
  "11-27":["Dia Nacional de Combate ao Câncer","Dia da Amizade Brasil-Argentina"],
  "11-30":["Dia Nacional do Evangélico","Novembro Azul — Saúde do Homem"],
  // ── Dezembro ──
  "12-01":["Dia Mundial de Combate à AIDS"],
  "12-02":["Dia Nacional da Astronomia","Dia Nacional de Combate à Pirataria e à Biopirataria"],
  "12-03":["Dia do Delegado de Polícia","Dia do Trabalhador nas Minas de Carvão"],
  "12-04":["Dia Nacional do Perito Criminal","Dia Nacional do Policial Penal","Dia da Propaganda","Dia de Santa Bárbara"],
  "12-05":["Dia Nacional de Mobilização dos Homens pelo Fim da Violência contra as Mulheres"],
  "12-06":["Dia Nacional do Extensionista Rural","Dia Nacional da Assistência Social"],
  "12-07":["Dia Nacional da Silvicultura","Dia Consagrado à Justiça"],
  "12-08":["Dia Nacional da Família","Dia de Nossa Senhora da Conceição"],
  "12-09":["Dia Nacional do Fonoaudiólogo","Dia da Justiça"],
  "12-10":["Dia Nacional de Conscientização sobre as Doenças Crônicas","Dia Nacional das Apaes","Dia Internacional dos Direitos Humanos"],
  "12-11":["Dia Nacional da Câmara Júnior"],
  "12-12":["Dia do Cego","Dia do Engenheiro Florestal"],
  "12-13":["Dia Nacional do Forró","Dia Nacional do Ministério Público","Dia de Santa Luzia"],
  "12-14":["Dia Nacional do Engenheiro de Pesca","Dia Nacional do Arquiteto e Urbanista"],
  "12-15":["Dia Nacional da Economia Solidária","Dia do Reservista"],
  "12-16":["Dia Nacional do Medicamento Biossimilar"],
  "12-17":["Dia do Bioma Pampa"],
  "12-18":["Dia Nacional do Museólogo"],
  "12-21":["Dia do Atleta","Início do Verão"],
  "12-24":["Dia do Órfão","Véspera de Natal"],
  "12-25":["Natal","Dia da Marinha Mercante","Dia do Petroquímico"],
  "12-28":["Dia de Mauá","Dia Nacional do Cooperativismo de Crédito"],
  "12-31":["Véspera de Ano Novo (Réveillon)"]
};
const comemoracoesDe = (d) => COMEMORACOES[`${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`] || [];
// frases do dia — mistura de autocuidado (sem autor) e frases de pessoas que
// marcaram o mundo (com autor). Formato { t: texto, a: autor }. a vazio = sem autor.
const FRASES = [
  // — autocuidado / aparência (originais) —
  { t:"Cuidar de si não é vaidade — é respeito por quem você é.", a:"" },
  { t:"A autoestima se constrói nos pequenos cuidados de cada dia.", a:"" },
  { t:"Respire fundo: hoje é um ótimo dia para se sentir bem.", a:"" },
  { t:"Quem se cuida por fora também fortalece o que sente por dentro.", a:"" },
  { t:"Um tempo para você não é luxo, é necessidade.", a:"" },
  { t:"A melhor versão de você começa com um gesto de carinho consigo mesmo.", a:"" },
  { t:"Sentir-se bem na própria pele muda o jeito de encarar o dia.", a:"" },
  { t:"Pequenas pausas para se cuidar renovam a energia inteira.", a:"" },
  { t:"Você merece sair daqui se sentindo mais leve e confiante.", a:"" },
  { t:"Autoconfiança também se cultiva no espelho — comece por se gostar.", a:"" },
  { t:"Cuidar da aparência é uma forma gentil de cuidar da mente.", a:"" },
  { t:"Hoje, escolha se tratar com a mesma gentileza que oferece aos outros.", a:"" },
  { t:"Um visual renovado é um bom começo para uma fase nova.", a:"" },
  { t:"O cuidado de hoje é o bem-estar de amanhã.", a:"" },
  { t:"Valorize-se: você é o seu projeto mais importante.", a:"" },
  // — pessoas que marcaram o mundo —
  { t:"Somos aquilo que repetidamente fazemos. A excelência é um hábito.", a:"Aristóteles" },
  { t:"Conhece-te a ti mesmo.", a:"Sócrates" },
  { t:"Uma jornada de mil milhas começa com um único passo.", a:"Lao-Tsé" },
  { t:"Onde quer que vá, vá com todo o seu coração.", a:"Confúcio" },
  { t:"Não é porque as coisas são difíceis que não ousamos; é porque não ousamos que elas são difíceis.", a:"Sêneca" },
  { t:"A simplicidade é o último grau de sofisticação.", a:"Leonardo da Vinci" },
  { t:"A imaginação é mais importante que o conhecimento.", a:"Albert Einstein" },
  { t:"No meio da dificuldade encontra-se a oportunidade.", a:"Albert Einstein" },
  { t:"Seja a mudança que você quer ver no mundo.", a:"Mahatma Gandhi" },
  { t:"Tudo parece impossível até que seja feito.", a:"Nelson Mandela" },
  { t:"A melhor maneira de começar é parar de falar e começar a fazer.", a:"Walt Disney" },
  { t:"Quer você pense que pode ou que não pode, você tem razão.", a:"Henry Ford" },
  { t:"Um dia sem sorrir é um dia desperdiçado.", a:"Charles Chaplin" },
  { t:"Investir em conhecimento rende sempre os melhores juros.", a:"Benjamin Franklin" },
  { t:"Tudo vale a pena quando a alma não é pequena.", a:"Fernando Pessoa" },
  { t:"Um país se faz com homens e livros.", a:"Monteiro Lobato" },
  { t:"Enquanto esperamos viver, a vida vai passando.", a:"Sêneca" },
  { t:"Se quer ir rápido, vá sozinho; se quer ir longe, vá acompanhado.", a:"Provérbio africano" },
  { t:"Que teu alimento seja teu remédio.", a:"Hipócrates" },
];

// fidelidade (mesma régua do painel): faixas por nº de visitas
const NIVEIS = [
  { nome:"Bronze",     min:0,  prox:"Prata"      },
  { nome:"Prata",      min:4,  prox:"Ouro"       },
  { nome:"Ouro",       min:12, prox:"Diamond VIP"},
  { nome:"Diamond VIP",min:20, prox:null         },
];
const fidelidade = (visitas) => {
  const v = Number(visitas)||0;
  let atual = NIVEIS[0];
  for (const n of NIVEIS) if (v >= n.min) atual = n;
  const idx = NIVEIS.indexOf(atual);
  const prox = NIVEIS[idx+1] || null;
  const base = atual.min, alvo = prox ? prox.min : atual.min;
  const pct = prox ? Math.max(6, Math.min(100, Math.round(((v-base)/(alvo-base))*100))) : 100;
  const faltam = prox ? Math.max(0, alvo - v) : 0;
  return { nivel: atual.nome, prox: prox ? prox.nome : null, pct, faltam, visitas: v };
};

// ─── COMPONENTES BASE ───────────────────────────────────────────────────
const Shell = ({ children, step, total, onToggleTema }) => {
  const T = useT();
  return (
    <div style={{minHeight:"100dvh",background:T.bg,fontFamily:T.sans,color:T.ink,display:"flex",flexDirection:"column",alignItems:"center",transition:"background .3s, color .3s"}}>
      <style>{`
        @keyframes aqUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        /* Reserva o espaço da barra de rolagem mesmo quando a tela é curta.
           Sem isso, telas curtas (ex.: Histórico vazio) perdem a barra, a
           janela alarga ~15px e a BottomNav (centralizada) "pula" pro lado. */
        html{scrollbar-gutter:stable;overflow-y:scroll}
        *{box-sizing:border-box}
        .aq-btn:active{transform:scale(.98)}
        .aq-card-pick{transition:all .18s cubic-bezier(.4,0,.2,1)}
        .aq-card-pick:active{transform:scale(.985)}
      `}</style>
      <div style={{width:"100%",maxWidth:460,padding:"0 0 40px",animation:"aqUp .35s cubic-bezier(.22,1,.36,1)",position:"relative"}}>
        {onToggleTema && <TemaToggle onToggle={onToggleTema} />}
        {typeof step==="number" && (
          <div style={{display:"flex",gap:5,padding:"16px 22px 0"}}>
            {Array.from({length:total}).map((_,i)=>(
              <div key={i} style={{flex:1,height:4,borderRadius:99,background:i<=step?T.brass:T.line,transition:"background .3s"}}/>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
};

const TemaToggle = ({ onToggle }) => {
  const T = useT();
  const escuro = T.name === "dark";
  return (
    <button onClick={onToggle} aria-label="Alternar tema" className="aq-btn" style={{
      position:"absolute",top:14,right:16,zIndex:50,width:40,height:40,borderRadius:12,cursor:"pointer",
      border:`1px solid ${T.line}`,background:T.card,color:T.brass,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",
      transition:"all .2s",
    }}>{escuro ? "☀" : "☾"}</button>
  );
};

const Header = ({ titulo, sub, onBack }) => {
  const T = useT();
  return (
    <div style={{padding:"20px 22px 8px"}}>
      {onBack && (
        <button onClick={onBack} className="aq-btn" style={{border:"none",background:"none",color:T.muted,fontSize:14,cursor:"pointer",padding:"4px 0",marginBottom:8,fontFamily:T.sans}}>
          ← Voltar
        </button>
      )}
      <h1 style={{fontFamily:T.serif,fontWeight:600,fontSize:26,margin:0,lineHeight:1.15,letterSpacing:"-0.01em",color:T.ink}}>{titulo}</h1>
      {sub && <p style={{color:T.muted,fontSize:14,margin:"6px 0 0"}}>{sub}</p>}
    </div>
  );
};

const Primary = ({ children, onClick, disabled }) => {
  const T = useT();
  return (
    <button onClick={onClick} disabled={disabled} className="aq-btn" style={{
      width:"100%",padding:"16px",borderRadius:13,border:"none",cursor:disabled?"not-allowed":"pointer",
      background:disabled?T.line:`linear-gradient(150deg,${T.brass},${T.brassDeep})`,
      color:disabled?T.muted:"#fff",fontSize:16,fontWeight:700,fontFamily:T.sans,
      boxShadow:disabled?"none":T.shadowBtn,transition:"all .2s",
    }}>{children}</button>
  );
};

// Seletor de foto do cliente: avatar circular tocável. Abre câmera ou galeria
// (no celular o próprio sistema oferece as duas opções). Mostra prévia e spinner.
const FotoPicker = ({ fotoUrl, iniciais, enviando, onEscolher }) => {
  const T = useT();
  const inputRef = useRef(null);
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
      <div onClick={()=>!enviando && inputRef.current && inputRef.current.click()}
        style={{width:96,height:96,borderRadius:"50%",cursor:enviando?"default":"pointer",position:"relative",
          background:fotoUrl?`#000 center/cover url(${fotoUrl})`:`linear-gradient(135deg,${T.brass},${T.brassDeep})`,
          display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:34,
          border:`2px solid ${T.brassLine}`,boxShadow:T.shadowBtn,overflow:"hidden"}}>
        {!fotoUrl && !enviando && (iniciais || "?")}
        {enviando && <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600}}>Enviando…</div>}
        {!enviando && (
          <div style={{position:"absolute",right:0,bottom:0,width:30,height:30,borderRadius:"50%",background:T.brass,border:`2px solid ${T.bg}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>📷</div>
        )}
      </div>
      <button onClick={()=>!enviando && inputRef.current && inputRef.current.click()} className="aq-btn"
        style={{background:"none",border:"none",color:T.brass,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:T.sans}}>
        {fotoUrl ? "Trocar foto" : "Adicionar foto"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" style={{display:"none"}}
        onChange={(e)=>{ const f = e.target.files && e.target.files[0]; if (f) onEscolher(f); e.target.value=""; }}/>
    </div>
  );
};

// Editor de dependentes (filhos) — reutilizado no cadastro e na edição de perfil.
// Recebe a lista (deps) e o setter (setDeps). Cada item: { nome, nascimento(yyyy-mm-dd) }.
const DependentesEditor = ({ deps, setDeps }) => {
  const T = useT();
  const ligado = deps.length > 0;
  const inputBase = {width:"100%",padding:"12px 14px",fontSize:15,borderRadius:11,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink};
  const setCampo = (i, campo, val) => setDeps(deps.map((d,idx)=> idx===i ? {...d,[campo]:val} : d));
  const remover = (i) => setDeps(deps.filter((_,idx)=>idx!==i));
  const adicionar = () => setDeps([...deps, {nome:"",nascimento:""}]);
  return (
    <div style={{marginTop:14,background:T.bg1,border:`1px solid ${T.line}`,borderRadius:14,padding:"14px 14px 4px"}}>
      <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
        <input type="checkbox" checked={ligado} onChange={(e)=> e.target.checked ? adicionar() : setDeps([])}
          style={{width:18,height:18,accentColor:T.brass,cursor:"pointer",flexShrink:0}}/>
        <span style={{fontSize:14,fontWeight:600,color:T.ink2}}>Tenho dependentes que também atendo aqui</span>
      </label>
      {ligado && (
        <div style={{marginTop:12}}>
          {deps.map((d,i)=>{
            const idade = calcIdade(d.nascimento);
            return (
              <div key={i} style={{marginBottom:12,paddingBottom:12,borderBottom:i<deps.length-1?`1px dashed ${T.line}`:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:12,fontWeight:700,color:T.muted}}>Dependente {i+1}{idade?` · ${idade}`:""}</span>
                  <button onClick={()=>remover(i)} className="aq-btn" style={{background:"none",border:"none",color:T.danger,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans,padding:0}}>Remover</button>
                </div>
                <input value={d.nome} onChange={(e)=>setCampo(i,"nome",e.target.value)} placeholder="Nome do dependente"
                  style={inputBase} onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
                <input value={d.nascimento} onChange={(e)=>setCampo(i,"nascimento",e.target.value)} type="date" max={hojeISO()} min="1900-01-01"
                  style={{...inputBase,marginTop:8,colorScheme:T.name==="dark"?"dark":"light"}}
                  onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
              </div>
            );
          })}
          <button onClick={adicionar} className="aq-btn" style={{width:"100%",padding:"11px",marginBottom:10,borderRadius:11,border:`1.5px dashed ${T.line}`,background:"transparent",color:T.brass,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:T.sans}}>+ Adicionar outro dependente</button>
        </div>
      )}
    </div>
  );
};


const Bottom = ({ children, comBarra }) => {
  const T = useT();
  // Quando há BottomNav fixa no rodapé, o botão Continuar sobe 70px pra
  // ficar acima dela (R4). Sem barra, mantém o comportamento original.
  return (
    <div style={{padding:"12px 22px 0",position:"sticky",bottom: comBarra ? 70 : 0,background:`linear-gradient(to top, ${T.bg} 70%, transparent)`,paddingBottom:16}}>{children}</div>
  );
};

// ícones de linha (monocromáticos, herdam a cor do pai) — visual premium
const Icon = ({ name, size=20, stroke=1.8 }) => {
  const c = { width:size, height:size, viewBox:"0 0 24 24", fill:"none", stroke:"currentColor", strokeWidth:stroke, strokeLinecap:"round", strokeLinejoin:"round" };
  switch (name) {
    case "home":     return <svg {...c}><path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/></svg>;
    case "calendar": return <svg {...c}><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 9.5h16M8 3v4M16 3v4"/></svg>;
    case "clock":    return <svg {...c}><circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/></svg>;
    case "user":     return <svg {...c}><circle cx="12" cy="9" r="3.4"/><path d="M5.5 20c0-3.6 3-5.6 6.5-5.6s6.5 2 6.5 5.6"/></svg>;
    case "scissors": return <svg {...c}><circle cx="6.4" cy="6.4" r="2.2"/><circle cx="6.4" cy="17.6" r="2.2"/><path d="M8.3 7.7 19 17.4M8.3 16.3 19 6.6"/></svg>;
    default: return null;
  }
};

// barra de navegação inferior — FIXA na base do celular, centralizada na coluna
const BottomNav = ({ ativo, onNav }) => {
  const T = useT();
  const tabs = [
    { id:HOME,   icon:"home",     label:"Início"    },
    { id:1,      icon:"calendar", label:"Agendar"   },
    { id:HIST,   icon:"clock",    label:"Agenda"    },
    { id:PERFIL, icon:"user",     label:"Perfil"    },
  ];
  return (
    <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:460,background:T.card,borderTop:`1px solid ${T.line}`,display:"flex",justifyContent:"space-around",padding:"10px 0 calc(12px + env(safe-area-inset-bottom, 0px))",zIndex:50,boxShadow:T.name==="dark"?"0 -6px 20px rgba(0,0,0,.35)":"0 -6px 20px rgba(0,0,0,.06)"}}>
      {tabs.map(t=>{
        const on = ativo===t.id;
        return (
          <button key={t.id} onClick={()=>onNav(t.id)} className="aq-btn" style={{background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:4,color:on?T.brass:T.muted,fontFamily:T.sans,padding:"2px 14px"}}>
            <Icon name={t.icon} size={21} stroke={on?2:1.7} />
            <span style={{fontSize:10,fontWeight:on?700:500}}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const Linha = ({ label, valor }) => {
  const T = useT();
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"6px 0",gap:12}}>
      <span style={{color:T.muted,fontSize:13,flexShrink:0}}>{label}</span>
      <span style={{fontWeight:600,fontSize:14,textAlign:"right",color:T.ink}}>{valor||"—"}</span>
    </div>
  );
};

// cartão "Inspiração do dia" — data, signo, lua, estação, comemorações e frase
const InspiracaoCard = ({ fraseIdx }) => {
  const T = useT();
  const hoje = new Date();
  const coms = comemoracoesDe(hoje);
  const chips = [signoDe(hoje), faseLuaDe(hoje), estacaoDe(hoje)];
  return (
    <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:"16px"}}>
      <div style={{color:T.muted,fontSize:11,letterSpacing:"0.08em",textTransform:"uppercase"}}>{dataExtenso(hoje)}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:10}}>
        {chips.map((c,i)=>(
          <span key={i} style={{fontSize:11,fontWeight:600,color:T.brass,background:T.brassTint,border:`1px solid ${T.brassLine}`,borderRadius:99,padding:"4px 10px"}}>{c}</span>
        ))}
      </div>
      {coms.length>0 && (
        <div style={{marginTop:10,color:T.ink2,fontSize:12.5,lineHeight:1.5}}>
          <span style={{color:T.muted}}>Hoje também se celebra: </span>{coms.join(" · ")}
        </div>
      )}
      <div style={{height:1,background:T.line,margin:"14px 0"}}/>
      <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
        <span style={{color:T.brass,fontSize:16,lineHeight:1.3}}>✦</span>
        <div>
          <p style={{margin:0,fontFamily:T.serif,fontStyle:"italic",fontSize:15.5,lineHeight:1.5,color:T.ink}}>{FRASES[fraseIdx % FRASES.length].t}</p>
          {FRASES[fraseIdx % FRASES.length].a && <p style={{margin:"6px 0 0",fontSize:12.5,fontWeight:600,color:T.brass}}>— {FRASES[fraseIdx % FRASES.length].a}</p>}
        </div>
      </div>
    </div>
  );
};

// ─── Janelinha de Política / Termos ─────────────────────────────────────
const LegalModal = ({ tipo, onClose }) => {
  const T = useT();
  const isPriv = tipo === "privacidade";
  const titulo = isPriv ? "Política de Privacidade" : "Termos de Uso";
  const h = { fontFamily:T.sans, fontSize:14, fontWeight:700, color:T.ink, margin:"14px 0 4px" };
  const p = { margin:"0 0 8px" };
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:9999,backdropFilter:"blur(2px)"}}>
      <div onClick={(e)=>e.stopPropagation()} style={{background:T.bg,width:"100%",maxWidth:480,maxHeight:"82vh",borderRadius:"18px 18px 0 0",overflow:"hidden",display:"flex",flexDirection:"column",boxShadow:"0 -10px 40px rgba(0,0,0,.4)"}}>
        <div style={{padding:"18px 22px",borderBottom:`1px solid ${T.line}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontFamily:T.serif,fontSize:20,fontWeight:700,color:T.ink}}>{titulo}</span>
          <button onClick={onClose} style={{background:T.brassTint,border:"none",borderRadius:10,width:34,height:34,fontSize:18,color:T.brass,cursor:"pointer",lineHeight:1}}>✕</button>
        </div>
        <div style={{padding:"18px 22px",overflowY:"auto",fontSize:14,lineHeight:1.6,color:T.ink2,fontFamily:T.sans}}>
          <p style={{margin:"0 0 14px",fontSize:12.5,color:T.muted}}>Resumo dos pontos principais. AQUINO Barbearia &amp; Estética — R. Carlos Gomes, 256, Ideal, Ipatinga/MG.</p>
          {isPriv ? (
            <>
              <h3 style={h}>Quais dados coletamos</h3>
              <p style={p}>Nome, número de WhatsApp e, opcionalmente, data de nascimento e e-mail. Também guardamos seu histórico de serviços e frequência de visitas.</p>
              <h3 style={h}>Para quê</h3>
              <p style={p}>Para agendar, enviar lembretes e confirmações, manter seu histórico para recomendações e melhorar o atendimento. Tudo conforme a LGPD (Lei nº 13.709/2018).</p>
              <h3 style={h}>Compartilhamento</h3>
              <p style={p}>Não vendemos seus dados. Eles ficam em serviços do Google (Sheets/Calendar) usados apenas para operar o agendamento.</p>
              <h3 style={h}>Seus direitos</h3>
              <p style={p}>Você pode pedir acesso, correção ou exclusão dos seus dados, e recusar mensagens promocionais a qualquer momento respondendo <b>SAIR</b> no WhatsApp.</p>
            </>
          ) : (
            <>
              <h3 style={h}>Quem pode usar</h3>
              <p style={p}>Pessoas com 18 anos ou mais. Menores devem ser representados por um responsável legal.</p>
              <h3 style={h}>Agendamentos</h3>
              <p style={p}>Os horários são exibidos em tempo real. Após agendar, você recebe a confirmação pelo WhatsApp. Confirme presença respondendo <b>C</b> ou <b>SIM</b>; para cancelar, responda <b>CANCELAR</b>.</p>
              <h3 style={h}>Comunicações</h3>
              <p style={p}>Você receberá mensagens de confirmação e lembrete. Mensagens promocionais dependem do seu consentimento e podem ser recusadas respondendo <b>SAIR</b>.</p>
              <h3 style={h}>Cancelamento e no-show</h3>
              <p style={p}>Pedimos aviso prévio para cancelar ou remarcar. Faltas repetidas sem aviso podem exigir sinal em agendamentos futuros.</p>
            </>
          )}
        </div>
        <div style={{padding:"14px 22px",borderTop:`1px solid ${T.line}`}}>
          <button onClick={onClose} style={{width:"100%",padding:"14px",borderRadius:12,border:"none",background:`linear-gradient(150deg,${T.brass},${T.brassDeep})`,color:"#fff",fontSize:15,fontWeight:700,fontFamily:T.sans,cursor:"pointer"}}>Entendi</button>
        </div>
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════
const HOME = 7, HIST = 8, PERFIL = 9, EDITAR_PERFIL = 10;

function Portal() {
  const T = useT();
  const [step, setStep] = useState(0);            // 0 tel · 1 serviço · 2 barbeiro · 3 data/hora · 4 dados · 5 sinal · 6 ok · 7 home · 8 histórico
  const [tel, setTel] = useState("");
  const [clienteExistente, setClienteExistente] = useState(null);
  const [nome, setNome] = useState("");
  const [sobrenome, setSobrenome] = useState("");                 // Fatia A — separado para UX
  const [email, setEmail] = useState("");                          // Fatia A — obrigatório
  const [nascimento, setNascimento] = useState(""); // R2 — yyyy-mm-dd (formato do <input type=date>)
  const [dependentes, setDependentes] = useState([]); // [{nome, nascimento(yyyy-mm-dd)}]
  const [fotoUrl, setFotoUrl] = useState("");          // foto do cliente (link do Drive)
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [paraQuem, setParaQuem] = useState(-1);        // -1 = titular; >=0 = índice do dependente
  const [obs, setObs] = useState("");
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);     // Fatia A — tela de edição
  const [servicos, setServicos] = useState([]);
  const [barbeiros, setBarbeiros] = useState([]);
  const [servSel, setServSel] = useState(null);
  const [barbSel, setBarbSel] = useState(null);
  const [dataSel, setDataSel] = useState(null);
  const [horaSel, setHoraSel] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState(null);
  const [aceito, setAceito] = useState(false);
  const [legalModal, setLegalModal] = useState(null);
  // área do cliente
  const [meusAgs, setMeusAgs] = useState([]);
  const [carregandoArea, setCarregandoArea] = useState(false);
  const [reagendandoId, setReagendandoId] = useState(null);
  const [aviso, setAviso] = useState(null);   // {tipo:"ok"|"erro", txt}
  const [verificando, setVerificando] = useState(false);
  const [fraseIdx] = useState(() => Math.floor(Math.random() * FRASES.length));
  const demo = !ENV.hasBackend;

  const onToggleTema = useToggleTema();

  // carregar serviços + barbeiros
  useEffect(() => {
    (async () => {
      try {
        const [rs, rb] = await Promise.all([api.listarServicos(), api.listarBarbeiros()]);
        setServicos(rs && rs.servicos ? rs.servicos.filter(s=>s.ativo!==false) : DEMO_SERVICOS);
        setBarbeiros(rb && rb.barbeiros ? rb.barbeiros.filter(b=>b.ativo!==false) : DEMO_BARBEIROS);
      } catch (e) { setServicos(DEMO_SERVICOS); setBarbeiros(DEMO_BARBEIROS); }
    })();
  }, []);

  // carregar agendamentos do cliente
  const carregarMeus = async (limpo) => {
    if (!ENV.hasBackend) { setMeusAgs([]); return; }
    setCarregandoArea(true);
    try {
      const r = await api.meusAgendamentos(limpo);
      setMeusAgs((r && Array.isArray(r.agendamentos)) ? r.agendamentos : []);
    } catch (e) { setMeusAgs([]); }
    setCarregandoArea(false);
  };

  // próximo agendamento futuro (o mais cedo a partir de hoje)
  const proximoAg = (() => {
    const hj = hojeISO();
    const fut = meusAgs
      .map(a => ({ ...a, _d: agData(a), _h: agHora(a) }))
      .filter(a => a._d && a._d >= hj)
      .sort((a,b) => (a._d+a._h).localeCompare(b._d+b._h));
    return fut[0] || null;
  })();

  // ── Passo 0: telefone ──
  const avancarTelefone = async () => {
    const limpo = telLimpo(tel);
    if (limpo.length < 10) { setErro("Digite um número de WhatsApp válido."); return; }
    setErro(""); setVerificando(true);
    try {
      const r = await api.verificarCliente(limpo);
      if (r && r.encontrado) {
        const [pn, sn] = dividirNome(r.nome || "");
        setClienteExistente(r);
        setNome(pn);
        setSobrenome(sn);                                          // Fatia A: separa de uma vez
        setEmail(r.email || "");                                   // Fatia A: e-mail vindo do backend
        setNascimento(nascParaInput(r.nascimento));                // R2: pré-preenche se já existe
        setDependentes(depsParaEstado(r.dependentes || []));       // dependentes vindos do backend
        setFotoUrl(r.foto || "");                                   // foto vinda do backend
        setVerificando(false);
        setStep(HOME);            // entra já na Área do Cliente
        carregarMeus(limpo);      // agendamentos carregam em segundo plano
        return;
      }
    } catch (e) {}
    setVerificando(false);
    setStep(1);                   // cliente novo → agendamento
  };

  // ── Passo 3: carregar horários ──
  useEffect(() => {
    if (step!==3 || !dataSel || !servSel) return;
    setLoadingSlots(true); setHoraSel(null);
    (async () => {
      try {
        const r = await api.slots(isoDate(dataSel), servSel.duracao);
        const livres = (r && Array.isArray(r.slots)) ? r.slots : (demo ? DEMO_SLOTS : []);
        setSlots(livres);
      } catch (e) { setSlots(demo ? DEMO_SLOTS : []); }
      setLoadingSlots(false);
    })();
  }, [step, dataSel, servSel]);

  // ── enviar agendamento ──
  const confirmar = async () => {
    if (!nome.trim()) { setErro("Por favor, informe seu nome."); return; }
    if (!sobrenome.trim()) { setErro("Informe seu sobrenome."); return; }       // Fatia A
    if (!nascValido(nascimento)) {                                              // R2 — obrigatório
      setErro("Informe uma data de nascimento válida.");
      return;
    }
    if (!emailValido(email)) { setErro("Informe um e-mail válido."); return; }  // Fatia A
    if (!fotoUrl) { setErro("Adicione uma foto de perfil para concluir."); return; } // obrigatória
    setErro(""); setEnviando(true);
    try {
      const r = await api.agendar({
        nome: `${nome.trim()} ${sobrenome.trim()}`,                              // junta antes de mandar
        telefone: telLimpo(tel),
        nascimento: nascParaBackend(nascimento),                                 // R2 — DD/MM/AAAA pro backend
        email: email.trim(),                                                     // Fatia A
        foto: fotoUrl,                                                            // foto do cliente
        dependentes: depsParaBackend(dependentes),                               // lista de filhos
        para: (paraQuem >= 0 && dependentes[paraQuem]) ? dependentes[paraQuem].nome : "", // p/ quem é o corte
        data: isoDate(dataSel), horario: horaSel,
        servico: { nome: servSel.nome, duracao: servSel.duracao, preco: servSel.preco },
        barbeiro: barbSel ? barbSel.nome : "", observacao: obs.trim(),
      });
      if (r && r._demo) { setResultado({ demo:true }); setStep(6); }
      else if (r && r.requiresSinal) { setResultado(r); setStep(5); }
      else if (r && (r.success || r.id)) { setResultado(r); carregarMeus(telLimpo(tel)); setStep(6); }
      else { setErro((r && r.error) || "Não foi possível concluir. Tente outro horário."); }
    } catch (e) { setErro("Falha de conexão. Verifique sua internet e tente de novo."); }
    setEnviando(false);
  };

  // ── confirmar reagendamento (mesmo agendamento, nova data/hora) ──
  const confirmarReagendamento = async () => {
    setErro(""); setEnviando(true);
    try {
      const r = await api.reagendar(reagendandoId, isoDate(dataSel), horaSel, telLimpo(tel));
      if (r && (r.success || r._demo)) {
        setReagendandoId(null); setServSel(null); setDataSel(null); setHoraSel(null);
        await carregarMeus(telLimpo(tel));
        setAviso({ tipo:"ok", txt:"Horário remarcado! Você recebe a confirmação no WhatsApp." });
        setStep(HOME);
      } else { setErro((r && r.error) || "Não foi possível remarcar. Tente outro horário."); }
    } catch (e) { setErro("Falha de conexão. Tente novamente."); }
    setEnviando(false);
  };

  // ── cancelar agendamento ──
  const cancelarAg = async (ag) => {
    if (!window.confirm(`Cancelar o ${ag.servico} de ${labelData(agData(ag))} às ${agHora(ag)}?`)) return;
    try {
      const r = await api.cancelar(ag.id, telLimpo(tel));
      if (r && (r.success || r._demo)) {
        await carregarMeus(telLimpo(tel));
        setAviso({ tipo:"ok", txt:"Agendamento cancelado." });
      } else { setAviso({ tipo:"erro", txt:(r && r.error) || "Não foi possível cancelar." }); }
    } catch (e) { setAviso({ tipo:"erro", txt:"Falha de conexão." }); }
  };

  // ── foto do cliente: reduz, envia ao Drive e guarda o link ──
  const escolherFoto = async (file) => {
    setErro(""); setEnviandoFoto(true);
    try {
      const dataUrl = await reduzirImagem(file);
      if (!ENV.hasBackend) { setFotoUrl(dataUrl); setEnviandoFoto(false); return; } // demo: usa local
      const r = await api.uploadFoto(dataUrl);
      if (r && r.success && r.url) setFotoUrl(r.url);
      else setErro("Não consegui enviar a foto. Tente outra imagem.");
    } catch (e) { setErro("Não consegui processar essa imagem. Tente outra."); }
    setEnviandoFoto(false);
  };

  // ── salvar perfil (Fatia A — tela Editar perfil) ──
  const salvarPerfil = async () => {
    if (!nome.trim()) { setErro("Informe seu nome."); return; }
    if (!sobrenome.trim()) { setErro("Informe seu sobrenome."); return; }
    if (!nascValido(nascimento)) { setErro("Informe uma data de nascimento válida."); return; }
    if (!emailValido(email)) { setErro("Informe um e-mail válido."); return; }
    if (!fotoUrl) { setErro("Adicione uma foto de perfil."); return; }
    setErro(""); setSalvandoPerfil(true);
    try {
      const r = await api.atualizarPerfil({
        tel: telLimpo(tel),
        nome: nome.trim(),
        sobrenome: sobrenome.trim(),
        nascimento: nascParaBackend(nascimento),
        email: email.trim(),
        foto: fotoUrl,
        dependentes: depsParaBackend(dependentes),
      });
      if (r && (r.success || r._demo)) {
        // atualiza clienteExistente local pra refletir mudança sem nova chamada
        const novoNomeCompleto = `${nome.trim()} ${sobrenome.trim()}`;
        setClienteExistente(c => ({ ...(c||{}), nome: novoNomeCompleto, email: email.trim(), nascimento: nascParaBackend(nascimento), foto: fotoUrl }));
        setAviso({ tipo:"ok", txt:"Perfil atualizado!" });
        setStep(PERFIL);
      } else {
        setErro((r && r.error) || "Não foi possível salvar. Tente novamente.");
      }
    } catch (e) { setErro("Falha de conexão. Tente novamente."); }
    setSalvandoPerfil(false);
  };

  // iniciar reagendamento de um agendamento
  const iniciarReagendar = (ag) => {
    setReagendandoId(ag.id);
    setServSel({ nome: ag.servico, duracao: ag.duracao || 60, preco: ag.preco || 0 });
    setDataSel(null); setHoraSel(null); setErro("");
    setStep(3);
  };

  const resetTudo = () => {
    setStep(0); setTel(""); setServSel(null); setBarbSel(null); setDataSel(null); setHoraSel(null);
    setNome(""); setSobrenome(""); setEmail(""); setNascimento(""); setObs("");
    setDependentes([]); setParaQuem(-1); setFotoUrl("");
    setResultado(null); setClienteExistente(null); setReagendandoId(null);
    setMeusAgs([]); setAceito(false); setAviso(null);
  };

  // ── novo agendamento sem deslogar (botão da tela de sucesso) ──
  const novoAgendamento = () => {
    setServSel(null); setBarbSel(null); setDataSel(null); setHoraSel(null);
    setParaQuem(-1); setObs(""); setErro(""); setResultado(null);
    setStep(1);
  };

  // navegação da barra inferior
  const irPara = (destino) => {
    if (destino === 1) { setReagendandoId(null); setServSel(null); setBarbSel(null); }
    if ((destino === HOME || destino === HIST) && tel && ENV.hasBackend) carregarMeus(telLimpo(tel));
    setStep(destino);
  };

  // ═══ TELAS ═══

  // PASSO 0 — Boas-vindas + telefone
  if (step===0) return (
    <>
    <Shell onToggleTema={onToggleTema}>
      <div style={{padding:"54px 22px 0",textAlign:"center"}}>
        <div style={{width:64,height:64,margin:"0 auto 14px",borderRadius:18,background:`linear-gradient(150deg,${T.brass},${T.brassDeep})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:T.shadowBtn}}>
          <span style={{fontFamily:T.serif,color:"#fff",fontSize:30,fontWeight:700}}>A</span>
        </div>
        <div style={{fontFamily:T.serif,fontSize:34,fontWeight:700,letterSpacing:"0.04em",color:T.ink}}>{BARBEARIA.nome}</div>
        <div style={{color:T.brass,fontSize:13,fontWeight:600,letterSpacing:"0.16em",textTransform:"uppercase",marginTop:2}}>{BARBEARIA.sub}</div>
      </div>
      <div style={{padding:"32px 22px 0"}}>
        <h1 style={{fontFamily:T.serif,fontWeight:600,fontSize:24,margin:"0 0 6px",lineHeight:1.2,color:T.ink}}>Agende seu horário</h1>
        <p style={{color:T.muted,fontSize:14,margin:"0 0 22px"}}>Em poucos toques. Comece com seu WhatsApp.</p>
        <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>Seu WhatsApp</label>
        <input
          value={tel} onChange={(e)=>setTel(maskTel(e.target.value))} type="tel" inputMode="numeric"
          placeholder="(31) 99999-9999" autoFocus
          style={{width:"100%",marginTop:8,padding:"15px 16px",fontSize:17,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
          onFocus={(e)=>e.target.style.borderColor=T.brass}
          onBlur={(e)=>e.target.style.borderColor=T.line}
          onKeyDown={(e)=>e.key==="Enter"&&avancarTelefone()}
        />
        {erro && <div style={{color:T.danger,fontSize:13,marginTop:8}}>{erro}</div>}
      </div>
      <Bottom>
        <label style={{display:"flex",alignItems:"flex-start",gap:10,margin:"0 0 14px",cursor:"pointer",textAlign:"left"}}>
          <input type="checkbox" checked={aceito} onChange={(e)=>setAceito(e.target.checked)}
            style={{width:20,height:20,marginTop:1,accentColor:T.brass,flexShrink:0,cursor:"pointer"}}/>
          <span style={{fontSize:12.5,color:T.ink2,lineHeight:1.5}}>
            Li e concordo com a{" "}
            <button type="button" onClick={(e)=>{e.preventDefault();setLegalModal("privacidade");}}
              style={{background:"none",border:"none",padding:0,color:T.brass,fontWeight:700,textDecoration:"underline",cursor:"pointer",fontSize:12.5,fontFamily:T.sans}}>Política de Privacidade</button>{" "}e os{" "}
            <button type="button" onClick={(e)=>{e.preventDefault();setLegalModal("termos");}}
              style={{background:"none",border:"none",padding:0,color:T.brass,fontWeight:700,textDecoration:"underline",cursor:"pointer",fontSize:12.5,fontFamily:T.sans}}>Termos de Uso</button>.
          </span>
        </label>
        <Primary onClick={avancarTelefone} disabled={telLimpo(tel).length<10 || !aceito || verificando}>{verificando?"Verificando…":"Continuar"}</Primary>
      </Bottom>
    </Shell>
    {legalModal && <LegalModal tipo={legalModal} onClose={()=>setLegalModal(null)} />}
    </>
  );

  // PASSO 7 — ÁREA DO CLIENTE (cliente conhecido)
  if (step===HOME) {
    const fid = fidelidade(visitasSeguras(clienteExistente, meusAgs.length));
    return (
      <Shell onToggleTema={onToggleTema}>
        <div style={{padding:"56px 22px 4px"}}>
          <div style={{color:T.muted,fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:4}}>Olá, {primeiroNome(clienteExistente?.nome) || "cliente"}</div>
          <div style={{fontFamily:T.serif,color:T.ink,fontWeight:700,fontSize:24,letterSpacing:"-0.01em"}}>Seu próximo horário</div>
        </div>

        {aviso && (
          <div style={{margin:"8px 22px 0",padding:"11px 14px",borderRadius:12,fontSize:13,
            background:aviso.tipo==="ok"?T.brassTint:`${T.danger}1a`,color:aviso.tipo==="ok"?T.brass:T.danger,
            display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
            <span>{aviso.txt}</span>
            <button onClick={()=>setAviso(null)} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:15}}>✕</button>
          </div>
        )}

        <div style={{padding:"14px 22px 0"}}>
          {carregandoArea ? (
            <div style={{textAlign:"center",color:T.muted,fontSize:13,padding:"24px 0"}}>Carregando seus agendamentos…</div>
          ) : proximoAg ? (
            <div style={{background:T.name==="dark"?`linear-gradient(135deg,#161006,${T.card})`:T.card,border:`1px solid ${T.brassLine}`,borderRadius:16,padding:"16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{color:T.brass,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>Confirmado</div>
                  <div style={{color:T.ink,fontWeight:700,fontSize:17}}>{proximoAg.servico}</div>
                  {proximoAg.para && <div style={{color:T.brass,fontSize:12.5,fontWeight:600,marginTop:3}}>Para: {proximoAg.para}</div>}
                  <div style={{color:T.muted,fontSize:12.5,marginTop:4}}>{labelData(proximoAg._d)} · {proximoAg._h}</div>
                </div>
                <div style={{width:44,height:44,borderRadius:12,background:T.brassTint,border:`1px solid ${T.brassLine}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.brass}}><Icon name="scissors" size={22}/></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button onClick={()=>iniciarReagendar(proximoAg)} className="aq-btn" style={{background:T.brass,border:"none",borderRadius:10,padding:"11px",cursor:"pointer",color:"#0C0C0C",fontWeight:700,fontSize:13,fontFamily:T.sans}}>Reagendar</button>
                <button onClick={()=>cancelarAg(proximoAg)} className="aq-btn" style={{background:T.name==="dark"?T.card2:T.bg1,border:`1px solid ${T.line}`,borderRadius:10,padding:"11px",cursor:"pointer",color:T.muted,fontWeight:600,fontSize:13,fontFamily:T.sans}}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:"20px 16px",textAlign:"center"}}>
              <div style={{color:T.brass,marginBottom:8,display:"flex",justifyContent:"center"}}><Icon name="calendar" size={30} stroke={1.6}/></div>
              <div style={{color:T.ink,fontWeight:700,fontSize:15}}>Nenhum horário marcado</div>
              <div style={{color:T.muted,fontSize:13,margin:"4px 0 12px"}}>Que tal agendar agora?</div>
              <button onClick={()=>{ setReagendandoId(null); setServSel(null); setStep(1); }} className="aq-btn" style={{background:`linear-gradient(150deg,${T.brass},${T.brassDeep})`,border:"none",borderRadius:11,padding:"12px 22px",cursor:"pointer",color:"#fff",fontWeight:700,fontSize:14,fontFamily:T.sans}}>Agendar horário</button>
            </div>
          )}
        </div>

        {/* fidelidade */}
        <div style={{padding:"12px 22px 0"}}>
          <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:"14px 16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{color:T.brass,fontSize:13,fontWeight:700}}>✦ Nível {fid.nivel}</div>
              <div style={{color:T.muted,fontSize:11}}>{fid.visitas} visita{fid.visitas===1?"":"s"}</div>
            </div>
            <div style={{height:5,background:T.line,borderRadius:3,overflow:"hidden"}}>
              <div style={{width:`${fid.pct}%`,height:"100%",background:T.brass,transition:"width .4s"}}/>
            </div>
            <div style={{color:T.muted,fontSize:11,marginTop:6}}>
              {fid.prox ? `${fid.faltam} visita${fid.faltam===1?"":"s"} para ${fid.prox} ✦` : "Nível máximo alcançado ✦"}
            </div>
          </div>
        </div>

        {/* inspiração do dia */}
        <div style={{padding:"12px 22px 0"}}>
          <InspiracaoCard fraseIdx={fraseIdx} />
        </div>

        <div style={{height:88}}/>
        <BottomNav ativo={HOME} onNav={irPara} />
      </Shell>
    );
  }

  // PASSO 8 — HISTÓRICO
  if (step===HIST) {
    const ordenados = [...meusAgs]
      .map(a => ({ ...a, _d: agData(a), _h: agHora(a) }))
      .sort((a,b)=>(b._d+b._h).localeCompare(a._d+a._h));
    return (
      <Shell onToggleTema={onToggleTema}>
        <Header titulo="Seus agendamentos" sub={`${ordenados.length} agendamento${ordenados.length===1?"":"s"}`} onBack={()=>setStep(HOME)}/>
        <div style={{padding:"8px 22px 0",display:"flex",flexDirection:"column",gap:10}}>
          {carregandoArea ? (
            <div style={{textAlign:"center",color:T.muted,fontSize:13,padding:"30px 0"}}>Carregando…</div>
          ) : ordenados.length===0 ? (
            <div style={{textAlign:"center",color:T.muted,fontSize:13,padding:"30px 0"}}>Você ainda não tem agendamentos registrados.</div>
          ) : ordenados.map((a,i)=>{
            const futuro = a._d >= hojeISO();
            return (
              <div key={i} style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:14,padding:"14px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <div style={{color:T.ink,fontWeight:700,fontSize:14}}>{a.servico}</div>
                  {a.para && <div style={{color:T.brass,fontSize:12,fontWeight:600,marginTop:2}}>Para: {a.para}</div>}
                  <div style={{color:T.muted,fontSize:12,marginTop:3}}>{labelData(a._d)} · {a._h}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{color:T.muted,fontSize:13,fontWeight:600}}>{money(a.preco)}</span>
                  <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:99,background:futuro?T.brassTint:T.line,color:futuro?T.brass:T.muted}}>{futuro?"Próximo":"Realizado"}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{height:88}}/>
        <BottomNav ativo={HIST} onNav={irPara} />
      </Shell>
    );
  }

  // PASSO 9 — PERFIL
  if (step===PERFIL) {
    const fid = fidelidade(visitasSeguras(clienteExistente, meusAgs.length));
    const inic = (primeiroNome(clienteExistente?.nome)[0] || "?").toUpperCase();
    return (
      <Shell onToggleTema={onToggleTema}>
        <Header titulo="Seu perfil" onBack={()=>setStep(HOME)}/>

        {aviso && (
          <div style={{margin:"4px 22px 0",padding:"11px 14px",borderRadius:12,fontSize:13,
            background:aviso.tipo==="ok"?T.brassTint:`${T.danger}1a`,color:aviso.tipo==="ok"?T.brass:T.danger,
            display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
            <span>{aviso.txt}</span>
            <button onClick={()=>setAviso(null)} style={{background:"none",border:"none",color:"inherit",cursor:"pointer",fontSize:15}}>✕</button>
          </div>
        )}

        <div style={{padding:"4px 22px 0"}}>
          <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:"18px",display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:54,height:54,borderRadius:"50%",background:clienteExistente?.foto?`#000 center/cover url(${clienteExistente.foto})`:`linear-gradient(135deg,${T.brass},${T.brassDeep})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:22,flexShrink:0,overflow:"hidden"}}>{clienteExistente?.foto?"":inic}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{color:T.ink,fontWeight:700,fontSize:18}}>{clienteExistente?.nome || "—"}</div>
              <div style={{color:T.muted,fontSize:13,marginTop:2}}>{maskTel(tel)}</div>
            </div>
          </div>

          {/* Seus dados — leitura. Editar abre tela própria */}
          <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:"16px 18px",marginTop:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{color:T.muted,fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase"}}>Seus dados</span>
              <button onClick={()=>{ setErro(""); setStep(EDITAR_PERFIL); }} className="aq-btn" style={{background:"none",border:"none",color:T.brass,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:T.sans,padding:0}}>Editar ✎</button>
            </div>
            <Linha label="Nome" valor={clienteExistente?.nome || "—"}/>
            <Linha label="Nascimento" valor={clienteExistente?.nascimento || "—"}/>
            <Linha label="E-mail" valor={clienteExistente?.email || "—"}/>
          </div>

          <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:"16px 18px",marginTop:12}}>
            <Linha label="Nível de fidelidade" valor={`✦ ${fid.nivel}`}/>
            <Linha label="Visitas" valor={`${fid.visitas}`}/>
            <Linha label="Próximo nível" valor={fid.prox ? `${fid.prox} (faltam ${fid.faltam})` : "Máximo atingido"}/>
          </div>
          <div style={{marginTop:18}}>
            <button onClick={resetTudo} className="aq-btn" style={{width:"100%",padding:"14px",borderRadius:12,border:`1.5px solid ${T.line}`,background:"transparent",color:T.muted,fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:T.sans}}>Sair / trocar de número</button>
          </div>
        </div>
        <div style={{height:88}}/>
        <BottomNav ativo={PERFIL} onNav={irPara} />
      </Shell>
    );
  }

  // PASSO 10 — EDITAR PERFIL (Fatia A)
  if (step===EDITAR_PERFIL) {
    const podeSalvar = !salvandoPerfil && !enviandoFoto && nome.trim() && sobrenome.trim() && nascValido(nascimento) && emailValido(email) && fotoUrl;
    return (
      <Shell onToggleTema={onToggleTema}>
        <Header titulo="Editar perfil" sub="Atualize seus dados — todos obrigatórios." onBack={()=>{ setErro(""); setStep(PERFIL); }}/>
        <div style={{padding:"4px 22px 0"}}>
          <div style={{marginBottom:10,display:"flex",flexDirection:"column",alignItems:"center"}}>
            <FotoPicker fotoUrl={fotoUrl} iniciais={(nome[0]||"?").toUpperCase()} enviando={enviandoFoto} onEscolher={escolherFoto}/>
          </div>
          <div style={{marginTop:6}}>
            <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>Nome</label>
            <input value={nome} onChange={(e)=>setNome(e.target.value)} placeholder="Ex.: João"
              style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
              onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
          </div>
          <div style={{marginTop:14}}>
            <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>Sobrenome</label>
            <input value={sobrenome} onChange={(e)=>setSobrenome(e.target.value)} placeholder="Ex.: Silva"
              style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
              onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
          </div>
          <div style={{marginTop:14}}>
            <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>Data de nascimento</label>
            <input value={nascimento} onChange={(e)=>setNascimento(e.target.value)} type="date" max={hojeISO()} min="1900-01-01"
              style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink,colorScheme:T.name==="dark"?"dark":"light"}}
              onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
          </div>
          <div style={{marginTop:14}}>
            <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>E-mail</label>
            <input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="seu@email.com"
              style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
              onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
          </div>
          <DependentesEditor deps={dependentes} setDeps={setDependentes} />
          <div style={{marginTop:14}}>
            <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>WhatsApp</label>
            <input value={maskTel(tel)} readOnly
              style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.bg1,fontFamily:T.sans,outline:"none",color:T.muted,cursor:"not-allowed"}}/>
            <div style={{fontSize:11,color:T.muted,marginTop:6}}>Para mudar o WhatsApp, use “Sair / trocar de número” na tela anterior.</div>
          </div>
          {erro && <div style={{color:T.danger,fontSize:13,marginTop:12}}>{erro}</div>}
        </div>
        <Bottom comBarra><Primary onClick={salvarPerfil} disabled={!podeSalvar}>{salvandoPerfil?"Salvando…":"Salvar alterações"}</Primary></Bottom>
        <div style={{height:80}}/>
        <BottomNav ativo={PERFIL} onNav={irPara} />
      </Shell>
    );
  }

  // PASSO 1 — Serviço
  if (step===1) return (
    <Shell step={0} total={5} onToggleTema={onToggleTema}>
      <Header titulo="Escolha o serviço" sub={clienteExistente?`Olá de novo, ${primeiroNome(clienteExistente.nome)}!`:"O que você quer fazer hoje?"} onBack={()=> clienteExistente ? setStep(HOME) : setStep(0)}/>
      {dependentes.length > 0 && (
        <div style={{padding:"0 22px 4px"}}>
          <div style={{fontSize:13,fontWeight:600,color:T.ink2,marginBottom:8}}>Para quem é o atendimento?</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[{nome:"Para mim",idx:-1}, ...dependentes.map((d,i)=>({nome:primeiroNome(d.nome)||`Dependente ${i+1}`,idx:i}))].map(opt=>{
              const sel = paraQuem===opt.idx;
              return (
                <button key={opt.idx} onClick={()=>setParaQuem(opt.idx)} className="aq-btn" style={{
                  padding:"9px 14px",borderRadius:99,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:T.sans,
                  border:`1.5px solid ${sel?T.brass:T.line}`,
                  background:sel?`linear-gradient(150deg,${T.brass},${T.brassDeep})`:T.card,
                  color:sel?"#fff":T.ink,
                }}>{opt.nome}</button>
              );
            })}
          </div>
        </div>
      )}
      <div style={{padding:"8px 22px 0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {servicos.map(sv=>{
          const sel = servSel && servSel.id===sv.id;
          return (
            <div key={sv.id} className="aq-card-pick" onClick={()=>setServSel(sv)} style={{
              padding:"14px",borderRadius:14,cursor:"pointer",background:T.card,
              border:`1.5px solid ${sel?T.brass:T.line}`,boxShadow:sel?"0 8px 20px -12px rgba(193,138,61,.6)":"none",
            }}>
              <div style={{fontWeight:700,fontSize:14,lineHeight:1.25,color:T.ink}}>{sv.nome}</div>
              <div style={{color:T.muted,fontSize:12,marginTop:6}}>{sv.duracao} min</div>
              <div style={{color:T.brass,fontWeight:700,fontSize:15,marginTop:2}}>{money(sv.preco)}</div>
            </div>
          );
        })}
      </div>
      <Bottom comBarra><Primary onClick={()=>setStep(2)} disabled={!servSel}>{servSel?`Continuar · ${money(servSel.preco)}`:"Selecione um serviço"}</Primary></Bottom>
      <div style={{height:80}}/>
      <BottomNav ativo={1} onNav={irPara} />
    </Shell>
  );

  // PASSO 2 — Barbeiro
  if (step===2) return (
    <Shell step={1} total={5} onToggleTema={onToggleTema}>
      <Header titulo="Escolha o barbeiro" sub="Quem você quer que faça seu atendimento?" onBack={()=>setStep(1)}/>
      <div style={{padding:"8px 22px 0",display:"flex",flexDirection:"column",gap:10}}>
        {barbeiros.map(b=>{
          const sel = barbSel && barbSel.id===b.id;
          const iniciais = b.nome.split(" ").map(p=>p[0]).slice(0,2).join("").toUpperCase();
          return (
            <div key={b.id} className="aq-card-pick" onClick={()=>setBarbSel(b)} style={{
              padding:"14px",borderRadius:14,cursor:"pointer",background:T.card,display:"flex",alignItems:"center",gap:12,
              border:`1.5px solid ${sel?T.brass:T.line}`,boxShadow:sel?"0 8px 20px -12px rgba(193,138,61,.6)":"none",
            }}>
              <div style={{width:44,height:44,borderRadius:"50%",background:`linear-gradient(135deg,#D8C39C,#B07F37)`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:15,flexShrink:0}}>{iniciais}</div>
              <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15,color:T.ink}}>{b.nome}</div></div>
              <div style={{width:22,height:22,borderRadius:"50%",border:`2px solid ${sel?T.brass:T.line}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {sel&&<div style={{width:11,height:11,borderRadius:"50%",background:T.brass}}/>}
              </div>
            </div>
          );
        })}
      </div>
      <Bottom comBarra><Primary onClick={()=>setStep(3)} disabled={!barbSel}>Continuar</Primary></Bottom>
      <div style={{height:80}}/>
      <BottomNav ativo={1} onNav={irPara} />
    </Shell>
  );

  // PASSO 3 — Data e horário (também usado no reagendamento)
  if (step===3) return (
    <Shell step={2} total={5} onToggleTema={onToggleTema}>
      <Header titulo={reagendandoId?"Novo horário":"Data e horário"} sub={reagendandoId?`Remarcando: ${servSel?.nome}`:`${servSel?.nome} · ${barbSel?.nome}`} onBack={()=> reagendandoId ? setStep(HOME) : setStep(2)}/>
      <div style={{padding:"8px 0 0"}}>
        <div style={{display:"flex",gap:8,overflowX:"auto",padding:"0 22px 4px",scrollbarWidth:"none"}}>
          {proximosDias(14).map((d,i)=>{
            const sel = dataSel && isoDate(dataSel)===isoDate(d);
            const hoje = i===0;
            return (
              <div key={i} className="aq-card-pick" onClick={()=>setDataSel(d)} style={{
                flexShrink:0,width:58,padding:"10px 0",borderRadius:13,textAlign:"center",cursor:"pointer",
                background:sel?`linear-gradient(150deg,${T.brass},${T.brassDeep})`:T.card,
                border:`1.5px solid ${sel?T.brass:T.line}`,color:sel?"#fff":T.ink,
              }}>
                <div style={{fontSize:11,opacity:.8}}>{hoje?"Hoje":DIAS[d.getDay()]}</div>
                <div style={{fontSize:19,fontWeight:700,margin:"2px 0"}}>{d.getDate()}</div>
                <div style={{fontSize:10,opacity:.7}}>{MESES[d.getMonth()]}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{padding:"20px 22px 0"}}>
        {!dataSel ? (
          <div style={{textAlign:"center",color:T.muted,fontSize:13,padding:"30px 0"}}>Escolha um dia acima para ver os horários.</div>
        ) : loadingSlots ? (
          <div style={{textAlign:"center",color:T.muted,fontSize:13,padding:"30px 0"}}>Buscando horários disponíveis…</div>
        ) : slots.length===0 ? (
          <div style={{textAlign:"center",color:T.muted,fontSize:13,padding:"30px 0"}}>Sem horários livres neste dia. Tente outra data.</div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
            {slots.map(h=>{
              const sel = horaSel===h;
              return (
                <div key={h} className="aq-card-pick" onClick={()=>setHoraSel(h)} style={{
                  padding:"12px 0",borderRadius:11,textAlign:"center",cursor:"pointer",fontWeight:600,fontSize:14,
                  background:sel?`linear-gradient(150deg,${T.brass},${T.brassDeep})`:T.card,
                  border:`1.5px solid ${sel?T.brass:T.line}`,color:sel?"#fff":T.ink,
                }}>{h}</div>
              );
            })}
          </div>
        )}
        {erro && <div style={{color:T.danger,fontSize:13,marginTop:12,textAlign:"center"}}>{erro}</div>}
      </div>
      <Bottom comBarra={!reagendandoId}>
        {reagendandoId
          ? <Primary onClick={confirmarReagendamento} disabled={!dataSel||!horaSel||enviando}>{enviando?"Remarcando…":"Confirmar novo horário"}</Primary>
          : <Primary onClick={()=>setStep(4)} disabled={!dataSel||!horaSel}>Continuar</Primary>}
      </Bottom>
      {!reagendandoId && (<>
        <div style={{height:80}}/>
        <BottomNav ativo={1} onNav={irPara} />
      </>)}
    </Shell>
  );

  // PASSO 4 — Dados + confirmação
  if (step===4) return (
    <Shell step={3} total={5} onToggleTema={onToggleTema}>
      <Header titulo="Confirme seu agendamento" onBack={()=>setStep(3)}/>
      <div style={{padding:"4px 22px 0"}}>
        <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:18}}>
          {(paraQuem>=0 && dependentes[paraQuem]) && <Linha label="Para" valor={dependentes[paraQuem].nome}/>}
          <Linha label="Serviço" valor={servSel?.nome}/>
          <Linha label="Barbeiro" valor={barbSel?.nome}/>
          <Linha label="Data" valor={dataSel && `${DIAS[dataSel.getDay()]}, ${dataSel.getDate()} de ${MESES_L[dataSel.getMonth()]}`}/>
          <Linha label="Horário" valor={horaSel}/>
          <Linha label="Duração" valor={`${servSel?.duracao} min`}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,paddingTop:12,borderTop:`1px dashed ${T.line}`}}>
            <span style={{fontWeight:700,fontSize:15,color:T.ink}}>Total</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:22,color:T.brass}}>{money(servSel?.preco)}</span>
          </div>
        </div>
        <div style={{marginTop:6,marginBottom:4,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <FotoPicker fotoUrl={fotoUrl} iniciais={(nome[0]||"?").toUpperCase()} enviando={enviandoFoto} onEscolher={escolherFoto}/>
          <div style={{fontSize:11,color:T.muted,marginTop:4,textAlign:"center"}}>Foto de perfil (obrigatória) — ajuda no seu reconhecimento.</div>
        </div>
        <div style={{marginTop:14}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>Nome</label>
          <input value={nome} onChange={(e)=>setNome(e.target.value)} placeholder="Ex.: João" autoFocus={!nome}
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
        </div>
        <div style={{marginTop:14}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>Sobrenome</label>
          <input value={sobrenome} onChange={(e)=>setSobrenome(e.target.value)} placeholder="Ex.: Silva"
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
        </div>
        <div style={{marginTop:14}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>Data de nascimento</label>
          <input
            value={nascimento}
            onChange={(e)=>setNascimento(e.target.value)}
            type="date"
            max={hojeISO()}
            min="1900-01-01"
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink,colorScheme:T.name==="dark"?"dark":"light"}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
          <div style={{fontSize:11,color:T.muted,marginTop:6}}>Usamos para mensagem de aniversário e cuidados específicos.</div>
        </div>
        <div style={{marginTop:14}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>E-mail</label>
          <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="seu@email.com" type="email" inputMode="email" autoComplete="email"
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
        </div>
        <DependentesEditor deps={dependentes} setDeps={setDependentes} />
        <div style={{marginTop:14}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>Observação <span style={{color:T.muted,fontWeight:400}}>(opcional)</span></label>
          <input value={obs} onChange={(e)=>setObs(e.target.value)} placeholder="Algum pedido especial?"
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:15,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
        </div>
        {erro && <div style={{color:T.danger,fontSize:13,marginTop:12}}>{erro}</div>}
      </div>
      <Bottom comBarra={!reagendandoId}><Primary onClick={confirmar} disabled={enviando||enviandoFoto||!nome.trim()||!sobrenome.trim()||!nascValido(nascimento)||!emailValido(email)||!fotoUrl}>{enviando?"Confirmando…":"Confirmar agendamento"}</Primary></Bottom>
      {!reagendandoId && (<>
        <div style={{height:80}}/>
        <BottomNav ativo={1} onNav={irPara} />
      </>)}
    </Shell>
  );

  // PASSO 5 — Sinal (Pix)
  if (step===5) return (
    <Shell onToggleTema={onToggleTema}>
      <Header titulo="Garanta seu horário" sub="Para confirmar, falta um sinal via Pix."/>
      <div style={{padding:"4px 22px 0"}}>
        <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:20,textAlign:"center"}}>
          <div style={{fontSize:13,color:T.muted}}>Valor do sinal ({resultado?.sinalPct||30}%)</div>
          <div style={{fontFamily:T.serif,fontWeight:700,fontSize:30,color:T.brass,margin:"4px 0 14px"}}>{money(resultado?.valorSinal)}</div>
          {resultado?.pix?.qrCodeBase64 && (
            <img src={`data:image/png;base64,${resultado.pix.qrCodeBase64}`} alt="QR Code Pix" style={{width:200,height:200,margin:"0 auto",display:"block",borderRadius:12}}/>
          )}
          {resultado?.pix?.copiaECola && (
            <div style={{marginTop:14}}>
              <div style={{fontSize:12,color:T.muted,marginBottom:6}}>Pix copia e cola:</div>
              <div style={{background:T.bg1,border:`1px solid ${T.line}`,borderRadius:10,padding:"10px 12px",fontSize:11,wordBreak:"break-all",fontFamily:"monospace",color:T.ink2}}>{resultado.pix.copiaECola}</div>
              <button className="aq-btn" onClick={()=>{navigator.clipboard?.writeText(resultado.pix.copiaECola);}} style={{marginTop:10,width:"100%",padding:"12px",borderRadius:11,border:`1.5px solid ${T.brass}`,background:T.brassTint,color:T.brass,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:T.sans}}>Copiar código Pix</button>
            </div>
          )}
          <p style={{fontSize:12,color:T.muted,marginTop:16,lineHeight:1.5}}>Assim que o pagamento for confirmado, você recebe a confirmação no WhatsApp. O valor é descontado no dia do atendimento.</p>
        </div>
      </div>
      <Bottom><Primary onClick={()=>setStep(6)}>Já paguei / Concluir</Primary></Bottom>
    </Shell>
  );

  // PASSO 6 — Sucesso
  return (
    <Shell onToggleTema={onToggleTema}>
      <div style={{padding:"56px 22px 0",textAlign:"center"}}>
        <div style={{width:72,height:72,margin:"0 auto 20px",borderRadius:"50%",background:T.wa,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 14px 30px -10px rgba(31,168,85,.6)"}}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h1 style={{fontFamily:T.serif,fontWeight:700,fontSize:28,margin:"0 0 8px",color:T.ink}}>Agendamento confirmado!</h1>
        <p style={{color:T.muted,fontSize:15,margin:"0 0 24px",lineHeight:1.5}}>{primeiroNome(nome)}, {(paraQuem>=0 && dependentes[paraQuem]) ? `o horário de ${primeiroNome(dependentes[paraQuem].nome)} está garantido.` : "seu horário está garantido."}</p>
      </div>
      <div style={{padding:"0 22px"}}>
        <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:18,textAlign:"left"}}>
          {(paraQuem>=0 && dependentes[paraQuem]) && <Linha label="Para" valor={dependentes[paraQuem].nome}/>}
          <Linha label="Serviço" valor={servSel?.nome}/>
          <Linha label="Barbeiro" valor={barbSel?.nome}/>
          <Linha label="Data" valor={dataSel && `${DIAS[dataSel.getDay()]}, ${dataSel.getDate()}/${String(dataSel.getMonth()+1).padStart(2,"0")}`}/>
          <Linha label="Horário" valor={horaSel}/>
          <Linha label="Local" valor={BARBEARIA.endereco}/>
        </div>
        {(resultado?.demo||demo) && <p style={{textAlign:"center",fontSize:11,color:T.muted,marginTop:14}}>Modo demonstração — conecte o backend (VITE_GAS_URL) para gravar de verdade.</p>}
        {!(resultado?.demo||demo) && <p style={{textAlign:"center",fontSize:13,color:T.muted,marginTop:16,lineHeight:1.5}}>Você receberá lembretes no WhatsApp: 24h e 1h antes.</p>}
      </div>
      <Bottom>
        <Primary onClick={novoAgendamento}>Agendar outro horário</Primary>
        <button onClick={()=>setStep(HOME)} className="aq-btn" style={{width:"100%",marginTop:10,padding:"14px",borderRadius:13,border:`1.5px solid ${T.line}`,background:"transparent",color:T.ink2,fontWeight:600,fontSize:15,cursor:"pointer",fontFamily:T.sans}}>Ir para o início</button>
      </Bottom>
    </Shell>
  );
}

// hook para alternar tema (lê do contexto-pai via window event simples)
function useToggleTema() {
  return () => { window.dispatchEvent(new CustomEvent("aq-toggle-tema")); };
}

// ════════════════════════════════════════════════════════════════════════
export default function BookingPortal() {
  const [tema, setTema] = useState(lerTema);
  useEffect(() => {
    const h = () => setTema(t => { const novo = t === "dark" ? "light" : "dark"; salvarTema(novo); return novo; });
    window.addEventListener("aq-toggle-tema", h);
    return () => window.removeEventListener("aq-toggle-tema", h);
  }, []);
  return (
    <ThemeCtx.Provider value={THEMES[tema]}>
      <Portal />
    </ThemeCtx.Provider>
  );
}

