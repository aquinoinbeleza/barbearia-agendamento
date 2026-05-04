import { useState, useEffect } from "react"

// ═══════════════════════════════════════════════════════════════
//  ⚙️  CONFIGURAÇÃO — edite aqui antes de publicar
// ═══════════════════════════════════════════════════════════════
const GAS_URL = "https://script.google.com/macros/s/AKfycbyYk03d8DY8NQTDRNEfb3CSUO0gJOi5Ya-TcYyj9VCj_VEwnCumwoLI15WgXJL1Bvz9_Q/exec"

const BARBEARIA = {
  nome:      "AQUINO | Barbearia & Estética",
  slogan:    "Conforto. Estilo. Confiança.",
  endereco:  "R. Carlos Gomes, 256 - Ideal, Ipatinga - MG",
  instagram: "@aquino.inbeleza",
}

const SERVICOS = [
  { id:"1", nome:"Corte Clássico",   preco:45,  duracao:45,  icon:"✂️",  desc:"Tesoura e máquina" },
  { id:"2", nome:"Degradê + Barba",  preco:65,  duracao:60,  icon:"🪒",  desc:"Combo masculino" },
  { id:"3", nome:"Barba Navalha",    preco:35,  duracao:30,  icon:"🧔",  desc:"Tradicional c/ toalha" },
  { id:"4", nome:"Coloração",        preco:90,  duracao:90,  icon:"🎨",  desc:"Tintura profissional" },
  { id:"5", nome:"Platinado",        preco:150, duracao:120, icon:"⚡",  desc:"Descoloração completa" },
  { id:"6", nome:"Sobrancelha",      preco:25,  duracao:20,  icon:"🔍",  desc:"Design + limpeza" },
]
// ═══════════════════════════════════════════════════════════════

// ── Paleta ──────────────────────────────────────────────────────
const C = {
  bg:        "#070707",
  surface:   "#0f0f0f",
  card:      "#141414",
  border:    "#242424",
  borderHov: "#3a3a3a",
  gold:      "#c9a84c",
  goldLight: "#dfc070",
  goldDim:   "#c9a84c22",
  text:      "#ede9e3",
  sub:       "#888",
  muted:     "#444",
  green:     "#4caf82",
  red:       "#e05555",
}

// ── Utilitários de data ──────────────────────────────────────────
const DIAS  = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"]
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
const MESES_EXT = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"]

function dataExtenso(d) {
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES_EXT[d.getMonth()]}`
}

function getProximos30Dias() {
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  return Array.from({length:30}, (_,i) => {
    const d = new Date(hoje); d.setDate(d.getDate()+i); return d
  })
}

// ── Mock para demo (sem GAS configurado) ────────────────────────
function gerarSlotsMock(duracao) {
  const base = ["08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30",
                 "13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"]
  return base.filter(() => Math.random() > 0.35)
}

// ════════════════════════════════════════════════════════════════
export default function App() {
  const [step,       setStep]       = useState(0)
  const [servico,    setServico]    = useState(null)
  const [dataSel,    setDataSel]    = useState(null)
  const [horario,    setHorario]    = useState(null)
  const [nome,       setNome]       = useState("")
  const [telefone,   setTelefone]   = useState("")
  const [slots,      setSlots]      = useState([])
  const [loadSlots,  setLoadSlots]  = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState("")

  // Injeta fontes e CSS global
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
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes pulse{0%,100%{opacity:.6}50%{opacity:1}}
      @keyframes scaleIn{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}

      .anim{animation:fadeUp .42s cubic-bezier(.22,1,.36,1) forwards}
      .anim-scale{animation:scaleIn .38s cubic-bezier(.22,1,.36,1) forwards}

      .svc-card{transition:border-color .2s,background .2s,transform .15s}
      .svc-card:hover{border-color:${C.borderHov}!important;transform:translateY(-2px)}

      .slot{transition:all .15s}
      .slot:hover{background:${C.goldDim}!important;border-color:${C.gold}!important;color:${C.gold}!important}

      .day-btn{transition:all .15s}
      .day-btn:hover:not(:disabled){background:${C.goldDim}!important;border-color:${C.gold}60!important}

      .back-btn{transition:color .15s}
      .back-btn:hover{color:${C.gold}!important}

      .gold-btn{transition:all .15s}
      .gold-btn:hover:not(:disabled){background:${C.goldLight}!important;transform:translateY(-1px)}

      .input-wrap input:focus ~ .input-border{border-color:${C.gold}!important}
    `
    document.head.appendChild(style)
  }, [])

  // Busca slots quando data ou serviço mudam
  useEffect(() => {
    if (!dataSel || !servico) return
    setLoadSlots(true); setSlots([]); setHorario(null)

    if (GAS_URL.startsWith("COLE")) {
      setTimeout(() => { setSlots(gerarSlotsMock(servico.duracao)); setLoadSlots(false) }, 900)
      return
    }

    const p = new URLSearchParams({ data: dataSel.toISOString().split("T")[0], duracao: servico.duracao })
    fetch(`${GAS_URL}?${p}`)
      .then(r => r.json())
      .then(d => { setSlots(d.slots || []); setLoadSlots(false) })
      .catch(() => { setSlots(gerarSlotsMock(servico.duracao)); setLoadSlots(false) })
  }, [dataSel, servico])

  const confirmar = async () => {
    setSubmitting(true); setError("")
    if (GAS_URL.startsWith("COLE")) {
      await new Promise(r => setTimeout(r, 1600))
      setStep(6); setSubmitting(false); return
    }
    try {
      const res  = await fetch(GAS_URL, { method:"POST", body: JSON.stringify({ servico, data: dataSel?.toISOString().split("T")[0], horario, nome, telefone }) })
      const data = await res.json()
      if (data.success) setStep(6)
      else setError(data.error || "Erro ao confirmar. Tente novamente.")
    } catch { setError("Erro de conexão. Tente novamente.") }
    setSubmitting(false)
  }

  const voltar = () => setStep(s => Math.max(0, s-1))
  const nome1  = nome.split(" ")[0]

  // ── STEP 0: HERO ─────────────────────────────────────────────
  if (step === 0) return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,textAlign:"center",background:`radial-gradient(ellipse 80% 60% at 50% 0%, ${C.gold}09, transparent), ${C.bg}`}}>
      {/* Linha decorativa */}
      <div style={{width:1,height:64,background:`linear-gradient(transparent,${C.gold}90)`,marginBottom:32}}/>

      <div className="anim" style={{animationDelay:"0s"}}>
        <p style={{letterSpacing:6,fontSize:11,color:C.gold,textTransform:"uppercase",marginBottom:20,fontWeight:500}}>
          Barbearia
        </p>
        <h1 style={{
          fontFamily:"'Cormorant Garamond',serif",
          fontSize:"clamp(48px,12vw,88px)",
          fontWeight:600,
          color:C.text,
          lineHeight:1,
          letterSpacing:-1,
        }}>{BARBEARIA.nome}</h1>
      </div>

      <div className="anim" style={{animationDelay:".1s"}}>
        <p style={{color:C.sub,marginTop:16,fontSize:14,letterSpacing:3,textTransform:"uppercase",fontWeight:300}}>
          {BARBEARIA.slogan}
        </p>
      </div>

      {/* Ornamento dourado */}
      <div className="anim" style={{animationDelay:".2s",display:"flex",alignItems:"center",gap:16,margin:"36px 0"}}>
        <div style={{width:64,height:1,background:`linear-gradient(to right,transparent,${C.gold})`}}/>
        <span style={{color:C.gold,fontSize:18}}>✦</span>
        <div style={{width:64,height:1,background:`linear-gradient(to left,transparent,${C.gold})`}}/>
      </div>

      <div className="anim" style={{animationDelay:".3s"}}>
        <button
          className="gold-btn"
          onClick={() => setStep(1)}
          style={{
            background:C.gold, color:"#000",
            padding:"17px 52px", borderRadius:2,
            fontSize:13, fontWeight:600,
            letterSpacing:3, textTransform:"uppercase",
          }}
        >
          Agendar Horário
        </button>
      </div>

      <div className="anim" style={{animationDelay:".4s",marginTop:32,display:"flex",flexDirection:"column",gap:6}}>
        <p style={{color:C.muted,fontSize:13}}>📍 {BARBEARIA.endereco}</p>
        <p style={{color:C.muted,fontSize:13}}>📱 {BARBEARIA.instagram}</p>
      </div>
    </div>
  )

  // ── STEP 6: SUCESSO ──────────────────────────────────────────
  if (step === 6) return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:24,background:C.bg}}>
      <div className="anim-scale" style={{maxWidth:420,width:"100%",textAlign:"center"}}>

        <div style={{
          width:80,height:80,borderRadius:"50%",
          border:`2px solid ${C.green}`,
          background:`${C.green}12`,
          display:"flex",alignItems:"center",justifyContent:"center",
          margin:"0 auto 28px",fontSize:32,
        }}>✓</div>

        <h2 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:36,fontWeight:600,marginBottom:12}}>
          Reservado!
        </h2>
        <p style={{color:C.sub,lineHeight:1.6,marginBottom:8}}>
          {nome1}, seu horário está confirmado.
        </p>
        <p style={{color:C.gold,fontWeight:600,fontSize:17,marginBottom:32}}>
          {dataSel && dataExtenso(dataSel)} às {horario}
        </p>

        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"20px 24px",marginBottom:32,fontSize:14,color:C.sub,lineHeight:1.9,textAlign:"left"}}>
          <div>📱 Confirmação enviada no WhatsApp</div>
          <div>🔔 Lembrete automático 24h antes</div>
          <div>🔔 Lembrete automático 1h antes</div>
          <div>📍 {BARBEARIA.endereco}</div>
        </div>

        <button onClick={() => { setStep(0); setServico(null); setDataSel(null); setHorario(null); setNome(""); setTelefone("") }}
          style={{color:C.gold,fontSize:14,textDecoration:"underline"}}>
          Novo agendamento
        </button>
      </div>
    </div>
  )

  // ── LAYOUT PADRÃO (steps 1–5) ─────────────────────────────────
  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center"}}>

      {/* Header */}
      <header style={{width:"100%",maxWidth:660,padding:"24px 24px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:22,fontWeight:600,color:C.gold,letterSpacing:1}}>
            {BARBEARIA.nome}
          </div>
        </div>
        {/* Barra de progresso */}
        <div style={{display:"flex",gap:5,alignItems:"center"}}>
          {[1,2,3,4,5].map(s => (
            <div key={s} style={{
              height:3, borderRadius:2,
              width: s === step ? 28 : s < step ? 16 : 8,
              background: s <= step ? C.gold : C.muted,
              transition:"all .3s ease",
              opacity: s < step ? .6 : 1,
            }}/>
          ))}
        </div>
      </header>

      <main style={{width:"100%",maxWidth:660,padding:"36px 24px 64px",flex:1}}>

        {/* STEP 1: SERVIÇO */}
        {step === 1 && (
          <div>
            <StepHeader title="Qual serviço?" sub="Selecione o que você deseja" delay={0}/>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              {SERVICOS.map((s,i) => (
                <button key={s.id} className="svc-card anim"
                  onClick={() => { setServico(s); setStep(2) }}
                  style={{
                    background: servico?.id===s.id ? C.goldDim : C.card,
                    border:`1px solid ${servico?.id===s.id ? C.gold : C.border}`,
                    borderRadius:10, padding:"20px 16px",
                    textAlign:"left", animationDelay:`${i*.06}s`,
                  }}>
                  <div style={{fontSize:26,marginBottom:10}}>{s.icon}</div>
                  <div style={{fontWeight:600,fontSize:15,color:C.text,marginBottom:4}}>{s.nome}</div>
                  <div style={{fontSize:12,color:C.sub,marginBottom:14}}>{s.desc}</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{color:C.gold,fontWeight:700,fontSize:17}}>R$ {s.preco}</span>
                    <span style={{color:C.muted,fontSize:12}}>{s.duracao} min</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STEP 2: DATA */}
        {step === 2 && (
          <div>
            <BackBtn onClick={voltar}/>
            <StepHeader title="Qual data?" sub="Escolha o dia do atendimento" delay={0}/>
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
              {getProximos30Dias().map((d,i) => {
                const sel = dataSel?.toDateString()===d.toDateString()
                const dom = d.getDay()===0
                return (
                  <button key={i} className="day-btn anim"
                    disabled={dom}
                    onClick={() => { setDataSel(d); setStep(3) }}
                    style={{
                      background: sel ? C.goldDim : C.card,
                      border:`1px solid ${sel ? C.gold : C.border}`,
                      borderRadius:8, padding:"12px 4px",
                      textAlign:"center", opacity:dom?.3:1,
                      cursor:dom?"not-allowed":"pointer",
                      animationDelay:`${i*.018}s`,
                    }}>
                    <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>
                      {DIAS[d.getDay()]}
                    </div>
                    <div style={{fontSize:19,fontWeight:600,color:sel?C.gold:C.text,marginBottom:2}}>
                      {d.getDate()}
                    </div>
                    <div style={{fontSize:10,color:C.sub}}>
                      {MESES[d.getMonth()]}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* STEP 3: HORÁRIO */}
        {step === 3 && (
          <div>
            <BackBtn onClick={voltar}/>
            <StepHeader
              title="Qual horário?"
              sub={dataSel ? dataExtenso(dataSel) : ""}
              delay={0}
            />
            {loadSlots ? (
              <div style={{textAlign:"center",padding:"72px 0"}}>
                <div style={{width:32,height:32,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.gold}`,borderRadius:"50%",animation:"spin .7s linear infinite",margin:"0 auto 16px"}}/>
                <p style={{color:C.sub,fontSize:14}}>Verificando disponibilidade…</p>
              </div>
            ) : slots.length===0 ? (
              <div style={{textAlign:"center",padding:"72px 0"}}>
                <div style={{fontSize:40,marginBottom:16}}>😔</div>
                <p style={{color:C.sub}}>Sem horários disponíveis neste dia.</p>
                <button onClick={voltar} style={{color:C.gold,marginTop:20,fontSize:14,textDecoration:"underline"}}>
                  Escolher outro dia
                </button>
              </div>
            ) : (
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                {slots.map((sl,i) => (
                  <button key={sl} className="slot anim"
                    onClick={() => { setHorario(sl); setStep(4) }}
                    style={{
                      background: horario===sl ? C.goldDim : C.card,
                      border:`1px solid ${horario===sl ? C.gold : C.border}`,
                      borderRadius:8, padding:"14px 6px",
                      fontSize:15, fontWeight:500,
                      color:horario===sl ? C.gold : C.text,
                      animationDelay:`${i*.04}s`,
                    }}>
                    {sl}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* STEP 4: DADOS */}
        {step === 4 && (
          <div>
            <BackBtn onClick={voltar}/>
            <StepHeader title="Seus dados" sub="Para finalizar o agendamento" delay={0}/>
            <div style={{display:"flex",flexDirection:"column",gap:20}}>
              <Campo label="Nome completo" value={nome} onChange={setNome} placeholder="João da Silva"/>
              <Campo label="WhatsApp (com DDD)" value={telefone} onChange={setTelefone} placeholder="(11) 99999-9999" type="tel"/>

              <button
                className="gold-btn anim"
                style={{animationDelay:".2s"}}
                onClick={() => { if(nome.length>2 && telefone.length>9) setStep(5) }}
                disabled={nome.length<3 || telefone.length<10}
              >
                <div style={{
                  background: nome.length>2 && telefone.length>9 ? C.gold : C.muted,
                  color: nome.length>2 && telefone.length>9 ? "#000" : C.sub,
                  padding:"17px", borderRadius:8,
                  fontSize:14, fontWeight:600,
                  letterSpacing:2, textTransform:"uppercase",
                  textAlign:"center", transition:"all .2s",
                }}>
                  Continuar →
                </div>
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: CONFIRMAÇÃO */}
        {step === 5 && (
          <div>
            <BackBtn onClick={voltar}/>
            <StepHeader title="Confirmar?" sub="Revise antes de finalizar" delay={0}/>

            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"4px 24px",marginBottom:24}}>
              {[
                { label:"Serviço",  val:servico?.nome,             extra:`R$ ${servico?.preco} · ${servico?.duracao} min` },
                { label:"Data",     val:dataSel&&dataExtenso(dataSel) },
                { label:"Horário",  val:horario },
                { label:"Nome",     val:nome },
                { label:"WhatsApp", val:telefone },
              ].map((item,i) => (
                <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"17px 0",borderBottom:i<4?`1px solid ${C.border}`:"none"}}>
                  <span style={{color:C.sub,fontSize:13}}>{item.label}</span>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontWeight:500,fontSize:15}}>{item.val}</div>
                    {item.extra && <div style={{color:C.sub,fontSize:12,marginTop:2}}>{item.extra}</div>}
                  </div>
                </div>
              ))}
            </div>

            {error && <p style={{color:C.red,textAlign:"center",fontSize:14,marginBottom:16}}>{error}</p>}

            <button className="gold-btn" onClick={confirmar} disabled={submitting}
              style={{
                width:"100%", background:submitting?C.muted:C.gold,
                color:submitting?"#666":"#000",
                padding:"18px", borderRadius:8,
                fontSize:15, fontWeight:700,
                letterSpacing:1, textTransform:"uppercase",
              }}>
              {submitting
                ? <span style={{display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
                    <span style={{width:16,height:16,border:"2px solid #66640",borderTop:"2px solid #000",borderRadius:"50%",display:"inline-block",animation:"spin .7s linear infinite"}}/>
                    Confirmando…
                  </span>
                : "✓ Confirmar Agendamento"
              }
            </button>

            <p style={{color:C.muted,fontSize:12,textAlign:"center",marginTop:16}}>
              Você receberá confirmação no WhatsApp 📱
            </p>
          </div>
        )}

      </main>
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────────
function StepHeader({ title, sub, delay=0 }) {
  return (
    <div className="anim" style={{marginBottom:28,animationDelay:`${delay}s`}}>
      <h1 style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,fontWeight:600,color:C.text,lineHeight:1.1}}>
        {title}
      </h1>
      {sub && <p style={{color:C.sub,marginTop:8,fontSize:14}}>{sub}</p>}
    </div>
  )
}

function BackBtn({ onClick }) {
  return (
    <button className="back-btn" onClick={onClick}
      style={{color:C.muted,fontSize:14,marginBottom:24,display:"flex",alignItems:"center",gap:6}}>
      ← Voltar
    </button>
  )
}

function Campo({ label, value, onChange, placeholder, type="text" }) {
  const [focus, setFocus] = useState(false)
  return (
    <div>
      <label style={{display:"block",color:C.sub,fontSize:11,letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>
        {label}
      </label>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width:"100%", background:C.card,
          border:`1px solid ${focus?C.gold:C.border}`,
          borderRadius:8, padding:"14px 16px",
          fontSize:16, color:C.text,
          transition:"border-color .2s",
        }}
      />
    </div>
  )
}

