// ════════════════════════════════════════════════════════════════════════
//  utils/seasons.js — Estação do ano (Hemisfério Sul — Brasil)
//  Datas aproximadas dos solstícios/equinócios (variam ~1 dia por ano).
// ════════════════════════════════════════════════════════════════════════

export const estacaoDe = (d) => {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  if (md >= 1221 || md <= 319) return "Verão";
  if (md <= 620) return "Outono";
  if (md <= 922) return "Inverno";
  if (md <= 1220) return "Primavera";
  return "Verão";
};

export default estacaoDe;
