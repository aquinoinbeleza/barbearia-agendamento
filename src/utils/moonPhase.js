// ════════════════════════════════════════════════════════════════════════
//  utils/moonPhase.js — Fase da Lua (cálculo astronômico real, offline)
//  ------------------------------------------------------------------------
//  Calcula a fase a partir da posição REAL do Sol e da Lua (não por uma média
//  aproximada). Portado do algoritmo de iluminação lunar do SunCalc, de
//  Vladimir Agafonkin (licença BSD-2-Clause) — sem dependência externa e sem
//  consultar a internet em tempo de execução.
//
//  Convenção do rótulo (igual às agendas de papel brasileiras): mostramos a
//  ÚLTIMA fase principal atingida — Nova → Crescente → Cheia → Minguante.
//  Ex.: depois do Quarto Crescente e antes da Cheia, a lua está "Crescente".
// ════════════════════════════════════════════════════════════════════════

const PI = Math.PI;
const rad = PI / 180;
const dayMs = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const e = rad * 23.4397; // obliquidade da eclíptica

const toDays = (date) => date.valueOf() / dayMs - 0.5 + J1970 - J2000;

const rightAscension = (l, b) =>
  Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const declination = (l, b) =>
  Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));

const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
const eclipticLongitude = (M) => {
  const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = rad * 102.9372;
  return M + C + P + PI;
};
const sunCoords = (d) => {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
};
const moonCoords = (d) => {
  const L = rad * (218.316 + 13.176396 * d); // longitude eclíptica
  const M = rad * (134.963 + 13.064993 * d); // anomalia média
  const F = rad * (93.272 + 13.229350 * d);  // distância média
  const l = L + rad * 6.289 * Math.sin(M);   // longitude
  const b = rad * 5.128 * Math.sin(F);       // latitude
  const dt = 385001 - 20905 * Math.cos(M);   // distância à Lua (km)
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
};

const moonIllumination = (date) => {
  const d = toDays(date);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sdist = 149598000; // distância Terra–Sol (km)
  const phi = Math.acos(
    Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra)
  );
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra)
  );
  return {
    fraction: (1 + Math.cos(inc)) / 2,                       // 0..1 (quanto está iluminada)
    phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / PI,      // 0=Nova .25=Crescente .5=Cheia .75=Minguante
  };
};

// Fração iluminada do disco (0..1) — útil se um dia quiser mostrar "% iluminada".
export const iluminacaoLuaDe = (d) => moonIllumination(d).fraction;

// Nome da fase (4 principais), avaliado ao MEIO-DIA local do dia.
// Convenção das agendas de papel brasileiras (Animativa etc.): o nome é a ÚLTIMA
// fase principal ATINGIDA e permanece até a próxima:
//   Nova → (Quarto) Crescente → Cheia → (Quarto) Minguante → Nova …
// Ou seja, DEPOIS da Cheia a lua continua "Cheia" até o Quarto Minguante, e
// DEPOIS da Nova continua "Nova" até o Quarto Crescente. (Antes mostrava a lua de
// 99% como "Minguante" logo no dia seguinte à cheia — errado para essa convenção.)
// Detecção robusta, sem depender do instante exato em que a pessoa abre o site:
//   • dia de PICO de iluminação  = Lua Cheia;  dia de VALE = Lua Nova;
//   • entre eles, usa o lado (crescendo/minguando) e o limite de 50% (= os quartos).
export const faseLuaDe = (d) => {
  const ilumNoDia = (date) => moonIllumination(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0)).fraction;
  const ontem = new Date(d); ontem.setDate(ontem.getDate() - 1);
  const amanha = new Date(d); amanha.setDate(amanha.getDate() + 1);
  const fOntem = ilumNoDia(ontem);
  const fHoje  = ilumNoDia(d);
  const fAmanha = ilumNoDia(amanha);
  const crescendo = fAmanha >= fHoje; // iluminação aumentando → lado crescente do ciclo
  if (fHoje >= fOntem && fHoje >= fAmanha) return "Lua Cheia"; // pico → dia da Cheia
  if (fHoje <= fOntem && fHoje <= fAmanha) return "Lua Nova";  // vale → dia da Nova
  // Acima de 50% iluminada: crescendo ainda é Crescente; minguando já passou da Cheia.
  if (fHoje >= 0.5) return crescendo ? "Lua Crescente" : "Lua Cheia";
  // Abaixo de 50%: crescendo ainda é Nova (antes do Q. Crescente); minguando é Minguante.
  return crescendo ? "Lua Nova" : "Lua Minguante";
};

export default faseLuaDe;

