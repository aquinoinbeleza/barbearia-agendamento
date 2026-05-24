import { useState, useEffect, useMemo } from "react";

/* ════════════════════════════════════════════════════════════════════════
   AQUINO · Portal do Cliente (agendamento público online)
   ------------------------------------------------------------------------
   Página pública: o cliente agenda sozinho em poucos toques.
   Fluxo: telefone → serviço → barbeiro → data/horário → confirmação.
   - Lê serviços e barbeiros do backend (GAS). Sem backend → modo demonstração.
   - Sinal (Pix) só aparece se o backend exigir (controlado pelo painel admin).
   - Design tokens reais da AQUINO (latão + carvão + papel · Fraunces+Hanken).
   ════════════════════════════════════════════════════════════════════════ */

// ─── ENV / API (mesmo contrato do App.jsx) ──────────────────────────────
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
  slots:    (data, duracao) => api._get({ action: "slots", data, duracao }),
  agendar:  (payload) => api._post({ action: "agendamento", requestId: `req_${Date.now()}_${Math.random().toString(36).slice(2,9)}`, ...payload }),
};

// ─── DADOS DEMO (sem backend) — menu real da AQUINO ─────────────────────
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

// ─── TOKENS DE DESIGN (AQUINO) ──────────────────────────────────────────
const T = {
  ink:"#19150F", ink2:"#3A342B", paper:"#F6F1E9", card:"#FFFFFF", line:"#E7DECF",
  muted:"#8C8475", brass:"#C18A3D", brassDeep:"#9C6C25", brassTint:"#F4EAD7",
  wa:"#1FA855", ok:"#2F8F5B", danger:"#C0492F",
  serif:"'Fraunces', Georgia, serif", sans:"'Hanken Grotesk', system-ui, sans-serif",
};
const money = (v) => `R$ ${Number(v||0).toFixed(2).replace(".",",")}`;
const maskTel = (v) => {
  const d = String(v).replace(/\D/g,"").slice(0,11);
  if (d.length<=2) return d;
  if (d.length<=7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
};
const telLimpo = (v) => String(v).replace(/\D/g,"");

// ─── DATAS ──────────────────────────────────────────────────────────────
const DIAS = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const MESES = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const proximosDias = (n=14) => {
  const out=[]; const hoje=new Date(); hoje.setHours(0,0,0,0);
  for(let i=0;i<n;i++){ const d=new Date(hoje); d.setDate(hoje.getDate()+i); out.push(d); }
  return out;
};
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

// ─── COMPONENTES BASE ───────────────────────────────────────────────────
const Shell = ({ children, step, total }) => (
  <div style={{minHeight:"100dvh",background:T.paper,fontFamily:T.sans,color:T.ink,display:"flex",flexDirection:"column",alignItems:"center"}}>
    <style>{`
      @keyframes aqUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      *{box-sizing:border-box}
      .aq-btn:active{transform:scale(.98)}
      .aq-card-pick{transition:all .18s cubic-bezier(.4,0,.2,1)}
      .aq-card-pick:active{transform:scale(.985)}
    `}</style>
    <div style={{width:"100%",maxWidth:460,padding:"0 0 40px",animation:"aqUp .35s cubic-bezier(.22,1,.36,1)"}}>
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

const Header = ({ titulo, sub, onBack }) => (
  <div style={{padding:"20px 22px 8px"}}>
    {onBack && (
      <button onClick={onBack} className="aq-btn" style={{border:"none",background:"none",color:T.muted,fontSize:14,cursor:"pointer",padding:"4px 0",marginBottom:8,fontFamily:T.sans}}>
        ← Voltar
      </button>
    )}
    <h1 style={{fontFamily:T.serif,fontWeight:600,fontSize:26,margin:0,lineHeight:1.15,letterSpacing:"-0.01em"}}>{titulo}</h1>
    {sub && <p style={{color:T.muted,fontSize:14,margin:"6px 0 0"}}>{sub}</p>}
  </div>
);

const Primary = ({ children, onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled} className="aq-btn" style={{
    width:"100%",padding:"16px",borderRadius:13,border:"none",cursor:disabled?"not-allowed":"pointer",
    background:disabled?T.line:`linear-gradient(150deg,${T.brass},${T.brassDeep})`,
    color:disabled?T.muted:"#fff",fontSize:16,fontWeight:700,fontFamily:T.sans,
    boxShadow:disabled?"none":"0 12px 24px -8px rgba(193,138,61,.55)",transition:"all .2s",
  }}>{children}</button>
);

const Bottom = ({ children }) => (
  <div style={{padding:"12px 22px 0",position:"sticky",bottom:0,background:`linear-gradient(to top, ${T.paper} 70%, transparent)`,paddingBottom:16}}>{children}</div>
);

// ════════════════════════════════════════════════════════════════════════
export default function BookingPortal() {
  const [step, setStep] = useState(0);            // 0 tel · 1 serviço · 2 barbeiro · 3 data/hora · 4 dados · 5 sinal · 6 ok
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
  const [resultado, setResultado] = useState(null); // {requiresSinal, pix, ...}
  const demo = !ENV.hasBackend;

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

  // ── Passo 0: telefone ──
  const avancarTelefone = async () => {
    const limpo = telLimpo(tel);
    if (limpo.length < 10) { setErro("Digite um número de WhatsApp válido."); return; }
    setErro("");
    try {
      const r = await api.verificarCliente(limpo);
      if (r && r.encontrado) { setClienteExistente(r); setNome(r.nome || ""); }
    } catch (e) {}
    setStep(1);
  };

  // ── Passo 3: carregar horários quando escolhe data ──
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

  // ── Passo 4 → enviar agendamento ──
  const confirmar = async () => {
    if (!nome.trim()) { setErro("Por favor, informe seu nome."); return; }
    setErro(""); setEnviando(true);
    try {
      const r = await api.agendar({
        nome: nome.trim(),
        telefone: telLimpo(tel),
        data: isoDate(dataSel),
        horario: horaSel,
        servico: { nome: servSel.nome, duracao: servSel.duracao, preco: servSel.preco },
        barbeiro: barbSel ? barbSel.nome : "",
        observacao: obs.trim(),
      });
      if (r && r._demo) { setResultado({ demo:true }); setStep(6); }
      else if (r && r.requiresSinal) { setResultado(r); setStep(5); }
      else if (r && (r.success || r.id)) { setResultado(r); setStep(6); }
      else { setErro((r && r.error) || "Não foi possível concluir. Tente outro horário."); }
    } catch (e) { setErro("Falha de conexão. Verifique sua internet e tente de novo."); }
    setEnviando(false);
  };

  // ═══ TELAS ═══

  // PASSO 0 — Boas-vindas + telefone
  if (step===0) return (
    <Shell>
      <div style={{padding:"40px 22px 0",textAlign:"center"}}>
        <div style={{width:64,height:64,margin:"0 auto 14px",borderRadius:18,background:`linear-gradient(150deg,${T.brass},${T.brassDeep})`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 12px 24px -8px rgba(193,138,61,.55)"}}>
          <span style={{fontFamily:T.serif,color:"#fff",fontSize:30,fontWeight:700}}>A</span>
        </div>
        <div style={{fontFamily:T.serif,fontSize:34,fontWeight:700,letterSpacing:"0.04em"}}>{BARBEARIA.nome}</div>
        <div style={{color:T.brassDeep,fontSize:13,fontWeight:600,letterSpacing:"0.16em",textTransform:"uppercase",marginTop:2}}>{BARBEARIA.sub}</div>
      </div>
      <div style={{padding:"32px 22px 0"}}>
        <h1 style={{fontFamily:T.serif,fontWeight:600,fontSize:24,margin:"0 0 6px",lineHeight:1.2}}>Agende seu horário</h1>
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
      <Bottom><Primary onClick={avancarTelefone} disabled={telLimpo(tel).length<10}>Continuar</Primary>
        <p style={{textAlign:"center",fontSize:11,color:T.muted,margin:"14px 0 0",lineHeight:1.5}}>
          Ao continuar, você concorda com nossa Política de Privacidade e Termos de Uso.
        </p>
      </Bottom>
    </Shell>
  );

  // PASSO 1 — Serviço
  if (step===1) return (
    <Shell step={0} total={5}>
      <Header titulo="Escolha o serviço" sub={clienteExistente?`Olá de novo, ${(clienteExistente.nome||"").split(" ")[0]}! 👋`:"O que você quer fazer hoje?"} onBack={()=>setStep(0)}/>
      <div style={{padding:"8px 22px 0",display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        {servicos.map(s=>{
          const sel = servSel && servSel.id===s.id;
          return (
            <div key={s.id} className="aq-card-pick" onClick={()=>setServSel(s)} style={{
              padding:"14px",borderRadius:14,cursor:"pointer",background:T.card,
              border:`1.5px solid ${sel?T.brass:T.line}`,boxShadow:sel?"0 8px 20px -12px rgba(193,138,61,.6)":"none",
            }}>
              <div style={{fontWeight:700,fontSize:14,lineHeight:1.25}}>{s.nome}</div>
              <div style={{color:T.muted,fontSize:12,marginTop:6}}>{s.duracao} min</div>
              <div style={{color:T.brassDeep,fontWeight:700,fontSize:15,marginTop:2}}>{money(s.preco)}</div>
            </div>
          );
        })}
      </div>
      <Bottom><Primary onClick={()=>setStep(2)} disabled={!servSel}>{servSel?`Continuar · ${money(servSel.preco)}`:"Selecione um serviço"}</Primary></Bottom>
    </Shell>
  );

  // PASSO 2 — Barbeiro
  if (step===2) return (
    <Shell step={1} total={5}>
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
              <div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{b.nome}</div></div>
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

  // PASSO 3 — Data e horário
  if (step===3) return (
    <Shell step={2} total={5}>
      <Header titulo="Data e horário" sub={`${servSel?.nome} · ${barbSel?.nome}`} onBack={()=>setStep(2)}/>
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
      </div>
      <Bottom><Primary onClick={()=>setStep(4)} disabled={!dataSel||!horaSel}>Continuar</Primary></Bottom>
    </Shell>
  );

  // PASSO 4 — Dados + confirmação
  if (step===4) return (
    <Shell step={3} total={5}>
      <Header titulo="Confirme seu agendamento" onBack={()=>setStep(3)}/>
      <div style={{padding:"4px 22px 0"}}>
        <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:18,boxShadow:"0 8px 22px -18px rgba(25,21,15,.4)"}}>
          <Linha label="Serviço" valor={servSel?.nome}/>
          <Linha label="Barbeiro" valor={barbSel?.nome}/>
          <Linha label="Data" valor={dataSel && `${DIAS[dataSel.getDay()]}, ${dataSel.getDate()} de ${["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"][dataSel.getMonth()]}`}/>
          <Linha label="Horário" valor={horaSel}/>
          <Linha label="Duração" valor={`${servSel?.duracao} min`}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,paddingTop:12,borderTop:`1px dashed ${T.line}`}}>
            <span style={{fontWeight:700,fontSize:15}}>Total</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:22,color:T.brassDeep}}>{money(servSel?.preco)}</span>
          </div>
        </div>
        <div style={{marginTop:18}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>Seu nome completo</label>
          <input value={nome} onChange={(e)=>setNome(e.target.value)} placeholder="Ex.: João Silva" autoFocus={!nome}
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none"}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
        </div>
        <div style={{marginTop:14}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>Observação <span style={{color:T.muted,fontWeight:400}}>(opcional)</span></label>
          <input value={obs} onChange={(e)=>setObs(e.target.value)} placeholder="Algum pedido especial?"
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:15,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none"}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
        </div>
        {erro && <div style={{color:T.danger,fontSize:13,marginTop:12}}>{erro}</div>}
      </div>
      <Bottom><Primary onClick={confirmar} disabled={enviando||!nome.trim()}>{enviando?"Confirmando…":"Confirmar agendamento"}</Primary></Bottom>
    </Shell>
  );

  // PASSO 5 — Sinal (Pix) — só se backend exigir
  if (step===5) return (
    <Shell>
      <Header titulo="Garanta seu horário" sub="Para confirmar, falta um sinal via Pix."/>
      <div style={{padding:"4px 22px 0"}}>
        <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:20,textAlign:"center"}}>
          <div style={{fontSize:13,color:T.muted}}>Valor do sinal ({resultado?.sinalPct||30}%)</div>
          <div style={{fontFamily:T.serif,fontWeight:700,fontSize:30,color:T.brassDeep,margin:"4px 0 14px"}}>{money(resultado?.valorSinal)}</div>
          {resultado?.pix?.qrCodeBase64 && (
            <img src={`data:image/png;base64,${resultado.pix.qrCodeBase64}`} alt="QR Code Pix" style={{width:200,height:200,margin:"0 auto",display:"block",borderRadius:12}}/>
          )}
          {resultado?.pix?.copiaECola && (
            <div style={{marginTop:14}}>
              <div style={{fontSize:12,color:T.muted,marginBottom:6}}>Pix copia e cola:</div>
              <div style={{background:T.paper,border:`1px solid ${T.line}`,borderRadius:10,padding:"10px 12px",fontSize:11,wordBreak:"break-all",fontFamily:"monospace",color:T.ink2}}>{resultado.pix.copiaECola}</div>
              <button className="aq-btn" onClick={()=>{navigator.clipboard?.writeText(resultado.pix.copiaECola);}} style={{marginTop:10,width:"100%",padding:"12px",borderRadius:11,border:`1.5px solid ${T.brass}`,background:T.brassTint,color:T.brassDeep,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:T.sans}}>Copiar código Pix</button>
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
    <Shell>
      <div style={{padding:"56px 22px 0",textAlign:"center"}}>
        <div style={{width:72,height:72,margin:"0 auto 20px",borderRadius:"50%",background:T.wa,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 14px 30px -10px rgba(31,168,85,.6)"}}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </div>
        <h1 style={{fontFamily:T.serif,fontWeight:700,fontSize:28,margin:"0 0 8px"}}>Agendamento confirmado!</h1>
        <p style={{color:T.muted,fontSize:15,margin:"0 0 24px",lineHeight:1.5}}>
          {nome.split(" ")[0]}, seu horário está garantido.
        </p>
      </div>
      <div style={{padding:"0 22px"}}>
        <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:18,textAlign:"left"}}>
          <Linha label="Serviço" valor={servSel?.nome}/>
          <Linha label="Barbeiro" valor={barbSel?.nome}/>
          <Linha label="Data" valor={dataSel && `${DIAS[dataSel.getDay()]}, ${dataSel.getDate()}/${String(dataSel.getMonth()+1).padStart(2,"0")}`}/>
          <Linha label="Horário" valor={horaSel}/>
          <Linha label="Local" valor={BARBEARIA.endereco}/>
        </div>
        {demo && <p style={{textAlign:"center",fontSize:11,color:T.muted,marginTop:14}}>⚙️ Modo demonstração — conecte o backend (VITE_GAS_URL) para gravar de verdade.</p>}
        {!demo && <p style={{textAlign:"center",fontSize:13,color:T.muted,marginTop:16,lineHeight:1.5}}>Você receberá lembretes no WhatsApp: 24h e 1h antes. 💈</p>}
      </div>
      <Bottom><Primary onClick={()=>{ setStep(0); setTel(""); setServSel(null); setBarbSel(null); setDataSel(null); setHoraSel(null); setNome(""); setObs(""); setResultado(null); setClienteExistente(null); }}>Fazer outro agendamento</Primary></Bottom>
    </Shell>
  );
}

const Linha = ({ label, valor }) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"6px 0",gap:12}}>
    <span style={{color:T.muted,fontSize:13,flexShrink:0}}>{label}</span>
    <span style={{fontWeight:600,fontSize:14,textAlign:"right"}}>{valor||"—"}</span>
  </div>
);
