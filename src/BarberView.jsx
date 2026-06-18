import React, { useEffect, useState } from "react";

// Página PÚBLICA do barbeiro (sem login) — aberta pelo link /barbeiro?b=<token>.
// O token é do próprio barbeiro (gerado no backend a partir do id + SITE_TOKEN); o endpoint
// devolve só os números DELE (faturamento, meta, nível, posição) — nunca os dos colegas.
const GAS_URL = (import.meta.env && import.meta.env.VITE_GAS_URL) || "";

const C = {
  bg: "#0B0B0C", card: "#141416", line: "#2A2A2E",
  ink: "#F6F1E9", sec: "#B9B2A4", muted: "#7C7668",
  gold: "#C18A3D", goldSoft: "#E0B775",
  ouro: "#E0B775", prata: "#C9CDD4", bronze: "#C8894B",
};
const money = (n) => "R$ " + (Number(n) || 0).toLocaleString("pt-BR");
const corNivel = (nv) => nv === "Ouro" ? C.ouro : nv === "Prata" ? C.prata : nv === "Bronze" ? C.bronze : C.muted;
const getParam = (name) => { try { return new URLSearchParams(window.location.search).get(name) || ""; } catch (e) { return ""; } };

export default function BarberView() {
  const [data, setData] = useState(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getParam("b");
    if (!GAS_URL) { setErro("Painel ainda não configurado pela barbearia."); setLoading(false); return; }
    if (!token) { setErro("Link inválido — peça o link novamente ao dono."); setLoading(false); return; }
    fetch(GAS_URL + "?action=metaBarbeiro&b=" + encodeURIComponent(token))
      .then((r) => r.json())
      .then((j) => { if (j && j.success) setData(j); else setErro("Link inválido ou expirado — peça um novo ao dono."); })
      .catch(() => setErro("Falha de conexão. Tente de novo em instantes."))
      .finally(() => setLoading(false));
  }, []);

  const wrap = { minHeight: "100vh", background: C.bg, color: C.ink, fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif", display: "flex", justifyContent: "center", padding: "24px 16px" };
  const card = { width: "100%", maxWidth: 440, background: C.card, border: `1px solid ${C.line}`, borderRadius: 20, padding: 22 };

  if (loading) return (<div style={wrap}><div style={{ ...card, textAlign: "center", color: C.sec }}>Carregando seu painel…</div></div>);
  if (erro || !data) return (<div style={wrap}><div style={{ ...card, textAlign: "center" }}><div style={{ fontSize: 32, marginBottom: 8 }}>🔒</div><div style={{ color: C.sec, fontSize: 14 }}>{erro || "Não foi possível carregar."}</div></div></div>);

  const pctBar = Math.min(100, Number(data.pct) || 0);
  const prox = data.proximoNivel;
  const niveis = Array.isArray(data.niveis) ? data.niveis : [];
  const premios = data.premios || {};

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ textAlign: "center", color: C.muted, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase" }}>{data.barbearia} · Painel do barbeiro</div>
        <div style={{ textAlign: "center", fontSize: 24, fontWeight: 700, marginTop: 6 }}>{data.barbeiro}</div>
        <div style={{ textAlign: "center", color: C.muted, fontSize: 12, marginTop: 2 }}>Mês {data.mes}</div>

        {data.nivel ? (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <span style={{ display: "inline-block", border: `1px solid ${corNivel(data.nivel)}`, color: corNivel(data.nivel), borderRadius: 999, padding: "4px 14px", fontSize: 13, fontWeight: 700, letterSpacing: "0.05em" }}>NÍVEL {String(data.nivel).toUpperCase()}</span>
          </div>
        ) : null}

        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: C.goldSoft }}>{money(data.faturado)}</span>
            <span style={{ fontSize: 13, color: C.sec }}>{data.meta ? "de " + money(data.meta) : "sem meta"}</span>
          </div>
          <div style={{ height: 12, background: "#000", border: `1px solid ${C.line}`, borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: pctBar + "%", background: `linear-gradient(90deg,${C.gold},${C.goldSoft})`, borderRadius: 999 }} />
          </div>
          <div style={{ textAlign: "right", fontSize: 12, color: C.sec, marginTop: 4 }}>{data.pct}% da meta</div>
        </div>

        <div style={{ background: "#000", border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px", marginTop: 16, fontSize: 14, color: C.ink, textAlign: "center" }}>{data.mensagem}</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
          <Stat label="Atendimentos" value={data.atendimentos} />
          <Stat label="Posição" value={"#" + data.posicao + " de " + data.totalBarbeiros} />
        </div>

        {prox ? (
          <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: C.sec }}>Faltam <b style={{ color: C.goldSoft }}>{money(prox.faltaR)}</b> para o <b style={{ color: corNivel(prox.nome) }}>{prox.nome}</b></div>
        ) : null}

        {niveis.length > 0 && (
          <div style={{ marginTop: 18, borderTop: `1px solid ${C.line}`, paddingTop: 14 }}>
            <div style={{ color: C.muted, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Níveis e prêmios</div>
            {niveis.slice().sort((a, b) => (a.pct || 0) - (b.pct || 0)).map((n) => (
              <div key={n.nome} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0" }}>
                <span><b style={{ color: corNivel(n.nome) }}>{n.nome}</b> <span style={{ color: C.muted }}>· {n.pct}%</span></span>
                <span style={{ color: C.sec }}>{premios[n.nome] || "—"}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ textAlign: "center", color: C.muted, fontSize: 10.5, marginTop: 18 }}>Atualiza sozinho conforme os atendimentos são concluídos.</div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: "#000", border: `1px solid ${C.line}`, borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink }}>{value}</div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}
