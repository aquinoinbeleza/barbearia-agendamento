// ════════════════════════════════════════════════════════════════════════
//  utils/zodiac.js — Signo do zodíaco a partir da data
// ════════════════════════════════════════════════════════════════════════

export const signoDe = (d) => {
  const md = (d.getMonth() + 1) * 100 + d.getDate();
  if (md >= 1222 || md <= 119) return "Capricórnio";
  if (md <= 218) return "Aquário";
  if (md <= 320) return "Peixes";
  if (md <= 419) return "Áries";
  if (md <= 520) return "Touro";
  if (md <= 620) return "Gêmeos";
  if (md <= 722) return "Câncer";
  if (md <= 822) return "Leão";
  if (md <= 922) return "Virgem";
  if (md <= 1022) return "Libra";
  if (md <= 1121) return "Escorpião";
  return "Sagitário";
};

export default signoDe;
