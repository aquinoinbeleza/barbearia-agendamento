import { useState, useEffect, createContext, useContext } from "react";

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

const Bottom = ({ children }) => {
  const T = useT();
  return (
    <div style={{padding:"12px 22px 0",position:"sticky",bottom:0,background:`linear-gradient(to top, ${T.bg} 70%, transparent)`,paddingBottom:16}}>{children}</div>
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

// barra de navegação inferior (área do cliente)
const BottomNav = ({ ativo, onNav }) => {
  const T = useT();
  const tabs = [
    { id:HOME,   icon:"home",     label:"Início"    },
    { id:1,      icon:"calendar", label:"Agendar"   },
    { id:HIST,   icon:"clock",    label:"Histórico" },
    { id:PERFIL, icon:"user",     label:"Perfil"    },
  ];
  return (
    <div style={{position:"sticky",bottom:0,marginTop:22,background:T.card,borderTop:`1px solid ${T.line}`,display:"flex",justifyContent:"space-around",padding:"10px 0 12px"}}>
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
const HOME = 7, HIST = 8, PERFIL = 9;

function Portal() {
  const T = useT();
  const [step, setStep] = useState(0);            // 0 tel · 1 serviço · 2 barbeiro · 3 data/hora · 4 dados · 5 sinal · 6 ok · 7 home · 8 histórico
  const [tel, setTel] = useState("");
  const [clienteExistente, setClienteExistente] = useState(null);
  const [nome, setNome] = useState("");
  const [obs, setObs] = useState("");
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
        setClienteExistente(r); setNome(r.nome || "");
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
    setErro(""); setEnviando(true);
    try {
      const r = await api.agendar({
        nome: nome.trim(), telefone: telLimpo(tel),
        data: isoDate(dataSel), horario: horaSel,
        servico: { nome: servSel.nome, duracao: servSel.duracao, preco: servSel.preco },
        barbeiro: barbSel ? barbSel.nome : "", observacao: obs.trim(),
      });
      if (r && r._demo) { setResultado({ demo:true }); setStep(6); }
      else if (r && r.requiresSinal) { setResultado(r); setStep(5); }
      else if (r && (r.success || r.id)) { setResultado(r); setStep(6); }
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

  // iniciar reagendamento de um agendamento
  const iniciarReagendar = (ag) => {
    setReagendandoId(ag.id);
    setServSel({ nome: ag.servico, duracao: ag.duracao || 60, preco: ag.preco || 0 });
    setDataSel(null); setHoraSel(null); setErro("");
    setStep(3);
  };

  const resetTudo = () => {
    setStep(0); setTel(""); setServSel(null); setBarbSel(null); setDataSel(null); setHoraSel(null);
    setNome(""); setObs(""); setResultado(null); setClienteExistente(null); setReagendandoId(null);
    setMeusAgs([]); setAceito(false); setAviso(null);
  };

  // navegação da barra inferior
  const irPara = (destino) => {
    if (destino === 1) { setReagendandoId(null); setServSel(null); setBarbSel(null); }
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
        <Header titulo="Seu histórico" sub={`${ordenados.length} agendamento${ordenados.length===1?"":"s"}`} onBack={()=>setStep(HOME)}/>
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
        <div style={{padding:"4px 22px 0"}}>
          <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:"18px",display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:54,height:54,borderRadius:"50%",background:`linear-gradient(135deg,${T.brass},${T.brassDeep})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:22,flexShrink:0}}>{inic}</div>
            <div>
              <div style={{color:T.ink,fontWeight:700,fontSize:18}}>{clienteExistente?.nome || "—"}</div>
              <div style={{color:T.muted,fontSize:13,marginTop:2}}>{maskTel(tel)}</div>
            </div>
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
        <BottomNav ativo={PERFIL} onNav={irPara} />
      </Shell>
    );
  }

  // PASSO 1 — Serviço
  if (step===1) return (
    <Shell step={0} total={5} onToggleTema={onToggleTema}>
      <Header titulo="Escolha o serviço" sub={clienteExistente?`Olá de novo, ${primeiroNome(clienteExistente.nome)}!`:"O que você quer fazer hoje?"} onBack={()=> clienteExistente ? setStep(HOME) : setStep(0)}/>
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
      <Bottom><Primary onClick={()=>setStep(2)} disabled={!servSel}>{servSel?`Continuar · ${money(servSel.preco)}`:"Selecione um serviço"}</Primary></Bottom>
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
      <Bottom><Primary onClick={()=>setStep(3)} disabled={!barbSel}>Continuar</Primary></Bottom>
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
      <Bottom>
        {reagendandoId
          ? <Primary onClick={confirmarReagendamento} disabled={!dataSel||!horaSel||enviando}>{enviando?"Remarcando…":"Confirmar novo horário"}</Primary>
          : <Primary onClick={()=>setStep(4)} disabled={!dataSel||!horaSel}>Continuar</Primary>}
      </Bottom>
    </Shell>
  );

  // PASSO 4 — Dados + confirmação
  if (step===4) return (
    <Shell step={3} total={5} onToggleTema={onToggleTema}>
      <Header titulo="Confirme seu agendamento" onBack={()=>setStep(3)}/>
      <div style={{padding:"4px 22px 0"}}>
        <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:18}}>
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
        <div style={{marginTop:18}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>Seu nome completo</label>
          <input value={nome} onChange={(e)=>setNome(e.target.value)} placeholder="Ex.: João Silva" autoFocus={!nome}
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
        </div>
        <div style={{marginTop:14}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>Observação <span style={{color:T.muted,fontWeight:400}}>(opcional)</span></label>
          <input value={obs} onChange={(e)=>setObs(e.target.value)} placeholder="Algum pedido especial?"
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:15,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
        </div>
        {erro && <div style={{color:T.danger,fontSize:13,marginTop:12}}>{erro}</div>}
      </div>
      <Bottom><Primary onClick={confirmar} disabled={enviando||!nome.trim()}>{enviando?"Confirmando…":"Confirmar agendamento"}</Primary></Bottom>
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
        <p style={{color:T.muted,fontSize:15,margin:"0 0 24px",lineHeight:1.5}}>{primeiroNome(nome)}, seu horário está garantido.</p>
      </div>
      <div style={{padding:"0 22px"}}>
        <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:18,textAlign:"left"}}>
          <Linha label="Serviço" valor={servSel?.nome}/>
          <Linha label="Barbeiro" valor={barbSel?.nome}/>
          <Linha label="Data" valor={dataSel && `${DIAS[dataSel.getDay()]}, ${dataSel.getDate()}/${String(dataSel.getMonth()+1).padStart(2,"0")}`}/>
          <Linha label="Horário" valor={horaSel}/>
          <Linha label="Local" valor={BARBEARIA.endereco}/>
        </div>
        {(resultado?.demo||demo) && <p style={{textAlign:"center",fontSize:11,color:T.muted,marginTop:14}}>Modo demonstração — conecte o backend (VITE_GAS_URL) para gravar de verdade.</p>}
        {!(resultado?.demo||demo) && <p style={{textAlign:"center",fontSize:13,color:T.muted,marginTop:16,lineHeight:1.5}}>Você receberá lembretes no WhatsApp: 24h e 1h antes.</p>}
      </div>
      <Bottom><Primary onClick={resetTudo}>Voltar ao início</Primary></Bottom>
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

