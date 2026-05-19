import { useState, useEffect, useRef } from "react"

// ═══════════════════════════════════════════════════════════════
//  ⚙️  CONFIGURAÇÃO — lê variáveis de ambiente do Vercel
// ═══════════════════════════════════════════════════════════════
const GAS_URL = import.meta.env.VITE_GAS_URL
  || "https://script.google.com/macros/s/AKfycbyYk03d8DY8NQTDRNEfb3CSUO0gJOi5Ya-TcYyj9VCj_VEwnCumwoLI15WgXJL1Bvz9_Q/exec"
const SITE_TOKEN = import.meta.env.VITE_SITE_TOKEN || "aq2025site"

const BARBEARIA = {
  nome:      "AQUINO | Barbearia & Estética",
  slogan:    "Conforto. Estilo. Confiança.",
  endereco:  "R. Carlos Gomes, 256 - Ideal, Ipatinga - MG",
  instagram: "@aquino.inbeleza",
}

const SERVICOS = [
  { id:"1",  nome:"Corte",                              preco:40,  duracao:60,  icon:"✂️", desc:"Tesoura e máquina" },
  { id:"2",  nome:"Barba",                              preco:35,  duracao:35,  icon:"🪒", desc:"Navalha + toalha quente" },
  { id:"3",  nome:"Acabamento",                         preco:15,  duracao:15,  icon:"💈", desc:"Pescoço e entorno" },
  { id:"4",  nome:"Sobrancelha Navalha",                preco:15,  duracao:15,  icon:"🔍", desc:"Design com navalha" },
  { id:"5",  nome:"Sobrancelha Pinça",                  preco:35,  duracao:45,  icon:"🔍", desc:"Modelagem com pinça" },
  { id:"6",  nome:"Corte e Barba",                      preco:65,  duracao:90,  icon:"⭐", desc:"Combo completo" },
  { id:"7",  nome:"Corte + Barba + Sobrancelha Navalha", preco:75, duracao:105, icon:"👑", desc:"Pacote premium" },
  { id:"8",  nome:"Corte e Sobrancelha",                preco:50,  duracao:75,  icon:"✨", desc:"Corte + sobrancelha navalha" },
  { id:"9",  nome:"Barba + Sobrancelha + Acabamento",   preco:55,  duracao:45,  icon:"💫", desc:"Combo rosto completo" },
  { id:"10", nome:"Barba + Sobrancelha ou Acabamento",  preco:45,  duracao:40,  icon:"🪒", desc:"Barba + 1 complemento" },
  { id:"11", nome:"Relaxamento",                        preco:40,  duracao:30,  icon:"💧", desc:"A partir de R$ 40" },
  { id:"12", nome:"Hidratação",                         preco:35,  duracao:45,  icon:"💧", desc:"A partir de R$ 35" },
  { id:"13", nome:"Corte e Relaxamento",                preco:75,  duracao:90,  icon:"✂️", desc:"A partir de R$ 70" },
  { id:"14", nome:"Barboterapia",    preco:0, duracao:60,  icon:"🧴", desc:"A consultar", disabled:true },
  { id:"15", nome:"Botox Capilar",   preco:0, duracao:120, icon:"💎", desc:"A consultar", disabled:true },
  { id:"16", nome:"Selagem",         preco:0, duracao:180, icon:"💎", desc:"A consultar", disabled:true },
  { id:"17", nome:"Barba e Botox",   preco:0, duracao:120, icon:"🧴", desc:"A consultar", disabled:true },
  { id:"18", nome:"Corte e Botox",   preco:0, duracao:180, icon:"💎", desc:"A consultar", disabled:true },
  { id:"19", nome:"Corte e Selagem", preco:0, duracao:240, icon:"💎", desc:"A consultar", disabled:true },
]

// ── Paleta ──────────────────────────────────────────────────────
const C = {
  bg:"#070707", surface:"#0f0f0f", card:"#141414",
  border:"#242424", borderHov:"#3a3a3a",
  gold:"#c9a84c", goldLight:"#dfc070", goldDim:"#c9a84c22",
  text:"#ede9e3", sub:"#888", muted:"#444",
  green:"#4caf82", red:"#e05555", blue:"#4c8fcf", cyan:"#38BDF8",
}

// ── [FASE 2] Tier VIP adicionado ────────────────────────────────
const NIVEL_STYLES = {
  VIP:    { cor:"#38BDF8", bg:"#38BDF822", borda:"#38BDF866", emoji:"💎" },
  Ouro:   { cor:"#C9A84C", bg:"#C9A84C22", borda:"#C9A84C66", emoji:"🥇" },
  Prata:  { cor:"#C0C8D0", bg:"#C0C8D022", borda:"#C0C8D066", emoji:"🥈" },
  Bronze: { cor:"#CD7F32", bg:"#CD7F3222", borda:"#CD7F3266", emoji:"🥉" },
}

// ── Utilitários ─────────────────────────────────────────────────
const DIAS     = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]
const MESES    = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
const MESES_EXT= ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"]

function dataExtenso(d) { return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES_EXT[d.getMonth()]}` }
function getProximos30Dias() {
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  return Array.from({length:30},(_,i)=>{ const d=new Date(hoje); d.setDate(d.getDate()+i); return d })
}
function calcularIdade(nascDDMMAAAA) {
  if (!nascDDMMAAAA) return null
  const [d,m,a] = nascDDMMAAAA.split("/").map(Number)
  if (!d||!m||!a) return null
  const hoje = new Date()
  let idade = hoje.getFullYear() - a
  if (hoje.getMonth()+1 < m || (hoje.getMonth()+1===m && hoje.getDate()<d)) idade--
  return idade
}
function formatarTel(v) {
  const s = v.replace(/\D/g,"")
  if (s.length<=2)  return `(${s}`
  if (s.length<=6)  return `(${s.slice(0,2)}) ${s.slice(2)}`
  if (s.length<=10) return `(${s.slice(0,2)}) ${s.slice(2,6)}-${s.slice(6)}`
  return `(${s.slice(0,2)}) ${s.slice(2,7)}-${s.slice(7,11)}`
}
function formatarNasc(v) {
  const s = v.replace(/\D/g,"")
  if (s.length<=2)  return s
  if (s.length<=4)  return `${s.slice(0,2)}/${s.slice(2)}`
  return `${s.slice(0,2)}/${s.slice(2,4)}/${s.slice(4,8)}`
}
function telLimpo(v) { return v.replace(/\D/g,"") }
function gerarSlotsMock() {
  const base=["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"]
  return base.filter(()=>Math.random()>.35)
}

// ── Ícone por tipo de evento (Morning Briefing) ──────────────────
const EVENTO_STYLES = {
  faltaHoje:      { icon:"⚠️", bg:"#EF444415", cor:"#EF4444", borda:"#EF444440", label:"Risco financeiro direto" },
  vipReativacao:  { icon:"💎", bg:"#38BDF815", cor:"#38BDF8", borda:"#38BDF840", label:"LTV em risco" },
  vagoPremium:    { icon:"📅", bg:"#F59E0B15", cor:"#F59E0B", borda:"#F59E0B40", label:"Receita não capturada" },
  waitlistAtiva:  { icon:"👥", bg:"#22C55E15", cor:"#22C55E", borda:"#22C55E40", label:"Conversão disponível" },
  aniversariante: { icon:"🎂", bg:"#C9A84C15", cor:"#C9A84C", borda:"#C9A84C40", label:"Fidelização" },
}

// ── Mapa de progresso ────────────────────────────────────────────
const PROGRESS = { phone:1, register:1, welcome:1, service:2, date:3, time:4, confirm:5 }

// ════════════════════════════════════════════════════════════════
export default function App() {
  const isAdmin = typeof window !== "undefined" && window.location.search.includes("admin=1")

  const [step,        setStep]        = useState("hero")
  const [cliente,     setCliente]     = useState({ nome:"", telefone:"", nascimento:"" })
  const [retorno,     setRetorno]     = useState(null)
  const [isNovo,      setIsNovo]      = useState(true)
  const [servico,     setServico]     = useState(null)
  const [dataSel,     setDataSel]     = useState(null)
  const [horario,     setHorario]     = useState(null)
  const [slots,       setSlots]       = useState([])
  const [loadSlots,   setLoadSlots]   = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [error,       setError]       = useState("")
  const [concordou,     setConcordou]     = useState(false)
  const [politicaAberta, setPoliticaAberta] = useState(false)
  const [cancelTel,    setCancelTel]    = useState("")
  const [cancelAgs,    setCancelAgs]    = useState([])
  const [cancelSel,    setCancelSel]    = useState(null)
  const [buscandoAgs,  setBuscandoAgs]  = useState(false)
  const [cancelando,   setCancelando]   = useState(false)

  // ── Admin ─────────────────────────────────────────────────────
  const [adminAuth,   setAdminAuth]   = useState(false)
  const [adminPass,   setAdminPass]   = useState("")
  const [adminKey,    setAdminKey]    = useState("")  // chave validada (guardada após login)
  const [validandoAdmin, setValidandoAdmin] = useState(false)
  const [clientes,    setClientes]    = useState([])
  const [briefing,    setBriefing]    = useState(null)
  const [loadAdmin,   setLoadAdmin]   = useState(false)
  const [adminError,  setAdminError]  = useState("")
  const [adminTab,    setAdminTab]    = useState("inicio")
  const [cfg, setCfg] = useState({ diasBloqueados: [0, 1], horaInicio: 8, horaFim: 19, intervaloDias: 15 })
  const [cfgSaving, setCfgSaving] = useState(false)
  const [cfgMsg,    setCfgMsg]    = useState("")

  // CSS global
  useEffect(() => {
    const link = document.createElement("link")
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Outfit:wght@300;400;500;600&display=swap"
    link.rel  = "stylesheet"
    document.head.appendChild(link)
    const style = document.createElement("style")
    style.textContent = `
      *{box-sizing:border-box;margin:0;padding:0}
      html,body{background:${C.bg};font-family:'Outfit',sans-serif;color:${C.text};min-height:100vh}
      input,button,textarea{font-family:inherit;outline:none;border:none}
      button{cursor:pointer;background:none}
      ::-webkit-scrollbar{width:3px}
      ::-webkit-scrollbar-thumb{background:${C.muted};border-radius:2px}
      @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
      @keyframes scaleIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}
      .anim{animation:fadeUp .42s cubic-bezier(.22,1,.36,1) forwards}
      .anim-scale{animation:scaleIn .38s cubic-bezier(.22,1,.36,1) forwards}
      .svc-card{transition:border-color .2s,background .2s,transform .15s}
      .svc-card:not(:disabled):hover{border-color:${C.borderHov}!important;transform:translateY(-2px)}
      .slot{transition:all .15s}
      .slot:hover{background:${C.goldDim}!important;border-color:${C.gold}!important;color:${C.gold}!important}
      .day-btn{transition:all .15s}
      .day-btn:hover:not(:disabled){background:${C.goldDim}!important}
      .back-btn:hover{color:${C.gold}!important}
      .gold-btn:hover:not(:disabled){background:${C.goldLight}!important;transform:translateY(-1px)}
      .admin-row:hover{background:#0d0d0d}
      .briefing-card{transition:transform .2s, border-color .2s}
      .briefing-card:hover{transform:translateY(-2px)}
    `
    document.head.appendChild(style)
  }, [])

  // Busca slots
  useEffect(() => {
    if (!dataSel || !servico) return
    setLoadSlots(true); setSlots([]); setHorario(null)
    const p = new URLSearchParams({ action:"slots", data:dataSel.toISOString().split("T")[0], duracao:servico.duracao })
    fetch(`${GAS_URL}?${p}&token=${SITE_TOKEN}`)
      .then(r=>r.json())
      .then(d=>{ setSlots(d.slots||[]); setLoadSlots(false) })
      .catch(()=>{ setSlots(gerarSlotsMock()); setLoadSlots(false) })
  }, [dataSel, servico])

  // ── Verificar cliente ──
  const verificarCliente = async (tel) => {
    setVerificando(true); setError("")
    try {
      const r    = await fetch(`${GAS_URL}?action=verificarCliente&tel=${telLimpo(tel)}&token=${SITE_TOKEN}`)
      const data = await r.json()
      if (data.encontrado) {
        setCliente({ nome:data.nome, telefone:tel, nascimento:data.nascimento||"" })
        setRetorno({
          totalVisitas: data.totalVisitas, ultimaVisita: data.ultimaVisita, diasDesde: data.diasDesde,
          nivel: data.nivel, score: data.score, statusLabel: data.statusLabel, statusCor: data.statusCor,
          cancelamentos: data.cancelamentos,
        })
        setIsNovo(false)
        setStep("welcome")
        setTimeout(()=>setStep("service"), 2800)
      } else {
        setIsNovo(true); setStep("register")
      }
    } catch { setIsNovo(true); setStep("register") }
    setVerificando(false)
  }

  const confirmar = async () => {
    setSubmitting(true); setError("")
    try {
      const res  = await fetch(GAS_URL, {
        method:"POST",
        body: JSON.stringify({
          action:"agendamento", token:SITE_TOKEN, servico,
          data:dataSel?.toISOString().split("T")[0], horario,
          nome:cliente.nome, telefone:telLimpo(cliente.telefone),
          nascimento:cliente.nascimento, isNovo
        })
      })
      const data = await res.json()
      if (data.success) setStep("success")
      else setError(data.error || "Erro ao confirmar. Tente novamente.")
    } catch { setError("Erro de conexão. Tente novamente.") }
    setSubmitting(false)
  }

  const buscarMeusAgendamentos = async (tel) => {
    setBuscandoAgs(true); setError("")
    try {
      const r = await fetch(`${GAS_URL}?action=meusAgendamentos&tel=${telLimpo(tel)}&token=${SITE_TOKEN}`)
      const d = await r.json()
      setCancelAgs(d.agendamentos || [])
      setStep("cancel-lista")
    } catch { setError("Erro de conexão. Tente novamente.") }
    setBuscandoAgs(false)
  }

  const executarCancelamento = async () => {
    setCancelando(true); setError("")
    try {
      const r = await fetch(GAS_URL, {
        method: "POST",
        body: JSON.stringify({ action:"cancelar", token:SITE_TOKEN, agendamentoId:cancelSel.id, tel:telLimpo(cancelTel) })
      })
      const d = await r.json()
      if (d.success) setStep("cancel-ok")
      else setError(d.error || "Erro ao cancelar. Tente novamente.")
    } catch { setError("Erro de conexão.") }
    setCancelando(false)
  }

  const resetar = () => {
    setStep("hero"); setCliente({nome:"",telefone:"",nascimento:""}); setRetorno(null)
    setIsNovo(true); setServico(null); setDataSel(null); setHorario(null)
    setSlots([]); setError("")
  }

  // ════════════════════════════════════════════════════════════════
  //  ADMIN — Validação server-side (senha nunca no bundle JS)
  // ════════════════════════════════════════════════════════════════
  const fazerLoginAdmin = async () => {
    setValidandoAdmin(true); setAdminError("")
    try {
      // Validação real é feita pelo GAS — tentamos chamar dashboard
      const r = await fetch(GAS_URL, {
        method:"POST",
        body: JSON.stringify({ action:"dashboard", key: adminPass, token: SITE_TOKEN })
      })
      const d = await r.json()
      if (d.clientes !== undefined) {
        setAdminKey(adminPass)
        setAdminAuth(true)
        setClientes(d.clientes)
        // Carrega briefing também
        carregarBriefing(adminPass)
      } else {
        setAdminError(d.erro || "Senha incorreta")
      }
    } catch { setAdminError("Erro de conexão.") }
    setValidandoAdmin(false)
  }

  const carregarAdmin = async () => {
    setLoadAdmin(true); setAdminError("")
    try {
      const r = await fetch(GAS_URL, { method:"POST", body: JSON.stringify({ action:"dashboard", key:adminKey, token:SITE_TOKEN }) })
      const d = await r.json()
      if (d.clientes) setClientes(d.clientes)
      else setAdminError("Erro ao carregar dados.")
    } catch { setAdminError("Erro de conexão.") }
    setLoadAdmin(false)
  }

  const carregarBriefing = async (key) => {
    try {
      const r = await fetch(GAS_URL, { method:"POST", body: JSON.stringify({ action:"morningBriefing", key: key || adminKey, token:SITE_TOKEN }) })
      const d = await r.json()
      if (!d.erro) setBriefing(d)
    } catch {}
  }

  // ════════════════════════════════════════════════════════════════
  //  PAINEL ADMIN
  // ════════════════════════════════════════════════════════════════
  if (isAdmin) {
    if (!adminAuth) return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:C.bg}}>
        <div className="anim-scale" style={{maxWidth:360,width:"100%",padding:32,textAlign:"center"}}>
          <div style={{fontSize:32,marginBottom:16}}>🔐</div>
          <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:28,marginBottom:8}}>Painel Admin</h2>
          <p style={{color:C.sub,fontSize:13,marginBottom:28}}>AQUINO | Barbearia & Estética</p>
          <Campo label="Senha" value={adminPass} onChange={setAdminPass} placeholder="••••••••" type="password" onEnter={fazerLoginAdmin}/>
          <button className="gold-btn" onClick={fazerLoginAdmin} disabled={validandoAdmin || !adminPass}
            style={{width:"100%",background:validandoAdmin||!adminPass?C.muted:C.gold,color:validandoAdmin||!adminPass?"#666":"#000",padding:"14px",borderRadius:8,fontWeight:700,fontSize:14,marginTop:16,letterSpacing:2,textTransform:"uppercase"}}>
            {validandoAdmin ? "Verificando…" : "Entrar"}
          </button>
          {adminError && <p style={{color:C.red,fontSize:13,marginTop:12}}>{adminError}</p>}
          <p style={{color:C.muted,fontSize:11,marginTop:24,lineHeight:1.6}}>
            🔒 Sua senha é validada no servidor.<br/>Nunca fica salva neste navegador.
          </p>
        </div>
      </div>
    )

    const salvarConfigs = async () => {
      setCfgSaving(true); setCfgMsg("")
      try {
        const r = await fetch(GAS_URL, {
          method:"POST",
          body: JSON.stringify({ action:"salvarConfig", token:SITE_TOKEN, key:adminKey, config: cfg })
        })
        const d = await r.json()
        setCfgMsg(d.success ? "✅ Configurações salvas!" : "❌ Erro ao salvar.")
      } catch { setCfgMsg("❌ Erro de conexão.") }
      setCfgSaving(false)
      setTimeout(()=>setCfgMsg(""), 3000)
    }

    const DIAS_SEMANA = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]
    const toggleDia = (idx) => {
      setCfg(prev => ({
        ...prev,
        diasBloqueados: prev.diasBloqueados.includes(idx)
          ? prev.diasBloqueados.filter(d => d !== idx)
          : [...prev.diasBloqueados, idx]
      }))
    }

    return (
      <div style={{minHeight:"100vh",background:C.bg,paddingBottom:64}}>

        <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
          <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:20,fontWeight:600}}>
            AQUINO <span style={{color:C.muted,fontSize:13,fontWeight:400}}>Admin</span>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <button onClick={()=>{ carregarAdmin(); carregarBriefing() }} style={{color:C.sub,fontSize:13,padding:"8px 14px",border:`1px solid ${C.border}`,borderRadius:6}}>↺ Atualizar</button>
            <button onClick={()=>{ setAdminAuth(false); setAdminPass(""); setAdminKey(""); setClientes([]); setBriefing(null) }} style={{color:C.sub,fontSize:13}}>Sair</button>
          </div>
        </div>

        <div style={{maxWidth:1080,margin:"0 auto",padding:"0 16px"}}>
          <div style={{display:"flex",gap:0,borderBottom:`1px solid ${C.border}`,marginBottom:28,marginTop:8,overflow:"auto"}}>
            {[["inicio","🌅 Início"],["clientes","👥 Clientes"],["config","⚙️ Configurações"]].map(([tab,label])=>(
              <button key={tab} onClick={()=>setAdminTab(tab)}
                style={{padding:"14px 24px",fontSize:13,fontWeight:adminTab===tab?600:400,color:adminTab===tab?C.gold:C.sub,borderBottom:adminTab===tab?`2px solid ${C.gold}`:"2px solid transparent",background:"none",cursor:"pointer",transition:"all .15s",whiteSpace:"nowrap"}}>
                {label}
              </button>
            ))}
          </div>

          {/* ════ ABA INÍCIO — MORNING BRIEFING ════ */}
          {adminTab === "inicio" && (
            <div className="anim">
              {!briefing ? (
                <div style={{textAlign:"center",padding:64}}>
                  <div style={{width:32,height:32,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.gold}`,borderRadius:"50%",animation:"spin .7s linear infinite",margin:"0 auto 16px"}}/>
                  <p style={{color:C.sub}}>Preparando briefing do dia…</p>
                </div>
              ) : (
                <>
                  {/* Cabeçalho */}
                  <div style={{marginBottom:32}}>
                    <p style={{color:C.sub,fontSize:12,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Bom dia</p>
                    <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:36,fontWeight:600,lineHeight:1.1,marginBottom:8}}>
                      {briefing.dataExtenso}
                    </h1>
                    <p style={{color:briefing.eventos.length>0?C.gold:C.sub,fontSize:15,fontWeight:500}}>
                      {briefing.eventos.length === 0
                        ? "Nenhuma decisão urgente para hoje 🎉"
                        : `Você tem ${briefing.eventos.length} ${briefing.eventos.length===1?"decisão":"decisões"} que ${briefing.eventos.length===1?"vale":"valem"} atenção`}
                    </p>
                    {briefing.totalEventos > 3 && (
                      <p style={{color:C.muted,fontSize:12,marginTop:6}}>
                        + {briefing.totalEventos - 3} eventos menos urgentes não mostrados
                      </p>
                    )}
                  </div>

                  {/* KPIs do dia */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:32}}>
                    {[
                      { label:"Agendamentos", val:briefing.kpis.agendamentosHoje, icon:"📅", cor:C.gold },
                      { label:"Cancelamentos", val:briefing.kpis.cancelamentosHoje, icon:"❌", cor:briefing.kpis.cancelamentosHoje>0?C.red:C.text },
                      { label:"Esperado", val:`R$ ${briefing.kpis.faturamentoEsperado}`, icon:"💰", cor:C.green },
                      { label:"Ocupação", val:`${briefing.kpis.ocupacao}%`, icon:"📊", cor:briefing.kpis.ocupacao>60?C.green:briefing.kpis.ocupacao>30?C.gold:C.sub },
                    ].map((card,i)=>(
                      <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 18px"}}>
                        <div style={{fontSize:18,marginBottom:4}}>{card.icon}</div>
                        <div style={{fontSize:22,fontWeight:700,color:card.cor}}>{card.val}</div>
                        <div style={{fontSize:11,color:C.sub,marginTop:2,textTransform:"uppercase",letterSpacing:1}}>{card.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Cards de eventos priorizados */}
                  {briefing.eventos.length > 0 && (
                    <>
                      <p style={{color:C.sub,fontSize:11,letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>
                        Top 3 prioridades — ordem por impacto
                      </p>
                      <div style={{display:"flex",flexDirection:"column",gap:12}}>
                        {briefing.eventos.map((ev,i)=>{
                          const s = EVENTO_STYLES[ev.tipo] || EVENTO_STYLES.aniversariante
                          return (
                            <div key={i} className="briefing-card anim" style={{
                              background:s.bg, border:`1px solid ${s.borda}`, borderRadius:12,
                              padding:"20px 24px", animationDelay:`${i*.1}s`,
                            }}>
                              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
                                <div style={{flex:1,minWidth:240}}>
                                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                                    <span style={{fontSize:22}}>{s.icon}</span>
                                    <span style={{fontSize:11,color:s.cor,fontWeight:600,letterSpacing:2,textTransform:"uppercase"}}>
                                      {s.label}
                                    </span>
                                  </div>
                                  <div style={{fontSize:18,fontWeight:600,color:C.text,marginBottom:4}}>
                                    {ev.cliente}{ev.horario && ` — ${ev.horario}`}
                                  </div>
                                  {ev.servico && (
                                    <div style={{fontSize:13,color:C.sub,marginBottom:6}}>
                                      {ev.servico}{ev.preco ? ` · R$ ${ev.preco}` : ""}
                                    </div>
                                  )}
                                  <div style={{fontSize:13,color:C.sub,lineHeight:1.6}}>{ev.motivo}</div>
                                </div>
                                <div style={{minWidth:200,textAlign:"right"}}>
                                  <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase",marginBottom:6}}>Ação sugerida</div>
                                  <div style={{fontSize:14,fontWeight:600,color:s.cor,lineHeight:1.4}}>{ev.acao}</div>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}

                  <p style={{color:C.muted,fontSize:11,textAlign:"center",marginTop:32,lineHeight:1.6}}>
                    Algoritmo IPE: prioridade = (score × 0.4) + (impacto financeiro × 0.6)<br/>
                    Atualizado a cada acesso · Máximo 3 itens
                  </p>
                </>
              )}
            </div>
          )}

          {/* ════ ABA CLIENTES ════ */}
          {adminTab === "clientes" && (<>
            {clientes.length > 0 && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:28}}>
                {[
                  { label:"Total clientes",  val:clientes.length, icon:"👥", cor:C.text },
                  { label:"💎 VIP",          val:clientes.filter(c=>c.nivel==="VIP").length,   icon:"💎", cor:NIVEL_STYLES.VIP.cor },
                  { label:"🥇 Ouro",         val:clientes.filter(c=>c.nivel==="Ouro").length,  icon:"🥇", cor:NIVEL_STYLES.Ouro.cor },
                  { label:"⚠️ Em risco",     val:clientes.filter(c=>c.flags?.risco).length,    icon:"⚠️", cor:"#EF4444" },
                ].map((card,i)=>(
                  <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 20px"}}>
                    <div style={{fontSize:22,marginBottom:6}}>{card.icon}</div>
                    <div style={{fontSize:24,fontWeight:700,color:card.cor}}>{card.val}</div>
                    <div style={{fontSize:12,color:C.sub,marginTop:2}}>{card.label}</div>
                  </div>
                ))}
              </div>
            )}

            {loadAdmin ? (
              <div style={{textAlign:"center",padding:64}}>
                <div style={{width:32,height:32,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.gold}`,borderRadius:"50%",animation:"spin .7s linear infinite",margin:"0 auto 16px"}}/>
                <p style={{color:C.sub}}>Carregando clientes…</p>
              </div>
            ) : adminError ? (
              <p style={{color:C.red,textAlign:"center",padding:32}}>{adminError}</p>
            ) : clientes.length === 0 ? (
              <p style={{color:C.sub,textAlign:"center",padding:64}}>Nenhum cliente cadastrado ainda.</p>
            ) : (
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:"1.8fr 0.9fr 1fr 0.9fr 0.6fr 0.6fr 0.9fr",gap:8,padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.sub,textTransform:"uppercase",letterSpacing:1}}>
                  <span>Cliente</span><span>Nível</span><span>WhatsApp</span><span>Último</span><span>Visitas</span><span>Dias</span><span>Score / Status</span>
                </div>
                {clientes.map((c,i)=>{
                  const diasDesde   = c.diasDesde || 0
                  const intervalo   = c.intervaloDias || 15
                  const urgente     = diasDesde >= intervalo
                  const nascToday   = ()=>{ const [d,m]=c.nascimento?.split("/")||[]; const h=new Date(); return parseInt(d)===h.getDate()&&parseInt(m)===h.getMonth()+1 }
                  const idade       = calcularIdade(c.nascimento)
                  const ny          = c.nivel ? NIVEL_STYLES[c.nivel] : NIVEL_STYLES.Bronze
                  const scoreCor    = c.statusCor || C.sub

                  return (
                    <div key={i} className="admin-row" style={{display:"grid",gridTemplateColumns:"1.8fr 0.9fr 1fr 0.9fr 0.6fr 0.6fr 0.9fr",gap:8,padding:"14px 16px",borderBottom:`1px solid ${C.border}`,fontSize:13,alignItems:"center",transition:"background .15s"}}>
                      <div>
                        <div style={{fontWeight:500,color:C.text,display:"flex",alignItems:"center",gap:6}}>
                          {c.nomeAbreviado || c.nome}
                          {c.flags?.sugerirRetorno && <span title="Sugerir retorno" style={{fontSize:10}}>🔄</span>}
                          {c.flags?.ativarSinal && <span title="Ativar sinal" style={{fontSize:10}}>💰</span>}
                        </div>
                        <div style={{fontSize:11,color:C.sub,marginTop:2}}>
                          {nascToday() ? "🎂 Aniversário hoje!" : c.nascimento ? `${c.nascimento}${idade?" ("+idade+" anos)":""}` : "—"}
                        </div>
                      </div>
                      <div>
                        <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",background:ny.bg,border:`1px solid ${ny.borda}`,borderRadius:999,fontSize:10,color:ny.cor,fontWeight:600}}>
                          <span style={{fontSize:11}}>{ny.emoji}</span>
                          <span>{c.nivel || "Bronze"}</span>
                        </span>
                      </div>
                      <div style={{color:C.sub,fontSize:12}}>{c.telefone}</div>
                      <div style={{color:C.sub,fontSize:12}}>{c.ultimaVisita||"—"}</div>
                      <div style={{color:C.gold,fontWeight:600}}>{c.totalVisitas||0}x</div>
                      <div style={{color:urgente?C.red:C.sub,fontWeight:urgente?600:400}}>{diasDesde}d</div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        {c.score !== undefined && (
                          <div style={{width:28,height:28,borderRadius:"50%",background:`${scoreCor}22`,border:`1px solid ${scoreCor}66`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:scoreCor}}>
                            {c.score}
                          </div>
                        )}
                        <div>
                          <div style={{fontSize:11,fontWeight:600,color:scoreCor}}>{c.statusLabel || "—"}</div>
                          {c.cancelamentos > 0 && (
                            <div style={{fontSize:10,color:C.muted}}>{c.cancelamentos} cancel.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>)}

          {/* ════ ABA CONFIGURAÇÕES ════ */}
          {adminTab === "config" && (
            <div style={{maxWidth:560}}>
              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"24px",marginBottom:16}}>
                <div style={{fontWeight:600,fontSize:15,color:C.text,marginBottom:4}}>Dias de atendimento</div>
                <div style={{fontSize:12,color:C.sub,marginBottom:20}}>Dias marcados em dourado estão <strong>abertos</strong>.</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {DIAS_SEMANA.map((dia, idx) => {
                    const bloqueado = cfg.diasBloqueados.includes(idx)
                    return (
                      <button key={idx} onClick={()=>toggleDia(idx)}
                        style={{padding:"10px 16px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .15s",
                          background: bloqueado ? C.card : C.goldDim,
                          border: `1px solid ${bloqueado ? C.border : C.gold}`,
                          color: bloqueado ? C.muted : C.gold,
                          textDecoration: bloqueado ? "line-through" : "none",
                          opacity: bloqueado ? 0.5 : 1
                        }}>
                        {dia}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"24px",marginBottom:16}}>
                <div style={{fontWeight:600,fontSize:15,color:C.text,marginBottom:4}}>Horário de funcionamento</div>
                <div style={{display:"flex",gap:24,alignItems:"center",flexWrap:"wrap",marginTop:20}}>
                  <div>
                    <label style={{display:"block",color:C.sub,fontSize:11,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Abertura</label>
                    <select value={cfg.horaInicio} onChange={e=>setCfg(p=>({...p,horaInicio:Number(e.target.value)}))}
                      style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:14,cursor:"pointer"}}>
                      {Array.from({length:13},(_,i)=>i+6).map(h=>(<option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>))}
                    </select>
                  </div>
                  <div style={{color:C.muted,fontSize:20,paddingTop:20}}>→</div>
                  <div>
                    <label style={{display:"block",color:C.sub,fontSize:11,letterSpacing:2,textTransform:"uppercase",marginBottom:8}}>Encerramento</label>
                    <select value={cfg.horaFim} onChange={e=>setCfg(p=>({...p,horaFim:Number(e.target.value)}))}
                      style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 14px",color:C.text,fontSize:14,cursor:"pointer"}}>
                      {Array.from({length:13},(_,i)=>i+12).map(h=>(<option key={h} value={h}>{String(h).padStart(2,"0")}:00</option>))}
                    </select>
                  </div>
                </div>
              </div>

              <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"24px",marginBottom:24}}>
                <div style={{fontWeight:600,fontSize:15,color:C.text,marginBottom:4}}>Intervalo de retorno</div>
                <div style={{fontSize:12,color:C.sub,marginBottom:20}}>Dias para sugerir retorno ao cliente.</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {[7,10,14,15,21,30].map(v=>(
                    <button key={v} onClick={()=>setCfg(p=>({...p,intervaloDias:v}))}
                      style={{padding:"10px 18px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",transition:"all .15s",
                        background:cfg.intervaloDias===v?C.goldDim:C.card,
                        border:`1px solid ${cfg.intervaloDias===v?C.gold:C.border}`,
                        color:cfg.intervaloDias===v?C.gold:C.sub}}>
                      {v} dias
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={salvarConfigs} disabled={cfgSaving}
                style={{width:"100%",background:cfgSaving?C.muted:C.gold,color:cfgSaving?"#666":"#000",padding:"16px",borderRadius:8,fontWeight:700,fontSize:14,letterSpacing:2,textTransform:"uppercase",border:"none",cursor:"pointer"}}>
                {cfgSaving ? "Salvando…" : "💾 Salvar configurações"}
              </button>
              {cfgMsg && <p style={{textAlign:"center",marginTop:12,fontSize:13,color:cfgMsg.includes("✅")?C.green:C.red}}>{cfgMsg}</p>}
            </div>
          )}

        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  //  HERO
  // ════════════════════════════════════════════════════════════════
  if (step === "hero") return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center",background:`radial-gradient(ellipse 80% 60% at 50% 0%, ${C.gold}09, transparent), ${C.bg}`}}>
      <div style={{width:1,height:64,background:`linear-gradient(transparent,${C.gold}90)`,marginBottom:32}}/>
      <div className="anim">
        <p style={{letterSpacing:6,fontSize:11,color:C.gold,textTransform:"uppercase",marginBottom:20,fontWeight:500}}>Barbearia</p>
        <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:"clamp(48px,12vw,88px)",fontWeight:600,color:C.text,lineHeight:1,letterSpacing:-1}}>{BARBEARIA.nome}</h1>
      </div>
      <div className="anim" style={{animationDelay:".1s"}}>
        <p style={{color:C.sub,marginTop:16,fontSize:14,letterSpacing:3,textTransform:"uppercase",fontWeight:300}}>{BARBEARIA.slogan}</p>
      </div>
      <div className="anim" style={{animationDelay:".2s",display:"flex",alignItems:"center",gap:16,margin:"36px 0"}}>
        <div style={{width:64,height:1,background:`linear-gradient(to right,transparent,${C.gold})`}}/>
        <span style={{color:C.gold,fontSize:18}}>✦</span>
        <div style={{width:64,height:1,background:`linear-gradient(to left,transparent,${C.gold})`}}/>
      </div>
      <div className="anim" style={{animationDelay:".3s"}}>
        <button className="gold-btn" onClick={()=>setStep("phone")}
          style={{background:C.gold,color:"#000",padding:"17px 52px",borderRadius:2,fontSize:13,fontWeight:600,letterSpacing:3,textTransform:"uppercase",transition:"all .15s"}}>
          Agendar Horário
        </button>
      </div>
      <div className="anim" style={{animationDelay:".4s",marginTop:32,display:"flex",flexDirection:"column",gap:6}}>
        <p style={{color:C.muted,fontSize:13}}>📍 {BARBEARIA.endereco}</p>
        <p style={{color:C.muted,fontSize:13}}>📱 {BARBEARIA.instagram}</p>
        <button onClick={()=>{ setCancelTel(""); setCancelAgs([]); setCancelSel(null); setStep("cancel-phone") }}
          style={{color:C.muted,fontSize:12,textDecoration:"underline",marginTop:8,background:"none",border:"none",cursor:"pointer"}}>
          Cancelar agendamento existente
        </button>
      </div>
    </div>
  )

  if (step === "phone") {
    const telOk = telLimpo(cliente.telefone).length >= 10
    return (
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,background:C.bg}}>
        <div className="anim" style={{maxWidth:400,width:"100%",textAlign:"center"}}>
          <button className="back-btn" onClick={resetar} style={{color:C.muted,fontSize:14,marginBottom:32,display:"flex",alignItems:"center",gap:6,transition:"color .15s"}}>← Voltar</button>
          <div style={{fontSize:40,marginBottom:16}}>📱</div>
          <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:600,marginBottom:8}}>Qual seu WhatsApp?</h2>
          <p style={{color:C.sub,fontSize:14,marginBottom:32}}>Vamos verificar seu cadastro</p>
          <Campo label="WhatsApp com DDD" value={cliente.telefone} onChange={v=>setCliente(p=>({...p,telefone:formatarTel(v)}))} placeholder="(31) 99999-9999" type="tel"/>
          {error && <p style={{color:C.red,fontSize:13,marginTop:12}}>{error}</p>}
          <button className="gold-btn" onClick={()=>verificarCliente(cliente.telefone)} disabled={!telOk||verificando}
            style={{width:"100%",background:telOk&&!verificando?C.gold:C.muted,color:telOk&&!verificando?"#000":C.sub,padding:"16px",borderRadius:8,fontWeight:700,fontSize:14,marginTop:20,letterSpacing:2,textTransform:"uppercase",transition:"all .15s"}}>
            {verificando ? <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><span style={{width:16,height:16,border:"2px solid #000",borderTop:"2px solid transparent",borderRadius:"50%",display:"inline-block",animation:"spin .7s linear infinite"}}/>Verificando…</span> : "Continuar →"}
          </button>
        </div>
      </div>
    )
  }

  if (step === "welcome") {
    const nome1 = cliente.nome.split(" ")[0]
    const ny = retorno?.nivel ? NIVEL_STYLES[retorno.nivel] : null
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:C.bg}}>
        <div className="anim-scale" style={{maxWidth:380,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:56,marginBottom:16,animation:"pulse 1.5s ease infinite"}}>👋</div>
          <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:36,fontWeight:600,marginBottom:8}}>
            Olá de novo,<br/>{nome1}!
          </h2>
          {ny && retorno?.totalVisitas > 0 && (
            <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"7px 14px",marginTop:12,marginBottom:8,background:ny.bg,border:`1px solid ${ny.borda}`,borderRadius:999,fontSize:12,color:ny.cor,fontWeight:600,letterSpacing:.5}}>
              <span style={{fontSize:15}}>{ny.emoji}</span>
              <span>Cliente {retorno.nivel}</span>
            </div>
          )}
          <p style={{color:C.sub,fontSize:14,marginBottom:24,marginTop:8}}>Que bom ter você de volta</p>
          {retorno && (
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px",fontSize:13,color:C.sub,lineHeight:2,textAlign:"left"}}>
              {retorno.ultimaVisita && <div>📅 Última visita: <span style={{color:C.text}}>{retorno.ultimaVisita}</span></div>}
              {retorno.totalVisitas !== undefined && <div>💈 Total de visitas: <span style={{color:C.gold,fontWeight:600}}>{retorno.totalVisitas}x</span></div>}
            </div>
          )}
          <p style={{color:C.muted,fontSize:12,marginTop:20,animation:"pulse 1s ease infinite"}}>Carregando serviços…</p>
        </div>
      </div>
    )
  }

  if (step === "register") {
    const nomeOk  = cliente.nome.trim().length >= 3
    const nascOk  = cliente.nascimento.replace(/\D/g,"").length === 8
    const idade   = calcularIdade(cliente.nascimento)
    const tudo    = nomeOk && nascOk && concordou
    return (
      <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center"}}>
        <PoliticaModal aberta={politicaAberta} onFechar={()=>setPoliticaAberta(false)}/>
        <ProgHeader step={1}/>
        <main style={{width:"100%",maxWidth:460,padding:"36px 24px 64px"}}>
          <button className="back-btn" onClick={()=>setStep("phone")} style={{color:C.muted,fontSize:14,marginBottom:24,display:"flex",alignItems:"center",gap:6,transition:"color .15s"}}>← Voltar</button>
          <div className="anim" style={{marginBottom:28}}>
            <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:600,lineHeight:1.1}}>Primeiro acesso</h1>
            <p style={{color:C.sub,marginTop:8,fontSize:14}}>Precisamos de alguns dados 😊</p>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            <Campo label="Nome completo" value={cliente.nome} onChange={v=>setCliente(p=>({...p,nome:v}))} placeholder="João da Silva"/>
            <div>
              <label style={{display:"block",color:C.sub,fontSize:11,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>WhatsApp</label>
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",fontSize:16,color:C.muted}}>{cliente.telefone} ✓</div>
            </div>
            <div>
              <label style={{display:"block",color:C.sub,fontSize:11,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Data de nascimento</label>
              <div style={{position:"relative"}}>
                <CampoNasc value={cliente.nascimento} onChange={v=>setCliente(p=>({...p,nascimento:formatarNasc(v)}))}/>
                {idade !== null && (
                  <div style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",color:C.gold,fontSize:13,fontWeight:600}}>{idade} anos</div>
                )}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"16px",background:C.surface,borderRadius:8,border:`1px solid ${C.border}`}}>
              <input type="checkbox" id="lgpd" checked={concordou} onChange={e=>setConcordou(e.target.checked)} style={{marginTop:3,accentColor:C.gold,width:16,height:16,cursor:"pointer",flexShrink:0}}/>
              <label htmlFor="lgpd" style={{fontSize:12,color:C.sub,lineHeight:1.6,cursor:"pointer"}}>
                Li e concordo com a <button onClick={()=>setPoliticaAberta(true)} style={{color:C.gold,textDecoration:"underline",fontSize:12,cursor:"pointer",background:"none",border:"none",padding:0,fontFamily:"inherit"}}>Política de Privacidade</button>. Meus dados serão usados exclusivamente para agendamentos e comunicação sobre atendimentos.
              </label>
            </div>
            <button className="gold-btn" onClick={()=>{ if(tudo) setStep("service") }} disabled={!tudo}
              style={{background:tudo?C.gold:C.muted,color:tudo?"#000":C.sub,padding:"16px",borderRadius:8,fontWeight:700,fontSize:14,letterSpacing:2,textTransform:"uppercase",transition:"all .2s"}}>Continuar →</button>
          </div>
        </main>
      </div>
    )
  }

  if (step === "cancel-phone") {
    const telOk = telLimpo(cancelTel).length >= 10
    return (
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,background:C.bg}}>
        <div className="anim" style={{maxWidth:400,width:"100%"}}>
          <button className="back-btn" onClick={resetar} style={{color:C.muted,fontSize:14,marginBottom:32,display:"flex",alignItems:"center",gap:6,transition:"color .15s",background:"none",border:"none",cursor:"pointer"}}>← Voltar</button>
          <div style={{fontSize:40,marginBottom:16,textAlign:"center"}}>📋</div>
          <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:600,marginBottom:8,textAlign:"center"}}>Meus Agendamentos</h2>
          <p style={{color:C.sub,fontSize:14,marginBottom:32,textAlign:"center"}}>Digite seu WhatsApp para ver seus agendamentos</p>
          <Campo label="WhatsApp com DDD" value={cancelTel} onChange={v=>setCancelTel(formatarTel(v))} placeholder="(31) 99999-9999" type="tel"/>
          {error && <p style={{color:C.red,fontSize:13,marginTop:12,textAlign:"center"}}>{error}</p>}
          <button className="gold-btn" onClick={()=>buscarMeusAgendamentos(cancelTel)} disabled={!telOk||buscandoAgs}
            style={{width:"100%",background:telOk&&!buscandoAgs?C.gold:C.muted,color:telOk&&!buscandoAgs?"#000":C.sub,padding:"16px",borderRadius:8,fontWeight:700,fontSize:14,marginTop:20,letterSpacing:2,textTransform:"uppercase",border:"none",cursor:"pointer",transition:"all .15s"}}>
            {buscandoAgs ? <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}><span style={{width:16,height:16,border:"2px solid #000",borderTop:"2px solid transparent",borderRadius:"50%",display:"inline-block",animation:"spin .7s linear infinite"}}/>Buscando…</span> : "Ver Agendamentos →"}
          </button>
        </div>
      </div>
    )
  }

  if (step === "cancel-lista") return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center"}}>
      <header style={{width:"100%",maxWidth:560,padding:"20px 24px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.gold}}>AQUINO</div>
      </header>
      <main style={{width:"100%",maxWidth:560,padding:"32px 24px 64px"}}>
        <button className="back-btn" onClick={()=>setStep("cancel-phone")} style={{color:C.muted,fontSize:14,marginBottom:24,display:"flex",alignItems:"center",gap:6,transition:"color .15s",background:"none",border:"none",cursor:"pointer"}}>← Voltar</button>
        <div className="anim" style={{marginBottom:28}}>
          <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:600,color:C.text}}>Seus Agendamentos</h1>
          <p style={{color:C.sub,marginTop:8,fontSize:14}}>Selecione o que deseja cancelar</p>
        </div>
        {cancelAgs.length === 0 ? (
          <div style={{textAlign:"center",padding:"48px 0"}}>
            <div style={{fontSize:40,marginBottom:16}}>📭</div>
            <p style={{color:C.sub,marginBottom:20}}>Nenhum agendamento futuro encontrado.</p>
            <button onClick={()=>setStep("hero")} style={{color:C.gold,fontSize:14,textDecoration:"underline",background:"none",border:"none",cursor:"pointer"}}>Fazer novo agendamento</button>
          </div>
        ) : (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {cancelAgs.map((ag,i) => (
              <div key={ag.id} className="anim" style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px",animationDelay:`${i*.07}s`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:16,color:C.text,marginBottom:4}}>{ag.servico}</div>
                    <div style={{color:C.sub,fontSize:13}}>📅 {ag.dataBR} às {ag.horario}</div>
                  </div>
                  <div style={{color:C.gold,fontWeight:700,fontSize:16}}>R$ {ag.preco}</div>
                </div>
                <button onClick={()=>{setCancelSel(ag);setError("");setStep("cancel-confirm")}}
                  style={{width:"100%",padding:"11px",borderRadius:8,border:`1px solid ${C.red}`,color:C.red,background:"transparent",fontWeight:600,fontSize:13,letterSpacing:1,textTransform:"uppercase",cursor:"pointer",transition:"all .15s"}}>
                  ✕ Cancelar este agendamento
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )

  if (step === "cancel-confirm") return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:C.bg}}>
      <div className="anim-scale" style={{maxWidth:420,width:"100%",textAlign:"center"}}>
        <div style={{fontSize:48,marginBottom:20}}>⚠️</div>
        <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:30,fontWeight:600,marginBottom:8}}>Confirmar cancelamento?</h2>
        <p style={{color:C.sub,fontSize:14,marginBottom:24}}>Esta ação não pode ser desfeita</p>
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px 24px",marginBottom:24,textAlign:"left"}}>
          <div style={{fontWeight:600,fontSize:16,color:C.text,marginBottom:8}}>{cancelSel?.servico}</div>
          <div style={{color:C.sub,fontSize:14,lineHeight:1.8}}>
            <div>📅 {cancelSel?.dataBR}</div>
            <div>🕐 {cancelSel?.horario}</div>
            <div>💰 R$ {cancelSel?.preco}</div>
          </div>
        </div>
        {error && <p style={{color:C.red,fontSize:13,marginBottom:16}}>{error}</p>}
        <div style={{display:"flex",gap:12}}>
          <button onClick={()=>setStep("cancel-lista")} style={{flex:1,padding:"15px",borderRadius:8,border:`1px solid ${C.border}`,color:C.sub,background:"transparent",fontWeight:600,fontSize:14,cursor:"pointer"}}>Não, manter</button>
          <button className="gold-btn" onClick={executarCancelamento} disabled={cancelando}
            style={{flex:1,padding:"15px",borderRadius:8,border:"none",background:cancelando?C.muted:C.red,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",transition:"all .15s"}}>
            {cancelando ? "Cancelando…" : "Sim, cancelar"}
          </button>
        </div>
      </div>
    </div>
  )

  if (step === "cancel-ok") return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:C.bg}}>
      <div className="anim-scale" style={{maxWidth:380,width:"100%",textAlign:"center"}}>
        <div style={{width:72,height:72,borderRadius:"50%",border:`2px solid ${C.red}`,background:`${C.red}12`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 24px",fontSize:28}}>✕</div>
        <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:30,fontWeight:600,marginBottom:12}}>Agendamento cancelado</h2>
        <p style={{color:C.sub,fontSize:14,marginBottom:4}}>{cancelSel?.servico}</p>
        <p style={{color:C.muted,fontSize:13,marginBottom:32}}>{cancelSel?.dataBR} às {cancelSel?.horario}</p>
        <button className="gold-btn" onClick={()=>setStep("hero")} style={{background:C.gold,color:"#000",padding:"14px 36px",borderRadius:8,fontWeight:700,fontSize:13,letterSpacing:2,textTransform:"uppercase",border:"none",cursor:"pointer"}}>
          Fazer novo agendamento
        </button>
      </div>
    </div>
  )

  if (step === "success") {
    const nome1 = cliente.nome.split(" ")[0]
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:C.bg}}>
        <div className="anim-scale" style={{maxWidth:420,width:"100%",textAlign:"center"}}>
          <div style={{width:80,height:80,borderRadius:"50%",border:`2px solid ${C.green}`,background:`${C.green}12`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 28px",fontSize:32}}>✓</div>
          <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:36,fontWeight:600,marginBottom:12}}>Reservado!</h2>
          <p style={{color:C.sub,lineHeight:1.6,marginBottom:8}}>{nome1}, seu horário está confirmado.</p>
          <p style={{color:C.gold,fontWeight:600,fontSize:17,marginBottom:32}}>{dataSel && dataExtenso(dataSel)} às {horario}</p>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px 24px",marginBottom:32,fontSize:14,color:C.sub,lineHeight:1.9,textAlign:"left"}}>
            <div>📱 Confirmação enviada no WhatsApp</div>
            <div>🔔 Lembrete automático 24h antes</div>
            <div>🔔 Lembrete automático 1h antes</div>
            <div>📍 {BARBEARIA.endereco}</div>
          </div>
          <button onClick={resetar} style={{color:C.gold,fontSize:14,textDecoration:"underline"}}>Novo agendamento</button>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  //  SERVICE / DATE / TIME / CONFIRM
  // ════════════════════════════════════════════════════════════════
  const progNum = PROGRESS[step] || 1
  const voltar  = () => {
    const prev = { service:isNovo?"register":"phone", date:"service", time:"date", confirm:"time" }
    setStep(prev[step] || "hero")
  }

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center"}}>
      <ProgHeader step={progNum}/>
      <main style={{width:"100%",maxWidth:660,padding:"36px 24px 64px",flex:1}}>

        {step === "service" && (
          <div>
            <BackBtn onClick={voltar}/>
            <StepHeader title="Qual serviço?" sub="Selecione o que você deseja"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {SERVICOS.map((s,i)=>(
                <button key={s.id} className="svc-card anim" onClick={()=>{ if(!s.disabled){ setServico(s); setStep("date") } }} disabled={s.disabled}
                  style={{background:servico?.id===s.id?C.goldDim:C.card,border:`1px solid ${servico?.id===s.id?C.gold:C.border}`,borderRadius:10,padding:"20px 16px",textAlign:"left",animationDelay:`${i*.05}s`,opacity:s.disabled?.6:1}}>
                  <div style={{fontSize:24,marginBottom:10}}>{s.icon}</div>
                  <div style={{fontWeight:600,fontSize:14,color:C.text,marginBottom:4}}>{s.nome}</div>
                  <div style={{fontSize:11,color:C.sub,marginBottom:14}}>{s.desc}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{color:s.disabled?C.muted:C.gold,fontWeight:700,fontSize:16}}>{s.disabled?"A consultar":`R$ ${s.preco}`}</span>
                    <span style={{color:C.muted,fontSize:11}}>{s.duracao}min</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === "date" && (
          <div>
            <BackBtn onClick={voltar}/>
            <StepHeader title="Qual data?" sub="Escolha o dia do atendimento"/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
              {getProximos30Dias().map((d,i)=>{
                const sel = dataSel?.toDateString()===d.toDateString()
                const folga = d.getDay()===0 || d.getDay()===1
                return (
                  <button key={i} className="day-btn anim" disabled={folga} onClick={()=>{ setDataSel(d); setStep("time") }}
                    style={{background:sel?C.goldDim:C.card,border:`1px solid ${sel?C.gold:C.border}`,borderRadius:8,padding:"12px 4px",textAlign:"center",opacity:folga?.3:1,cursor:folga?"not-allowed":"pointer",animationDelay:`${i*.015}s`,transition:"all .15s"}}>
                    <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{DIAS[d.getDay()]}</div>
                    <div style={{fontSize:18,fontWeight:600,color:sel?C.gold:C.text,marginBottom:2}}>{d.getDate()}</div>
                    <div style={{fontSize:10,color:C.sub}}>{MESES[d.getMonth()]}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {step === "time" && (
          <div>
            <BackBtn onClick={voltar}/>
            <StepHeader title="Qual horário?" sub={dataSel?dataExtenso(dataSel):""}/>
            {loadSlots ? (
              <div style={{textAlign:"center",padding:"72px 0"}}>
                <div style={{width:32,height:32,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.gold}`,borderRadius:"50%",animation:"spin .7s linear infinite",margin:"0 auto 16px"}}/>
                <p style={{color:C.sub,fontSize:14}}>Verificando disponibilidade…</p>
              </div>
            ) : slots.length===0 ? (
              <div style={{textAlign:"center",padding:"72px 0"}}>
                <div style={{fontSize:40,marginBottom:16}}>😔</div>
                <p style={{color:C.sub}}>Sem horários disponíveis neste dia.</p>
                <button onClick={voltar} style={{color:C.gold,marginTop:20,fontSize:14,textDecoration:"underline"}}>Escolher outro dia</button>
              </div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                {slots.map((sl,i)=>(
                  <button key={sl} className="slot anim" onClick={()=>{ setHorario(sl); setStep("confirm") }}
                    style={{background:horario===sl?C.goldDim:C.card,border:`1px solid ${horario===sl?C.gold:C.border}`,borderRadius:8,padding:"14px 6px",fontSize:15,fontWeight:500,color:horario===sl?C.gold:C.text,animationDelay:`${i*.04}s`,transition:"all .15s"}}>
                    {sl}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {step === "confirm" && (
          <div>
            <BackBtn onClick={voltar}/>
            <StepHeader title="Confirmar?" sub="Revise antes de finalizar"/>
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"4px 24px",marginBottom:24}}>
              {[
                { label:"Serviço",  val:servico?.nome, extra:`R$ ${servico?.preco} · ${servico?.duracao} min` },
                { label:"Data",     val:dataSel&&dataExtenso(dataSel) },
                { label:"Horário",  val:horario },
                { label:"Nome",     val:cliente.nome },
                { label:"WhatsApp", val:cliente.telefone },
              ].map((item,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"17px 0",borderBottom:i<4?`1px solid ${C.border}`:"none"}}>
                  <span style={{color:C.sub,fontSize:13}}>{item.label}</span>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontWeight:500,fontSize:15}}>{item.val}</div>
                    {item.extra&&<div style={{color:C.sub,fontSize:12,marginTop:2}}>{item.extra}</div>}
                  </div>
                </div>
              ))}
            </div>
            {error && <p style={{color:C.red,textAlign:"center",fontSize:14,marginBottom:16}}>{error}</p>}
            <button className="gold-btn" onClick={confirmar} disabled={submitting}
              style={{width:"100%",background:submitting?C.muted:C.gold,color:submitting?"#666":"#000",padding:"18px",borderRadius:8,fontSize:15,fontWeight:700,letterSpacing:1,textTransform:"uppercase",transition:"all .15s"}}>
              {submitting ? "Confirmando…" : "✓ Confirmar Agendamento"}
            </button>
          </div>
        )}

      </main>
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────
function ProgHeader({ step }) {
  return (
    <header style={{width:"100%",maxWidth:660,padding:"20px 24px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.gold,letterSpacing:1}}>AQUINO</div>
      <div style={{display:"flex",gap:4,alignItems:"center"}}>
        {[1,2,3,4,5].map(s=>(
          <div key={s} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div style={{height:3,borderRadius:2,width:s===step?28:s<step?16:8,background:s<=step?C.gold:C.muted,transition:"all .3s ease",opacity:s<step?.6:1}}/>
          </div>
        ))}
      </div>
    </header>
  )
}

function StepHeader({ title, sub }) {
  return (
    <div className="anim" style={{marginBottom:28}}>
      <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:600,color:C.text,lineHeight:1.1}}>{title}</h1>
      {sub && <p style={{color:C.sub,marginTop:8,fontSize:14}}>{sub}</p>}
    </div>
  )
}

function BackBtn({ onClick }) {
  return (
    <button className="back-btn" onClick={onClick} style={{color:C.muted,fontSize:14,marginBottom:24,display:"flex",alignItems:"center",gap:6,transition:"color .15s"}}>← Voltar</button>
  )
}

function Campo({ label, value, onChange, placeholder, type="text", onEnter }) {
  const [focus, setFocus] = useState(false)
  return (
    <div>
      <label style={{display:"block",color:C.sub,fontSize:11,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
        onKeyDown={e=>{ if (e.key === "Enter" && onEnter) onEnter() }}
        style={{width:"100%",background:C.card,border:`1px solid ${focus?C.gold:C.border}`,borderRadius:8,padding:"14px 16px",fontSize:16,color:C.text,transition:"border-color .2s"}}/>
    </div>
  )
}

function CampoNasc({ value, onChange }) {
  const [focus, setFocus] = useState(false)
  return (
    <input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder="DD/MM/AAAA" maxLength={10}
      onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
      style={{width:"100%",background:C.card,border:`1px solid ${focus?C.gold:C.border}`,borderRadius:8,padding:"14px 16px",fontSize:16,color:C.text,transition:"border-color .2s"}}/>
  )
}

export function PoliticaModal({ aberta, onFechar }) {
  if (!aberta) return null
  return (
    <div onClick={onFechar} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,backdropFilter:"blur(4px)"}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#111",border:`1px solid #2a2a2a`,borderRadius:12,maxWidth:540,width:"100%",maxHeight:"85vh",overflow:"auto",padding:"32px 28px",position:"relative"}}>
        <button onClick={onFechar} style={{position:"absolute",top:16,right:16,color:"#666",fontSize:20,lineHeight:1}}>✕</button>
        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,color:"#ede9e3",marginBottom:4}}>Política de Privacidade</div>
        <div style={{fontSize:12,color:"#555",marginBottom:24}}>AQUINO | Barbearia & Estética — CNPJ 34.828.065/0001-41</div>
        {[
          { titulo: "1. Dados Coletados", texto: "Coletamos nome completo, número de WhatsApp e data de nascimento, exclusivamente para fins de agendamento e comunicação sobre seus atendimentos." },
          { titulo: "2. Finalidade", texto: "Seus dados são utilizados para: confirmar agendamentos, enviar lembretes automáticos, avisar sobre o momento ideal de retorno e enviar mensagem de aniversário." },
          { titulo: "3. Armazenamento e Segurança", texto: "Seus dados são armazenados com segurança na infraestrutura do Google (Google Sheets e Google Calendar), que possui certificação ISO 27001, criptografia em trânsito e em repouso, e conformidade com padrões internacionais de proteção de dados." },
          { titulo: "4. Seus Direitos (LGPD)", texto: "Você tem direito a: acessar seus dados, corrigir informações incorretas e solicitar a exclusão completa dos seus dados a qualquer momento." },
          { titulo: "5. Contato do Responsável", texto: "Vinícius Júlio de Aquino\naquino.inbeleza@gmail.com\nR. Carlos Gomes, 256 - Ideal, Ipatinga - MG" },
        ].map((item,i)=>(
          <div key={i} style={{marginBottom:20}}>
            <div style={{fontWeight:600,color:"#ede9e3",fontSize:14,marginBottom:6}}>{item.titulo}</div>
            <div style={{color:"#888",fontSize:13,lineHeight:1.7,whiteSpace:"pre-line"}}>{item.texto}</div>
          </div>
        ))}
        <button onClick={onFechar} style={{width:"100%",marginTop:20,background:"#c9a84c",color:"#000",padding:"13px",borderRadius:8,fontWeight:700,fontSize:13,letterSpacing:2,textTransform:"uppercase",border:"none",cursor:"pointer"}}>
          Entendido ✓
        </button>
      </div>
    </div>
  )
}

