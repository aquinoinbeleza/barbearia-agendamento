import { useState, useEffect, useRef } from "react"

// ═══════════════════════════════════════════════════════════════
//  ⚙️  CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════
const GAS_URL = "https://script.google.com/macros/s/AKfycbyYk03d8DY8NQTDRNEfb3CSUO0gJOi5Ya-TcYyj9VCj_VEwnCumwoLI15WgXJL1Bvz9_Q/exec"
const ADMIN_SENHA = "aquino2025"   // ← troque pela sua senha do painel

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
  { id:"7",  nome:"Corte + Barba + Sobrancelha",        preco:75,  duracao:105, icon:"👑", desc:"Pacote premium" },
  { id:"8",  nome:"Corte e Sobrancelha",                preco:50,  duracao:75,  icon:"✨", desc:"Corte + sobrancelha navalha" },
  { id:"9",  nome:"Barba + Sobrancelha + Acabamento",   preco:55,  duracao:45,  icon:"💫", desc:"Combo rosto completo" },
  { id:"10", nome:"Barba + Sobrancelha ou Acabamento",  preco:45,  duracao:40,  icon:"🪒", desc:"Barba + 1 complemento" },
  { id:"11", nome:"Relaxamento",                        preco:40,  duracao:30,  icon:"💧", desc:"A partir de R$ 40" },
  { id:"12", nome:"Hidratação",                         preco:35,  duracao:45,  icon:"💧", desc:"A partir de R$ 35" },
  { id:"13", nome:"Corte e Relaxamento",                preco:70,  duracao:90,  icon:"✂️", desc:"A partir de R$ 70" },
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
  green:"#4caf82", red:"#e05555", blue:"#4c8fcf",
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

// ── Mapa de progresso ────────────────────────────────────────────
const PROGRESS = { phone:1, register:1, welcome:1, service:2, date:3, time:4, confirm:5 }

// ════════════════════════════════════════════════════════════════
export default function App() {
  // Detecta rota admin
  const isAdmin = typeof window !== "undefined" && window.location.search.includes("admin=1")

  const [step,        setStep]        = useState("hero")
  const [cliente,     setCliente]     = useState({ nome:"", telefone:"", nascimento:"" })
  const [retorno,     setRetorno]     = useState(null) // { totalVisitas, ultimaVisita, diasDesde }
  const [isNovo,      setIsNovo]      = useState(true)
  const [servico,     setServico]     = useState(null)
  const [dataSel,     setDataSel]     = useState(null)
  const [horario,     setHorario]     = useState(null)
  const [slots,       setSlots]       = useState([])
  const [loadSlots,   setLoadSlots]   = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [error,       setError]       = useState("")
  // LGPD
  const [concordou,     setConcordou]     = useState(false)
  const [politicaAberta, setPoliticaAberta] = useState(false)
  // Admin
  const [adminAuth,   setAdminAuth]   = useState(false)
  const [adminPass,   setAdminPass]   = useState("")
  const [clientes,    setClientes]    = useState([])
  const [loadAdmin,   setLoadAdmin]   = useState(false)
  const [adminError,  setAdminError]  = useState("")

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
    `
    document.head.appendChild(style)
  }, [])

  // Busca slots
  useEffect(() => {
    if (!dataSel || !servico) return
    setLoadSlots(true); setSlots([]); setHorario(null)
    if (GAS_URL.startsWith("COLE")) {
      setTimeout(()=>{ setSlots(gerarSlotsMock()); setLoadSlots(false) }, 900); return
    }
    const p = new URLSearchParams({ action:"slots", data:dataSel.toISOString().split("T")[0], duracao:servico.duracao })
    fetch(`${GAS_URL}?${p}`)
      .then(r=>r.json())
      .then(d=>{ setSlots(d.slots||[]); setLoadSlots(false) })
      .catch(()=>{ setSlots(gerarSlotsMock()); setLoadSlots(false) })
  }, [dataSel, servico])

  // ── Verificar cliente pelo telefone ─────────────────────────────
  const verificarCliente = async (tel) => {
    setVerificando(true); setError("")
    if (GAS_URL.startsWith("COLE")) {
      await new Promise(r=>setTimeout(r,800))
      setIsNovo(true); setVerificando(false); setStep("register"); return
    }
    try {
      const r    = await fetch(`${GAS_URL}?action=verificarCliente&tel=${telLimpo(tel)}`)
      const data = await r.json()
      if (data.encontrado) {
        setCliente({ nome:data.nome, telefone:tel, nascimento:data.nascimento||"" })
        setRetorno({ totalVisitas:data.totalVisitas, ultimaVisita:data.ultimaVisita, diasDesde:data.diasDesde })
        setIsNovo(false)
        setStep("welcome")
        setTimeout(()=>setStep("service"), 2500)
      } else {
        setIsNovo(true)
        setStep("register")
      }
    } catch {
      setIsNovo(true); setStep("register")
    }
    setVerificando(false)
  }

  // ── Confirmar agendamento ────────────────────────────────────────
  const confirmar = async () => {
    setSubmitting(true); setError("")
    if (GAS_URL.startsWith("COLE")) {
      await new Promise(r=>setTimeout(r,1600))
      setStep("success"); setSubmitting(false); return
    }
    try {
      const res  = await fetch(GAS_URL, {
        method:"POST",
        body: JSON.stringify({
          action:"agendamento",
          servico, data:dataSel?.toISOString().split("T")[0],
          horario, nome:cliente.nome, telefone:telLimpo(cliente.telefone),
          nascimento:cliente.nascimento, isNovo
        })
      })
      const data = await res.json()
      if (data.success) setStep("success")
      else setError(data.error || "Erro ao confirmar. Tente novamente.")
    } catch { setError("Erro de conexão. Tente novamente.") }
    setSubmitting(false)
  }

  const resetar = () => {
    setStep("hero"); setCliente({nome:"",telefone:"",nascimento:""}); setRetorno(null)
    setIsNovo(true); setServico(null); setDataSel(null); setHorario(null)
    setSlots([]); setError("")
  }

  // ── Painel Admin ─────────────────────────────────────────────────
  const carregarAdmin = async () => {
    setLoadAdmin(true); setAdminError("")
    try {
      const r = await fetch(`${GAS_URL}?action=dashboard&key=${ADMIN_SENHA}`)
      const d = await r.json()
      if (d.clientes) setClientes(d.clientes)
      else setAdminError("Erro ao carregar dados.")
    } catch { setAdminError("Erro de conexão.") }
    setLoadAdmin(false)
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
          <Campo label="Senha" value={adminPass} onChange={setAdminPass} placeholder="••••••••" type="password"/>
          <button className="gold-btn" onClick={()=>{ if(adminPass===ADMIN_SENHA){ setAdminAuth(true); carregarAdmin() } else setAdminError("Senha incorreta") }}
            style={{width:"100%",background:C.gold,color:"#000",padding:"14px",borderRadius:8,fontWeight:700,fontSize:14,marginTop:16,letterSpacing:2,textTransform:"uppercase"}}>
            Entrar
          </button>
          {adminError && <p style={{color:C.red,fontSize:13,marginTop:12}}>{adminError}</p>}
        </div>
      </div>
    )

    return (
      <div style={{minHeight:"100vh",background:C.bg,padding:"0 0 64px"}}>
        {/* Header admin */}
        <div style={{background:C.card,borderBottom:`1px solid ${C.border}`,padding:"16px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:10}}>
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",color:C.gold,fontSize:20,fontWeight:600}}>Painel de Clientes</div>
            <div style={{color:C.sub,fontSize:12}}>{BARBEARIA.nome}</div>
          </div>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <button onClick={carregarAdmin} style={{color:C.sub,fontSize:13,padding:"8px 16px",border:`1px solid ${C.border}`,borderRadius:6}}>
              ↺ Atualizar
            </button>
            <button onClick={()=>{ setAdminAuth(false); setAdminPass(""); setClientes([]) }}
              style={{color:C.sub,fontSize:13}}>Sair</button>
          </div>
        </div>

        <div style={{maxWidth:900,margin:"0 auto",padding:"24px 16px"}}>

          {/* Cards resumo */}
          {clientes.length > 0 && (
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:28}}>
              {[
                { label:"Total de clientes",   val:clientes.length,    icon:"👥" },
                { label:"Aniversários hoje",   val:clientes.filter(c=>{ const [d,m]=c.nascimento?.split("/")||[]; const hoje=new Date(); return parseInt(d)===hoje.getDate()&&parseInt(m)===hoje.getMonth()+1 }).length, icon:"🎂" },
                { label:"Precisam retornar",   val:clientes.filter(c=>c.diasDesde>=(c.intervaloDias||15)).length, icon:"⏰" },
              ].map((card,i)=>(
                <div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px 20px"}}>
                  <div style={{fontSize:22,marginBottom:6}}>{card.icon}</div>
                  <div style={{fontSize:24,fontWeight:700,color:i===2?C.gold:C.text}}>{card.val}</div>
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
              {/* Header tabela */}
              <div style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 1fr 0.8fr 0.8fr 1fr",gap:8,padding:"12px 16px",borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.sub,textTransform:"uppercase",letterSpacing:1}}>
                <span>Cliente</span><span>WhatsApp</span><span>Último atend.</span><span>Visitas</span><span>Dias</span><span>Status</span>
              </div>
              {clientes.map((c,i)=>{
                const diasDesde   = c.diasDesde || 0
                const intervalo   = c.intervaloDias || 15
                const urgente     = diasDesde >= intervalo
                const quaseNaHora = diasDesde >= intervalo - 5 && !urgente
                const nascToday   = ()=>{ const [d,m]=c.nascimento?.split("/")||[]; const h=new Date(); return parseInt(d)===h.getDate()&&parseInt(m)===h.getMonth()+1 }
                const idade       = calcularIdade(c.nascimento)

                return (
                  <div key={i} className="admin-row" style={{display:"grid",gridTemplateColumns:"2fr 1.2fr 1fr 0.8fr 0.8fr 1fr",gap:8,padding:"14px 16px",borderBottom:`1px solid ${C.border}`,fontSize:13,alignItems:"center",transition:"background .15s"}}>
                    <div>
                      <div style={{fontWeight:500,color:C.text}}>{c.nome}</div>
                      <div style={{fontSize:11,color:C.sub,marginTop:2}}>
                        {nascToday() ? "🎂 Aniversário hoje!" : c.nascimento ? `${c.nascimento}${idade?" ("+idade+" anos)":""}` : "—"}
                      </div>
                    </div>
                    <div style={{color:C.sub,fontSize:12}}>{c.telefone}</div>
                    <div style={{color:C.sub,fontSize:12}}>{c.ultimaVisita||"—"}</div>
                    <div style={{color:C.gold,fontWeight:600}}>{c.totalVisitas||0}x</div>
                    <div style={{color:urgente?C.red:quaseNaHora?C.gold:C.sub,fontWeight:urgente||quaseNaHora?600:400}}>
                      {diasDesde}d
                    </div>
                    <div>
                      <span style={{
                        fontSize:10, fontWeight:600, letterSpacing:1, textTransform:"uppercase", padding:"3px 8px", borderRadius:20,
                        background: urgente?`${C.red}22`:quaseNaHora?`${C.gold}22`:`${C.green}22`,
                        color: urgente?C.red:quaseNaHora?C.gold:C.green
                      }}>
                        {urgente?"Chamar":quaseNaHora?"Em breve":"Regular"}
                      </span>
                    </div>
                  </div>
                )
              })}
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
      <div className="anim" style={{animationDelay:"0s"}}>
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
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════
  //  STEP: TELEFONE (identificação)
  // ════════════════════════════════════════════════════════════════
  if (step === "phone") {
    const telOk = telLimpo(cliente.telefone).length >= 10
    return (
      <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,background:C.bg}}>
        <div className="anim" style={{maxWidth:400,width:"100%",textAlign:"center"}}>
          <button className="back-btn" onClick={resetar} style={{color:C.muted,fontSize:14,marginBottom:32,display:"flex",alignItems:"center",gap:6,transition:"color .15s"}}>
            ← Voltar
          </button>
          <div style={{fontSize:40,marginBottom:16}}>📱</div>
          <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:600,marginBottom:8}}>Qual seu WhatsApp?</h2>
          <p style={{color:C.sub,fontSize:14,marginBottom:32}}>Vamos verificar seu cadastro</p>

          <Campo label="WhatsApp com DDD" value={cliente.telefone}
            onChange={v=>setCliente(p=>({...p,telefone:formatarTel(v)}))}
            placeholder="(31) 99999-9999" type="tel"/>

          {error && <p style={{color:C.red,fontSize:13,marginTop:12}}>{error}</p>}

          <button className="gold-btn" onClick={()=>verificarCliente(cliente.telefone)} disabled={!telOk||verificando}
            style={{width:"100%",background:telOk&&!verificando?C.gold:C.muted,color:telOk&&!verificando?"#000":C.sub,padding:"16px",borderRadius:8,fontWeight:700,fontSize:14,marginTop:20,letterSpacing:2,textTransform:"uppercase",transition:"all .15s"}}>
            {verificando
              ? <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <span style={{width:16,height:16,border:"2px solid #000",borderTop:"2px solid transparent",borderRadius:"50%",display:"inline-block",animation:"spin .7s linear infinite"}}/>
                  Verificando…
                </span>
              : "Continuar →"
            }
          </button>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  //  STEP: BEM-VINDO DE VOLTA (cliente existente)
  // ════════════════════════════════════════════════════════════════
  if (step === "welcome") {
    const nome1 = cliente.nome.split(" ")[0]
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:C.bg}}>
        <div className="anim-scale" style={{maxWidth:360,width:"100%",textAlign:"center"}}>
          <div style={{fontSize:56,marginBottom:16,animation:"pulse 1.5s ease infinite"}}>👋</div>
          <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:36,fontWeight:600,marginBottom:8}}>
            Olá de novo,<br/>{nome1}!
          </h2>
          <p style={{color:C.sub,fontSize:14,marginBottom:24}}>Que bom ter você de volta</p>
          {retorno && (
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"16px",fontSize:13,color:C.sub,lineHeight:2}}>
              {retorno.ultimaVisita && <div>📅 Última visita: <span style={{color:C.text}}>{retorno.ultimaVisita}</span></div>}
              {retorno.totalVisitas && <div>💈 Total de visitas: <span style={{color:C.gold,fontWeight:600}}>{retorno.totalVisitas}x</span></div>}
            </div>
          )}
          <p style={{color:C.muted,fontSize:12,marginTop:20,animation:"pulse 1s ease infinite"}}>Carregando serviços…</p>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  //  STEP: CADASTRO (cliente novo)
  // ════════════════════════════════════════════════════════════════
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
          <button className="back-btn" onClick={()=>setStep("phone")} style={{color:C.muted,fontSize:14,marginBottom:24,display:"flex",alignItems:"center",gap:6,transition:"color .15s"}}>
            ← Voltar
          </button>
          <div className="anim" style={{marginBottom:28}}>
            <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:600,lineHeight:1.1}}>Primeiro acesso</h1>
            <p style={{color:C.sub,marginTop:8,fontSize:14}}>Precisamos de alguns dados 😊</p>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            {/* Nome */}
            <Campo label="Nome completo" value={cliente.nome}
              onChange={v=>setCliente(p=>({...p,nome:v}))}
              placeholder="João da Silva"/>

            {/* Telefone (só leitura) */}
            <div>
              <label style={{display:"block",color:C.sub,fontSize:11,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>WhatsApp</label>
              <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"14px 16px",fontSize:16,color:C.muted}}>
                {cliente.telefone} ✓
              </div>
            </div>

            {/* Nascimento */}
            <div>
              <label style={{display:"block",color:C.sub,fontSize:11,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>
                Data de nascimento
              </label>
              <div style={{position:"relative"}}>
                <CampoNasc value={cliente.nascimento}
                  onChange={v=>setCliente(p=>({...p,nascimento:formatarNasc(v)}))}/>
                {idade !== null && (
                  <div style={{position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",color:C.gold,fontSize:13,fontWeight:600}}>
                    {idade} anos
                  </div>
                )}
              </div>
              <p style={{color:C.muted,fontSize:11,marginTop:6}}>Formato: DD/MM/AAAA</p>
            </div>

            {/* Consentimento LGPD */}
            <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"16px",background:C.surface,borderRadius:8,border:`1px solid ${C.border}`}}>
              <input type="checkbox" id="lgpd" checked={concordou} onChange={e=>setConcordou(e.target.checked)}
                style={{marginTop:3,accentColor:C.gold,width:16,height:16,cursor:"pointer",flexShrink:0}}/>
              <label htmlFor="lgpd" style={{fontSize:12,color:C.sub,lineHeight:1.6,cursor:"pointer"}}>
                Li e concordo com a{" "}
                <button onClick={()=>setPoliticaAberta(true)}
                  style={{color:C.gold,textDecoration:"underline",fontSize:12,cursor:"pointer",background:"none",border:"none",padding:0,fontFamily:"inherit"}}>
                  Política de Privacidade
                </button>
                . Meus dados serão usados exclusivamente para agendamentos e comunicação sobre atendimentos.
              </label>
            </div>

            <button className="gold-btn" onClick={()=>{ if(tudo) setStep("service") }} disabled={!tudo}
              style={{background:tudo?C.gold:C.muted,color:tudo?"#000":C.sub,padding:"16px",borderRadius:8,fontWeight:700,fontSize:14,letterSpacing:2,textTransform:"uppercase",transition:"all .2s"}}>
              Continuar →
            </button>
          </div>
        </main>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════
  //  STEP: SUCESSO
  // ════════════════════════════════════════════════════════════════
  if (step === "success") {
    const nome1 = cliente.nome.split(" ")[0]
    return (
      <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:C.bg}}>
        <div className="anim-scale" style={{maxWidth:420,width:"100%",textAlign:"center"}}>
          <div style={{width:80,height:80,borderRadius:"50%",border:`2px solid ${C.green}`,background:`${C.green}12`,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 28px",fontSize:32}}>✓</div>
          <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:36,fontWeight:600,marginBottom:12}}>Reservado!</h2>
          <p style={{color:C.sub,lineHeight:1.6,marginBottom:8}}>{nome1}, seu horário está confirmado.</p>
          <p style={{color:C.gold,fontWeight:600,fontSize:17,marginBottom:32}}>
            {dataSel && dataExtenso(dataSel)} às {horario}
          </p>
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
  //  STEPS: SERVICE / DATE / TIME / CONFIRM
  // ════════════════════════════════════════════════════════════════
  const progNum = PROGRESS[step] || 1
  const voltar  = () => {
    const prev = { service:"phone", date:"service", time:"date", confirm:"time" }
    setStep(prev[step] || "hero")
  }

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center"}}>
      <ProgHeader step={progNum}/>
      <main style={{width:"100%",maxWidth:660,padding:"36px 24px 64px",flex:1}}>

        {/* SERVIÇO */}
        {step === "service" && (
          <div>
            <BackBtn onClick={voltar}/>
            <StepHeader title="Qual serviço?" sub="Selecione o que você deseja"/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {SERVICOS.map((s,i)=>(
                <button key={s.id} className="svc-card anim"
                  onClick={()=>{ if(!s.disabled){ setServico(s); setStep("date") } }}
                  disabled={s.disabled}
                  style={{background:servico?.id===s.id?C.goldDim:C.card,border:`1px solid ${servico?.id===s.id?C.gold:C.border}`,borderRadius:10,padding:"20px 16px",textAlign:"left",animationDelay:`${i*.05}s`,opacity:s.disabled?.6:1}}>
                  <div style={{fontSize:24,marginBottom:10}}>{s.icon}</div>
                  <div style={{fontWeight:600,fontSize:14,color:C.text,marginBottom:4}}>{s.nome}</div>
                  <div style={{fontSize:11,color:C.sub,marginBottom:14}}>{s.desc}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{color:s.disabled?C.muted:C.gold,fontWeight:700,fontSize:16}}>
                      {s.disabled?"A consultar":`R$ ${s.preco}`}
                    </span>
                    <span style={{color:C.muted,fontSize:11}}>{s.duracao}min</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* DATA */}
        {step === "date" && (
          <div>
            <BackBtn onClick={voltar}/>
            <StepHeader title="Qual data?" sub="Escolha o dia do atendimento"/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
              {getProximos30Dias().map((d,i)=>{
                const sel = dataSel?.toDateString()===d.toDateString()
                const dom = d.getDay()===0
                return (
                  <button key={i} className="day-btn anim" disabled={dom}
                    onClick={()=>{ setDataSel(d); setStep("time") }}
                    style={{background:sel?C.goldDim:C.card,border:`1px solid ${sel?C.gold:C.border}`,borderRadius:8,padding:"12px 4px",textAlign:"center",opacity:dom?.3:1,cursor:dom?"not-allowed":"pointer",animationDelay:`${i*.015}s`,transition:"all .15s"}}>
                    <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>{DIAS[d.getDay()]}</div>
                    <div style={{fontSize:18,fontWeight:600,color:sel?C.gold:C.text,marginBottom:2}}>{d.getDate()}</div>
                    <div style={{fontSize:10,color:C.sub}}>{MESES[d.getMonth()]}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* HORÁRIO */}
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
                  <button key={sl} className="slot anim"
                    onClick={()=>{ setHorario(sl); setStep("confirm") }}
                    style={{background:horario===sl?C.goldDim:C.card,border:`1px solid ${horario===sl?C.gold:C.border}`,borderRadius:8,padding:"14px 6px",fontSize:15,fontWeight:500,color:horario===sl?C.gold:C.text,animationDelay:`${i*.04}s`,transition:"all .15s"}}>
                    {sl}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CONFIRMAÇÃO */}
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
              {submitting
                ? <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                    <span style={{width:16,height:16,border:"2px solid transparent",borderTop:"2px solid #000",borderRadius:"50%",display:"inline-block",animation:"spin .7s linear infinite"}}/>
                    Confirmando…
                  </span>
                : "✓ Confirmar Agendamento"
              }
            </button>
            <p style={{color:C.muted,fontSize:12,textAlign:"center",marginTop:16}}>Você receberá confirmação no WhatsApp 📱</p>
          </div>
        )}

      </main>
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────
function ProgHeader({ step }) {
  const labels = ["Identif.", "Serviço", "Data", "Horário", "Confirmar"]
  return (
    <header style={{width:"100%",maxWidth:660,padding:"20px 24px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,fontWeight:600,color:C.gold,letterSpacing:1}}>
        AQUINO
      </div>
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
    <button className="back-btn" onClick={onClick}
      style={{color:C.muted,fontSize:14,marginBottom:24,display:"flex",alignItems:"center",gap:6,transition:"color .15s"}}>
      ← Voltar
    </button>
  )
}

function Campo({ label, value, onChange, placeholder, type="text" }) {
  const [focus, setFocus] = useState(false)
  return (
    <div>
      <label style={{display:"block",color:C.sub,fontSize:11,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>{label}</label>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
        style={{width:"100%",background:C.card,border:`1px solid ${focus?C.gold:C.border}`,borderRadius:8,padding:"14px 16px",fontSize:16,color:C.text,transition:"border-color .2s"}}/>
    </div>
  )
}

function CampoNasc({ value, onChange }) {
  const [focus, setFocus] = useState(false)
  return (
    <input type="text" value={value} onChange={e=>onChange(e.target.value)}
      placeholder="DD/MM/AAAA" maxLength={10}
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

        <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:24,fontWeight:600,color:"#ede9e3",marginBottom:4}}>
          Política de Privacidade
        </div>
        <div style={{fontSize:12,color:"#555",marginBottom:24}}>AQUINO | Barbearia & Estética — CNPJ 34.828.065/0001-41</div>

        {[
          {
            titulo: "1. Dados Coletados",
            texto: "Coletamos nome completo, número de WhatsApp e data de nascimento, exclusivamente para fins de agendamento e comunicação sobre seus atendimentos."
          },
          {
            titulo: "2. Finalidade",
            texto: "Seus dados são utilizados para: confirmar agendamentos, enviar lembretes automáticos, avisar sobre o momento ideal de retorno e enviar mensagem de aniversário."
          },
          {
            titulo: "3. Armazenamento e Segurança",
            texto: "Seus dados são armazenados com segurança na infraestrutura do Google (Google Sheets e Google Calendar), que possui certificação ISO 27001, criptografia em trânsito e em repouso, e conformidade com padrões internacionais de proteção de dados. Não compartilhamos seus dados com terceiros sob nenhuma circunstância."
          },
          {
            titulo: "4. Seus Direitos (LGPD — Lei nº 13.709/2018)",
            texto: "Você tem direito a: acessar seus dados, corrigir informações incorretas e solicitar a exclusão completa dos seus dados a qualquer momento."
          },
          {
            titulo: "5. Contato do Responsável",
            texto: "Vinícius Júlio de Aquino\naquino.inbeleza@gmail.com\nR. Carlos Gomes, 256 - Ideal, Ipatinga - MG"
          },
        ].map((item,i)=>(
          <div key={i} style={{marginBottom:20}}>
            <div style={{fontWeight:600,color:"#ede9e3",fontSize:14,marginBottom:6}}>{item.titulo}</div>
            <div style={{color:"#888",fontSize:13,lineHeight:1.7,whiteSpace:"pre-line"}}>{item.texto}</div>
          </div>
        ))}

        {/* Selo Google */}
        <div style={{marginTop:24,padding:"14px 16px",background:"#0a0a0a",borderRadius:8,border:`1px solid #1e1e1e`,display:"flex",alignItems:"center",gap:12}}>
          <div style={{fontSize:24}}>🔒</div>
          <div>
            <div style={{fontSize:12,fontWeight:600,color:"#ede9e3",marginBottom:2}}>Protegido pela infraestrutura Google</div>
            <div style={{fontSize:11,color:"#555",lineHeight:1.5}}>Certificação ISO 27001 · Criptografia AES-256 · Conformidade GDPR/LGPD</div>
          </div>
        </div>

        <div style={{marginTop:16,fontSize:11,color:"#444",textAlign:"center"}}>
          Última atualização: maio de 2026
        </div>

        <button onClick={onFechar}
          style={{width:"100%",marginTop:20,background:"#c9a84c",color:"#000",padding:"13px",borderRadius:8,fontWeight:700,fontSize:13,letterSpacing:2,textTransform:"uppercase",border:"none",cursor:"pointer"}}>
          Entendido ✓
        </button>
      </div>
    </div>
  )
}

