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

// ─── IDIOMA (i18n) ──────────────────────────────────────────────────────
// Fase 1: funil de agendamento + navegação + perfil. Conteúdo dinâmico
// (serviços, datas comemorativas, frases) permanece em português.
const IDIOMAS = [
  { cod:"pt", flag:"🇧🇷", nome:"Português" },
  { cod:"en", flag:"🇺🇸", nome:"English" },
  { cod:"es", flag:"🇪🇸", nome:"Español" },
  { cod:"fr", flag:"🇫🇷", nome:"Français" },
];
const IDIOMA_KEY = "aquino_portal_idioma";
const lerIdioma = () => { try { const v = localStorage.getItem(IDIOMA_KEY); return ["pt","en","es","fr"].includes(v) ? v : "pt"; } catch (e) { return "pt"; } };
const salvarIdioma = (l) => { try { localStorage.setItem(IDIOMA_KEY, l); } catch (e) {} };
const IdiomaCtx = createContext("pt");
const useIdioma = () => useContext(IdiomaCtx);

const STRINGS = {
  // navegação inferior
  nav_inicio:   { pt:"Início",   en:"Home",      es:"Inicio",    fr:"Accueil" },
  nav_agendar:  { pt:"Agendar",  en:"Book",      es:"Reservar",  fr:"Réserver" },
  nav_agenda:   { pt:"Agenda",   en:"Schedule",  es:"Agenda",    fr:"Agenda" },
  nav_perfil:   { pt:"Perfil",   en:"Profile",   es:"Perfil",    fr:"Profil" },
  // genéricos
  voltar:       { pt:"← Voltar", en:"← Back",     es:"← Volver",  fr:"← Retour" },
  continuar:    { pt:"Continuar",en:"Continue",   es:"Continuar", fr:"Continuer" },
  // tela 0 — telefone
  t0_titulo:    { pt:"Agende seu horário", en:"Book your appointment", es:"Reserva tu horario", fr:"Réservez votre rendez-vous" },
  t0_sub:       { pt:"Em poucos toques. Comece com seu WhatsApp.", en:"In a few taps. Start with your WhatsApp.", es:"En pocos toques. Empieza con tu WhatsApp.", fr:"En quelques clics. Commencez avec votre WhatsApp." },
  t0_label:     { pt:"Seu WhatsApp", en:"Your WhatsApp", es:"Tu WhatsApp", fr:"Votre WhatsApp" },
  t0_ph_br:     { pt:"(31) 99999-9999", en:"(31) 99999-9999", es:"(31) 99999-9999", fr:"(31) 99999-9999" },
  t0_ph_intl:   { pt:"número com DDD", en:"number with area code", es:"número con código de área", fr:"numéro avec indicatif" },
  t0_ddi_aviso: { pt:"Código internacional", en:"International code", es:"Código internacional", fr:"Indicatif international" },
  t0_ddi_fim:   { pt:"selecionado.", en:"selected.", es:"seleccionado.", fr:"sélectionné." },
  t0_tel_inval: { pt:"Digite um número de WhatsApp válido.", en:"Enter a valid WhatsApp number.", es:"Ingresa un número de WhatsApp válido.", fr:"Entrez un numéro WhatsApp valide." },
  t0_verificando:{ pt:"Verificando…", en:"Checking…", es:"Verificando…", fr:"Vérification…" },
  t0_li_concordo:{ pt:"Li e concordo com a", en:"I have read and agree to the", es:"He leído y acepto la", fr:"J'ai lu et j'accepte la" },
  t0_privacidade:{ pt:"Política de Privacidade", en:"Privacy Policy", es:"Política de Privacidad", fr:"Politique de Confidentialité" },
  t0_e_os:      { pt:"e os", en:"and the", es:"y los", fr:"et les" },
  t0_termos:    { pt:"Termos de Uso", en:"Terms of Use", es:"Términos de Uso", fr:"Conditions d'Utilisation" },
  // tela 1 — serviço
  t1_titulo:    { pt:"Escolha o serviço", en:"Choose the service", es:"Elige el servicio", fr:"Choisissez le service" },
  t1_ola_volta: { pt:"Olá de novo,", en:"Hello again,", es:"Hola de nuevo,", fr:"Bonjour à nouveau," },
  t1_sub:       { pt:"O que você quer fazer hoje?", en:"What would you like today?", es:"¿Qué quieres hacer hoy?", fr:"Que souhaitez-vous aujourd'hui ?" },
  t1_para_quem: { pt:"Para quem é o atendimento?", en:"Who is this appointment for?", es:"¿Para quién es la cita?", fr:"Pour qui est ce rendez-vous ?" },
  t1_para_mim:  { pt:"Para mim", en:"For me", es:"Para mí", fr:"Pour moi" },
  t1_min:       { pt:"min", en:"min", es:"min", fr:"min" },
  t1_selecione: { pt:"Selecione um serviço", en:"Select a service", es:"Selecciona un servicio", fr:"Sélectionnez un service" },
  // tela 2 — barbeiro
  t2_titulo:    { pt:"Escolha o profissional", en:"Choose the professional", es:"Elige el profesional", fr:"Choisissez le professionnel" },
  t2_sub:       { pt:"Quem você quer que faça seu atendimento?", en:"Who would you like to attend you?", es:"¿Quién quieres que te atienda?", fr:"Qui souhaitez-vous pour votre rendez-vous ?" },
  // tela 3 — data/hora
  t3_data_hora: { pt:"Data e horário", en:"Date and time", es:"Fecha y hora", fr:"Date et heure" },
  t3_novo_h:    { pt:"Novo horário", en:"New time", es:"Nuevo horario", fr:"Nouvel horaire" },
  t3_remarc_sub:{ pt:"Remarcando: {x}", en:"Rescheduling: {x}", es:"Reprogramando: {x}", fr:"Report : {x}" },
  // tela 5 — sinal/pix
  t5_titulo:    { pt:"Garanta seu horário", en:"Secure your appointment", es:"Asegura tu horario", fr:"Confirmez votre rendez-vous" },
  t5_sub:       { pt:"Para confirmar, falta um sinal via Pix.", en:"To confirm, a Pix deposit is needed.", es:"Para confirmar, falta una seña vía Pix.", fr:"Pour confirmer, un acompte via Pix est requis." },
  t3_novo_horario:{ pt:"Confirmar novo horário", en:"Confirm new time", es:"Confirmar nuevo horario", fr:"Confirmer le nouvel horaire" },
  t3_remarcando:{ pt:"Remarcando…", en:"Rescheduling…", es:"Reprogramando…", fr:"Report en cours…" },
  // tela 4 — dados
  t4_titulo:    { pt:"Confirme seus dados", en:"Confirm your details", es:"Confirma tus datos", fr:"Confirmez vos informations" },
  t4_nome:      { pt:"Nome", en:"First name", es:"Nombre", fr:"Prénom" },
  t4_sobrenome: { pt:"Sobrenome", en:"Last name", es:"Apellido", fr:"Nom" },
  t4_nascimento:{ pt:"Data de nascimento", en:"Date of birth", es:"Fecha de nacimiento", fr:"Date de naissance" },
  t4_nasc_aviso:{ pt:"Usamos para mensagem de aniversário e cuidados específicos.", en:"Used for birthday greetings and tailored care.", es:"Lo usamos para felicitaciones de cumpleaños y cuidados específicos.", fr:"Utilisé pour les vœux d'anniversaire et des soins adaptés." },
  t4_email:     { pt:"E-mail", en:"E-mail", es:"Correo electrónico", fr:"E-mail" },
  t4_foto_aviso:{ pt:"Foto de perfil (obrigatória) — ajuda no seu reconhecimento.", en:"Profile photo (required) — helps us recognize you.", es:"Foto de perfil (obligatoria) — ayuda a reconocerte.", fr:"Photo de profil (obligatoire) — aide à vous reconnaître." },
  t4_obs:       { pt:"Observação", en:"Note", es:"Observación", fr:"Remarque" },
  t4_opcional:  { pt:"(opcional)", en:"(optional)", es:"(opcional)", fr:"(facultatif)" },
  t4_obs_ph:    { pt:"Algum pedido especial?", en:"Any special request?", es:"¿Alguna petición especial?", fr:"Une demande particulière ?" },
  t4_confirmar: { pt:"Confirmar agendamento", en:"Confirm booking", es:"Confirmar reserva", fr:"Confirmer la réservation" },
  t4_confirmando:{ pt:"Confirmando…", en:"Confirming…", es:"Confirmando…", fr:"Confirmation…" },
  err_nome:     { pt:"Por favor, informe seu nome.", en:"Please enter your name.", es:"Por favor, ingresa tu nombre.", fr:"Veuillez saisir votre nom." },
  err_sobrenome:{ pt:"Informe seu sobrenome.", en:"Please enter your last name.", es:"Ingresa tu apellido.", fr:"Saisissez votre nom de famille." },
  err_nasc:     { pt:"Informe uma data de nascimento válida.", en:"Enter a valid date of birth.", es:"Ingresa una fecha de nacimiento válida.", fr:"Entrez une date de naissance valide." },
  err_email:    { pt:"Informe um e-mail válido.", en:"Enter a valid e-mail.", es:"Ingresa un correo válido.", fr:"Entrez un e-mail valide." },
  err_foto:     { pt:"Adicione uma foto de perfil para concluir.", en:"Add a profile photo to finish.", es:"Agrega una foto de perfil para finalizar.", fr:"Ajoutez une photo de profil pour terminer." },
  // foto
  foto_add:     { pt:"Adicionar foto", en:"Add photo", es:"Agregar foto", fr:"Ajouter une photo" },
  foto_trocar:  { pt:"Trocar foto", en:"Change photo", es:"Cambiar foto", fr:"Changer la photo" },
  foto_enviando:{ pt:"Enviando…", en:"Uploading…", es:"Enviando…", fr:"Envoi…" },
  // dependentes
  dep_toggle:   { pt:"Tenho dependentes que também atendo aqui", en:"I have dependents who also come here", es:"Tengo dependientes que también atiendo aquí", fr:"J'ai des proches qui viennent aussi ici" },
  dep_label:    { pt:"Dependente", en:"Dependent", es:"Dependiente", fr:"Proche" },
  dep_nome_ph:  { pt:"Nome do dependente", en:"Dependent's name", es:"Nombre del dependiente", fr:"Nom du proche" },
  dep_remover:  { pt:"Remover", en:"Remove", es:"Eliminar", fr:"Retirer" },
  dep_add:      { pt:"+ Adicionar outro dependente", en:"+ Add another dependent", es:"+ Agregar otro dependiente", fr:"+ Ajouter un autre proche" },
  // sucesso
  ok_titulo:    { pt:"Agendamento confirmado!", en:"Booking confirmed!", es:"¡Reserva confirmada!", fr:"Réservation confirmée !" },
  ok_garantido: { pt:"seu horário está garantido.", en:"your time is secured.", es:"tu horario está garantizado.", fr:"votre créneau est confirmé." },
  ok_dep_garantido:{ pt:"o horário de {x} está garantido.", en:"{x}'s appointment is secured.", es:"el horario de {x} está garantizado.", fr:"le rendez-vous de {x} est confirmé." },
  ok_novo:      { pt:"Agendar outro horário", en:"Book another time", es:"Reservar otro horario", fr:"Réserver un autre créneau" },
  ok_inicio:    { pt:"Ir para o início", en:"Go to home", es:"Ir al inicio", fr:"Aller à l'accueil" },
  lbl_para:     { pt:"Para", en:"For", es:"Para", fr:"Pour" },
  lbl_servico:  { pt:"Serviço", en:"Service", es:"Servicio", fr:"Service" },
  lbl_barbeiro: { pt:"Barbeiro", en:"Barber", es:"Barbero", fr:"Coiffeur" },
  lbl_data:     { pt:"Data", en:"Date", es:"Fecha", fr:"Date" },
  lbl_horario:  { pt:"Horário", en:"Time", es:"Hora", fr:"Heure" },
  lbl_local:    { pt:"Local", en:"Location", es:"Lugar", fr:"Lieu" },
  ok_lembrete:  { pt:"Você receberá lembretes no WhatsApp: 24h e 1h antes.", en:"You'll get WhatsApp reminders: 24h and 1h before.", es:"Recibirás recordatorios por WhatsApp: 24h y 1h antes.", fr:"Vous recevrez des rappels WhatsApp : 24h et 1h avant." },
  // perfil
  pf_titulo:    { pt:"Seu perfil", en:"Your profile", es:"Tu perfil", fr:"Votre profil" },
  pf_seus_dados:{ pt:"Seus dados", en:"Your details", es:"Tus datos", fr:"Vos informations" },
  pf_editar:    { pt:"Editar ✎", en:"Edit ✎", es:"Editar ✎", fr:"Modifier ✎" },
  pf_idade:     { pt:"Idade", en:"Age", es:"Edad", fr:"Âge" },
  pf_dependentes:{ pt:"Dependentes", en:"Dependents", es:"Dependientes", fr:"Proches" },
  pf_fidelidade:{ pt:"Nível de fidelidade", en:"Loyalty level", es:"Nivel de fidelidad", fr:"Niveau de fidélité" },
  pf_visitas:   { pt:"Visitas", en:"Visits", es:"Visitas", fr:"Visites" },
  pf_prox_nivel:{ pt:"Próximo nível", en:"Next level", es:"Próximo nivel", fr:"Niveau suivant" },
  pf_max:       { pt:"Máximo atingido", en:"Max reached", es:"Máximo alcanzado", fr:"Maximum atteint" },
  pf_faltam:    { pt:"faltam", en:"left", es:"faltan", fr:"restants" },
  pf_sair:      { pt:"Sair / trocar de número", en:"Log out / change number", es:"Salir / cambiar número", fr:"Quitter / changer de numéro" },
  // editar perfil
  ed_titulo:    { pt:"Editar perfil", en:"Edit profile", es:"Editar perfil", fr:"Modifier le profil" },
  ed_sub:       { pt:"Atualize seus dados — todos obrigatórios.", en:"Update your details — all required.", es:"Actualiza tus datos — todos obligatorios.", fr:"Mettez à jour vos informations — toutes obligatoires." },
  ed_salvar:    { pt:"Salvar alterações", en:"Save changes", es:"Guardar cambios", fr:"Enregistrer" },
  ed_salvando:  { pt:"Salvando…", en:"Saving…", es:"Guardando…", fr:"Enregistrement…" },
  ed_wpp_aviso: { pt:"Para mudar o WhatsApp, use “Sair / trocar de número” na tela anterior.", en:"To change WhatsApp, use \"Log out / change number\" on the previous screen.", es:"Para cambiar el WhatsApp, usa \"Salir / cambiar número\" en la pantalla anterior.", fr:"Pour changer de WhatsApp, utilisez « Quitter / changer de numéro » sur l'écran précédent." },
  ed_perfil_ok: { pt:"Perfil atualizado!", en:"Profile updated!", es:"¡Perfil actualizado!", fr:"Profil mis à jour !" },
  // agenda/histórico
  ag_titulo:    { pt:"Seus agendamentos", en:"Your appointments", es:"Tus reservas", fr:"Vos rendez-vous" },
  ag_n_um:      { pt:"agendamento", en:"appointment", es:"reserva", fr:"rendez-vous" },
  ag_n_varios:  { pt:"agendamentos", en:"appointments", es:"reservas", fr:"rendez-vous" },
  ag_vazio:     { pt:"Você ainda não tem agendamentos registrados.", en:"You have no appointments yet.", es:"Aún no tienes reservas registradas.", fr:"Vous n'avez pas encore de rendez-vous." },
  // home
  hm_proximo:   { pt:"Seu próximo horário", en:"Your next appointment", es:"Tu próximo horario", fr:"Votre prochain rendez-vous" },
  hm_nenhum:    { pt:"Nenhum horário marcado", en:"No appointment scheduled", es:"Ningún horario reservado", fr:"Aucun rendez-vous prévu" },
  hm_que_tal:   { pt:"Que tal agendar agora?", en:"How about booking now?", es:"¿Qué tal reservar ahora?", fr:"Et si vous réserviez maintenant ?" },
  insp_hoje:    { pt:"Hoje também se celebra: ", en:"Also celebrated today: ", es:"Hoy también se celebra: ", fr:"Aujourd'hui on célèbre aussi : " },
  t3_escolha_dia:{ pt:"Escolha um dia acima para ver os horários.", en:"Pick a day above to see available times.", es:"Elige un día arriba para ver los horarios.", fr:"Choisissez un jour ci-dessus pour voir les créneaux." },
  t3_buscando:  { pt:"Buscando horários disponíveis…", en:"Finding available times…", es:"Buscando horarios disponibles…", fr:"Recherche des créneaux disponibles…" },
  hm_agendar:   { pt:"Agendar horário", en:"Book appointment", es:"Reservar horario", fr:"Prendre rendez-vous" },
  st_confirmado:{ pt:"Confirmado", en:"Confirmed", es:"Confirmado", fr:"Confirmé" },
  st_proximo:   { pt:"Próximo", en:"Upcoming", es:"Próximo", fr:"À venir" },
  st_realizado: { pt:"Realizado", en:"Completed", es:"Realizado", fr:"Effectué" },
  ac_reagendar: { pt:"Reagendar", en:"Reschedule", es:"Reprogramar", fr:"Reporter" },
  ac_cancelar:  { pt:"Cancelar", en:"Cancel", es:"Cancelar", fr:"Annuler" },
  carregando:   { pt:"Carregando…", en:"Loading…", es:"Cargando…", fr:"Chargement…" },
  carregando_ag:{ pt:"Carregando seus agendamentos…", en:"Loading your appointments…", es:"Cargando tus reservas…", fr:"Chargement de vos rendez-vous…" },
  pix_label:    { pt:"Pix copia e cola:", en:"Pix copy & paste:", es:"Pix copiar y pegar:", fr:"Pix copier-coller :" },
  pix_copiar:   { pt:"Copiar código Pix", en:"Copy Pix code", es:"Copiar código Pix", fr:"Copier le code Pix" },
  pix_copiado:  { pt:"Copiado!", en:"Copied!", es:"¡Copiado!", fr:"Copié !" },
};
const traduzir = (idioma, chave, repl) => {
  const e = STRINGS[chave];
  let s = (e && (e[idioma] || e.pt)) || chave;
  if (repl) Object.keys(repl).forEach(k => { s = s.replace("{"+k+"}", repl[k]); });
  return s;
};

// ─── HELPERS ────────────────────────────────────────────────────────────
const money = (v) => `R$ ${Number(v||0).toFixed(2).replace(".",",")}`;
const maskTel = (v) => {
  const d = String(v).replace(/\D/g,"").slice(0,11);
  if (d.length<=2) return d;
  if (d.length<=7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
};
const telLimpo = (v) => String(v).replace(/\D/g,"");

// Bandeira gerada a partir do código ISO de 2 letras (BR → 🇧🇷). Evita digitar emoji.
const flagEmoji = (iso) => String(iso||"").toUpperCase().replace(/[A-Z]/g, c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65));
// Países para o seletor de DDI (Brasil primeiro; resto em ordem alfabética).
const PAISES = [
  { nome:"Brasil", iso:"BR", ddi:"55" },
  { nome:"Afeganistão", iso:"AF", ddi:"93" },
  { nome:"África do Sul", iso:"ZA", ddi:"27" },
  { nome:"Albânia", iso:"AL", ddi:"355" },
  { nome:"Alemanha", iso:"DE", ddi:"49" },
  { nome:"Andorra", iso:"AD", ddi:"376" },
  { nome:"Angola", iso:"AO", ddi:"244" },
  { nome:"Anguila", iso:"AI", ddi:"1" },
  { nome:"Antígua e Barbuda", iso:"AG", ddi:"1" },
  { nome:"Arábia Saudita", iso:"SA", ddi:"966" },
  { nome:"Argélia", iso:"DZ", ddi:"213" },
  { nome:"Argentina", iso:"AR", ddi:"54" },
  { nome:"Armênia", iso:"AM", ddi:"374" },
  { nome:"Aruba", iso:"AW", ddi:"297" },
  { nome:"Austrália", iso:"AU", ddi:"61" },
  { nome:"Áustria", iso:"AT", ddi:"43" },
  { nome:"Azerbaijão", iso:"AZ", ddi:"994" },
  { nome:"Bahamas", iso:"BS", ddi:"1" },
  { nome:"Bangladesh", iso:"BD", ddi:"880" },
  { nome:"Barbados", iso:"BB", ddi:"1" },
  { nome:"Barein", iso:"BH", ddi:"973" },
  { nome:"Bélgica", iso:"BE", ddi:"32" },
  { nome:"Belize", iso:"BZ", ddi:"501" },
  { nome:"Benin", iso:"BJ", ddi:"229" },
  { nome:"Bermudas", iso:"BM", ddi:"1" },
  { nome:"Bielorrússia", iso:"BY", ddi:"375" },
  { nome:"Bolívia", iso:"BO", ddi:"591" },
  { nome:"Bósnia e Herzegovina", iso:"BA", ddi:"387" },
  { nome:"Botsuana", iso:"BW", ddi:"267" },
  { nome:"Brunei", iso:"BN", ddi:"673" },
  { nome:"Bulgária", iso:"BG", ddi:"359" },
  { nome:"Burquina Faso", iso:"BF", ddi:"226" },
  { nome:"Burundi", iso:"BI", ddi:"257" },
  { nome:"Butão", iso:"BT", ddi:"975" },
  { nome:"Cabo Verde", iso:"CV", ddi:"238" },
  { nome:"Camarões", iso:"CM", ddi:"237" },
  { nome:"Camboja", iso:"KH", ddi:"855" },
  { nome:"Canadá", iso:"CA", ddi:"1" },
  { nome:"Catar", iso:"QA", ddi:"974" },
  { nome:"Cazaquistão", iso:"KZ", ddi:"7" },
  { nome:"Chade", iso:"TD", ddi:"235" },
  { nome:"Chile", iso:"CL", ddi:"56" },
  { nome:"China", iso:"CN", ddi:"86" },
  { nome:"Chipre", iso:"CY", ddi:"357" },
  { nome:"Cingapura", iso:"SG", ddi:"65" },
  { nome:"Colômbia", iso:"CO", ddi:"57" },
  { nome:"Comores", iso:"KM", ddi:"269" },
  { nome:"Congo", iso:"CG", ddi:"242" },
  { nome:"Congo (RDC)", iso:"CD", ddi:"243" },
  { nome:"Coreia do Norte", iso:"KP", ddi:"850" },
  { nome:"Coreia do Sul", iso:"KR", ddi:"82" },
  { nome:"Costa do Marfim", iso:"CI", ddi:"225" },
  { nome:"Costa Rica", iso:"CR", ddi:"506" },
  { nome:"Croácia", iso:"HR", ddi:"385" },
  { nome:"Cuba", iso:"CU", ddi:"53" },
  { nome:"Dinamarca", iso:"DK", ddi:"45" },
  { nome:"Djibuti", iso:"DJ", ddi:"253" },
  { nome:"Dominica", iso:"DM", ddi:"1" },
  { nome:"Egito", iso:"EG", ddi:"20" },
  { nome:"El Salvador", iso:"SV", ddi:"503" },
  { nome:"Emirados Árabes Unidos", iso:"AE", ddi:"971" },
  { nome:"Equador", iso:"EC", ddi:"593" },
  { nome:"Eritreia", iso:"ER", ddi:"291" },
  { nome:"Eslováquia", iso:"SK", ddi:"421" },
  { nome:"Eslovênia", iso:"SI", ddi:"386" },
  { nome:"Espanha", iso:"ES", ddi:"34" },
  { nome:"Estados Unidos", iso:"US", ddi:"1" },
  { nome:"Estônia", iso:"EE", ddi:"372" },
  { nome:"Eswatini", iso:"SZ", ddi:"268" },
  { nome:"Etiópia", iso:"ET", ddi:"251" },
  { nome:"Fiji", iso:"FJ", ddi:"679" },
  { nome:"Filipinas", iso:"PH", ddi:"63" },
  { nome:"Finlândia", iso:"FI", ddi:"358" },
  { nome:"França", iso:"FR", ddi:"33" },
  { nome:"Gabão", iso:"GA", ddi:"241" },
  { nome:"Gâmbia", iso:"GM", ddi:"220" },
  { nome:"Gana", iso:"GH", ddi:"233" },
  { nome:"Geórgia", iso:"GE", ddi:"995" },
  { nome:"Granada", iso:"GD", ddi:"1" },
  { nome:"Grécia", iso:"GR", ddi:"30" },
  { nome:"Groenlândia", iso:"GL", ddi:"299" },
  { nome:"Guadalupe", iso:"GP", ddi:"590" },
  { nome:"Guatemala", iso:"GT", ddi:"502" },
  { nome:"Guiana", iso:"GY", ddi:"592" },
  { nome:"Guiana Francesa", iso:"GF", ddi:"594" },
  { nome:"Guiné", iso:"GN", ddi:"224" },
  { nome:"Guiné Equatorial", iso:"GQ", ddi:"240" },
  { nome:"Guiné-Bissau", iso:"GW", ddi:"245" },
  { nome:"Haiti", iso:"HT", ddi:"509" },
  { nome:"Holanda (Países Baixos)", iso:"NL", ddi:"31" },
  { nome:"Honduras", iso:"HN", ddi:"504" },
  { nome:"Hong Kong", iso:"HK", ddi:"852" },
  { nome:"Hungria", iso:"HU", ddi:"36" },
  { nome:"Iêmen", iso:"YE", ddi:"967" },
  { nome:"Ilhas Cayman", iso:"KY", ddi:"1" },
  { nome:"Ilhas Maldivas", iso:"MV", ddi:"960" },
  { nome:"Ilhas Salomão", iso:"SB", ddi:"677" },
  { nome:"Índia", iso:"IN", ddi:"91" },
  { nome:"Indonésia", iso:"ID", ddi:"62" },
  { nome:"Irã", iso:"IR", ddi:"98" },
  { nome:"Iraque", iso:"IQ", ddi:"964" },
  { nome:"Irlanda", iso:"IE", ddi:"353" },
  { nome:"Islândia", iso:"IS", ddi:"354" },
  { nome:"Israel", iso:"IL", ddi:"972" },
  { nome:"Itália", iso:"IT", ddi:"39" },
  { nome:"Jamaica", iso:"JM", ddi:"1" },
  { nome:"Japão", iso:"JP", ddi:"81" },
  { nome:"Jordânia", iso:"JO", ddi:"962" },
  { nome:"Kosovo", iso:"XK", ddi:"383" },
  { nome:"Kuwait", iso:"KW", ddi:"965" },
  { nome:"Laos", iso:"LA", ddi:"856" },
  { nome:"Lesoto", iso:"LS", ddi:"266" },
  { nome:"Letônia", iso:"LV", ddi:"371" },
  { nome:"Líbano", iso:"LB", ddi:"961" },
  { nome:"Libéria", iso:"LR", ddi:"231" },
  { nome:"Líbia", iso:"LY", ddi:"218" },
  { nome:"Liechtenstein", iso:"LI", ddi:"423" },
  { nome:"Lituânia", iso:"LT", ddi:"370" },
  { nome:"Luxemburgo", iso:"LU", ddi:"352" },
  { nome:"Macau", iso:"MO", ddi:"853" },
  { nome:"Macedônia do Norte", iso:"MK", ddi:"389" },
  { nome:"Madagascar", iso:"MG", ddi:"261" },
  { nome:"Malásia", iso:"MY", ddi:"60" },
  { nome:"Malaui", iso:"MW", ddi:"265" },
  { nome:"Maldivas", iso:"MV", ddi:"960" },
  { nome:"Mali", iso:"ML", ddi:"223" },
  { nome:"Malta", iso:"MT", ddi:"356" },
  { nome:"Marrocos", iso:"MA", ddi:"212" },
  { nome:"Martinica", iso:"MQ", ddi:"596" },
  { nome:"Maurício", iso:"MU", ddi:"230" },
  { nome:"Mauritânia", iso:"MR", ddi:"222" },
  { nome:"México", iso:"MX", ddi:"52" },
  { nome:"Mianmar", iso:"MM", ddi:"95" },
  { nome:"Micronésia", iso:"FM", ddi:"691" },
  { nome:"Moçambique", iso:"MZ", ddi:"258" },
  { nome:"Moldávia", iso:"MD", ddi:"373" },
  { nome:"Mônaco", iso:"MC", ddi:"377" },
  { nome:"Mongólia", iso:"MN", ddi:"976" },
  { nome:"Montenegro", iso:"ME", ddi:"382" },
  { nome:"Namíbia", iso:"NA", ddi:"264" },
  { nome:"Nepal", iso:"NP", ddi:"977" },
  { nome:"Nicarágua", iso:"NI", ddi:"505" },
  { nome:"Níger", iso:"NE", ddi:"227" },
  { nome:"Nigéria", iso:"NG", ddi:"234" },
  { nome:"Noruega", iso:"NO", ddi:"47" },
  { nome:"Nova Caledônia", iso:"NC", ddi:"687" },
  { nome:"Nova Zelândia", iso:"NZ", ddi:"64" },
  { nome:"Omã", iso:"OM", ddi:"968" },
  { nome:"Palau", iso:"PW", ddi:"680" },
  { nome:"Palestina", iso:"PS", ddi:"970" },
  { nome:"Panamá", iso:"PA", ddi:"507" },
  { nome:"Papua-Nova Guiné", iso:"PG", ddi:"675" },
  { nome:"Paquistão", iso:"PK", ddi:"92" },
  { nome:"Paraguai", iso:"PY", ddi:"595" },
  { nome:"Peru", iso:"PE", ddi:"51" },
  { nome:"Polinésia Francesa", iso:"PF", ddi:"689" },
  { nome:"Polônia", iso:"PL", ddi:"48" },
  { nome:"Porto Rico", iso:"PR", ddi:"1" },
  { nome:"Portugal", iso:"PT", ddi:"351" },
  { nome:"Quênia", iso:"KE", ddi:"254" },
  { nome:"Quirguistão", iso:"KG", ddi:"996" },
  { nome:"Reino Unido", iso:"GB", ddi:"44" },
  { nome:"República Centro-Africana", iso:"CF", ddi:"236" },
  { nome:"República Dominicana", iso:"DO", ddi:"1" },
  { nome:"República Tcheca", iso:"CZ", ddi:"420" },
  { nome:"Romênia", iso:"RO", ddi:"40" },
  { nome:"Ruanda", iso:"RW", ddi:"250" },
  { nome:"Rússia", iso:"RU", ddi:"7" },
  { nome:"Samoa", iso:"WS", ddi:"685" },
  { nome:"San Marino", iso:"SM", ddi:"378" },
  { nome:"Santa Lúcia", iso:"LC", ddi:"1" },
  { nome:"São Cristóvão e Névis", iso:"KN", ddi:"1" },
  { nome:"São Tomé e Príncipe", iso:"ST", ddi:"239" },
  { nome:"São Vicente e Granadinas", iso:"VC", ddi:"1" },
  { nome:"Senegal", iso:"SN", ddi:"221" },
  { nome:"Serra Leoa", iso:"SL", ddi:"232" },
  { nome:"Sérvia", iso:"RS", ddi:"381" },
  { nome:"Seychelles", iso:"SC", ddi:"248" },
  { nome:"Síria", iso:"SY", ddi:"963" },
  { nome:"Somália", iso:"SO", ddi:"252" },
  { nome:"Sri Lanka", iso:"LK", ddi:"94" },
  { nome:"Sudão", iso:"SD", ddi:"249" },
  { nome:"Sudão do Sul", iso:"SS", ddi:"211" },
  { nome:"Suécia", iso:"SE", ddi:"46" },
  { nome:"Suíça", iso:"CH", ddi:"41" },
  { nome:"Suriname", iso:"SR", ddi:"597" },
  { nome:"Tailândia", iso:"TH", ddi:"66" },
  { nome:"Taiwan", iso:"TW", ddi:"886" },
  { nome:"Tajiquistão", iso:"TJ", ddi:"992" },
  { nome:"Tanzânia", iso:"TZ", ddi:"255" },
  { nome:"Timor-Leste", iso:"TL", ddi:"670" },
  { nome:"Togo", iso:"TG", ddi:"228" },
  { nome:"Tonga", iso:"TO", ddi:"676" },
  { nome:"Trinidad e Tobago", iso:"TT", ddi:"1" },
  { nome:"Tunísia", iso:"TN", ddi:"216" },
  { nome:"Turcomenistão", iso:"TM", ddi:"993" },
  { nome:"Turquia", iso:"TR", ddi:"90" },
  { nome:"Ucrânia", iso:"UA", ddi:"380" },
  { nome:"Uganda", iso:"UG", ddi:"256" },
  { nome:"Uruguai", iso:"UY", ddi:"598" },
  { nome:"Uzbequistão", iso:"UZ", ddi:"998" },
  { nome:"Vanuatu", iso:"VU", ddi:"678" },
  { nome:"Vaticano", iso:"VA", ddi:"379" },
  { nome:"Venezuela", iso:"VE", ddi:"58" },
  { nome:"Vietnã", iso:"VN", ddi:"84" },
  { nome:"Zâmbia", iso:"ZM", ddi:"260" },
  { nome:"Zimbábue", iso:"ZW", ddi:"263" },
];
// número final guardado: Brasil = só os dígitos (como sempre foi, p/ não perder
// cadastros); outros países = DDI + dígitos.
const numeroFinal = (ddi, tel) => String(ddi)==="55" ? telLimpo(tel) : String(ddi)+telLimpo(tel);
// exibição amigável do telefone (respeita o país)
const telExibe = (ddi, tel) => String(ddi)==="55" ? maskTel(tel) : `+${ddi} ${telLimpo(tel)}`;
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

// Mostra a data de nascimento sempre como DD/MM/AAAA, não importa se veio como
// "21/12/1990", "1990-12-21" ou "1990-12-21T02:00:00.000Z" (data da planilha).
const nascBR = (v) => {
  const iso = nascParaInput(v);                 // normaliza p/ yyyy-mm-dd
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "—";
};


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
        <IdiomaToggle />
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
// Botão de idioma: mostra a bandeira atual e cicla para o próximo idioma ao tocar.
const IdiomaToggle = () => {
  const T = useT();
  const idioma = useIdioma();
  const i = Math.max(0, IDIOMAS.findIndex(x=>x.cod===idioma));
  const trocar = () => { const prox = IDIOMAS[(i+1) % IDIOMAS.length]; window.dispatchEvent(new CustomEvent("aq-set-idioma", { detail: prox.cod })); };
  return (
    <button onClick={trocar} aria-label="Mudar idioma" title={IDIOMAS[i].nome} className="aq-btn" style={{
      position:"absolute",top:14,right:64,zIndex:50,height:40,padding:"0 10px",borderRadius:12,cursor:"pointer",gap:5,
      border:`1px solid ${T.line}`,background:T.card,color:T.ink,fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",
      transition:"all .2s",fontFamily:T.sans,fontWeight:700,
    }}>{IDIOMAS[i].flag}<span style={{fontSize:11,color:T.muted}}>{IDIOMAS[i].cod.toUpperCase()}</span></button>
  );
};

const Header = ({ titulo, sub, onBack }) => {
  const T = useT();
  const idioma = useIdioma();
  return (
    <div style={{padding:"20px 22px 8px"}}>
      {onBack && (
        <button onClick={onBack} className="aq-btn" style={{border:"none",background:"none",color:T.muted,fontSize:14,cursor:"pointer",padding:"4px 0",marginBottom:8,fontFamily:T.sans}}>
          {traduzir(idioma,"voltar")}
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
  const idioma = useIdioma();
  const t = (k) => traduzir(idioma, k);
  const inputRef = useRef(null);
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
      <div onClick={()=>!enviando && inputRef.current && inputRef.current.click()}
        style={{width:96,height:96,borderRadius:"50%",cursor:enviando?"default":"pointer",position:"relative",
          background:fotoUrl?`#000 center/cover url(${fotoUrl})`:`linear-gradient(135deg,${T.brass},${T.brassDeep})`,
          display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:700,fontSize:34,
          border:`2px solid ${T.brassLine}`,boxShadow:T.shadowBtn,overflow:"hidden"}}>
        {!fotoUrl && !enviando && (iniciais || "?")}
        {enviando && <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:600}}>{t("foto_enviando")}</div>}
        {!enviando && (
          <div style={{position:"absolute",right:0,bottom:0,width:30,height:30,borderRadius:"50%",background:T.brass,border:`2px solid ${T.bg}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>📷</div>
        )}
      </div>
      <button onClick={()=>!enviando && inputRef.current && inputRef.current.click()} className="aq-btn"
        style={{background:"none",border:"none",color:T.brass,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:T.sans}}>
        {fotoUrl ? t("foto_trocar") : t("foto_add")}
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
  const idioma = useIdioma();
  const t = (k) => traduzir(idioma, k);
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
        <span style={{fontSize:14,fontWeight:600,color:T.ink2}}>{t("dep_toggle")}</span>
      </label>
      {ligado && (
        <div style={{marginTop:12}}>
          {deps.map((d,i)=>{
            const idade = calcIdade(d.nascimento);
            return (
              <div key={i} style={{marginBottom:12,paddingBottom:12,borderBottom:i<deps.length-1?`1px dashed ${T.line}`:"none"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span style={{fontSize:12,fontWeight:700,color:T.muted}}>{t("dep_label")} {i+1}{idade?` · ${idade}`:""}</span>
                  <button onClick={()=>remover(i)} className="aq-btn" style={{background:"none",border:"none",color:T.danger,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:T.sans,padding:0}}>{t("dep_remover")}</button>
                </div>
                <input value={d.nome} onChange={(e)=>setCampo(i,"nome",e.target.value)} placeholder={t("dep_nome_ph")}
                  style={inputBase} onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
                <input value={d.nascimento} onChange={(e)=>setCampo(i,"nascimento",e.target.value)} type="date" max={hojeISO()} min="1900-01-01"
                  style={{...inputBase,marginTop:8,colorScheme:T.name==="dark"?"dark":"light"}}
                  onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
              </div>
            );
          })}
          <button onClick={adicionar} className="aq-btn" style={{width:"100%",padding:"11px",marginBottom:10,borderRadius:11,border:`1.5px dashed ${T.line}`,background:"transparent",color:T.brass,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:T.sans}}>{t("dep_add")}</button>
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
  const idioma = useIdioma();
  const t = (k) => traduzir(idioma, k);
  const tabs = [
    { id:HOME,   icon:"home",     label:t("nav_inicio")  },
    { id:1,      icon:"calendar", label:t("nav_agendar") },
    { id:HIST,   icon:"clock",    label:t("nav_agenda")  },
    { id:PERFIL, icon:"user",     label:t("nav_perfil")  },
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
  const idioma = useIdioma();
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
          <span style={{color:T.muted}}>{traduzir(idioma,"insp_hoje")}</span>{coms.join(" · ")}
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
  const idioma = useIdioma();
  const t = (k, r) => traduzir(idioma, k, r);
  const [step, setStep] = useState(0);            // 0 tel · 1 serviço · 2 barbeiro · 3 data/hora · 4 dados · 5 sinal · 6 ok · 7 home · 8 histórico
  const [tel, setTel] = useState("");
  const [ddi, setDdi] = useState("55");   // DDI do país (Brasil por padrão, trocável)
  const [paisIso, setPaisIso] = useState("BR"); // ISO do país escolhido (p/ bandeira; vários dividem o DDI)
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
    const limpo = numeroFinal(ddi, tel);
    const minOk = ddi==="55" ? telLimpo(tel).length>=10 : telLimpo(tel).length>=6;
    if (!minOk) { setErro(t("t0_tel_inval")); return; }
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
    if (!nome.trim()) { setErro(t("err_nome")); return; }
    if (!sobrenome.trim()) { setErro(t("err_sobrenome")); return; }       // Fatia A
    if (!nascValido(nascimento)) {                                              // R2 — obrigatório
      setErro(t("err_nasc"));
      return;
    }
    if (!emailValido(email)) { setErro(t("err_email")); return; }  // Fatia A
    if (!fotoUrl) { setErro(t("err_foto")); return; } // obrigatória
    setErro(""); setEnviando(true);
    try {
      const r = await api.agendar({
        nome: `${nome.trim()} ${sobrenome.trim()}`,                              // junta antes de mandar
        telefone: numeroFinal(ddi, tel),
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
      else if (r && (r.success || r.id)) { setResultado(r); carregarMeus(numeroFinal(ddi, tel)); setStep(6); }
      else { setErro((r && r.error) || "Não foi possível concluir. Tente outro horário."); }
    } catch (e) { setErro("Falha de conexão. Verifique sua internet e tente de novo."); }
    setEnviando(false);
  };

  // ── confirmar reagendamento (mesmo agendamento, nova data/hora) ──
  const confirmarReagendamento = async () => {
    setErro(""); setEnviando(true);
    try {
      const r = await api.reagendar(reagendandoId, isoDate(dataSel), horaSel, numeroFinal(ddi, tel));
      if (r && (r.success || r._demo)) {
        setReagendandoId(null); setServSel(null); setDataSel(null); setHoraSel(null);
        await carregarMeus(numeroFinal(ddi, tel));
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
      const r = await api.cancelar(ag.id, numeroFinal(ddi, tel));
      if (r && (r.success || r._demo)) {
        await carregarMeus(numeroFinal(ddi, tel));
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
    if (!nome.trim()) { setErro(t("err_nome")); return; }
    if (!sobrenome.trim()) { setErro(t("err_sobrenome")); return; }
    if (!nascValido(nascimento)) { setErro(t("err_nasc")); return; }
    if (!emailValido(email)) { setErro(t("err_email")); return; }
    if (!fotoUrl) { setErro(t("err_foto")); return; }
    setErro(""); setSalvandoPerfil(true);
    try {
      const r = await api.atualizarPerfil({
        tel: numeroFinal(ddi, tel),
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
        setAviso({ tipo:"ok", txt:t("ed_perfil_ok") });
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
    setStep(0); setTel(""); setDdi("55"); setPaisIso("BR"); setServSel(null); setBarbSel(null); setDataSel(null); setHoraSel(null);
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
    if ((destino === HOME || destino === HIST) && tel && ENV.hasBackend) carregarMeus(numeroFinal(ddi, tel));
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
        <h1 style={{fontFamily:T.serif,fontWeight:600,fontSize:24,margin:"0 0 6px",lineHeight:1.2,color:T.ink}}>{t("t0_titulo")}</h1>
        <p style={{color:T.muted,fontSize:14,margin:"0 0 22px"}}>{t("t0_sub")}</p>
        <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>{t("t0_label")}</label>
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <div style={{position:"relative",flexShrink:0}}>
            <select
              value={Math.max(0, PAISES.findIndex(p=>p.iso===paisIso))}
              onChange={(e)=>{ const p = PAISES[Number(e.target.value)]; setDdi(p.ddi); setPaisIso(p.iso); setTel(p.ddi==="55"?maskTel(telLimpo(tel)):telLimpo(tel)); }}
              aria-label="País / DDI"
              style={{appearance:"none",WebkitAppearance:"none",maxWidth:128,height:"100%",padding:"15px 26px 15px 14px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,color:T.ink,outline:"none",cursor:"pointer"}}>
              {PAISES.map((p,i)=>(<option key={i} value={i}>{flagEmoji(p.iso)} {p.nome} +{p.ddi}</option>))}
            </select>
            <span style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",pointerEvents:"none",color:T.muted,fontSize:11}}>▼</span>
          </div>
          <input
            value={tel} onChange={(e)=>setTel(ddi==="55"?maskTel(e.target.value):telLimpo(e.target.value).slice(0,15))} type="tel" inputMode="numeric"
            placeholder={ddi==="55"?t("t0_ph_br"):t("t0_ph_intl")} autoFocus
            style={{flex:1,minWidth:0,padding:"15px 16px",fontSize:17,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
            onFocus={(e)=>e.target.style.borderColor=T.brass}
            onBlur={(e)=>e.target.style.borderColor=T.line}
            onKeyDown={(e)=>e.key==="Enter"&&avancarTelefone()}
          />
        </div>
        {ddi!=="55" && <div style={{fontSize:11,color:T.muted,marginTop:6}}>{flagEmoji(paisIso)} {t("t0_ddi_aviso")} +{ddi} {t("t0_ddi_fim")}</div>}
        {erro && <div style={{color:T.danger,fontSize:13,marginTop:8}}>{erro}</div>}
      </div>
      <Bottom>
        <label style={{display:"flex",alignItems:"flex-start",gap:10,margin:"0 0 14px",cursor:"pointer",textAlign:"left"}}>
          <input type="checkbox" checked={aceito} onChange={(e)=>setAceito(e.target.checked)}
            style={{width:20,height:20,marginTop:1,accentColor:T.brass,flexShrink:0,cursor:"pointer"}}/>
          <span style={{fontSize:12.5,color:T.ink2,lineHeight:1.5}}>
            {t("t0_li_concordo")}{" "}
            <button type="button" onClick={(e)=>{e.preventDefault();setLegalModal("privacidade");}}
              style={{background:"none",border:"none",padding:0,color:T.brass,fontWeight:700,textDecoration:"underline",cursor:"pointer",fontSize:12.5,fontFamily:T.sans}}>{t("t0_privacidade")}</button>{" "}{t("t0_e_os")}{" "}
            <button type="button" onClick={(e)=>{e.preventDefault();setLegalModal("termos");}}
              style={{background:"none",border:"none",padding:0,color:T.brass,fontWeight:700,textDecoration:"underline",cursor:"pointer",fontSize:12.5,fontFamily:T.sans}}>{t("t0_termos")}</button>.
          </span>
        </label>
        <Primary onClick={avancarTelefone} disabled={(ddi==="55"?telLimpo(tel).length<10:telLimpo(tel).length<6) || !aceito || verificando}>{verificando?t("t0_verificando"):t("continuar")}</Primary>
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
          <div style={{fontFamily:T.serif,color:T.ink,fontWeight:700,fontSize:24,letterSpacing:"-0.01em"}}>{t("hm_proximo")}</div>
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
            <div style={{textAlign:"center",color:T.muted,fontSize:13,padding:"24px 0"}}>{t("carregando_ag")}</div>
          ) : proximoAg ? (
            <div style={{background:T.name==="dark"?`linear-gradient(135deg,#161006,${T.card})`:T.card,border:`1px solid ${T.brassLine}`,borderRadius:16,padding:"16px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div>
                  <div style={{color:T.brass,fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:4}}>{t("st_confirmado")}</div>
                  <div style={{color:T.ink,fontWeight:700,fontSize:17}}>{proximoAg.servico}</div>
                  {proximoAg.para && <div style={{color:T.brass,fontSize:12.5,fontWeight:600,marginTop:3}}>Para: {proximoAg.para}</div>}
                  <div style={{color:T.muted,fontSize:12.5,marginTop:4}}>{labelData(proximoAg._d)} · {proximoAg._h}</div>
                </div>
                <div style={{width:44,height:44,borderRadius:12,background:T.brassTint,border:`1px solid ${T.brassLine}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.brass}}><Icon name="scissors" size={22}/></div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <button onClick={()=>iniciarReagendar(proximoAg)} className="aq-btn" style={{background:T.brass,border:"none",borderRadius:10,padding:"11px",cursor:"pointer",color:"#0C0C0C",fontWeight:700,fontSize:13,fontFamily:T.sans}}>{t("ac_reagendar")}</button>
                <button onClick={()=>cancelarAg(proximoAg)} className="aq-btn" style={{background:T.name==="dark"?T.card2:T.bg1,border:`1px solid ${T.line}`,borderRadius:10,padding:"11px",cursor:"pointer",color:T.muted,fontWeight:600,fontSize:13,fontFamily:T.sans}}>{t("ac_cancelar")}</button>
              </div>
            </div>
          ) : (
            <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:"20px 16px",textAlign:"center"}}>
              <div style={{color:T.brass,marginBottom:8,display:"flex",justifyContent:"center"}}><Icon name="calendar" size={30} stroke={1.6}/></div>
              <div style={{color:T.ink,fontWeight:700,fontSize:15}}>{t("hm_nenhum")}</div>
              <div style={{color:T.muted,fontSize:13,margin:"4px 0 12px"}}>{t("hm_que_tal")}</div>
              <button onClick={()=>{ setReagendandoId(null); setServSel(null); setStep(1); }} className="aq-btn" style={{background:`linear-gradient(150deg,${T.brass},${T.brassDeep})`,border:"none",borderRadius:11,padding:"12px 22px",cursor:"pointer",color:"#fff",fontWeight:700,fontSize:14,fontFamily:T.sans}}>{t("hm_agendar")}</button>
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
        <Header titulo={t("ag_titulo")} sub={`${ordenados.length} ${ordenados.length===1?t("ag_n_um"):t("ag_n_varios")}`} onBack={()=>setStep(HOME)}/>
        <div style={{padding:"8px 22px 0",display:"flex",flexDirection:"column",gap:10}}>
          {carregandoArea ? (
            <div style={{textAlign:"center",color:T.muted,fontSize:13,padding:"30px 0"}}>{t("carregando")}</div>
          ) : ordenados.length===0 ? (
            <div style={{textAlign:"center",color:T.muted,fontSize:13,padding:"30px 0"}}>{t("ag_vazio")}</div>
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
                  <span style={{fontSize:10,fontWeight:700,padding:"3px 8px",borderRadius:99,background:futuro?T.brassTint:T.line,color:futuro?T.brass:T.muted}}>{futuro?t("st_proximo"):t("st_realizado")}</span>
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
        <Header titulo={t("pf_titulo")} onBack={()=>setStep(HOME)}/>

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
              <div style={{color:T.muted,fontSize:13,marginTop:2}}>{telExibe(ddi, tel)}</div>
            </div>
          </div>

          {/* Seus dados — leitura. Editar abre tela própria */}
          <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:"16px 18px",marginTop:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <span style={{color:T.muted,fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase"}}>{t("pf_seus_dados")}</span>
              <button onClick={()=>{ setErro(""); setStep(EDITAR_PERFIL); }} className="aq-btn" style={{background:"none",border:"none",color:T.brass,fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:T.sans,padding:0}}>{t("pf_editar")}</button>
            </div>
            <Linha label={t("t4_nome")} valor={clienteExistente?.nome || "—"}/>
            {calcIdade(nascParaInput(clienteExistente?.nascimento)) && <Linha label={t("pf_idade")} valor={calcIdade(nascParaInput(clienteExistente?.nascimento))}/>}
            <Linha label={t("t4_nascimento")} valor={nascBR(clienteExistente?.nascimento)}/>
            <Linha label={t("t4_email")} valor={clienteExistente?.email || "—"}/>
          </div>

          {/* Dependentes — nome, idade e nascimento (sem e-mail) */}
          {dependentes.length > 0 && (
            <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:"16px 18px",marginTop:12}}>
              <div style={{color:T.muted,fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:8}}>{t("pf_dependentes")}</div>
              {dependentes.map((d,i)=>(
                <div key={i} style={{paddingBottom:i<dependentes.length-1?12:0,marginBottom:i<dependentes.length-1?12:0,borderBottom:i<dependentes.length-1?`1px dashed ${T.line}`:"none"}}>
                  <div style={{color:T.ink,fontWeight:700,fontSize:15,marginBottom:4}}>{d.nome}</div>
                  {calcIdade(d.nascimento) && <Linha label={t("pf_idade")} valor={calcIdade(d.nascimento)}/>}
                  <Linha label={t("t4_nascimento")} valor={nascBR(d.nascimento)}/>
                </div>
              ))}
            </div>
          )}

          <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:"16px 18px",marginTop:12}}>
            <Linha label={t("pf_fidelidade")} valor={`✦ ${fid.nivel}`}/>
            <Linha label={t("pf_visitas")} valor={`${fid.visitas}`}/>
            <Linha label={t("pf_prox_nivel")} valor={fid.prox ? `${fid.prox} (${t("pf_faltam")} ${fid.faltam})` : t("pf_max")}/>
          </div>
          <div style={{marginTop:18}}>
            <button onClick={resetTudo} className="aq-btn" style={{width:"100%",padding:"14px",borderRadius:12,border:`1.5px solid ${T.line}`,background:"transparent",color:T.muted,fontWeight:600,fontSize:14,cursor:"pointer",fontFamily:T.sans}}>{t("pf_sair")}</button>
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
        <Header titulo={t("ed_titulo")} sub={t("ed_sub")} onBack={()=>{ setErro(""); setStep(PERFIL); }}/>
        <div style={{padding:"4px 22px 0"}}>
          <div style={{marginBottom:10,display:"flex",flexDirection:"column",alignItems:"center"}}>
            <FotoPicker fotoUrl={fotoUrl} iniciais={(nome[0]||"?").toUpperCase()} enviando={enviandoFoto} onEscolher={escolherFoto}/>
          </div>
          <div style={{marginTop:6}}>
            <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>{t("t4_nome")}</label>
            <input value={nome} onChange={(e)=>setNome(e.target.value)} placeholder="Ex.: João"
              style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
              onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
          </div>
          <div style={{marginTop:14}}>
            <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>{t("t4_sobrenome")}</label>
            <input value={sobrenome} onChange={(e)=>setSobrenome(e.target.value)} placeholder="Ex.: Silva"
              style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
              onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
          </div>
          <div style={{marginTop:14}}>
            <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>{t("t4_nascimento")}</label>
            <input value={nascimento} onChange={(e)=>setNascimento(e.target.value)} type="date" max={hojeISO()} min="1900-01-01"
              style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink,colorScheme:T.name==="dark"?"dark":"light"}}
              onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
          </div>
          <div style={{marginTop:14}}>
            <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>{t("t4_email")}</label>
            <input value={email} onChange={(e)=>setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" placeholder="seu@email.com"
              style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
              onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
          </div>
          <DependentesEditor deps={dependentes} setDeps={setDependentes} />
          <div style={{marginTop:14}}>
            <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>WhatsApp</label>
            <input value={telExibe(ddi, tel)} readOnly
              style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.bg1,fontFamily:T.sans,outline:"none",color:T.muted,cursor:"not-allowed"}}/>
            <div style={{fontSize:11,color:T.muted,marginTop:6}}>{t("ed_wpp_aviso")}</div>
          </div>
          {erro && <div style={{color:T.danger,fontSize:13,marginTop:12}}>{erro}</div>}
        </div>
        <Bottom comBarra><Primary onClick={salvarPerfil} disabled={!podeSalvar}>{salvandoPerfil?t("ed_salvando"):t("ed_salvar")}</Primary></Bottom>
        <div style={{height:80}}/>
        <BottomNav ativo={PERFIL} onNav={irPara} />
      </Shell>
    );
  }

  // PASSO 1 — Serviço
  if (step===1) return (
    <Shell step={0} total={5} onToggleTema={onToggleTema}>
      <Header titulo={t("t1_titulo")} sub={clienteExistente?`${t("t1_ola_volta")} ${primeiroNome(clienteExistente.nome)}!`:t("t1_sub")} onBack={()=> clienteExistente ? setStep(HOME) : setStep(0)}/>
      {dependentes.length > 0 && (
        <div style={{padding:"0 22px 4px"}}>
          <div style={{fontSize:13,fontWeight:600,color:T.ink2,marginBottom:8}}>{t("t1_para_quem")}</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[{nome:t("t1_para_mim"),idx:-1}, ...dependentes.map((d,i)=>({nome:primeiroNome(d.nome)||`${t("dep_label")} ${i+1}`,idx:i}))].map(opt=>{
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
      <Bottom comBarra><Primary onClick={()=>setStep(2)} disabled={!servSel}>{servSel?`${t("continuar")} · ${money(servSel.preco)}`:t("t1_selecione")}</Primary></Bottom>
      <div style={{height:80}}/>
      <BottomNav ativo={1} onNav={irPara} />
    </Shell>
  );

  // PASSO 2 — Barbeiro
  if (step===2) return (
    <Shell step={1} total={5} onToggleTema={onToggleTema}>
      <Header titulo={t("t2_titulo")} sub={t("t2_sub")} onBack={()=>setStep(1)}/>
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
      <Bottom comBarra><Primary onClick={()=>setStep(3)} disabled={!barbSel}>{t("continuar")}</Primary></Bottom>
      <div style={{height:80}}/>
      <BottomNav ativo={1} onNav={irPara} />
    </Shell>
  );

  // PASSO 3 — Data e horário (também usado no reagendamento)
  if (step===3) return (
    <Shell step={2} total={5} onToggleTema={onToggleTema}>
      <Header titulo={reagendandoId?t("t3_novo_h"):t("t3_data_hora")} sub={reagendandoId?t("t3_remarc_sub",{x:servSel?.nome}):`${servSel?.nome} · ${barbSel?.nome}`} onBack={()=> reagendandoId ? setStep(HOME) : setStep(2)}/>
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
          <div style={{textAlign:"center",color:T.muted,fontSize:13,padding:"30px 0"}}>{t("t3_escolha_dia")}</div>
        ) : loadingSlots ? (
          <div style={{textAlign:"center",color:T.muted,fontSize:13,padding:"30px 0"}}>{t("t3_buscando")}</div>
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
          ? <Primary onClick={confirmarReagendamento} disabled={!dataSel||!horaSel||enviando}>{enviando?t("t3_remarcando"):t("t3_novo_horario")}</Primary>
          : <Primary onClick={()=>setStep(4)} disabled={!dataSel||!horaSel}>{t("continuar")}</Primary>}
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
      <Header titulo={t("t4_titulo")} onBack={()=>setStep(3)}/>
      <div style={{padding:"4px 22px 0"}}>
        <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:18}}>
          {(paraQuem>=0 && dependentes[paraQuem]) && <Linha label={t("lbl_para")} valor={dependentes[paraQuem].nome}/>}
          <Linha label={t("lbl_servico")} valor={servSel?.nome}/>
          <Linha label={t("lbl_barbeiro")} valor={barbSel?.nome}/>
          <Linha label={t("lbl_data")} valor={dataSel && `${DIAS[dataSel.getDay()]}, ${dataSel.getDate()} de ${MESES_L[dataSel.getMonth()]}`}/>
          <Linha label={t("lbl_horario")} valor={horaSel}/>
          <Linha label="Duração" valor={`${servSel?.duracao} min`}/>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,paddingTop:12,borderTop:`1px dashed ${T.line}`}}>
            <span style={{fontWeight:700,fontSize:15,color:T.ink}}>Total</span>
            <span style={{fontFamily:T.serif,fontWeight:700,fontSize:22,color:T.brass}}>{money(servSel?.preco)}</span>
          </div>
        </div>
        <div style={{marginTop:6,marginBottom:4,display:"flex",flexDirection:"column",alignItems:"center"}}>
          <FotoPicker fotoUrl={fotoUrl} iniciais={(nome[0]||"?").toUpperCase()} enviando={enviandoFoto} onEscolher={escolherFoto}/>
          <div style={{fontSize:11,color:T.muted,marginTop:4,textAlign:"center"}}>{t("t4_foto_aviso")}</div>
        </div>
        <div style={{marginTop:14}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>{t("t4_nome")}</label>
          <input value={nome} onChange={(e)=>setNome(e.target.value)} placeholder="Ex.: João" autoFocus={!nome}
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
        </div>
        <div style={{marginTop:14}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>{t("t4_sobrenome")}</label>
          <input value={sobrenome} onChange={(e)=>setSobrenome(e.target.value)} placeholder="Ex.: Silva"
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
        </div>
        <div style={{marginTop:14}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>{t("t4_nascimento")}</label>
          <input
            value={nascimento}
            onChange={(e)=>setNascimento(e.target.value)}
            type="date"
            max={hojeISO()}
            min="1900-01-01"
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink,colorScheme:T.name==="dark"?"dark":"light"}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
          <div style={{fontSize:11,color:T.muted,marginTop:6}}>{t("t4_nasc_aviso")}</div>
        </div>
        <div style={{marginTop:14}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>{t("t4_email")}</label>
          <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="seu@email.com" type="email" inputMode="email" autoComplete="email"
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:16,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
        </div>
        <DependentesEditor deps={dependentes} setDeps={setDependentes} />
        <div style={{marginTop:14}}>
          <label style={{fontSize:13,fontWeight:600,color:T.ink2}}>{t("t4_obs")} <span style={{color:T.muted,fontWeight:400}}>{t("t4_opcional")}</span></label>
          <input value={obs} onChange={(e)=>setObs(e.target.value)} placeholder={t("t4_obs_ph")}
            style={{width:"100%",marginTop:8,padding:"14px 16px",fontSize:15,borderRadius:13,border:`1.5px solid ${T.line}`,background:T.card,fontFamily:T.sans,outline:"none",color:T.ink}}
            onFocus={(e)=>e.target.style.borderColor=T.brass} onBlur={(e)=>e.target.style.borderColor=T.line}/>
        </div>
        {erro && <div style={{color:T.danger,fontSize:13,marginTop:12}}>{erro}</div>}
      </div>
      <Bottom comBarra={!reagendandoId}><Primary onClick={confirmar} disabled={enviando||enviandoFoto||!nome.trim()||!sobrenome.trim()||!nascValido(nascimento)||!emailValido(email)||!fotoUrl}>{enviando?t("t4_confirmando"):t("t4_confirmar")}</Primary></Bottom>
      {!reagendandoId && (<>
        <div style={{height:80}}/>
        <BottomNav ativo={1} onNav={irPara} />
      </>)}
    </Shell>
  );

  // PASSO 5 — Sinal (Pix)
  if (step===5) return (
    <Shell onToggleTema={onToggleTema}>
      <Header titulo={t("t5_titulo")} sub={t("t5_sub")}/>
      <div style={{padding:"4px 22px 0"}}>
        <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:20,textAlign:"center"}}>
          <div style={{fontSize:13,color:T.muted}}>Valor do sinal ({resultado?.sinalPct||30}%)</div>
          <div style={{fontFamily:T.serif,fontWeight:700,fontSize:30,color:T.brass,margin:"4px 0 14px"}}>{money(resultado?.valorSinal)}</div>
          {resultado?.pix?.qrCodeBase64 && (
            <img src={`data:image/png;base64,${resultado.pix.qrCodeBase64}`} alt="QR Code Pix" style={{width:200,height:200,margin:"0 auto",display:"block",borderRadius:12}}/>
          )}
          {resultado?.pix?.copiaECola && (
            <div style={{marginTop:14}}>
              <div style={{fontSize:12,color:T.muted,marginBottom:6}}>{t("pix_label")}</div>
              <div style={{background:T.bg1,border:`1px solid ${T.line}`,borderRadius:10,padding:"10px 12px",fontSize:11,wordBreak:"break-all",fontFamily:"monospace",color:T.ink2}}>{resultado.pix.copiaECola}</div>
              <button className="aq-btn" onClick={()=>{navigator.clipboard?.writeText(resultado.pix.copiaECola);}} style={{marginTop:10,width:"100%",padding:"12px",borderRadius:11,border:`1.5px solid ${T.brass}`,background:T.brassTint,color:T.brass,fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:T.sans}}>{t("pix_copiar")}</button>
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
        <h1 style={{fontFamily:T.serif,fontWeight:700,fontSize:28,margin:"0 0 8px",color:T.ink}}>{t("ok_titulo")}</h1>
        <p style={{color:T.muted,fontSize:15,margin:"0 0 24px",lineHeight:1.5}}>{primeiroNome(nome)}, {(paraQuem>=0 && dependentes[paraQuem]) ? t("ok_dep_garantido",{x:primeiroNome(dependentes[paraQuem].nome)}) : t("ok_garantido")}</p>
      </div>
      <div style={{padding:"0 22px"}}>
        <div style={{background:T.card,border:`1px solid ${T.line}`,borderRadius:16,padding:18,textAlign:"left"}}>
          {(paraQuem>=0 && dependentes[paraQuem]) && <Linha label={t("lbl_para")} valor={dependentes[paraQuem].nome}/>}
          <Linha label={t("lbl_servico")} valor={servSel?.nome}/>
          <Linha label={t("lbl_barbeiro")} valor={barbSel?.nome}/>
          <Linha label={t("lbl_data")} valor={dataSel && `${DIAS[dataSel.getDay()]}, ${dataSel.getDate()}/${String(dataSel.getMonth()+1).padStart(2,"0")}`}/>
          <Linha label={t("lbl_horario")} valor={horaSel}/>
          <Linha label={t("lbl_local")} valor={BARBEARIA.endereco}/>
        </div>
        {(resultado?.demo||demo) && <p style={{textAlign:"center",fontSize:11,color:T.muted,marginTop:14}}>Modo demonstração — conecte o backend (VITE_GAS_URL) para gravar de verdade.</p>}
        {!(resultado?.demo||demo) && <p style={{textAlign:"center",fontSize:13,color:T.muted,marginTop:16,lineHeight:1.5}}>{t("ok_lembrete")}</p>}
      </div>
      <Bottom>
        <Primary onClick={novoAgendamento}>{t("ok_novo")}</Primary>
        <button onClick={()=>setStep(HOME)} className="aq-btn" style={{width:"100%",marginTop:10,padding:"14px",borderRadius:13,border:`1.5px solid ${T.line}`,background:"transparent",color:T.ink2,fontWeight:600,fontSize:15,cursor:"pointer",fontFamily:T.sans}}>{t("ok_inicio")}</button>
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
  const [idioma, setIdioma] = useState(lerIdioma);
  useEffect(() => {
    const h = () => setTema(t => { const novo = t === "dark" ? "light" : "dark"; salvarTema(novo); return novo; });
    const hi = (e) => setIdioma(() => { const novo = e.detail; salvarIdioma(novo); return novo; });
    window.addEventListener("aq-toggle-tema", h);
    window.addEventListener("aq-set-idioma", hi);
    return () => { window.removeEventListener("aq-toggle-tema", h); window.removeEventListener("aq-set-idioma", hi); };
  }, []);
  return (
    <ThemeCtx.Provider value={THEMES[tema]}>
      <IdiomaCtx.Provider value={idioma}>
        <Portal />
      </IdiomaCtx.Provider>
    </ThemeCtx.Provider>
  );
}

