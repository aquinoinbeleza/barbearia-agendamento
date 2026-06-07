/**
 * ════════════════════════════════════════════════════════════════════════
 *  AQUINO Barbearia & Estética — Backend (Google Apps Script)
 *
 *  Agendamento, CRM, fidelidade, financeiro e integração com WhatsApp.
 *
 *   • Planilhas: Clientes / Agendamentos / Financeiro / Serviços / Fila / Métricas
 *   • Respostas: {success,error} e {encontrado,...}
 *   • IDs: ClienteID CLI-001 sequencial · Agendamento UUID 8 hex
 *   • Status: confirmado | presenca_confirmada | cancelado | faltou | realizado
 *   • Segurança: SITE_TOKEN, ADMIN_KEY validada no servidor, sanitização,
 *     rate limit, HMAC-SHA256 nos webhooks
 *   • Anti-spam: UltimoLembrete (col I) separado de UltimoAgendamento (col E)
 *
 *  SETUP (rode 1x no editor): setupScriptProperties → setupSheets → (opcional) criarTriggers
 *  Deploy: Implantar → App da Web → Executar como Eu · Acesso: Qualquer pessoa
 *
 *  © AQUINO. Todos os direitos reservados.
 * ════════════════════════════════════════════════════════════════════════
 */

// ─── PLANILHAS + SCHEMAS CANÔNICOS (PARTE 6.9 / 6.10) ──────────────────────
var SHEETS = { CLIENTES:'Clientes', AGENDAMENTOS:'Agendamentos', FINANCEIRO:'Financeiro', SERVICOS:'Servicos', FEEDBACKS:'Feedbacks', FILA_ESPERA:'FilaEspera', PENDENTES:'MensagensPendentes', METRICAS:'Metricas', LOG:'Log' };

var HEADERS = {
  // Email é APPEND-ONLY no fim (col J) — não desloca os índices canônicos existentes.
  // Dependentes (col K) também é append-only: JSON [{nome,nascimento}] dos filhos/dependentes.
  // Foto (col L) também é append-only: link da foto do cliente (no Google Drive).
  CLIENTES:     ['ClienteID','Telefone','Nome','NomeAbreviado','UltimoAgendamento','TotalAgendamentos','IntervaloDias','Nascimento','UltimoLembrete','Email','Dependentes','Foto'],
  // Para (col O) também é append-only: nome do dependente quando o atendimento é p/ um filho.
  AGENDAMENTOS: ['ID','Nome','NomeAbreviado','Telefone','ClienteID','Servico','Duracao','Data','Horario','Preco','Status','CriadoEm','SinalStatus','Barbeiro','Para','Observacao'],
  FINANCEIRO:   ['Data','Tipo','Categoria','Descricao','Valor','Profissional','AgendamentoID','FormaPagamento','Status'],
  SERVICOS:     ['ID','Nome','Preco','Duracao','Ativo'],
  FEEDBACKS:    ['Timestamp','ClienteID','Telefone','AgendamentoID','Nota','Comentario'],
  FILA_ESPERA:  ['ID','ClienteID','Telefone','Nome','Servico','DataDesejada','HorarioDesejado','FlexibilidadeData','Status','NotificadoEm','ExpiraEm','CriadoEm'],
  // Fila de reenvio (SEÇÃO 39 — robustez): mensagens que falharam após retry
  PENDENTES:    ['ID','Timestamp','Tipo','Destino','Conteudo','Tentativas','UltimoErro','Status'],
  // Observabilidade de negócio (SEÇÃO 41.4): log append-only de eventos
  METRICAS:     ['Timestamp','Tipo','Valor','Contexto'],
  LOG:          ['Timestamp','Nivel','Evento','Detalhe'],
};

// Índices de coluna (0-based) — espelham os mnemônicos do master
var CLI = { ID:0, TEL:1, NOME:2, ABREV:3, ULTIMO_AG:4, TOTAL:5, INTERVALO:6, NASC:7, ULTIMO_LEM:8, EMAIL:9, DEP:10, FOTO:11 };
var AG  = { ID:0, NOME:1, ABREV:2, TEL:3, CLI_ID:4, SERV:5, DUR:6, DATA:7, HORA:8, PRECO:9, STATUS:10, CRIADO:11, SINAL:12, BARBEIRO:13, PARA:14, OBS:15 };
var MP_ = { ID:0, TS:1, TIPO:2, DESTINO:3, CONTEUDO:4, TENTATIVAS:5, ERRO:6, STATUS:7 };

var STATUS = { CONFIRMADO:'confirmado', PRESENCA:'presenca_confirmada', CANCELADO:'cancelado', FALTOU:'faltou', REALIZADO:'realizado', AGUARDANDO:'aguardando_sinal' };
var AG_SINAL = 12; // coluna 13 (append-only) — SinalStatus: ''|pendente|pago|dispensado
var FE = { ID:0, CLI_ID:1, TEL:2, NOME:3, SERV:4, DATA:5, HORA:6, FLEX:7, STATUS:8, NOTIF:9, EXPIRA:10, CRIADO:11 };
var FILA_STATUS = { AGUARDANDO:'aguardando', NOTIFICADO:'notificado', CONVERTIDO:'convertido', EXPIRADO:'expirado', RECUSOU:'recusou' };

var PROP = {
  SITE_TOKEN:'SITE_TOKEN', ADMIN_KEY:'ADMIN_KEY', CONFIG_JSON:'CONFIG_JSON',
  WHATSAPP_TOKEN:'WHATSAPP_TOKEN', PHONE_NUMBER_ID:'PHONE_NUMBER_ID', VERIFY_TOKEN:'VERIFY_TOKEN',
  META_APP_SECRET:'META_APP_SECRET', SAC_NUMERO:'SAC_NUMERO', TEMPLATES_ATIVOS:'TEMPLATES_ATIVOS', GOOGLE_MAPS_LINK:'GOOGLE_MAPS_LINK',
  CALENDAR_ID:'CALENDAR_ID',
  // Cobrança / sinal (SEÇÃO 34) + Mercado Pago
  COBRANCA_MODO:'COBRANCA_MODO', COBRANCA_PERCENTUAL:'COBRANCA_PERCENTUAL',
  COBRANCA_DURACAO_MIN:'COBRANCA_DURACAO_MIN', COBRANCA_SCORE_LIMITE:'COBRANCA_SCORE_LIMITE',
  COBRANCA_HORARIOS_PREMIUM:'COBRANCA_HORARIOS_PREMIUM',
  MP_ACCESS_TOKEN:'MP_ACCESS_TOKEN', SITE_URL:'SITE_URL',
  // RBAC (SEÇÃO 23) — chaves opcionais por perfil. ADMIN_KEY = perfil admin.
  BARBEIRO_KEY:'BARBEIRO_KEY', RECEPCAO_KEY:'RECEPCAO_KEY',
  // E-mail transacional (SEÇÃO 32) + alerta de token Meta expirado (SEÇÃO 39)
  EMAIL_ATIVO:'EMAIL_ATIVO', EMAIL_DONO:'EMAIL_DONO',
};

var KEYWORDS = {
  CONFIRMAR: ['c','sim','confirmo','confirmar','ok','s'],
  CANCELAR:  ['cancelar','cancel','cancelamento'],
  REAGENDAR: ['reagendar','remarcar'],
  AGENDAR:   ['agendar','horario','horário','marcar','quero agendar'],
  HUMANO:    ['atendente','humano','pessoa','falar com alguem','falar com alguém'],
};

function defaultConfig_() {
  return {
    barbearia: { nome:'Aquino Barbearia & Estética', cidade:'Ipatinga · MG', endereco:'Av. 28 de Abril, 1200 — Centro', telefone:'(31) 99999-0000', logoUrl:'' },
    servicos: [
      { id:1, nome:'Corte', preco:45, duracao:45, ativo:true },
      { id:2, nome:'Corte + Barba', preco:65, duracao:90, ativo:true },
      { id:3, nome:'Barba', preco:30, duracao:30, ativo:true },
      { id:4, nome:'Combo VIP', preco:90, duracao:120, ativo:true },
      { id:5, nome:'Sobrancelha', preco:20, duracao:15, ativo:true },
    ],
    horarios: [
      { dia:'Segunda', abre:'09:00', fecha:'19:00', fechado:false },
      { dia:'Terça',   abre:'09:00', fecha:'19:00', fechado:false },
      { dia:'Quarta',  abre:'09:00', fecha:'19:00', fechado:false },
      { dia:'Quinta',  abre:'09:00', fecha:'20:00', fechado:false },
      { dia:'Sexta',   abre:'09:00', fecha:'20:00', fechado:false },
      { dia:'Sábado',  abre:'08:00', fecha:'18:00', fechado:false },
      { dia:'Domingo', abre:'—', fecha:'—', fechado:true },
    ],
    operacao: { slotMin:15, antecedencia:60, sinalPct:30, cancelamentoH:12, intervaloRetornoDias:15 },
    // Barbeiros/profissionais — editáveis no painel admin (add/editar/excluir).
    // Começa só com o dono; o cliente escolhe o barbeiro no agendamento online.
    barbeiros: [
      { id:1, nome:'Vinícius Aquino', ativo:true },
    ],
  };
}

// PÚBLICA: rode UMA vez no editor (seletor Executar) para carregar os DADOS REAIS
// (P0-6). Sobrescreve a config de demonstração: endereço/telefone reais, 19 serviços
// com preços/durações corretos, e fechado Domingo E Segunda. Pode rodar de novo sem problema.
function seedDadosReais() {
  var cfg = {
    barbearia: { nome:'AQUINO | Barbearia & Estética', cidade:'Ipatinga · MG', endereco:'R. Carlos Gomes, 256 — Ideal, Ipatinga/MG, CEP 35162-165', telefone:'(31) 98698-8939', logoUrl:'' },
    servicos: [
      { id:1,  nome:'Corte', preco:40, duracao:60, ativo:true },
      { id:2,  nome:'Barba (navalha + toalha quente)', preco:35, duracao:35, ativo:true },
      { id:3,  nome:'Acabamento (pescoço e entorno)', preco:15, duracao:15, ativo:true },
      { id:4,  nome:'Sobrancelha Navalha', preco:15, duracao:15, ativo:true },
      { id:5,  nome:'Sobrancelha Pinça', preco:35, duracao:45, ativo:true },
      { id:6,  nome:'Corte e Barba', preco:65, duracao:90, ativo:true },
      { id:7,  nome:'Corte + Barba + Sobrancelha Navalha', preco:75, duracao:105, ativo:true },
      { id:8,  nome:'Corte e Sobrancelha', preco:50, duracao:75, ativo:true },
      { id:9,  nome:'Barba + Sobrancelha + Acabamento', preco:55, duracao:45, ativo:true },
      { id:10, nome:'Barba + Sobrancelha ou Acabamento', preco:45, duracao:40, ativo:true },
      { id:11, nome:'Relaxamento (a partir de)', preco:40, duracao:30, ativo:true },
      { id:12, nome:'Hidratação (a partir de)', preco:35, duracao:45, ativo:true },
      { id:13, nome:'Corte e Relaxamento (a partir de R$ 70)', preco:75, duracao:90, ativo:true },
      { id:14, nome:'Barboterapia (sob consulta)', preco:0, duracao:60, ativo:false },
      { id:15, nome:'Botox Capilar (sob consulta)', preco:0, duracao:120, ativo:false },
      { id:16, nome:'Selagem (sob consulta)', preco:0, duracao:180, ativo:false },
      { id:17, nome:'Barba e Botox (sob consulta)', preco:0, duracao:120, ativo:false },
      { id:18, nome:'Corte e Botox (sob consulta)', preco:0, duracao:180, ativo:false },
      { id:19, nome:'Corte e Selagem (sob consulta)', preco:0, duracao:240, ativo:false }
    ],
    horarios: [
      { dia:'Segunda', abre:'—',     fecha:'—',     fechado:true  },
      { dia:'Terça',   abre:'08:00', fecha:'19:00', fechado:false },
      { dia:'Quarta',  abre:'08:00', fecha:'19:00', fechado:false },
      { dia:'Quinta',  abre:'08:00', fecha:'19:00', fechado:false },
      { dia:'Sexta',   abre:'08:00', fecha:'19:00', fechado:false },
      { dia:'Sábado',  abre:'08:00', fecha:'19:00', fechado:false },
      { dia:'Domingo', abre:'—',     fecha:'—',     fechado:true  }
    ],
    operacao: { slotMin:15, antecedencia:60, sinalPct:30, cancelamentoH:12, intervaloRetornoDias:15 },
    barbeiros: [ { id:1, nome:'Vinícius Aquino', ativo:true } ]
  };
  var r = actionSalvarConfig_({ config: cfg });
  Logger.log('Dados reais carregados (P0-6). ' + JSON.stringify(r));
  return r;
}

// ─── ROTEADOR doGet ─────────────────────────────────────────────────────────
function doGet(e) {
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    // 1) Verificação do webhook Meta (hub challenge) — antes do token de site
    if (p['hub.mode'] === 'subscribe') {
      if (p['hub.verify_token'] === getSecret_(PROP.VERIFY_TOKEN)) {
        return ContentService.createTextOutput(p['hub.challenge'] || '');
      }
      return ContentService.createTextOutput('');
    }
    // 2) Token de site obrigatório
    if (!validarSiteToken_(p.token)) return json_(respostaErro_('nao_autorizado'));
    if (!checarRateLimit_('get_' + (p.tel || 'anon'))) return json_(respostaErro_('rate_limit'));

    switch (p.action) {
      case 'ping':             return json_({ ok:true, ts: now_(), versao:'v9.2-master' });
      case 'getConfig':        return json_({ ok:true, config: getConfig_() });
      case 'listarServicos':   return json_({ ok:true, servicos: getConfig_().servicos });
      case 'listarBarbeiros':  return json_({ ok:true, barbeiros: (getConfig_().barbeiros||[]).filter(function(b){ return b.ativo !== false; }) });
      case 'verificarCliente': return json_(actionVerificarCliente_(p));
      case 'slots':            return json_(actionSlots_(p));
      case 'meusAgendamentos': return json_(actionMeusAgendamentos_(p));
      default:                 return json_(respostaErro_('acao_desconhecida')); // rota admin ofuscada
    }
  } catch (err) { logErro_('doGet', err); return json_(respostaErro_('erro_interno')); }
}

// ─── ROTEADOR doPost ────────────────────────────────────────────────────────
function doPost(e) {
  try {
    var body = parseBody_(e);

    // 0) Webhook Mercado Pago (notification_url ?source=mp)
    if ((e && e.parameter && e.parameter.source === 'mp') || (body && (body.type === 'payment' || body.action === 'payment.updated'))) {
      processarWebhookMP_(e, body);
      return ContentService.createTextOutput('');
    }

    // 1) Webhook Meta (mensagens recebidas) — valida HMAC antes de processar
    if (body && body.object === 'whatsapp_business_account') {
      if (!validarAssinaturaMeta_(e)) return ContentService.createTextOutput(''); // spoofing → silêncio
      processarWebhook_(body);
      return ContentService.createTextOutput(''); // 200 vazio p/ a Meta
    }

    // 2) Chamadas do site — SITE_TOKEN obrigatório no body
    if (!validarSiteToken_(body.token)) return json_(respostaErro_('nao_autorizado'));
    if (!checarRateLimit_('post_' + (body.telefone || body.tel || 'anon'))) return json_(respostaErro_('rate_limit'));

    switch (body.action) {
      case 'agendamento':      return json_(actionAgendamento_(body));
      case 'cancelar':         return json_(actionCancelar_(body));
      case 'confirmarPresenca':return json_(actionConfirmarPresenca_(body));
      case 'registrarFila':    return json_(actionRegistrarFila_(body));
      case 'reagendar':        return json_(actionReagendar_(body));
      case 'atualizarPerfil':  return json_(actionAtualizarPerfil_(body));
      case 'uploadFoto':       return json_(actionUploadFoto_(body));
      case 'enviarLembrete':   return json_(actionEnviarLembrete_(body));
      case 'enviarSinal':      return json_(actionEnviarSinal_(body));
      // ADMIN / RBAC — exigem perfil autorizado (admin · recepcao · barbeiro)
      case 'dashboard':
      case 'validarSenha':     return requireRole_(body, 'dashboard',       function(perfil){ return actionDashboard_(perfil); });
      case 'morningBriefing':  return requireRole_(body, 'morningBriefing', function(){ return actionMorningBriefing_(); });
      case 'metricas':         return requireRole_(body, 'metricas',        function(){ return actionMetricas_(body); });
      case 'salvarConfig':     return requireRole_(body, 'salvarConfig',    function(){ return actionSalvarConfig_(body); });
      case 'servicoCreate':    return requireRole_(body, 'servicoCreate',   function(){ return actionServicoCreate_(body); });
      case 'servicoUpdate':    return requireRole_(body, 'servicoUpdate',   function(){ return actionServicoUpdate_(body); });
      case 'servicoDelete':    return requireRole_(body, 'servicoDelete',   function(){ return actionServicoDelete_(body); });
      case 'barbeiroCreate':   return requireRole_(body, 'barbeiroCreate',  function(){ return actionBarbeiroCreate_(body); });
      case 'barbeiroUpdate':   return requireRole_(body, 'barbeiroUpdate',  function(){ return actionBarbeiroUpdate_(body); });
      case 'barbeiroDelete':   return requireRole_(body, 'barbeiroDelete',  function(){ return actionBarbeiroDelete_(body); });
      default:                 return json_(respostaErro_('acao_desconhecida'));
    }
  } catch (err) { logErro_('doPost', err); return json_(respostaErro_('erro_interno')); }
}

// ─── SEGURANÇA (P0/P1) ──────────────────────────────────────────────────────
function getSecret_(key) { return props_().getProperty(key) || ''; }
function validarSiteToken_(t) { var exp = getSecret_(PROP.SITE_TOKEN); return !!exp && timingSafeEqual_(String(t||''), exp); }
function validarAdmin_(k)     { var exp = getSecret_(PROP.ADMIN_KEY);  return !!exp && timingSafeEqual_(String(k||''), exp); }
function requireAdmin_(body, fn) { if (!validarAdmin_(body.key)) return json_(respostaErro_('admin_invalido')); return json_(fn()); }

// ─── RBAC (SEÇÃO 23) — admin · recepcao · barbeiro ──────────────────────────
// Resolve o perfil a partir da key enviada. ADMIN_KEY → 'admin'. Chaves de
// recepção/barbeiro são opcionais (se não configuradas, só existe admin).
function resolverPerfil_(key) {
  var k = String(key || '');
  if (!k) return null;
  if (validarAdmin_(k)) return 'admin';
  var rec = getSecret_(PROP.RECEPCAO_KEY); if (rec && timingSafeEqual_(k, rec)) return 'recepcao';
  var bar = getSecret_(PROP.BARBEIRO_KEY); if (bar && timingSafeEqual_(k, bar)) return 'barbeiro';
  return null;
}
// Matriz de permissões por ação (quem pode o quê)
var RBAC = {
  dashboard:       ['admin','recepcao','barbeiro'],
  morningBriefing: ['admin','recepcao','barbeiro'],
  metricas:        ['admin','recepcao'],
  salvarConfig:    ['admin'],
  servicoCreate:   ['admin'],
  servicoUpdate:   ['admin'],
  servicoDelete:   ['admin'],
};
// Exige um perfil autorizado para a ação; injeta o perfil resolvido em fn(perfil)
function requireRole_(body, acao, fn) {
  var perfil = resolverPerfil_(body.key);
  if (!perfil) return json_(respostaErro_('admin_invalido'));
  var permitidos = RBAC[acao] || ['admin'];
  if (permitidos.indexOf(perfil) === -1) return json_(respostaErro_('sem_permissao'));
  return json_(fn(perfil));
}

// comparação tempo-constante (anti timing attack) — GAS não tem timingSafeEqual nativo
function timingSafeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return r === 0;
}

// HMAC-SHA256 do webhook Meta (X-Hub-Signature-256). GAS não lê headers em
// doPost(e); a assinatura precisa chegar por proxy/param. Se ausente e não
// houver APP_SECRET configurado, não bloqueia (modo dev). Em produção, exija.
function validarAssinaturaMeta_(e) {
  var secret = getSecret_(PROP.META_APP_SECRET);
  if (!secret) return true; // dev: sem secret configurado
  var assinada = (e && e.parameter && e.parameter.sig) ? e.parameter.sig : '';
  if (!assinada) return true; // header indisponível no GAS — ver nota acima
  var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
  var bytes = Utilities.computeHmacSha256Signature(raw, secret);
  var hex = bytes.map(function(b){ var v=(b<0?b+256:b).toString(16); return v.length===1?'0'+v:v; }).join('');
  return timingSafeEqual_('sha256=' + hex, assinada);
}

// rate limit 15 req/min por identificador (CacheService)
function checarRateLimit_(id) {
  var cache = CacheService.getScriptCache();
  var k = 'rl_' + id;
  var n = parseInt(cache.get(k) || '0', 10);
  if (n >= 15) return false;
  cache.put(k, String(n + 1), 60);
  return true;
}

// sanitização anti formula-injection no Sheets (=, +, -, @)
function sanitizar_(v) {
  if (v === null || v === undefined) return '';
  var s = String(v);
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

function respostaErro_(code) {
  var msgs = {
    nao_autorizado:'Não autorizado', admin_invalido:'Senha incorreta', rate_limit:'Muitas requisições',
    acao_desconhecida:'Ação não reconhecida', erro_interno:'Erro interno', dados_invalidos:'Dados inválidos',
    sem_permissao:'Seu perfil não tem permissão para esta ação',
  };
  return { success:false, error: msgs[code] || 'Erro' };
}

// ─── AÇÕES DO SITE (respostas canônicas do master) ─────────────────────────
function actionVerificarCliente_(p) {
  var tel = telLimpo_(p.tel);
  var r = findClienteByTel_(tel);
  if (!r) return { encontrado:false };
  var o = r.obj;
  var cls = classificarCliente_(o[CLI.ID]);
  return {
    encontrado:true,
    clienteID:o[CLI.ID], nome:o[CLI.NOME], nomeAbreviado:o[CLI.ABREV],
    nascimento:o[CLI.NASC], email:o[CLI.EMAIL], dependentes:parseDependentes_(o[CLI.DEP]), foto:o[CLI.FOTO]||'', totalVisitas:Number(o[CLI.TOTAL])||0,
    ultimaVisita:dataBR_(o[CLI.ULTIMO_AG]), diasDesde:diasDesde_(o[CLI.ULTIMO_AG]),
    intervaloDias:Number(o[CLI.INTERVALO])||15,
    score:cls.score, nivel:cls.nivel, nivelEmoji:cls.nivelEmoji,
    status:cls.statusLabel, statusLabel:cls.statusLabel, statusCor:cls.statusCor,
    cancelamentos:contarCancelamentos_(o[CLI.ID]),
  };
}

// ─── ATUALIZAR PERFIL DO CLIENTE (R2 estendido / Fatia A) ───────────────────
// O próprio cliente pode atualizar Nome, Sobrenome, Data de nascimento e Email
// na tela de perfil do portal. Todos obrigatórios. Telefone NÃO muda (chave).
// O backend grava Nome como "${nome} ${sobrenome}" (a coluna é única) e atualiza
// NomeAbreviado, Nascimento e Email. Retorna o cliente atualizado.
function actionAtualizarPerfil_(p) {
  var tel = telLimpo_(p.tel || p.telefone);
  var nome = String(p.nome || '').trim();
  var sobrenome = String(p.sobrenome || '').trim();
  var nascimento = String(p.nascimento || '').trim(); // DD/MM/AAAA
  var email = String(p.email || '').trim();

  if (!tel) return respostaErro_('telefone_invalido');
  if (!nome || !sobrenome) return respostaErro_('nome_invalido');
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(nascimento)) return respostaErro_('nascimento_invalido');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respostaErro_('email_invalido');

  var r = findClienteByTel_(tel);
  if (!r) return respostaErro_('cliente_nao_encontrado');

  var nomeCompleto = sanitizar_(nome + ' ' + sobrenome);
  var abrev = sanitizar_(formatarNomeAbrev_(nomeCompleto));
  var depJSON = serializarDependentes_(p.dependentes); // [] → '' (limpa) | lista válida
  var sh = sheet_(SHEETS.CLIENTES);
  // Atualiza as 4 colunas do perfil + dependentes (1-indexed em getRange)
  sh.getRange(r.rowIndex, CLI.NOME + 1).setValue(nomeCompleto);
  sh.getRange(r.rowIndex, CLI.ABREV + 1).setValue(abrev);
  sh.getRange(r.rowIndex, CLI.NASC + 1).setValue(nascimento);
  sh.getRange(r.rowIndex, CLI.EMAIL + 1).setValue(sanitizar_(email));
  sh.getRange(r.rowIndex, CLI.DEP + 1).setValue(depJSON);
  if (typeof p.foto === 'string' && p.foto) sh.getRange(r.rowIndex, CLI.FOTO + 1).setValue(p.foto);

  return {
    success: true,
    cliente: {
      clienteID: r.obj[CLI.ID],
      nome: nomeCompleto,
      nomeAbreviado: abrev,
      nascimento: nascimento,
      email: email,
      dependentes: parseDependentes_(depJSON),
      foto: (typeof p.foto === 'string' && p.foto) ? p.foto : (r.obj[CLI.FOTO] || ''),
    }
  };
}

// ─── FOTO DO CLIENTE (Google Drive) ─────────────────────────────────────────
// O app reduz a foto p/ ~512px antes de enviar (data URL base64). Aqui ela é
// salva numa pasta do Drive do dono e devolvemos um link exibível em <img>.
function actionUploadFoto_(b) {
  var dataUrl = String(b.imagem || '');
  var m = dataUrl.match(/^data:(image\/[\w+.-]+);base64,([\s\S]+)$/);
  if (!m) return respostaErro_('imagem_invalida');
  try {
    var contentType = m[1];
    var bytes = Utilities.base64Decode(m[2]);
    var ext = (contentType.split('/')[1] || 'jpg').replace('jpeg','jpg');
    var blob = Utilities.newBlob(bytes, contentType, 'cliente_' + Date.now() + '.' + ext);
    var folder = getPastaFotos_();
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
    var id = file.getId();
    var url = 'https://drive.google.com/thumbnail?id=' + id + '&sz=w512';
    return { success:true, url:url, fileId:id };
  } catch (err) {
    logErro_('uploadFoto', err);
    return respostaErro_('falha_upload');
  }
}
// Pasta única no Drive (id guardado em Script Property p/ não procurar toda vez)
function getPastaFotos_() {
  var p = props_();
  var fid = p.getProperty('FOTOS_FOLDER_ID');
  if (fid) { try { return DriveApp.getFolderById(fid); } catch (e) {} }
  var folder = DriveApp.createFolder('AQUINO_FotosClientes');
  p.setProperty('FOTOS_FOLDER_ID', folder.getId());
  return folder;
}

// PÚBLICA: rode UMA vez no editor (seletor Executar) para autorizar o Drive e
// criar a pasta de fotos. Não termina com "_", então aparece na lista de funções.
function autorizarDriveFotos() {
  var pasta = getPastaFotos_();
  Logger.log('Drive OK. Pasta de fotos: ' + pasta.getName() + ' — ' + pasta.getUrl());
  return pasta.getUrl();
}

function actionSlots_(p) {
  var data = p.data;
  var duracao = parseInt(p.duracao, 10) || 45;
  var cfg = getConfig_();
  var dow = diaSemana_(data);
  var h = cfg.horarios.filter(function(x){ return x.dia === dow; })[0];
  if (!h || h.fechado) return { slots:[], fechado:true };
  var passo = cfg.operacao.slotMin || 15;
  var ocupados = getAgendamentos_()
    .filter(function(a){ return a[AG.DATA] === data && a[AG.STATUS] !== STATUS.CANCELADO; })
    .map(function(a){ return a[AG.HORA]; });
  var busy = intervalosOcupadosCalendar_(data); // [{ini,fim}] em minutos — folgas/feriados/eventos
  var slots = [];
  for (var t = toMin_(h.abre); t + duracao <= toMin_(h.fecha); t += passo) {
    var hhmm = fromMin_(t);
    if (ocupados.indexOf(hhmm) > -1) continue;
    var colide = busy.some(function(b){ return t < b.fim && (t + duracao) > b.ini; });
    if (!colide) slots.push(hhmm);
  }
  return { slots: slots };
}

function actionMeusAgendamentos_(p) {
  var tel = telLimpo_(p.tel);
  var ags = getAgendamentos_()
    .filter(function(a){ return telLimpo_(a[AG.TEL]) === tel && (a[AG.STATUS] === STATUS.CONFIRMADO || a[AG.STATUS] === STATUS.PRESENCA); })
    .map(function(a){ return { id:a[AG.ID], servico:a[AG.SERV], duracao:Number(a[AG.DUR])||0, data:a[AG.DATA], horario:a[AG.HORA], preco:Number(a[AG.PRECO])||0, dataBR:dataBR_(a[AG.DATA]), para:a[AG.PARA]||'' }; });
  return { agendamentos: ags };
}

function actionAgendamento_(b) {
  // IDEMPOTÊNCIA (SEÇÃO 38): mesmo requestId (duplo-clique/retry) → devolve o
  // resultado original sem criar agendamento duplicado. Cache 6h cobre retries.
  var cacheReq = CacheService.getScriptCache();
  if (b.requestId) {
    var prev = cacheReq.get('req_' + b.requestId);
    if (prev) { try { return JSON.parse(prev); } catch (e) {} }
  }
  var nome = String(b.nome || '').trim();
  var tel = telLimpo_(b.telefone || b.tel);
  var data = b.data, horario = b.horario || b.hora;
  // Contrato real do front: `servico` chega como OBJETO {nome,duracao,preco}.
  // Mantém compat com envio de campos soltos (servico string + duracao/preco).
  var servObj = (b.servico && typeof b.servico === 'object') ? b.servico : null;
  var servico = servObj ? (servObj.nome || '') : (b.servico || '');
  var duracao = parseInt(servObj ? servObj.duracao : b.duracao, 10) || 45;
  var preco   = parseFloat(servObj ? servObj.preco : (b.preco || b.valor)) || 0;
  var observacao = sanitizar_(String(b.observacao || '')).slice(0, 280); // P0-5: pedido especial do cliente
  if (!nome || !tel || !data || !horario || !servico) return respostaErro_('dados_invalidos');

  // conflito de horário — sobreposição REAL por duração (P0-2). Ocupa: confirmado/presença/realizado/aguardando_sinal. Ignora: cancelado/faltou.
  var tNova = toMin_(horario), durNova = duracao;
  var conflito = getAgendamentos_().some(function(a){
    if (a[AG.DATA] !== data) return false;
    if (a[AG.STATUS] === STATUS.CANCELADO || a[AG.STATUS] === STATUS.FALTOU) return false;
    var tEx = toMin_(a[AG.HORA]), dEx = Number(a[AG.DUR]) || 45;
    return tNova < (tEx + dEx) && (tNova + durNova) > tEx;
  });
  if (conflito) return { success:false, error:'Horário não disponível' };

  var cli = upsertCliente_(nome, tel, data, b.nascimento, b.clienteID, b.intervaloDias, b.email, serializarDependentes_(b.dependentes), b.foto);
  var id = gerarIdAgendamento_();
  var abrev = formatarNomeAbrev_(nome);
  var barbeiro = sanitizar_(String(b.barbeiro || '').trim()); // profissional escolhido (col N)
  var para = sanitizar_(String(b.para || '').trim()).slice(0,60); // dependente (col O), vazio = titular
  var ag = { id:id, data:data, horario:horario, servico:servico, duracao:duracao, preco:preco };
  var clienteObj = findClienteByTel_(tel);
  var exigeSinal = deveExigirSinal_(clienteObj ? clienteObj.obj : null, ag);

  var statusInicial = exigeSinal ? STATUS.AGUARDANDO : STATUS.CONFIRMADO;
  var sinalStatus = exigeSinal ? 'pendente' : '';
  sheet_(SHEETS.AGENDAMENTOS).appendRow([
    id, sanitizar_(nome), sanitizar_(abrev), tel, cli.id, sanitizar_(servico),
    duracao, data, horario, preco, statusInicial, nowISO_(), sinalStatus, barbeiro, para, observacao,
  ]);

  if (exigeSinal) {
    var pct = parseInt(getSecret_(PROP.COBRANCA_PERCENTUAL) || '30', 10);
    var valorSinal = Math.round(preco * pct) / 100;
    var pix = gerarPixSinal_(id, valorSinal, nome, tel, b.email);
    // sem Calendar/confirmação ainda — só após pagamento aprovado (webhook)
    var resSinal = { success:true, id:id, clienteID:cli.id, requiresSinal:true, sinalPct:pct, valorSinal:valorSinal, pix:pix };
    if (b.requestId) cacheReq.put('req_' + b.requestId, JSON.stringify(resSinal), 21600);
    return resSinal;
  }

  registrarFinanceiro_(data, preco, servico, abrev, id);
  criarEventoCalendar_(id, data, horario, duracao, nome, servico, tel, b.email);
  enviarConfirmacaoWhatsApp_(tel, nome, servico, data, horario, duracao, preco);
  enviarEmailConfirmacao_(b.email, nome, servico, data, horario, duracao, preco); // SEÇÃO 32 (no-op se EMAIL_ATIVO=0)
  notificarDonoNovoAgendamento_(nome, servico, data, horario, para);
  registrarMetrica_('agendamento_criado', 1, { servico:servico, canal:'site', preco:preco });
  var resOk = { success:true, id:id, clienteID:cli.id, requiresSinal:false };
  if (b.requestId) cacheReq.put('req_' + b.requestId, JSON.stringify(resOk), 21600);
  return resOk;
}

function actionCancelar_(b) {
  var id = b.agendamentoId;
  if (!id) return respostaErro_('dados_invalidos');
  var r = findRow_(SHEETS.AGENDAMENTOS, AG.ID, id);
  if (!r) return { success:false, error:'Agendamento não encontrado' };
  var st = r.obj[AG.STATUS];
  if (st === STATUS.CANCELADO) return { success:false, error:'Já cancelado' };
  if (st === STATUS.REALIZADO) return { success:false, error:'Agendamento já realizado' };
  // regra mínima de cancelamento (config.operacao.cancelamentoH)
  var minH = Number(getConfig_().operacao.cancelamentoH) || 0;
  if (minH > 0) {
    var ini = parseDataHora_(r.obj[AG.DATA], r.obj[AG.HORA]);
    if (ini && (ini.getTime() - Date.now()) < minH * 3600000)
      return { success:false, error:'Cancelamento exige no mínimo ' + minH + 'h de antecedência. Fale com o atendente.' };
  }
  setCell_(SHEETS.AGENDAMENTOS, r.rowIndex, AG.STATUS, STATUS.CANCELADO);
  removerEventoCalendar_(id); // libera o slot imediatamente
  verificarFilaEspera_(r.obj[AG.DATA], r.obj[AG.HORA]); // notifica o 1º da fila
  return { success:true };
}

function actionConfirmarPresenca_(b) {
  var tel = telLimpo_(b.tel || b.telefone);
  var futuros = getAgendamentos_().filter(function(a){ return telLimpo_(a[AG.TEL])===tel && a[AG.STATUS]===STATUS.CONFIRMADO; });
  if (!futuros.length) return { success:false, error:'Nenhum agendamento a confirmar' };
  // confirma o mais próximo
  var alvo = futuros.sort(function(x,y){ return (x[AG.DATA]+x[AG.HORA]).localeCompare(y[AG.DATA]+y[AG.HORA]); })[0];
  var r = findRow_(SHEETS.AGENDAMENTOS, AG.ID, alvo[AG.ID]);
  setCell_(SHEETS.AGENDAMENTOS, r.rowIndex, AG.STATUS, STATUS.PRESENCA);
  registrarMetrica_('presenca_confirmada', 1, { clienteID: alvo[AG.CLI_ID] });
  return { success:true };
}

function actionReagendar_(b) {
  var id = b.agendamentoId;
  var novo = b.novoHorario || {};
  var data = novo.data || b.data, hora = novo.hora || b.horario || b.hora;
  var r = findRow_(SHEETS.AGENDAMENTOS, AG.ID, id);
  if (!r) return { success:false, error:'Agendamento não encontrado' };

  // dados do agendamento atual (para checar conflito e recriar o evento no Calendar)
  var dataFinal = data || r.obj[AG.DATA];
  var horaFinal = hora || r.obj[AG.HORA];
  var nome    = r.obj[AG.NOME];
  var servico = r.obj[AG.SERV];
  var duracao = Number(r.obj[AG.DUR]) || 45;
  var tel     = r.obj[AG.TEL];

  // P0-3: conflito por DURAÇÃO no novo horário (mesma regra do P0-2), ignorando ele mesmo.
  var tNova = toMin_(horaFinal), durNova = duracao;
  var conflito = getAgendamentos_().some(function(a){
    if (String(a[AG.ID]) === String(id)) return false; // não conflita consigo mesmo
    if (a[AG.DATA] !== dataFinal) return false;
    if (a[AG.STATUS] === STATUS.CANCELADO || a[AG.STATUS] === STATUS.FALTOU) return false;
    var tEx = toMin_(a[AG.HORA]), dEx = Number(a[AG.DUR]) || 45;
    return tNova < (tEx + dEx) && (tNova + durNova) > tEx;
  });
  if (conflito) return { success:false, error:'Horário não disponível' };

  // remove o evento antigo do Calendar ANTES de gravar (o fallback do remover lê a linha antiga)
  removerEventoCalendar_(id);

  if (data) setCell_(SHEETS.AGENDAMENTOS, r.rowIndex, AG.DATA, data);
  if (hora) setCell_(SHEETS.AGENDAMENTOS, r.rowIndex, AG.HORA, hora);
  setCell_(SHEETS.AGENDAMENTOS, r.rowIndex, AG.STATUS, STATUS.CONFIRMADO);

  // cria o evento no novo horário
  criarEventoCalendar_(id, dataFinal, horaFinal, duracao, nome, servico, tel, b.email || '');

  return { success:true, id:id, data:dataFinal, horario:horaFinal };
}

// anti-spam: grava UltimoLembrete (col I) — NUNCA UltimoAgendamento (col E)
function actionEnviarLembrete_(b) {
  var r = b.clienteId ? findRow_(SHEETS.CLIENTES, CLI.ID, b.clienteId) : findClienteByTel_(telLimpo_(b.tel));
  if (!r) return { success:false, error:'Cliente não encontrado' };
  setCell_(SHEETS.CLIENTES, r.rowIndex, CLI.ULTIMO_LEM, hojeISO_() + '_manual');
  // enviarWhatsApp_(r.obj[CLI.TEL], 'Sentimos sua falta...'); // integração Meta
  return { success:true, clienteID:r.obj[CLI.ID], ultimoLembrete: hojeISO_() + '_manual' };
}

function actionEnviarSinal_(b) {
  var r = b.clienteId ? findRow_(SHEETS.CLIENTES, CLI.ID, b.clienteId) : findClienteByTel_(telLimpo_(b.tel));
  if (!r) return { success:false, error:'Cliente não encontrado' };
  var pct = parseFloat(b.valor) || getConfig_().operacao.sinalPct || 30;
  var base = parseFloat(b.preco) || 0;
  var valorSinal = base ? Math.round(base * pct) / 100 : 0;
  if (b.agendamentoId && valorSinal > 0) {
    var pix = gerarPixSinal_(b.agendamentoId, valorSinal, r.obj[CLI.NOME], r.obj[CLI.TEL], b.email);
    return { success: !pix.erro, clienteID:r.obj[CLI.ID], sinalPct:pct, valorSinal:valorSinal, pix:pix };
  }
  return { success:true, clienteID:r.obj[CLI.ID], sinalPct:pct, info:'informe agendamentoId e preco para gerar o Pix' };
}

// ─── AÇÕES ADMIN ────────────────────────────────────────────────────────────
function actionDashboard_(perfil) {
  perfil = perfil || 'admin';
  var ags = getAgendamentos_();
  var hoje = hojeISO_();
  var doDia = ags.filter(function(a){ return a[AG.DATA] === hoje; });
  var faturadoHoje = doDia.filter(function(a){ return a[AG.STATUS]===STATUS.REALIZADO; })
                          .reduce(function(s,a){ return s + (Number(a[AG.PRECO])||0); }, 0);
  // F.4: índice por cliente → gasto acumulado, próximo agendamento e histórico (visíveis no admin)
  var porCliente_ = {};
  ags.forEach(function(a){ var cid = a[AG.CLI_ID]; if (cid==null||cid==='') return; (porCliente_[cid] = porCliente_[cid] || []).push(a); });
  var gastoDe_ = function(cid){ return (porCliente_[cid]||[]).filter(function(a){ return a[AG.STATUS]===STATUS.REALIZADO; }).reduce(function(s,a){ return s + (Number(a[AG.PRECO])||0); }, 0); };
  var proximoDe_ = function(cid){
    var fut = (porCliente_[cid]||[]).filter(function(a){ return a[AG.DATA] >= hoje && (a[AG.STATUS]===STATUS.CONFIRMADO || a[AG.STATUS]===STATUS.PRESENCA || a[AG.STATUS]===STATUS.AGUARDANDO); })
      .sort(function(a,b){ return (a[AG.DATA]+a[AG.HORA]) < (b[AG.DATA]+b[AG.HORA]) ? -1 : 1; });
    return fut.length ? { data:fut[0][AG.DATA], horario:fut[0][AG.HORA], servico:fut[0][AG.SERV] } : null;
  };
  var historicoDe_ = function(cid){
    return (porCliente_[cid]||[]).filter(function(a){ return a[AG.STATUS]===STATUS.REALIZADO || a[AG.STATUS]===STATUS.FALTOU; })
      .sort(function(a,b){ return (a[AG.DATA]+a[AG.HORA]) < (b[AG.DATA]+b[AG.HORA]) ? 1 : -1; })
      .slice(0,20)
      .map(function(a){ return { data:a[AG.DATA], horario:a[AG.HORA], servico:a[AG.SERV], preco:Number(a[AG.PRECO])||0, status:a[AG.STATUS] }; });
  };
  var clientes = getClientes_().map(function(c){
    var cls = classificarCliente_(c[CLI.ID]);
    return { clienteID:c[CLI.ID], nome:c[CLI.NOME], telefone:c[CLI.TEL], totalVisitas:Number(c[CLI.TOTAL])||0,
             ultimoAgendamento:c[CLI.ULTIMO_AG], ultimoLembrete:c[CLI.ULTIMO_LEM], intervaloDias:Number(c[CLI.INTERVALO])||15, diasDesde:diasDesde_(c[CLI.ULTIMO_AG]),
             score:cls.score, nivel:cls.nivel, nivelEmoji:cls.nivelEmoji, status:cls.statusLabel, statusCor:cls.statusCor, risco:shouldFlagRisk_(c[CLI.ID]), cancelamentos:contarCancelamentos_(c[CLI.ID]),
             gasto:gastoDe_(c[CLI.ID]), proximo:proximoDe_(c[CLI.ID]), historico:historicoDe_(c[CLI.ID]) };
  }).sort(function(a,b){ return a.score - b.score; }); // piores primeiro (ação imediata)
  return {
    success:true, autenticado:true,
    perfil: perfil, // RBAC: 'admin' | 'recepcao' | 'barbeiro' — front adapta a UI
    permissoes: { editarConfig: perfil==='admin', verMetricas: perfil!=='barbeiro', editarServicos: perfil==='admin' },
    clientes: clientes, // front (MUDANÇA 1): if (d.clientes) setAdminAuth(true)
    kpis: { agendamentosHoje:doDia.length, confirmados:doDia.filter(function(a){return a[AG.STATUS]===STATUS.CONFIRMADO;}).length, faturadoHoje:faturadoHoje, totalClientes:clientes.length },
    agenda: doDia.map(function(a){ return { id:a[AG.ID], clienteId:a[AG.CLI_ID]||null, horario:a[AG.HORA], nome:a[AG.NOME], servico:a[AG.SERV], status:a[AG.STATUS], preco:Number(a[AG.PRECO])||0, obs:a[AG.OBS]||'' }; }),
  };
}

function actionMorningBriefing_() {
  var hojeStr = hojeISO_();
  var hoje = new Date(hojeStr + 'T00:00:00');
  var eventos = [];
  var clientes = getClientes_();
  var ags = getAgendamentos_();

  // EVENTO 1 — faltas prováveis hoje (clientes em risco com agendamento hoje)
  ags.forEach(function(a){
    if (a[AG.DATA] === hojeStr && a[AG.STATUS] === STATUS.CONFIRMADO) {
      var cid = a[AG.CLI_ID];
      if (cid && shouldFlagRisk_(cid)) {
        var preco = Number(a[AG.PRECO]) || 0;
        eventos.push({ tipo:'faltaHoje', cliente:a[AG.ABREV] || a[AG.NOME], horario:a[AG.HORA], servico:a[AG.SERV], preco:preco,
          motivo:'Score ' + calcularScore_(cid) + ' · ' + contarCancelamentos_(cid) + ' cancel.',
          acao:'Ativar sinal de R$ ' + Math.round(preco * 0.3), rank:ipeRank_('faltaHoje') });
      }
    }
  });

  // EVENTO 2 — VIPs (20+ visitas) há mais de 30 dias sem visitar
  clientes.forEach(function(c){
    var dd = diasDesde_(c[CLI.ULTIMO_AG]);
    if ((Number(c[CLI.TOTAL])||0) >= 20 && dd !== null && dd > 30) {
      eventos.push({ tipo:'vipReativacao', cliente:c[CLI.ABREV] || c[CLI.NOME], motivo:'VIP 💎 há ' + dd + ' dias sem visitar',
        acao:'Contato direto + oferta especial', rank:ipeRank_('vipReativacao') });
    }
  });

  // EVENTO 3 — aniversariantes de hoje
  var dHoje = hoje.getDate(), mHoje = hoje.getMonth() + 1;
  clientes.forEach(function(c){
    var p = String(c[CLI.NASC] || '').split('/');
    if (p.length === 3 && parseInt(p[0],10) === dHoje && parseInt(p[1],10) === mHoje) {
      eventos.push({ tipo:'aniversariante', cliente:c[CLI.ABREV] || c[CLI.NOME], motivo:'Aniversário hoje 🎂',
        acao:'Enviar mensagem com cupom ANIV10', rank:ipeRank_('aniversariante') });
    }
  });

  // Ordena por IPE rank e pega top 3
  eventos.sort(function(a,b){ return b.rank - a.rank; });
  var top3 = eventos.slice(0, 3);

  // KPIs do dia
  var agHoje = 0, faturEsperado = 0, faturRealizado = 0, cancelHoje = 0;
  ags.forEach(function(a){
    if (a[AG.DATA] !== hojeStr) return;
    var preco = Number(a[AG.PRECO]) || 0;
    if (a[AG.STATUS] === STATUS.CONFIRMADO || a[AG.STATUS] === STATUS.PRESENCA) {
      agHoje++; faturEsperado += preco;
      var hm = String(a[AG.HORA] || '').split(':');
      var dataAg = new Date(hoje); dataAg.setHours(parseInt(hm[0],10)||0, parseInt(hm[1],10)||0);
      if (dataAg < new Date()) faturRealizado += preco;
    } else if (a[AG.STATUS] === STATUS.CANCELADO) { cancelHoje++; }
  });

  return {
    success:true, data:hojeStr, diaSemana:diaSemana_(hojeStr), dataExtenso:dataBR_(hojeStr),
    eventos:top3, totalEventos:eventos.length,
    kpis:{ agendamentosHoje:agHoje, cancelamentosHoje:cancelHoje, faturamentoEsperado:faturEsperado,
           faturamentoRealizado:faturRealizado, ocupacao: agHoje > 0 ? Math.round((agHoje/12)*100) : 0 },
  };
}

// ─── MÉTRICAS DE NEGÓCIO (SEÇÃO 41) — séries p/ gráficos + DRE ───────────────
// Alimenta o dashboard Recharts: faturamento/dia, agendamentos/dia, taxa de
// comparecimento, receita por serviço e DRE básico (ticket médio, no-show).
function actionMetricas_(b) {
  var dias = Math.min(90, Math.max(7, parseInt(b && b.dias, 10) || 30));
  var ags = getAgendamentos_();
  var hoje = new Date(hojeISO_() + 'T00:00:00');

  // monta o eixo de datas (dias-1 .. hoje)
  var labels = [], mapa = {};
  for (var i = dias - 1; i >= 0; i--) {
    var d = new Date(hoje); d.setDate(d.getDate() - i);
    var iso = Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
    labels.push(iso);
    mapa[iso] = { data:iso, faturamento:0, agendamentos:0, comparecimentos:0, faltas:0, cancelamentos:0 };
  }

  var porServico = {}, totalRealizado = 0, totalReceita = 0, totalFaltas = 0, totalCancel = 0, totalAg = 0;
  ags.forEach(function(a){
    var dia = String(a[AG.DATA] || '').substring(0,10);
    var st = a[AG.STATUS], preco = Number(a[AG.PRECO]) || 0;
    if (mapa[dia]) {
      mapa[dia].agendamentos++;
      if (st === STATUS.REALIZADO || st === STATUS.PRESENCA) { mapa[dia].comparecimentos++; mapa[dia].faturamento += preco; }
      else if (st === STATUS.FALTOU)    mapa[dia].faltas++;
      else if (st === STATUS.CANCELADO) mapa[dia].cancelamentos++;
    }
    if (st === STATUS.REALIZADO || st === STATUS.PRESENCA) {
      totalRealizado++; totalReceita += preco;
      var sv = String(a[AG.SERV] || '—');
      porServico[sv] = porServico[sv] || { servico:sv, receita:0, qtd:0 };
      porServico[sv].receita += preco; porServico[sv].qtd++;
    } else if (st === STATUS.FALTOU)    totalFaltas++;
    else if (st === STATUS.CANCELADO)   totalCancel++;
    if (mapa[dia]) totalAg++;
  });

  var serie = labels.map(function(iso){ var m = mapa[iso]; m.dataBR = iso.substring(8,10) + '/' + iso.substring(5,7); return m; });
  var receitaServico = Object.keys(porServico).map(function(k){ return porServico[k]; })
                             .sort(function(x,y){ return y.receita - x.receita; });

  // DRE básico do período coberto pela planilha Financeiro
  var fin = getRowsData_(SHEETS.FINANCEIRO);
  var entradas = 0, saidas = 0;
  fin.forEach(function(r){ var v = Number(r[4]) || 0; if (String(r[1]).toLowerCase()==='saida') saidas += v; else entradas += v; });

  var taxaComparecimento = (totalRealizado + totalFaltas) > 0 ? Math.round(totalRealizado / (totalRealizado + totalFaltas) * 100) : 0;
  var taxaNoShow         = (totalRealizado + totalFaltas) > 0 ? Math.round(totalFaltas / (totalRealizado + totalFaltas) * 100) : 0;

  // eventos da aba Metricas (SEÇÃO 41) que não se derivam dos agendamentos
  var corteISO = labels[0] + 'T00:00:00.000Z';
  var reativacoes = 0, optOuts = 0, lembretes = 0;
  getRowsData_(SHEETS.METRICAS).forEach(function(m){
    if (String(m[0]) < corteISO) return;
    if (m[1] === 'reativacao_enviada') reativacoes += Number(m[2]) || 1;
    else if (m[1] === 'opt_out')        optOuts     += Number(m[2]) || 1;
    else if (m[1] === 'lembrete_enviado') lembretes  += Number(m[2]) || 1;
  });

  return {
    success:true, dias:dias,
    serie: serie,                       // [{dataBR,faturamento,agendamentos,comparecimentos,faltas,cancelamentos}]
    receitaServico: receitaServico,     // [{servico,receita,qtd}]
    eventos: { reativacoesEnviadas:reativacoes, optOuts:optOuts, lembretesEnviados:lembretes,
               taxaOptOut: lembretes>0 ? Math.round(optOuts/lembretes*100) : 0 },
    dre: {
      receita: Math.round(totalReceita*100)/100,
      entradasFinanceiro: Math.round(entradas*100)/100,
      saidasFinanceiro: Math.round(saidas*100)/100,
      resultado: Math.round((entradas - saidas)*100)/100,
      ticketMedio: totalRealizado ? Math.round(totalReceita/totalRealizado*100)/100 : 0,
      atendimentos: totalRealizado,
    },
    funil: { agendados:totalAg, comparecimentos:totalRealizado, faltas:totalFaltas, cancelamentos:totalCancel,
             taxaComparecimento:taxaComparecimento, taxaNoShow:taxaNoShow },
  };
}

function actionSalvarConfig_(b) {
  var cfg = b.config;
  if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg); } catch (e) {} }
  if (!cfg || typeof cfg !== 'object') return { success:false, error:'config_invalida' };

  // Shape LEGADO do front real v6: { diasBloqueados:[0..6], horaInicio:8, horaFim:19, intervaloDias:15 }
  var ehLegado = (cfg.horarios === undefined && cfg.servicos === undefined &&
                  (cfg.horaInicio !== undefined || cfg.diasBloqueados !== undefined));
  if (ehLegado) {
    props_().setProperties({
      horaInicio: String(cfg.horaInicio != null ? cfg.horaInicio : 8),
      horaFim: String(cfg.horaFim != null ? cfg.horaFim : 19),
      intervaloDias: String(cfg.intervaloDias != null ? cfg.intervaloDias : 15),
      diasBloqueados: JSON.stringify(cfg.diasBloqueados || []),
    }, false);
    // espelha no CONFIG_JSON rico p/ o getConfig continuar coerente
    var atual = getConfig_();
    var nomesDias = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
    atual.horarios = nomesDias.map(function(dia, idx){
      var bloq = (cfg.diasBloqueados || []).indexOf(idx) > -1;
      return { dia:dia, abre: bloq ? '—' : (cfg.horaInicio + ':00'), fecha: bloq ? '—' : (cfg.horaFim + ':00'), fechado: bloq };
    });
    atual.operacao = atual.operacao || {};
    atual.operacao.intervaloRetornoDias = Number(cfg.intervaloDias) || 15;
    props_().setProperty(PROP.CONFIG_JSON, JSON.stringify(atual));
    return { success:true, salvo:true, modo:'legado' };
  }

  // Shape RICO do nosso admin: { barbearia, servicos, horarios, operacao }
  saveConfig_(cfg);
  var legacy = derivarLegacy_(cfg);
  props_().setProperties({ horaInicio:legacy.horaInicio, horaFim:legacy.horaFim, intervaloDias:String(legacy.intervaloDias), diasBloqueados:JSON.stringify(legacy.diasBloqueados) }, false);
  return { success:true, salvo:true, modo:'rico', servicos:(cfg.servicos||[]).length, legacy:legacy };
}

function actionServicoCreate_(b) {
  var cfg = getConfig_();
  var novo = { id: nextServicoId_(cfg.servicos), nome:b.nome||'Novo serviço', preco:parseFloat(b.preco)||0, duracao:parseInt(b.duracao,10)||30, ativo:b.ativo!==false };
  cfg.servicos.push(novo); saveConfig_(cfg);
  return { success:true, servico:novo };
}
function actionServicoUpdate_(b) {
  var cfg = getConfig_(); var id = parseInt(b.id,10);
  var i = cfg.servicos.map(function(s){return s.id;}).indexOf(id);
  if (i===-1) return { success:false, error:'servico_nao_encontrado' };
  var s = cfg.servicos[i];
  if (b.nome!=null) s.nome=b.nome; if (b.preco!=null) s.preco=parseFloat(b.preco);
  if (b.duracao!=null) s.duracao=parseInt(b.duracao,10); if (b.ativo!=null) s.ativo=(b.ativo===true||b.ativo==='true');
  saveConfig_(cfg); return { success:true, servico:s };
}
function actionServicoDelete_(b) {
  var cfg = getConfig_(); var id = parseInt(b.id,10); var antes = cfg.servicos.length;
  cfg.servicos = cfg.servicos.filter(function(s){ return s.id!==id; });
  if (cfg.servicos.length===antes) return { success:false, error:'servico_nao_encontrado' };
  saveConfig_(cfg); return { success:true, removido:id };
}

// ─── BARBEIROS / PROFISSIONAIS (CRUD — editável no painel) ──────────────────
function nextBarbeiroId_(barbeiros) { return (barbeiros||[]).reduce(function(m,x){ return Math.max(m, x.id||0); }, 0) + 1; }
function actionBarbeiroCreate_(b) {
  var cfg = getConfig_(); if (!Array.isArray(cfg.barbeiros)) cfg.barbeiros = [];
  var nome = sanitizar_(String(b.nome||'').trim());
  if (!nome) return { success:false, error:'nome_obrigatorio' };
  var novo = { id: nextBarbeiroId_(cfg.barbeiros), nome:nome, ativo:b.ativo!==false };
  cfg.barbeiros.push(novo); saveConfig_(cfg);
  return { success:true, barbeiro:novo };
}
function actionBarbeiroUpdate_(b) {
  var cfg = getConfig_(); if (!Array.isArray(cfg.barbeiros)) cfg.barbeiros = [];
  var id = parseInt(b.id,10);
  var i = cfg.barbeiros.map(function(x){return x.id;}).indexOf(id);
  if (i===-1) return { success:false, error:'barbeiro_nao_encontrado' };
  if (b.nome!=null) cfg.barbeiros[i].nome = sanitizar_(String(b.nome).trim());
  if (b.ativo!=null) cfg.barbeiros[i].ativo = (b.ativo===true||b.ativo==='true');
  saveConfig_(cfg); return { success:true, barbeiro:cfg.barbeiros[i] };
}
function actionBarbeiroDelete_(b) {
  var cfg = getConfig_(); if (!Array.isArray(cfg.barbeiros)) cfg.barbeiros = [];
  var id = parseInt(b.id,10); var antes = cfg.barbeiros.length;
  cfg.barbeiros = cfg.barbeiros.filter(function(x){ return x.id!==id; });
  if (cfg.barbeiros.length===antes) return { success:false, error:'barbeiro_nao_encontrado' };
  saveConfig_(cfg); return { success:true, removido:id };
}

// ─── WEBHOOK / BOT (esqueleto fiel ao master — integrações marcadas) ────────
// Roteia a mensagem recebida pela máquina de estados (PARTE 7/8).
function processarWebhook_(body) {
  try {
    var value = body.entry[0].changes[0].value;

    // COEXISTÊNCIA: o dono respondeu pelo app (mesmo número) → echo da Meta.
    // Pausa o bot nessa conversa por 3h para não atropelar o atendimento humano.
    if (value.message_echoes && value.message_echoes.length) {
      value.message_echoes.forEach(function(ec){ if (ec.to) pausarBot_(telLimpo_(ec.to), 3); });
      return;
    }

    if (!value.messages || !value.messages.length) return; // status callbacks → ignora
    var msg = value.messages[0];
    var from = telLimpo_(msg.from);

    // IDEMPOTÊNCIA (SEÇÃO 38): a Meta reentrega o mesmo webhook se o GAS
    // demorar >20s. Ignora mensagem já processada (dedup por msg.id via Cache).
    if (msg.id) {
      var cacheW = CacheService.getScriptCache();
      if (cacheW.get('msg_' + msg.id)) return; // já processada
      cacheW.put('msg_' + msg.id, '1', 21600); // 6h
    }

    // Cliente interagiu → zera o controle antifadiga de sugestões.
    resetarSugestoes_(from);

    // Se um humano assumiu a conversa, o bot fica em silêncio (Coexistência).
    // "menu" ou "voltar" devolve o controle ao bot.
    if (botPausado_(from)) {
      var t0 = (msg.text && msg.text.body ? msg.text.body : '').trim().toLowerCase();
      if (t0 === 'menu' || t0 === 'voltar' || t0 === 'bot') { retomarBot_(from); }
      else { marcarMensagemRecebida_(from); return; }
    }

    if (msg.type !== 'text') return enviarWhatsApp_(from, menuPrincipal_(''));
    var bruto = (msg.text && msg.text.body ? msg.text.body : '').trim();
    var texto = bruto.toLowerCase();
    marcarMensagemRecebida_(from); // abre janela de 24h

    var estado = getEstado_(from);

    // 1) Estados multi-etapas têm prioridade sobre palavras-chave
    if (estado && estado.etapa === 'CONFIRMAR_CANCELAMENTO') return fluxoConfirmarCancelamento_(from, texto, estado);
    if (estado && estado.etapa === 'ESCOLHER_CANCELAMENTO')  return fluxoEscolherCancelamento_(from, texto, estado);
    if (estado && estado.etapa === 'NPS')                     return fluxoNPS_(from, texto, estado);
    if (estado && estado.etapa === 'AGUARDANDO_FILA')         return fluxoFilaEspera_(from, texto, estado);

    // 2) Opt-out (LGPD/Meta) — encerra comunicações promocionais
    if (texto === 'sair' || texto === 'parar' || texto === 'stop' || texto === 'descadastrar') {
      props_().setProperty('optout_' + from, '1');
      registrarMetrica_('opt_out', 1, { telefone: from });
      return enviarWhatsApp_(from, 'Pronto! Você não receberá mais mensagens promocionais. Responder a qualquer momento reativa o atendimento. Para agendar: ' + linkAgendamento_());
    }

    // 3) Escalada para humano
    if (KEYWORDS.HUMANO.indexOf(texto) > -1) {
      if (getSecret_('MODO_COEXISTENCIA') === '1') {
        pausarBot_(from, 3); // bot silencia; dono atende no app, mesmo número
        notificarDono_('🙋 ' + (cliNome_(from) || from) + ' pediu atendimento humano. Responda pelo app.');
        return enviarWhatsApp_(from, 'Certo! Um atendente vai te responder por aqui em instantes. 💈\n(Atendimento: seg–sáb, 9h–19h)');
      }
      return enviarWhatsApp_(from, 'Claro! Falar com atendente: https://wa.me/' + getSecret_(PROP.SAC_NUMERO) + '\n\nAtendimento: seg–sáb, 9h–19h.');
    }

    // 3) Confirmar presença (C/SIM/...)
    if (KEYWORDS.CONFIRMAR.indexOf(texto) > -1) {
      var rc = actionConfirmarPresenca_({ tel: from });
      return enviarWhatsApp_(from, rc.success ? 'Presença confirmada! Te esperamos 💈' : 'Não encontrei agendamento pendente de confirmação.');
    }

    // 4) Cancelamento → ramifica 0 / 1 / 2+
    if (KEYWORDS.CANCELAR.indexOf(texto) > -1) return iniciarCancelamento_(from);

    // 5) Agendar / reagendar (MVP: site; V2: fluxo completo no WhatsApp)
    if (KEYWORDS.AGENDAR.indexOf(texto) > -1 || KEYWORDS.REAGENDAR.indexOf(texto) > -1 || texto === '1')
      return enviarWhatsApp_(from, 'Para agendar, é rapidinho pelo site: ' + linkAgendamento_());

    // 6) Opções numeradas do menu
    if (texto === '2') return enviarWhatsApp_(from, listarServicosTexto_());
    if (texto === '3') return enviarWhatsApp_(from, 'Combos e promoções 💈\n' + listarServicosTexto_() + '\nUse o site para garantir o seu: ' + linkAgendamento_());
    if (texto === '4') return enviarWhatsApp_(from, meusAgendamentosTexto_(from));
    if (texto === '5') {
      if (getSecret_('MODO_COEXISTENCIA') === '1') { pausarBot_(from, 3); notificarDono_('🙋 ' + (cliNome_(from) || from) + ' pediu atendimento (menu).'); return enviarWhatsApp_(from, 'Um atendente vai te responder por aqui. 💈'); }
      return enviarWhatsApp_(from, 'Falar com atendente: https://wa.me/' + getSecret_(PROP.SAC_NUMERO));
    }

    // 7) Fallback / primeiro contato → menu personalizado
    var cli = findClienteByTel_(from);
    return enviarWhatsApp_(from, menuPrincipal_(cli ? cli.obj[CLI.NOME] : ''));
  } catch (e) { logErro_('processarWebhook', e); }
}

// ── Fluxo de cancelamento (estado em CacheService, TTL 6h) ──────────────────
function iniciarCancelamento_(from) {
  var futuros = buscarAgendamentosFuturos_(from);
  if (futuros.length === 0) return enviarWhatsApp_(from, 'Não encontrei agendamentos futuros. Para agendar: ' + linkAgendamento_());
  if (futuros.length === 1) {
    var a = futuros[0];
    setEstado_(from, { etapa:'CONFIRMAR_CANCELAMENTO', agId:a[AG.ID] });
    return enviarWhatsApp_(from, 'Encontrei: ' + a[AG.SERV] + ' em ' + dataBR_(a[AG.DATA]) + ' às ' + a[AG.HORA] + '.\nDeseja cancelar? Responda SIM ou NÃO.');
  }
  // 2+ → listar numerado
  var lista = futuros.map(function(a, i){ return (i+1) + ') ' + a[AG.SERV] + ' — ' + dataBR_(a[AG.DATA]) + ' ' + a[AG.HORA]; }).join('\n');
  setEstado_(from, { etapa:'ESCOLHER_CANCELAMENTO', ids: futuros.map(function(a){ return a[AG.ID]; }) });
  return enviarWhatsApp_(from, 'Você tem mais de um agendamento:\n' + lista + '\n\nResponda com o número que deseja cancelar.');
}
function fluxoEscolherCancelamento_(from, texto, estado) {
  var n = parseInt(texto, 10);
  if (isNaN(n) || n < 1 || n > estado.ids.length)
    return enviarWhatsApp_(from, 'Número inválido. Escolha entre 1 e ' + estado.ids.length + '.');
  var agId = estado.ids[n-1];
  var r = findRow_(SHEETS.AGENDAMENTOS, AG.ID, agId);
  setEstado_(from, { etapa:'CONFIRMAR_CANCELAMENTO', agId: agId });
  return enviarWhatsApp_(from, 'Cancelar ' + r.obj[AG.SERV] + ' em ' + dataBR_(r.obj[AG.DATA]) + ' às ' + r.obj[AG.HORA] + '? Responda SIM ou NÃO.');
}
function fluxoConfirmarCancelamento_(from, texto, estado) {
  if (KEYWORDS.CONFIRMAR.indexOf(texto) > -1 || texto === 'sim') {
    var r = actionCancelar_({ agendamentoId: estado.agId });
    limparEstado_(from);
    return enviarWhatsApp_(from, r.success ? 'Agendamento cancelado! Para reagendar: ' + linkAgendamento_() : 'Não consegui cancelar: ' + (r.error || 'erro') + '.');
  }
  if (texto === 'não' || texto === 'nao' || texto === 'n') { limparEstado_(from); return enviarWhatsApp_(from, 'Tudo bem! Agendamento mantido 💈'); }
  return enviarWhatsApp_(from, 'Por favor, responda SIM ou NÃO.');
}

// ── NPS pós-atendimento (estado setado por verificarFeedback) ───────────────
function fluxoNPS_(from, texto, estado) {
  var nota = parseInt(texto, 10);
  if (isNaN(nota) || nota < 1 || nota > 5) return enviarWhatsApp_(from, 'Avalie de 1 a 5, por favor ⭐');
  var cli = findClienteByTel_(from);
  sheet_(SHEETS.FEEDBACKS).appendRow([ now_(), cli ? cli.obj[CLI.ID] : '', from, estado.agId || '', nota, '' ]);
  limparEstado_(from);
  if (nota >= 4) {
    var maps = getSecret_(PROP.GOOGLE_MAPS_LINK);
    return enviarWhatsApp_(from, 'Que bom! 💈 Se puder, deixe sua avaliação: ' + (maps || 'obrigado!'));
  }
  enviarWhatsApp_(from, 'Obrigado pelo retorno. Vamos melhorar! Um atendente vai te chamar.');
  return enviarWhatsApp_(telLimpo_(getSecret_(PROP.SAC_NUMERO)), 'NPS baixo (' + nota + ') de ' + from + ' — verificar.');
}

// ── Textos do bot ───────────────────────────────────────────────────────────
function menuPrincipal_(nome) {
  var saud = nome ? ('Olá, ' + nome + '! 👋') : 'Olá! 👋';
  return saud + '\nBem-vindo à ' + getConfig_().barbearia.nome + '.\n\n1️⃣ Agendar horário\n2️⃣ Ver serviços\n3️⃣ Promoções e combos\n4️⃣ Meus agendamentos\n5️⃣ Falar com atendente';
}
function listarServicosTexto_() {
  return getConfig_().servicos.filter(function(s){ return s.ativo !== false; })
    .map(function(s, i){ return (i+1) + ') ' + s.nome + ' — R$ ' + s.preco + ' (' + s.duracao + 'min)'; }).join('\n');
}
function meusAgendamentosTexto_(tel) {
  var r = actionMeusAgendamentos_({ tel: tel });
  if (!r.agendamentos.length) return 'Você não tem agendamentos futuros. Para marcar: ' + linkAgendamento_();
  return 'Seus agendamentos:\n' + r.agendamentos.map(function(a){ return '• ' + a.servico + ' — ' + a.dataBR + ' ' + a.horario; }).join('\n');
}
function linkAgendamento_() { return getConfig_().barbearia.linkAgendamento || getSecret_('SITE_URL') || '[link do site]'; }
function buscarAgendamentosFuturos_(tel) {
  var hoje = hojeISO_(); var t = telLimpo_(tel);
  return getAgendamentos_().filter(function(a){
    return telLimpo_(a[AG.TEL]) === t && (a[AG.STATUS] === STATUS.CONFIRMADO || a[AG.STATUS] === STATUS.PRESENCA) && String(a[AG.DATA]) >= hoje;
  }).sort(function(x,y){ return (x[AG.DATA]+x[AG.HORA]).localeCompare(y[AG.DATA]+y[AG.HORA]); });
}

// ── Estado de conversa (CacheService, TTL 6h = 21600s) ──────────────────────
function getEstado_(tel) { var s = CacheService.getScriptCache().get('estado_' + tel); if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }
function setEstado_(tel, obj) { CacheService.getScriptCache().put('estado_' + tel, JSON.stringify(obj), 21600); }
function limparEstado_(tel) { CacheService.getScriptCache().remove('estado_' + tel); }

// ── Janela de 24h (PARTE 9) ─────────────────────────────────────────────────
function marcarMensagemRecebida_(tel) { CacheService.getScriptCache().put('janela_' + tel, String(Date.now()), 86400); }
function clienteAtivouJanela_(tel) { var t = CacheService.getScriptCache().get('janela_' + tel); return !!t && (Date.now() - parseInt(t,10) < 24*3600*1000); }
function optOut_(tel) { return props_().getProperty('optout_' + telLimpo_(tel)) === '1'; }
// Coexistência (mesmo número app + API): pausa do bot quando humano assume
function pausarBot_(tel, horas) { CacheService.getScriptCache().put('pausa_' + telLimpo_(tel), '1', (horas||3)*3600); }
function botPausado_(tel) { return CacheService.getScriptCache().get('pausa_' + telLimpo_(tel)) === '1'; }
function retomarBot_(tel) { CacheService.getScriptCache().remove('pausa_' + telLimpo_(tel)); }
function notificarDono_(msg) { var d = telLimpo_(getSecret_(PROP.SAC_NUMERO)); if (d) enviarWhatsApp_(d, msg); }
function cliNome_(tel) { var c = findClienteByTel_(telLimpo_(tel)); return c ? c.obj[CLI.NOME] : ''; }

// ─── SUGGESTION GOVERNANCE (antifadiga, SEÇÃO 20) ───────────────────────────
// Evita sobrecarregar o cliente com mensagens proativas: cooldown 4h entre
// sugestões, máx 3 ativas, silencia após 2 ignoradas. Zera quando o cliente responde.
function sugState_(tel) {
  var r = props_().getProperty('sug_' + telLimpo_(tel));
  if (!r) return { pending:0, ignored:0, last:0 };
  try { return JSON.parse(r); } catch (e) { return { pending:0, ignored:0, last:0 }; }
}
function sugSave_(tel, s) { props_().setProperty('sug_' + telLimpo_(tel), JSON.stringify(s)); }
function podeEnviarSugestao_(tel) {
  if (optOut_(tel)) return false;
  var s = sugState_(tel);
  if ((s.ignored||0) >= 2) return false;                       // silenciado
  if ((s.pending||0) >= 3) return false;                       // máx 3 ativas
  if (Date.now() - (s.last||0) < 4*3600*1000) return false;    // cooldown 4h
  return true;
}
function registrarSugestaoEnviada_(tel) {
  var s = sugState_(tel);
  s.last = Date.now(); s.pending = (s.pending||0) + 1; s.ignored = (s.ignored||0) + 1;
  sugSave_(tel, s);
}
function resetarSugestoes_(tel) { sugSave_(tel, { pending:0, ignored:0, last:0 }); }

// ── Envio WhatsApp (texto livre e template) via Graph API v19.0 ─────────────
// Robustez (SEÇÃO 39): envia com retry+backoff exponencial; se falhar de vez,
// enfileira em MensagensPendentes p/ reenvio posterior. Detecta token 401.
function enviarWhatsApp_(tel, texto) {
  var token = getSecret_(PROP.WHATSAPP_TOKEN), phoneId = getSecret_(PROP.PHONE_NUMBER_ID);
  if (!token || !phoneId) { logErro_('enviarWhatsApp', 'credenciais Meta ausentes'); return false; }
  var payload = { messaging_product:'whatsapp', to:telLimpo_(tel), type:'text', text:{ body:texto } };
  return enviarComRetry_(phoneId, token, payload, 'texto', telLimpo_(tel), texto);
}
function enviarWhatsAppTemplate_(tel, template, params) {
  var token = getSecret_(PROP.WHATSAPP_TOKEN), phoneId = getSecret_(PROP.PHONE_NUMBER_ID);
  if (!token || !phoneId) { logErro_('enviarTemplate', 'credenciais Meta ausentes'); return false; }
  var comps = [{ type:'body', parameters: (params||[]).map(function(p){ return { type:'text', text:String(p) }; }) }];
  var payload = { messaging_product:'whatsapp', to:telLimpo_(tel), type:'template',
    template:{ name:template, language:{ code:'pt_BR' }, components:comps } };
  return enviarComRetry_(phoneId, token, payload, 'template:' + template, telLimpo_(tel), JSON.stringify(params||[]));
}

// retry com backoff exponencial (0.5s, 1s, 2s); 401/403 não retenta (token inválido)
function enviarComRetry_(phoneId, token, payload, tipo, destino, conteudo) {
  var maxTent = 3, espera = 500;
  for (var tent = 1; tent <= maxTent; tent++) {
    var r = fetchMeta_(phoneId, token, payload);
    if (r.ok) return true;
    if (r.code === 400 || r.code === 401 || r.code === 403) { // SEÇÃO 39.1: não-recuperáveis
      if (r.code === 401 || r.code === 403) alertarTokenExpirado_(r.code);
      else logErro_('enviarComRetry', 'HTTP 400 não-recuperável');
      break;
    }
    if (tent < maxTent) { Utilities.sleep(espera); espera *= 2; }
  }
  enfileirarPendente_(tipo, destino, conteudo); // falhou após retries → fila
  return false;
}
function fetchMeta_(phoneId, token, payload) {
  try {
    var resp = UrlFetchApp.fetch('https://graph.facebook.com/v19.0/' + phoneId + '/messages',
      { method:'post', contentType:'application/json', headers:{ Authorization:'Bearer '+token }, payload:JSON.stringify(payload), muteHttpExceptions:true });
    var code = resp.getResponseCode();
    if (code >= 200 && code < 300) return { ok:true, code:code };
    logErro_('fetchMeta', 'HTTP ' + code + ' · ' + resp.getContentText().substring(0,200));
    return { ok:false, code:code };
  } catch (e) { logErro_('fetchMeta', e); return { ok:false, code:0 }; }
}

// alerta o dono UMA vez por dia quando o token Meta expira (401/403)
function alertarTokenExpirado_(code) {
  var chave = 'tokenalert_' + hojeISO_();
  if (jaProcessou_(chave)) return;
  marcarProcessado_(chave);
  var sac = getSecret_(PROP.SAC_NUMERO);
  var msg = '⚠️ AQUINO: o token do WhatsApp parou de funcionar (HTTP ' + code + '). '
          + 'As mensagens estão sendo enfileiradas. Renove o WHATSAPP_TOKEN no painel da Meta.';
  // tenta avisar por e-mail (não depende do mesmo token) e, se houver SAC, registra no Log
  var emailDono = getSecret_(PROP.EMAIL_DONO);
  if (emailDono) { try { MailApp.sendEmail(emailDono, 'AQUINO · Token WhatsApp expirado', msg); } catch (e) {} }
  logErro_('alertarTokenExpirado', 'HTTP ' + code + (sac ? (' · SAC ' + sac) : ''));
}

// ── Fila de reenvio (MensagensPendentes) ────────────────────────────────────
function enfileirarPendente_(tipo, destino, conteudo) {
  try {
    sheet_(SHEETS.PENDENTES).appendRow([ Utilities.getUuid().substring(0,8), now_(), tipo, destino, String(conteudo).substring(0,1000), 0, '', 'pendente' ]);
  } catch (e) { logErro_('enfileirarPendente', e); }
}
// trigger a cada 30min: tenta reenviar pendentes (máx 5 tentativas, depois marca 'falha')
function reenviarPendentes() {
  var token = getSecret_(PROP.WHATSAPP_TOKEN), phoneId = getSecret_(PROP.PHONE_NUMBER_ID);
  if (!token || !phoneId) return;
  var rows = getRowsRaw_(SHEETS.PENDENTES);
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (row[MP_.STATUS] !== 'pendente') continue;
    var tent = (Number(row[MP_.TENTATIVAS]) || 0) + 1;
    var tipo = String(row[MP_.TIPO] || 'texto'), destino = String(row[MP_.DESTINO]), conteudo = String(row[MP_.CONTEUDO]);
    var ok;
    if (tipo.indexOf('template:') === 0) ok = enviarWhatsAppTemplate_(destino, tipo.replace('template:',''), (function(){ try { return JSON.parse(conteudo); } catch(e){ return []; } })());
    else ok = enviarWhatsApp_(destino, conteudo);
    setCell_(SHEETS.PENDENTES, i+1, MP_.TENTATIVAS, tent);
    if (ok) setCell_(SHEETS.PENDENTES, i+1, MP_.STATUS, 'enviado');
    else if (tent >= 5) { setCell_(SHEETS.PENDENTES, i+1, MP_.STATUS, 'falha'); setCell_(SHEETS.PENDENTES, i+1, MP_.ERRO, 'esgotou tentativas'); }
  }
}

// backup semanal: exporta cada aba como JSON num arquivo no Drive (pasta "AQUINO_Backups")
function backupSemanal() {
  try {
    var pastas = DriveApp.getFoldersByName('AQUINO_Backups');
    var pasta = pastas.hasNext() ? pastas.next() : DriveApp.createFolder('AQUINO_Backups');
    var dump = {};
    for (var k in SHEETS) dump[SHEETS[k]] = getRowsRaw_(SHEETS[k]);
    var nome = 'aquino_backup_' + Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd') + '.json';
    pasta.createFile(nome, JSON.stringify(dump), 'application/json');
    // retém apenas os 8 backups mais recentes
    var files = [], it = pasta.getFiles();
    while (it.hasNext()) files.push(it.next());
    files.sort(function(a,b){ return b.getDateCreated() - a.getDateCreated(); });
    for (var i = 8; i < files.length; i++) files[i].setTrashed(true);
    Logger.log('Backup criado: ' + nome);
  } catch (e) { logErro_('backupSemanal', e); }
}

// ─── TRIGGERS DE TEMPO (PARTE 5.3) ──────────────────────────────────────────
// Anti-duplicata por chave em Script Properties
function jaProcessou_(chave) { return props_().getProperty('done_' + chave) === '1'; }
function marcarProcessado_(chave) { props_().setProperty('done_' + chave, '1'); }

// A cada 1h: lembrete 24h antes e 1h antes (livre dentro da janela, senão template)
function verificarLembretes() {
  var agora = new Date();
  var ags = getAgendamentos_();
  ags.forEach(function(a) {
    if (a[AG.STATUS] !== STATUS.CONFIRMADO) return;
    var quando = new Date(a[AG.DATA] + 'T' + (a[AG.HORA].length===5 ? a[AG.HORA] : '00:00') + ':00');
    if (isNaN(quando.getTime())) return;
    var horas = (quando.getTime() - agora.getTime()) / 3600000;
    var tel = a[AG.TEL], nome = a[AG.NOME];
    if (horas > 23 && horas <= 24 && !jaProcessou_('lem24_' + a[AG.ID])) {
      if (clienteAtivouJanela_(tel)) enviarWhatsApp_(tel, 'Olá, ' + nome + '! 👋 Lembrete do seu horário amanhã: ' + dataBR_(a[AG.DATA]) + ' às ' + a[AG.HORA] + '. Responda C para confirmar ou CANCELAR. 💈');
      else enviarWhatsAppTemplate_(tel, 'lembrete_24h', [nome, dataBR_(a[AG.DATA]), a[AG.HORA]]);
      marcarProcessado_('lem24_' + a[AG.ID]);
    }
    if (horas > 0 && horas <= 1 && !jaProcessou_('lem1_' + a[AG.ID])) {
      if (clienteAtivouJanela_(tel)) enviarWhatsApp_(tel, nome + ', estamos te esperando em 1 hora! 🔔');
      else enviarWhatsAppTemplate_(tel, 'lembrete_1h', [nome]);
      marcarProcessado_('lem1_' + a[AG.ID]);
    }
  });
}

// Todo dia 9h: aviso 5 dias antes do retorno previsto (UltimoAgendamento + IntervaloDias)
function verificarLembrete5Dias() {
  var hoje = hojeISO_();
  getClientes_().forEach(function(c) {
    if (optOut_(c[CLI.TEL])) return; // promocional → respeita opt-out
    var ult = c[CLI.ULTIMO_AG]; if (!ult) return;
    var prev = new Date(String(ult).substring(0,10) + 'T12:00:00');
    if (isNaN(prev.getTime())) return;
    prev.setDate(prev.getDate() + (Number(c[CLI.INTERVALO]) || 15) - 5);
    var alvo = Utilities.formatDate(prev, tz_(), 'yyyy-MM-dd');
    var chave = '5dias_' + c[CLI.ID] + '_' + alvo;
    if (alvo === hoje && !jaProcessou_(chave)) {
      if (!podeEnviarSugestao_(c[CLI.TEL])) return; // antifadiga
      enviarWhatsAppTemplate_(c[CLI.TEL], 'lembrete_5dias', [c[CLI.NOME], linkAgendamento_()]);
      registrarSugestaoEnviada_(c[CLI.TEL]);
      marcarProcessado_(chave);
    }
  });
}

// Todo dia 10h: reativação de inativos + aniversário (UltimoLembrete anti-spam)
function verificarReativacao() {
  var hoje = hojeISO_();
  var usaTemplate = getSecret_(PROP.TEMPLATES_ATIVOS) === '1';
  getClientes_().forEach(function(c, idx) {
    if (optOut_(c[CLI.TEL])) return; // respeita opt-out (promocional)
    var rowIndex = idx + 2;
    // aniversário (col Nascimento DD/MM/AAAA)
    var nasc = String(c[CLI.NASC] || '');
    var ddmm = nasc.split('/').slice(0,2).join('/');
    var hojeBR = Utilities.formatDate(new Date(), tz_(), 'dd/MM');
    if (ddmm && ddmm === hojeBR && c[CLI.ULTIMO_LEM] !== (hoje + '_aniv')) {
      if (usaTemplate) enviarWhatsAppTemplate_(c[CLI.TEL], 'aniversario', [c[CLI.NOME], linkAgendamento_()]);
      else enviarWhatsApp_(c[CLI.TEL], '🎂 Feliz aniversário, ' + c[CLI.NOME] + '! Use ANIV10 p/ 10% de desconto. ' + linkAgendamento_());
      setCell_(SHEETS.CLIENTES, rowIndex, CLI.ULTIMO_LEM, hoje + '_aniv');
      return;
    }
    // aniversário de DEPENDENTE (filho) — felicita no WhatsApp do responsável.
    // Marca anti-spam por dependente: UltimoLembrete = "<hoje>_anivdep_<nome>".
    var deps = parseDependentes_(c[CLI.DEP]);
    for (var di = 0; di < deps.length; di++) {
      var dnasc = String(deps[di].nascimento || '');
      var dddmm = dnasc.split('/').slice(0,2).join('/');
      var marca = hoje + '_anivdep_' + deps[di].nome;
      if (dddmm && dddmm === hojeBR && c[CLI.ULTIMO_LEM] !== marca) {
        var primeiroDep = String(deps[di].nome).split(/\s+/)[0];
        enviarWhatsApp_(c[CLI.TEL], '🎂 Hoje é aniversário do(a) ' + primeiroDep + '! Que tal comemorar com um corte caprichado? ' + linkAgendamento_());
        setCell_(SHEETS.CLIENTES, rowIndex, CLI.ULTIMO_LEM, marca);
        return;
      }
    }
    // reativação por intervalo
    var dias = diasDesde_(c[CLI.ULTIMO_AG]);
    var intervalo = Number(c[CLI.INTERVALO]) || 15;
    if (dias >= intervalo && c[CLI.ULTIMO_LEM] !== (hoje + '_reativ')) {
      if (!podeEnviarSugestao_(c[CLI.TEL])) return; // antifadiga (cooldown/silenciado)
      if (usaTemplate) enviarWhatsAppTemplate_(c[CLI.TEL], 'reativacao_cliente', [c[CLI.NOME], String(dias), linkAgendamento_()]);
      else enviarWhatsApp_(c[CLI.TEL], 'Olá, ' + c[CLI.NOME] + '! Já faz ' + dias + ' dias desde o último corte. Que tal renovar o visual? 💈 ' + linkAgendamento_());
      registrarSugestaoEnviada_(c[CLI.TEL]);
      setCell_(SHEETS.CLIENTES, rowIndex, CLI.ULTIMO_LEM, hoje + '_reativ'); // col I — nunca col E
      registrarMetrica_('reativacao_enviada', 1, { clienteID:c[CLI.ID], diasInativo:dias });
    }
  });
}

// Todo dia ao meio-dia: marca faltas (confirmado/presenca vencidos)
function registrarFaltas() {
  var hoje = hojeISO_();
  var rows = getRowsRaw_(SHEETS.AGENDAMENTOS);
  for (var i = 1; i < rows.length; i++) {
    var st = rows[i][AG.STATUS], data = String(rows[i][AG.DATA]);
    if ((st===STATUS.CONFIRMADO || st===STATUS.PRESENCA) && data && data < hoje) {
      setCell_(SHEETS.AGENDAMENTOS, i+1, AG.STATUS, STATUS.FALTOU);
      registrarMetrica_('falta_registrada', 1, { clienteID: rows[i][AG.CLI_ID], impacto: Number(rows[i][AG.PRECO])||0 });
    }
  }
}

// V2: a cada 1h — NPS 2h após o horário; abre estado NPS e marca realizado
function verificarFeedback() {
  var agora = new Date();
  getAgendamentos_().forEach(function(a) {
    if (a[AG.STATUS] !== STATUS.PRESENCA && a[AG.STATUS] !== STATUS.CONFIRMADO) return;
    var quando = new Date(a[AG.DATA] + 'T' + (a[AG.HORA].length===5 ? a[AG.HORA] : '00:00') + ':00');
    if (isNaN(quando.getTime())) return;
    var horas = (agora.getTime() - quando.getTime()) / 3600000;
    if (horas >= 1.5 && horas <= 2.5 && !jaProcessou_('nps_' + a[AG.ID])) {
      var r = findRow_(SHEETS.AGENDAMENTOS, AG.ID, a[AG.ID]);
      if (r) setCell_(SHEETS.AGENDAMENTOS, r.rowIndex, AG.STATUS, STATUS.REALIZADO);
      setEstado_(telLimpo_(a[AG.TEL]), { etapa:'NPS', agId:a[AG.ID] });
      enviarWhatsApp_(a[AG.TEL], 'Obrigado pela preferência 💈 Como foi sua experiência hoje? Avalie de 1 a 5 ⭐');
      marcarProcessado_('nps_' + a[AG.ID]);
    }
  });
}

// ─── SCORE DE CONFIANÇA ─────────────────────────────────────────────────────
// Base 10 (começa confiável e DIMINUI). Penaliza ausência e cancelamentos,
// bonifica fidelidade.
function contarCancelamentos_(clienteId) {
  return getAgendamentos_().filter(function(a){ return a[AG.CLI_ID]===clienteId && a[AG.STATUS]===STATUS.CANCELADO; }).length;
}
function totalVisitas_(clienteId) {
  return getAgendamentos_().filter(function(a){ return a[AG.CLI_ID]===clienteId && (a[AG.STATUS]===STATUS.REALIZADO || a[AG.STATUS]===STATUS.PRESENCA); }).length;
}
function contarFaltas_(clienteId) {
  return getAgendamentos_().filter(function(a){ return a[AG.CLI_ID]===clienteId && a[AG.STATUS]===STATUS.FALTOU; }).length;
}
// aceita clienteId; monta {cancelamentos, diasDesde, totalVisitas} do cliente
function calcularScore_(clienteId) {
  var r = findRow_(SHEETS.CLIENTES, CLI.ID, clienteId);
  var dias = r ? diasDesde_(r.obj[CLI.ULTIMO_AG]) : null;
  var visitas = r ? (Number(r.obj[CLI.TOTAL])||0) : 0;
  var cancelamentos = contarCancelamentos_(clienteId);
  var score = 10;
  if (dias !== null && dias !== undefined) { if (dias > 60) score -= 4; else if (dias > 30) score -= 2; }
  if (cancelamentos > 2) score -= 3; else if (cancelamentos > 0) score -= 1;
  if (visitas > 20) score += 2; else if (visitas > 10) score += 1;
  return Math.max(0, Math.min(10, score));
}
// Dois eixos (como na produção): nível de fidelidade (visitas) + status de confiança (score)
function getNivel_(visitas)   { if (visitas>=20) return 'VIP'; if (visitas>=12) return 'Ouro'; if (visitas>=6) return 'Prata'; return 'Bronze'; }
function getEmojiNivel_(nivel){ return ({VIP:'💎',Ouro:'🥇',Prata:'🥈',Bronze:'🥉'})[nivel] || ''; }
function getStatusScore_(score){
  if (score>=8) return { label:'Confiável', cor:'#22C55E' };
  if (score>=6) return { label:'Normal',    cor:'#38BDF8' };
  if (score>=4) return { label:'Atenção',   cor:'#F59E0B' };
  if (score>=2) return { label:'Risco',     cor:'#EF4444' };
  return           { label:'Crítico',   cor:'#DC2626' };
}
// helper combinado p/ os endpoints (nível + status num objeto só)
function classificarCliente_(clienteId) {
  var visitas = totalVisitas_(clienteId);
  var nivel = getNivel_(visitas);
  var score = calcularScore_(clienteId);
  var st = getStatusScore_(score);
  return { score:score, nivel:nivel, nivelEmoji:getEmojiNivel_(nivel), statusLabel:st.label, statusCor:st.cor };
}

// Disparadores de decisão — thresholds REAIS de produção
function shouldActivateSinal_(clienteId)   { return contarCancelamentos_(clienteId) >= 2 || calcularScore_(clienteId) < 4; }
function shouldFlagRisk_(clienteId)        { return calcularScore_(clienteId) < 5; }
function shouldSuggestRecurrence_(cliente) { if (!cliente) return false; return calcularScore_(cliente[CLI.ID]) >= 7 && diasDesde_(cliente[CLI.ULTIMO_AG]) > 25 && (Number(cliente[CLI.TOTAL])||0) >= 5; }

// ─── INFORMATION PRIORITY ENGINE (IPE) — pesos REAIS de produção ────────────
var IPE_WEIGHTS = {
  faltaHoje:      { score:95, financial:65, label:'risco financeiro direto', icon:'⚠️' },
  vagoPremium:    { score:80, financial:90, label:'receita não capturada',   icon:'📅' },
  vipReativacao:  { score:70, financial:80, label:'LTV em risco',            icon:'💎' },
  waitlistAtiva:  { score:65, financial:55, label:'conversão disponível',    icon:'👥' },
  aniversariante: { score:40, financial:30, label:'fidelização',            icon:'🎂' },
};
function ipeRank_(tipo) { var w = IPE_WEIGHTS[tipo]; return w ? (w.score*0.4 + w.financial*0.6) : 0; }


// ─── COBRANÇA / SINAL (SEÇÃO 34) — modelos A..G via COBRANCA_MODO ────────────
function deveExigirSinal_(cliente, ag) {
  var modo = getSecret_(PROP.COBRANCA_MODO) || 'desativado';
  switch (modo) {
    case 'universal':    return true;
    case 'novatos':      return !cliente || (Number(cliente[CLI.TOTAL])||0) === 0;
    case 'reincidentes': return cliente ? contarFaltas_(cliente[CLI.ID]) >= 1 : false;
    case 'longos':       return (ag.duracao || 0) >= (parseInt(getSecret_(PROP.COBRANCA_DURACAO_MIN)||'60',10));
    case 'premium':      return horarioPremium_(ag.data);
    case 'score':        return cliente ? calcularScore_(cliente[CLI.ID]) < (parseInt(getSecret_(PROP.COBRANCA_SCORE_LIMITE)||'5',10)) : true;
    case 'desativado':
    default:             return false;
  }
}
function horarioPremium_(data) {
  var premium = (getSecret_(PROP.COBRANCA_HORARIOS_PREMIUM) || 'sabado,domingo').toLowerCase();
  var dow = diaSemana_(data).toLowerCase().replace('á','a').replace('ç','c'); // sabado/domingo
  return premium.indexOf(dow) > -1;
}

// ─── MERCADO PAGO — Pix do sinal (POST /v1/payments) + webhook ──────────────
function gerarPixSinal_(agId, valor, nome, tel, email) {
  var token = getSecret_(PROP.MP_ACCESS_TOKEN);
  if (!token) { logErro_('gerarPixSinal', 'MP_ACCESS_TOKEN ausente'); return { erro:'mp_nao_configurado' }; }
  var payload = {
    transaction_amount: Number(valor),
    description: 'Sinal de agendamento — ' + nome,
    payment_method_id: 'pix',
    payer: { email: email || (telLimpo_(tel) + '@cliente.aquino'), first_name: nome },
    external_reference: agId,
    notification_url: (getSecret_('GAS_WEBHOOK_URL') || '') + '?source=mp',
  };
  try {
    var resp = UrlFetchApp.fetch('https://api.mercadopago.com/v1/payments', {
      method:'post', contentType:'application/json',
      headers:{ Authorization:'Bearer '+token, 'X-Idempotency-Key': agId },
      payload: JSON.stringify(payload), muteHttpExceptions:true,
    });
    var data = JSON.parse(resp.getContentText());
    var tdata = data.point_of_interaction && data.point_of_interaction.transaction_data;
    salvarPagamentoId_(agId, String(data.id || ''));
    return {
      paymentId: data.id, status: data.status,
      qrCode: tdata ? tdata.qr_code : null,            // copia-e-cola
      qrCodeBase64: tdata ? tdata.qr_code_base64 : null,
      ticketUrl: tdata ? tdata.ticket_url : null,
    };
  } catch (e) { logErro_('gerarPixSinal', e); return { erro:'falha_mp' }; }
}
function salvarPagamentoId_(agId, payId) { props_().setProperty('pay_' + agId, payId); }

// Webhook do Mercado Pago (notification_url): confirma pagamento → libera agendamento
function processarWebhookMP_(e, body) {
  try {
    var payId = (body && body.data && body.data.id) || (e && e.parameter && e.parameter['data.id']) || (e && e.parameter && e.parameter.id);
    if (!payId) return;
    var token = getSecret_(PROP.MP_ACCESS_TOKEN); if (!token) return;
    var resp = UrlFetchApp.fetch('https://api.mercadopago.com/v1/payments/' + payId,
      { headers:{ Authorization:'Bearer '+token }, muteHttpExceptions:true });
    var pay = JSON.parse(resp.getContentText());
    if (pay.status !== 'approved') return;
    var agId = pay.external_reference;
    var r = findRow_(SHEETS.AGENDAMENTOS, AG.ID, agId);
    if (!r) return;
    setCell_(SHEETS.AGENDAMENTOS, r.rowIndex, AG.STATUS, STATUS.CONFIRMADO);
    setCell_(SHEETS.AGENDAMENTOS, r.rowIndex, AG_SINAL, 'pago');
    var o = r.obj;
    var emailCli = '';
    var rc = findClienteByTel_(telLimpo_(o[AG.TEL])); if (rc) emailCli = rc.obj[CLI.EMAIL] || '';
    registrarFinanceiro_(o[AG.DATA], Number(pay.transaction_amount)||0, o[AG.SERV] + ' (sinal)', o[AG.ABREV], agId);
    criarEventoCalendar_(agId, o[AG.DATA], o[AG.HORA], Number(o[AG.DUR])||45, o[AG.NOME], o[AG.SERV], o[AG.TEL], emailCli);
    enviarConfirmacaoWhatsApp_(o[AG.TEL], o[AG.NOME], o[AG.SERV], o[AG.DATA], o[AG.HORA], Number(o[AG.DUR])||45, Number(o[AG.PRECO])||0);
    enviarEmailConfirmacao_(emailCli, o[AG.NOME], o[AG.SERV], o[AG.DATA], o[AG.HORA], Number(o[AG.DUR])||45, Number(o[AG.PRECO])||0);
    notificarDonoNovoAgendamento_(o[AG.NOME], o[AG.SERV], o[AG.DATA], o[AG.HORA]);
  } catch (err) { logErro_('processarWebhookMP', err); }
}

// Notifica o dono (SAC_NUMERO) sobre novo agendamento
function notificarDonoNovoAgendamento_(nome, servico, data, horario, para) {
  var dono = telLimpo_(getSecret_(PROP.SAC_NUMERO)); if (!dono) return;
  var quem = (para && String(para).trim()) ? (nome + ' (p/ ' + String(para).trim() + ')') : nome;
  enviarWhatsApp_(dono, '📅 Novo agendamento: ' + quem + ' — ' + servico + ' em ' + dataBR_(data) + ' às ' + horario);
}


// Agenda visual: cria evento ao agendar, remove ao cancelar, e alimenta a
// verificação de disponibilidade em tempo real (folgas/feriados = eventos).

// ─── FILA DE ESPERA INTELIGENTE (SEÇÃO 33) ─────────────────────────────────
function actionRegistrarFila_(b) {
  var tel = telLimpo_(b.telefone || b.tel);
  var data = b.dataDesejada || b.data, hora = b.horarioDesejado || b.horario;
  var servico = (b.servico && typeof b.servico === 'object') ? b.servico.nome : b.servico;
  if (!tel || !data || !hora || !servico) return respostaErro_('dados_invalidos');
  var fila = getRowsData_(SHEETS.FILA_ESPERA);
  var ativas = fila.filter(function(f){ return telLimpo_(f[FE.TEL])===tel && (f[FE.STATUS]===FILA_STATUS.AGUARDANDO || f[FE.STATUS]===FILA_STATUS.NOTIFICADO); });
  if (ativas.length >= 3) return { success:false, error:'Você já tem 3 entradas ativas na fila' };
  var dup = fila.some(function(f){ return telLimpo_(f[FE.TEL])===tel && f[FE.DATA]===data && f[FE.HORA]===hora && (f[FE.STATUS]===FILA_STATUS.AGUARDANDO || f[FE.STATUS]===FILA_STATUS.NOTIFICADO); });
  if (dup) return { success:false, error:'Você já está na fila para este horário' };
  var cli = findClienteByTel_(tel);
  var nome = b.nome || (cli ? cli.obj[CLI.NOME] : '');
  var id = gerarIdFila_();
  sheet_(SHEETS.FILA_ESPERA).appendRow([
    id, cli ? cli.obj[CLI.ID] : '', tel, sanitizar_(nome), sanitizar_(servico),
    data, hora, b.flexibilidadeData || 'mesmo_dia', FILA_STATUS.AGUARDANDO, '', '', nowISO_(),
  ]);
  var posicao = filaInteressados_(data, hora).length;
  return { success:true, posicao:posicao, mensagem:'Você está em ' + posicao + 'º na lista de espera' };
}
function filaInteressados_(data, hora) {
  return getRowsData_(SHEETS.FILA_ESPERA).filter(function(f){
    if (f[FE.STATUS] !== FILA_STATUS.AGUARDANDO) return false;
    var flex = f[FE.FLEX] || 'mesmo_dia';
    if (flex === 'mesmo_dia')    return f[FE.DATA] === data && f[FE.HORA] === hora;
    if (flex === 'mesma_semana') return mesmaSemana_(f[FE.DATA], data);
    return true;
  });
}
function mesmaSemana_(d1, d2) {
  var a = new Date(d1 + 'T12:00:00'), b = new Date(d2 + 'T12:00:00');
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return false;
  return Math.abs((a - b) / 86400000) <= 6;
}
function ordenarFila_(itens) {
  var prio = { VIP:1, Ouro:2, Prata:3, Bronze:4 };
  return itens.sort(function(a, b){
    var sa = a[FE.CLI_ID] ? calcularScore_(a[FE.CLI_ID]) : 5;
    var sb = b[FE.CLI_ID] ? calcularScore_(b[FE.CLI_ID]) : 5;
    if ((sa < 3) !== (sb < 3)) return (sa < 3) ? 1 : -1;
    var na = prio[getNivel_(a[FE.CLI_ID] ? totalVisitas_(a[FE.CLI_ID]) : 0)] || 5;
    var nb = prio[getNivel_(b[FE.CLI_ID] ? totalVisitas_(b[FE.CLI_ID]) : 0)] || 5;
    if (na !== nb) return na - nb;
    return new Date(a[FE.CRIADO]) - new Date(b[FE.CRIADO]);
  });
}
function verificarFilaEspera_(data, hora) {
  var candidatos = ordenarFila_(filaInteressados_(data, hora));
  if (candidatos.length) notificarFilaEspera_(candidatos[0], data, hora);
}
function notificarFilaEspera_(item, data, hora) {
  var r = findRow_(SHEETS.FILA_ESPERA, FE.ID, item[FE.ID]); if (!r) return;
  var expira = new Date(Date.now() + 30*60000).toISOString();
  setCell_(SHEETS.FILA_ESPERA, r.rowIndex, FE.STATUS, FILA_STATUS.NOTIFICADO);
  setCell_(SHEETS.FILA_ESPERA, r.rowIndex, FE.NOTIF, nowISO_());
  setCell_(SHEETS.FILA_ESPERA, r.rowIndex, FE.EXPIRA, expira);
  setEstado_(telLimpo_(item[FE.TEL]), { etapa:'AGUARDANDO_FILA', feId:item[FE.ID], data:(data||item[FE.DATA]), hora:(hora||item[FE.HORA]), servico:item[FE.SERV] });
  enviarWhatsApp_(item[FE.TEL],
    item[FE.NOME] + ', abriu um horário! 🎉\n\n📅 ' + dataBR_(data||item[FE.DATA]) + '\n⏰ ' + (hora||item[FE.HORA]) + '\n💈 ' + item[FE.SERV] +
    '\n\nQuer garantir? Responda S para confirmar. Você tem 30 minutos.');
}
function verificarFilaExpirada() {
  var agora = new Date();
  getRowsData_(SHEETS.FILA_ESPERA).forEach(function(f, i){
    if (f[FE.STATUS] !== FILA_STATUS.NOTIFICADO) return;
    if (!f[FE.EXPIRA] || new Date(f[FE.EXPIRA]) > agora) return;
    setCell_(SHEETS.FILA_ESPERA, i+2, FE.STATUS, FILA_STATUS.EXPIRADO);
    limparEstado_(telLimpo_(f[FE.TEL]));
    verificarFilaEspera_(f[FE.DATA], f[FE.HORA]);
  });
}
function fluxoFilaEspera_(from, texto, estado) {
  if (texto === 'não' || texto === 'nao' || texto === 'n') {
    var rr = findRow_(SHEETS.FILA_ESPERA, FE.ID, estado.feId);
    if (rr) setCell_(SHEETS.FILA_ESPERA, rr.rowIndex, FE.STATUS, FILA_STATUS.RECUSOU);
    limparEstado_(from);
    enviarWhatsApp_(from, 'Sem problemas! Continuamos de olho em novas vagas. 💈');
    return verificarFilaEspera_(estado.data, estado.hora);
  }
  if (KEYWORDS.CONFIRMAR.indexOf(texto) > -1 || texto === 'sim') {
    var jaTem = getAgendamentos_().some(function(a){ return telLimpo_(a[AG.TEL])===from && a[AG.DATA]===estado.data && a[AG.HORA]===estado.hora && a[AG.STATUS]!==STATUS.CANCELADO; });
    if (jaTem) { limparEstado_(from); return enviarWhatsApp_(from, 'Você já tem um agendamento nesse horário 🙂'); }
    var ocupado = getAgendamentos_().some(function(a){ return a[AG.DATA]===estado.data && a[AG.HORA]===estado.hora && a[AG.STATUS]!==STATUS.CANCELADO; });
    if (ocupado) { limparEstado_(from); return enviarWhatsApp_(from, 'Poxa, essa vaga acabou de ser preenchida. Te aviso na próxima!'); }
    var cfg = getConfig_();
    var serv = cfg.servicos.filter(function(s){ return s.nome === estado.servico; })[0] || { nome:estado.servico, duracao:45, preco:0 };
    var clienteRow = findClienteByTel_(from);
    var r = actionAgendamento_({ nome:(clienteRow ? clienteRow.obj[CLI.NOME] : 'Cliente'), telefone:from, data:estado.data, horario:estado.hora, servico:serv });
    if (r.success) {
      var rr2 = findRow_(SHEETS.FILA_ESPERA, FE.ID, estado.feId);
      if (rr2) setCell_(SHEETS.FILA_ESPERA, rr2.rowIndex, FE.STATUS, FILA_STATUS.CONVERTIDO);
      limparEstado_(from);
      return;
    }
    limparEstado_(from);
    return enviarWhatsApp_(from, 'Não consegui concluir agora. Fale com o atendente, por favor.');
  }
  return enviarWhatsApp_(from, 'Responda S para garantir a vaga ou N para recusar.');
}
function gerarIdFila_() {
  var n = getRowsData_(SHEETS.FILA_ESPERA).reduce(function(m,f){ var x=parseInt(String(f[FE.ID]).replace('FE',''),10)||0; return Math.max(m,x); }, 0);
  return 'FE' + ('00' + (n+1)).slice(-3);
}

// ─── GOOGLE CALENDAR ────────────────────────────────────────────────────────
function getCalendar_() {
  var id = getSecret_(PROP.CALENDAR_ID);
  try { return id ? CalendarApp.getCalendarById(id) : CalendarApp.getDefaultCalendar(); }
  catch (e) { logErro_('getCalendar', e); return null; }
}
// guarda o mapa agendamentoID → eventID em Script Properties (sem mexer no schema)
function salvarEventoId_(agId, eventId) { props_().setProperty('evt_' + agId, eventId); }
function lerEventoId_(agId) { return props_().getProperty('evt_' + agId); }

function criarEventoCalendar_(agId, data, horario, duracao, nome, servico, tel, email) {
  var cal = getCalendar_(); if (!cal) return null;
  try {
    var ini = parseDataHora_(data, horario); if (!ini) return null;
    var fim = new Date(ini.getTime() + (duracao || 45) * 60000);
    var opts = {
      description: 'Cliente: ' + nome + '\nTelefone: ' + tel + '\nServiço: ' + servico + '\nAgendamento: ' + agId,
      location: getConfig_().barbearia.endereco || '',
    };
    // convida o cliente como convidado (recebe convite + lembrete do Google) — SEÇÃO 32
    if (email && validarEmail_(email)) { opts.guests = email; opts.sendInvites = true; }
    var ev = cal.createEvent(servico + ' — ' + nome, ini, fim, opts);
    var eid = ev.getId();
    salvarEventoId_(agId, eid);
    return eid;
  } catch (e) { logErro_('criarEventoCalendar', e); return null; }
}

function removerEventoCalendar_(agId) {
  var cal = getCalendar_(); if (!cal) return false;
  try {
    var eid = lerEventoId_(agId);
    if (eid) {
      var ev = cal.getEventById(eid);
      if (ev) { ev.deleteEvent(); props_().deleteProperty('evt_' + agId); return true; }
    }
    // fallback: localizar pelo título/horário do agendamento
    var r = findRow_(SHEETS.AGENDAMENTOS, AG.ID, agId);
    if (r) {
      var ini = parseDataHora_(r.obj[AG.DATA], r.obj[AG.HORA]);
      if (ini) {
        var fim = new Date(ini.getTime() + (Number(r.obj[AG.DUR])||45) * 60000);
        cal.getEvents(ini, fim).forEach(function(ev){ if (ev.getTitle().indexOf(r.obj[AG.NOME]) > -1) ev.deleteEvent(); });
      }
    }
    return true;
  } catch (e) { logErro_('removerEventoCalendar', e); return false; }
}

// intervalos ocupados no Calendar para um dia (em minutos desde 00:00) — bloqueia slots
function intervalosOcupadosCalendar_(data) {
  var cal = getCalendar_(); if (!cal) return [];
  try {
    var ini = parseDataHora_(data, '00:00'); if (!ini) return [];
    var fim = new Date(ini.getTime() + 24*3600*1000);
    return cal.getEvents(ini, fim).map(function(ev){
      if (ev.isAllDayEvent()) return { ini:0, fim:24*60 }; // folga/feriado o dia todo
      return { ini: minutosDoDia_(ev.getStartTime()), fim: minutosDoDia_(ev.getEndTime()) };
    });
  } catch (e) { logErro_('intervalosOcupadosCalendar', e); return []; }
}

// confirmação pós-agendamento (texto livre — cliente acabou de interagir, dentro da janela)
function enviarConfirmacaoWhatsApp_(tel, nome, servico, data, horario, duracao, preco) {
  var end = getConfig_().barbearia.endereco || '';
  var msg = 'Agendamento confirmado, ' + nome + '! ✅\n\n'
    + '💈 ' + servico + '\n📅 ' + dataBR_(data) + '\n⏰ ' + horario + ' (' + duracao + 'min)\n💰 R$ ' + preco
    + (end ? ('\n📍 ' + end) : '')
    + '\n\nResponda C para confirmar presença ou CANCELAR se precisar desmarcar.';
  return enviarWhatsApp_(tel, msg);
}

// ── E-mail transacional (SEÇÃO 32) — confirmação via GmailApp/MailApp ────────
// Validação alinhada à SEÇÃO 32.3: vazio é válido (opcional), cap 254 chars.
function validarEmail_(e) {
  var s = String(e || '').trim();
  if (!s) return false;            // p/ guard de envio: sem e-mail = não enviar
  if (s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}
function emailLimpo_(e) { return String(e || '').trim().toLowerCase(); }

// O convite do Google Calendar (sendInvites:true) JÁ envia um e-mail profissional
// ao cliente (SEÇÃO 32.5). Este envio MailApp é um e-mail extra OPCIONAL e
// desligado por padrão (EMAIL_ATIVO=0). SEÇÃO 39.2: checar cota antes de enviar.
function enviarEmailConfirmacao_(email, nome, servico, data, horario, duracao, preco) {
  if (getSecret_(PROP.EMAIL_ATIVO) !== '1') return false; // desligado por padrão
  email = emailLimpo_(email);
  if (!validarEmail_(email)) return false;
  try { if (MailApp.getRemainingDailyQuota() < 10) { logErro_('enviarEmailConfirmacao', 'cota MailApp < 10 — fallback só WhatsApp'); return false; } } catch (e) {}
  var cfg = getConfig_(), b = cfg.barbearia || {};
  var assunto = 'Agendamento confirmado · ' + (b.nome || 'AQUINO');
  var corpo = ''
    + '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;border:1px solid #eee;border-radius:14px;overflow:hidden">'
    + '<div style="background:#0f0f0f;color:#c9a84c;padding:20px 24px;font-size:18px;font-weight:bold">' + (b.nome || 'AQUINO Barbearia & Estética') + '</div>'
    + '<div style="padding:24px;color:#222;line-height:1.6">'
    + '<p>Olá, <b>' + nome + '</b>! Seu agendamento está <b style="color:#22C55E">confirmado</b>. ✅</p>'
    + '<table style="width:100%;border-collapse:collapse;margin:16px 0">'
    + linhaEmail_('💈 Serviço', servico) + linhaEmail_('📅 Data', dataBR_(data))
    + linhaEmail_('⏰ Horário', horario + ' (' + duracao + ' min)') + linhaEmail_('💰 Valor', 'R$ ' + preco)
    + (b.endereco ? linhaEmail_('📍 Endereço', b.endereco) : '')
    + '</table>'
    + '<p style="font-size:13px;color:#666">Adicionamos um convite ao seu Google Agenda. Para cancelar, responda nosso WhatsApp.</p>'
    + '</div></div>';
  try { MailApp.sendEmail({ to: email, subject: assunto, htmlBody: corpo, name: b.nome || 'AQUINO' }); return true; }
  catch (e) { logErro_('enviarEmailConfirmacao', e); return false; }
}
function linhaEmail_(rotulo, valor) {
  return '<tr><td style="padding:6px 0;color:#888;width:120px">' + rotulo + '</td><td style="padding:6px 0;font-weight:bold">' + valor + '</td></tr>';
}

function parseDataHora_(data, horario) {
  var hh = (String(horario||'').length === 5) ? horario : '00:00';
  var d = new Date(String(data).substring(0,10) + 'T' + hh + ':00');
  return isNaN(d.getTime()) ? null : d;
}
function minutosDoDia_(d) { return d.getHours()*60 + d.getMinutes(); }

// ─── CONFIG / SERVIÇOS ──────────────────────────────────────────────────────
function getConfig_() { var raw = getSecret_(PROP.CONFIG_JSON); if (!raw) return defaultConfig_(); try { return JSON.parse(raw); } catch (e) { return defaultConfig_(); } }
function saveConfig_(cfg) { props_().setProperty(PROP.CONFIG_JSON, JSON.stringify(cfg)); if (Array.isArray(cfg.servicos)) sincronizarServicos_(cfg.servicos); }
function derivarLegacy_(cfg) {
  var dias = cfg.horarios || [];
  var abertos = dias.filter(function(d){ return !d.fechado && d.abre !== '—'; });
  return { horaInicio: abertos.length?abertos[0].abre:'09:00', horaFim: abertos.length?abertos[0].fecha:'19:00',
    intervaloDias: (cfg.operacao&&cfg.operacao.intervaloRetornoDias)||15, diasBloqueados: dias.filter(function(d){return d.fechado;}).map(function(d){return d.dia;}) };
}
function sincronizarServicos_(servicos) {
  var sh = sheet_(SHEETS.SERVICOS); sh.clearContents(); sh.appendRow(HEADERS.SERVICOS);
  servicos.forEach(function(s){ sh.appendRow([s.id, sanitizar_(s.nome), s.preco, s.duracao, s.ativo===false?'NAO':'SIM']); });
}
function nextServicoId_(servicos) { return servicos.reduce(function(m,s){ return Math.max(m, s.id||0); }, 0) + 1; }

// ─── CLIENTES ────────────────────────────────────────────────────────────────
function upsertCliente_(nome, tel, dataAg, nascimento, clienteIDHint, intervaloHint, email, dependentesJSON, foto) {
  var r = findClienteByTel_(tel);
  var intervalo = validarIntervalo_(intervaloHint);
  if (r) {
    var novoTotal = (Number(r.obj[CLI.TOTAL])||0) + 1;
    setCell_(SHEETS.CLIENTES, r.rowIndex, CLI.TOTAL, novoTotal);
    setCell_(SHEETS.CLIENTES, r.rowIndex, CLI.ULTIMO_AG, dataAg); // col E real — nunca lembrete
    if (email && validarEmail_(email) && !r.obj[CLI.EMAIL]) setCell_(SHEETS.CLIENTES, r.rowIndex, CLI.EMAIL, email);
    if (foto) setCell_(SHEETS.CLIENTES, r.rowIndex, CLI.FOTO, foto); // atualiza foto se enviada
    verificarMarcosFidelidade_(r.obj[CLI.ID], tel, r.obj[CLI.NOME] || nome, novoTotal); // Item 3
    return { id: r.obj[CLI.ID], novo:false, total:novoTotal };
  }
  var id = (clienteIDHint && /^CLI-\d+$/.test(clienteIDHint)) ? clienteIDHint : gerarClienteId_();
  sheet_(SHEETS.CLIENTES).appendRow([
    id, tel, sanitizar_(nome), sanitizar_(formatarNomeAbrev_(nome)), dataAg, 1, intervalo, sanitizar_(nascimento||''), '',
    (email && validarEmail_(email)) ? email : '', dependentesJSON || '', String(foto||''),
  ]);
  return { id:id, novo:true, total:1 };
}

// ── Marcos de fidelidade automáticos (SEÇÃO 23) — 5ª / 10ª / 20ª visita ──────
// Dispara cupom no WhatsApp ao atingir o marco. Anti-duplicata por Script Prop.
var MARCOS_FIDELIDADE = {
  5:  { cupom:'FIEL5',  texto:'🎉 Essa é sua *5ª visita*! Você ganhou o cupom *FIEL5*: 10% no próximo serviço. Obrigado pela confiança! 💈' },
  10: { cupom:'OURO10', texto:'🥇 *10ª visita!* Você subiu para o nível *Ouro*. Use *OURO10* e ganhe 15% no próximo corte. 🙌' },
  20: { cupom:'VIP20',  texto:'💎 *20ª visita!* Você agora é *VIP AQUINO*. Use *VIP20*: 20% de desconto + prioridade na agenda. 🥂' },
};
function verificarMarcosFidelidade_(clienteId, tel, nome, totalVisitas) {
  var marco = MARCOS_FIDELIDADE[totalVisitas];
  if (!marco) return;
  var chave = 'marco_' + clienteId + '_' + totalVisitas;
  if (jaProcessou_(chave)) return;
  marcarProcessado_(chave);
  enviarWhatsApp_(tel, (nome ? (nome + ', ') : '') + marco.texto);
  notificarDono_('🏆 ' + (nome || tel) + ' atingiu a ' + totalVisitas + 'ª visita (cupom ' + marco.cupom + ').');
}
function findClienteByTel_(tel) {
  var rows = getClientes_();
  for (var i=0;i<rows.length;i++){ if (telLimpo_(rows[i][CLI.TEL])===tel) return { rowIndex:i+2, obj:rows[i] }; }
  return null;
}
function gerarClienteId_() {
  var lock = LockService.getScriptLock(); lock.tryLock(5000);
  try {
    var rows = getClientes_();
    var max = rows.reduce(function(m,c){ var n = parseInt(String(c[CLI.ID]).replace('CLI-',''),10)||0; return Math.max(m,n); }, 0);
    return 'CLI-' + ('00' + (max+1)).slice(-3);
  } finally { lock.releaseLock(); }
}
function validarIntervalo_(v) { var n = parseInt(v,10); if (isNaN(n)) return 15; return Math.min(365, Math.max(1, n)); } // 1–365
function formatarNomeAbrev_(nome) {
  var p = String(nome||'').trim().split(/\s+/);
  if (p.length < 2) return p[0] || '';
  return p[0] + ' ' + p[p.length-1].charAt(0).toUpperCase() + '.';
}

// ─── DEPENDENTES (filhos/responsável) ───────────────────────────────────────
// Guardados como JSON na coluna CLI.DEP: [{ "nome":"João", "nascimento":"15/03/2018" }].
// parse tolera vazio/corrompido (devolve []). serializa valida e limita a 12.
function parseDependentes_(raw) {
  if (!raw) return [];
  try {
    var arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(function(d){ return d && d.nome; })
      .map(function(d){ return { nome:String(d.nome).trim(), nascimento:String(d.nascimento||'').trim() }; });
  } catch (e) { return []; }
}
function serializarDependentes_(arr) {
  if (!Array.isArray(arr)) return '';
  var limpos = arr
    .filter(function(d){ return d && String(d.nome||'').trim(); })
    .slice(0, 12)
    .map(function(d){
      var nasc = String(d.nascimento||'').trim();
      if (!/^\d{2}\/\d{2}\/\d{4}$/.test(nasc)) nasc = ''; // só aceita DD/MM/AAAA
      return { nome: sanitizar_(String(d.nome).trim()).slice(0,60), nascimento: nasc };
    });
  return limpos.length ? JSON.stringify(limpos) : '';
}

// ─── FINANCEIRO (schema canônico 9 colunas) ─────────────────────────────────
function registrarFinanceiro_(data, valor, servico, abrev, agId) {
  if (!valor) return;
  sheet_(SHEETS.FINANCEIRO).appendRow([ data, 'entrada', 'servico', sanitizar_(servico + ' — ' + abrev), valor, 'Aquino', agId, 'pendente', 'pendente' ]);
}

// ─── PLANILHAS (genérico) ───────────────────────────────────────────────────
function ss_()    { return SpreadsheetApp.getActiveSpreadsheet(); }
function props_() { return PropertiesService.getScriptProperties(); }
function sheet_(name) { var sh = ss_().getSheetByName(name); if (!sh) { sh = ss_().insertSheet(name); sh.appendRow(HEADERS[keyOf_(name)]); } return sh; }
function keyOf_(name) { for (var k in SHEETS) if (SHEETS[k]===name) return k; return null; }
function getRowsRaw_(name) { return sheet_(name).getDataRange().getValues(); }
function getRowsData_(name) { var v = getRowsRaw_(name); return v.length<2 ? [] : v.slice(1); }
function getClientes_()     { return getRowsData_(SHEETS.CLIENTES); }
function getAgendamentos_() { return getRowsData_(SHEETS.AGENDAMENTOS); }
function findRow_(name, colIdx, value) {
  var rows = getRowsData_(name);
  for (var i=0;i<rows.length;i++){ if (String(rows[i][colIdx])===String(value)) return { rowIndex:i+2, obj:rows[i] }; }
  return null;
}
function setCell_(name, rowIndex, colIdx, value) { sheet_(name).getRange(rowIndex, colIdx+1).setValue(value); }

// ─── UTILIDADES ──────────────────────────────────────────────────────────────
function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function parseBody_(e) { if (e && e.postData && e.postData.contents) { try { return JSON.parse(e.postData.contents); } catch (err) {} } return (e && e.parameter) ? e.parameter : {}; }
function gerarIdAgendamento_() { return Utilities.getUuid().replace(/-/g,'').substring(0,8).toUpperCase(); }
function now_()     { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm'); }
function nowISO_()  { return Utilities.formatDate(new Date(), 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"); }
function hojeISO_() { return Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd'); }
function tz_()      { return Session.getScriptTimeZone() || 'America/Sao_Paulo'; }
function telLimpo_(t){ return String(t||'').replace(/\D/g,''); }
function toMin_(s) { var p = String(s).split(':'); return (parseInt(p[0],10)||0)*60 + (parseInt(p[1],10)||0); }
function fromMin_(m){ var h=Math.floor(m/60), mm=m%60; return (h<10?'0':'')+h+':'+(mm<10?'0':'')+mm; }
function diaSemana_(iso){ var d=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado']; var x=iso?new Date(iso+'T12:00:00'):new Date(); return d[x.getDay()]; }
function dataBR_(iso){ if(!iso) return ''; var d=new Date(String(iso).substring(0,10)+'T12:00:00'); if(isNaN(d.getTime())) return String(iso); return Utilities.formatDate(d, tz_(), 'EEEE, dd \'de\' MMM'); }
function diasDesde_(quando){ if(!quando) return 999; var d=new Date(String(quando).replace(' ','T').substring(0,10)+'T12:00:00'); if(isNaN(d.getTime())) return 999; return Math.floor((Date.now()-d.getTime())/86400000); }
function logErro_(ctx, err){ try { sheet_(SHEETS.LOG).appendRow([now_(),'ERRO',ctx,String(err&&err.message?err.message:err)]); } catch(e){} }
// Observabilidade de negócio (SEÇÃO 41.4) — evento append-only na aba Metricas
function registrarMetrica_(tipo, valor, contexto){ try { sheet_(SHEETS.METRICAS).appendRow([nowISO_(), tipo, valor, JSON.stringify(contexto||{})]); } catch(e){} }

// ─── SETUP ────────────────────────────────────────────────────────────────────
function setupScriptProperties() {
  var p = props_();
  var defaults = {};
  defaults[PROP.SITE_TOKEN]  = p.getProperty(PROP.SITE_TOKEN)  || 'TROQUE-token-site-longo-aleatorio';
  defaults[PROP.ADMIN_KEY]   = p.getProperty(PROP.ADMIN_KEY)   || 'TROQUE-senha-admin';
  defaults[PROP.VERIFY_TOKEN]= p.getProperty(PROP.VERIFY_TOKEN)|| 'barber2025aquino';
  // Coexistência: '1' = mesmo número (app + Cloud API, humano atende no app);
  // '0' = dois números (bot na API + SAC_NUMERO separado). Padrão: '0'.
  if (!p.getProperty('MODO_COEXISTENCIA')) defaults['MODO_COEXISTENCIA'] = '0';
  // Cobrança (SEÇÃO 34): MVP = Modelo A (desativado). Trocar p/ universal|novatos|reincidentes|premium|longos|score
  if (!p.getProperty(PROP.COBRANCA_MODO))        defaults[PROP.COBRANCA_MODO] = 'desativado';
  if (!p.getProperty(PROP.COBRANCA_PERCENTUAL))  defaults[PROP.COBRANCA_PERCENTUAL] = '30';
  if (!p.getProperty(PROP.COBRANCA_DURACAO_MIN)) defaults[PROP.COBRANCA_DURACAO_MIN] = '60';
  if (!p.getProperty(PROP.COBRANCA_SCORE_LIMITE))defaults[PROP.COBRANCA_SCORE_LIMITE] = '5';
  if (!p.getProperty(PROP.COBRANCA_HORARIOS_PREMIUM)) defaults[PROP.COBRANCA_HORARIOS_PREMIUM] = 'sabado,domingo';
  // E-mail transacional (SEÇÃO 32): desligado por padrão. Ative com '1' + EMAIL_DONO p/ alertas.
  if (!p.getProperty(PROP.EMAIL_ATIVO)) defaults[PROP.EMAIL_ATIVO] = '0';
  // RBAC (SEÇÃO 23): BARBEIRO_KEY e RECEPCAO_KEY são opcionais (deixe vazio = só admin).
  // MP_ACCESS_TOKEN, GAS_WEBHOOK_URL, SITE_URL → preencher manualmente p/ ativar Pix
  if (!p.getProperty(PROP.CONFIG_JSON)) defaults[PROP.CONFIG_JSON] = JSON.stringify(defaultConfig_());
  // WHATSAPP_TOKEN, PHONE_NUMBER_ID, META_APP_SECRET, SAC_NUMERO, TEMPLATES_ATIVOS, GOOGLE_MAPS_LINK → preencher manualmente
  p.setProperties(defaults, false);
  Logger.log('Script Properties OK. ALTERE SITE_TOKEN e ADMIN_KEY e preencha as chaves da Meta.');
}
function setupSheets() {
  for (var k in SHEETS) { var name=SHEETS[k]; var sh=ss_().getSheetByName(name)||ss_().insertSheet(name); sh.clearContents(); sh.appendRow(HEADERS[k]); }
  sincronizarServicos_(defaultConfig_().servicos);
  Logger.log('Abas criadas: ' + Object.keys(SHEETS).map(function(k){return SHEETS[k];}).join(', '));
}
function verificarSinalExpirado() {
  // SPEC 3.5 / §8 — sinal não pago em 30min: cancela, libera o slot, avisa o cliente e chama a fila.
  var agora = Date.now();
  var LIMITE_MS = 30 * 60000; // 30 minutos
  getRowsData_(SHEETS.AGENDAMENTOS).forEach(function(a, i){
    if (a[AG.STATUS] !== STATUS.AGUARDANDO) return;
    var criado = a[AG.CRIADO] ? new Date(a[AG.CRIADO]).getTime() : 0;
    if (!criado || (agora - criado) < LIMITE_MS) return;
    setCell_(SHEETS.AGENDAMENTOS, i + 2, AG.STATUS, STATUS.CANCELADO);
    removerEventoCalendar_(a[AG.ID]);              // libera o slot (se houver evento)
    verificarFilaEspera_(a[AG.DATA], a[AG.HORA]);  // notifica o 1º da fila
    var tel = telLimpo_(a[AG.TEL]);
    if (tel) enviarWhatsApp_(tel, 'Olá! Sua reserva de ' + a[AG.SERV] + ' em ' + dataBR_(a[AG.DATA]) + ' às ' + a[AG.HORA] + ' foi cancelada porque o sinal não foi pago em 30 minutos. O horário já foi liberado — se ainda quiser, é só agendar de novo. 💈');
  });
}

function criarTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t){ ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('verificarLembretes').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('verificarFeedback').timeBased().everyHours(1).create(); // P0-1: marca realizado + dispara NPS
  ScriptApp.newTrigger('registrarFaltas').timeBased().atHour(12).everyDays(1).create();
  ScriptApp.newTrigger('verificarLembrete5Dias').timeBased().atHour(9).everyDays(1).create();
  ScriptApp.newTrigger('verificarReativacao').timeBased().atHour(10).everyDays(1).create();
  ScriptApp.newTrigger('verificarFilaExpirada').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('verificarSinalExpirado').timeBased().everyMinutes(5).create(); // P0-4: cancela aguardando_sinal nao pago em 30min
  ScriptApp.newTrigger('reenviarPendentes').timeBased().everyMinutes(30).create(); // robustez (SEÇÃO 39)
  ScriptApp.newTrigger('backupSemanal').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create(); // backup Drive
  Logger.log('Triggers criados.');
}

function repararContagens() {
  var shC = sheet_(SHEETS.CLIENTES);
  var ags = getAgendamentos_(); // linhas de dados (sem cabeçalho)

  // Conta agendamentos NÃO cancelados, por ClienteID e por telefone
  var porCli = {}, porTel = {};
  ags.forEach(function (a) {
    if (a[AG.STATUS] === STATUS.CANCELADO) return;
    var cid = a[AG.CLI_ID];
    if (cid) porCli[cid] = (porCli[cid] || 0) + 1;
    var tel = telLimpo_(a[AG.TEL]);
    if (tel) porTel[tel] = (porTel[tel] || 0) + 1;
  });

  var dados = shC.getDataRange().getValues(); // inclui a linha de cabeçalho (índice 0)
  var corrigidos = 0;
  var detalhes = [];

  for (var i = 1; i < dados.length; i++) {
    var row = dados[i];
    if (!row[CLI.ID]) continue; // pula linhas vazias

    var cid = row[CLI.ID];
    var tel = telLimpo_(row[CLI.TEL]);
    var correto = (porCli[cid] != null) ? porCli[cid] : (porTel[tel] || 0);

    var atual = row[CLI.TOTAL];
    var atualEhInteiroSao = (typeof atual === 'number' && isFinite(atual) &&
                             atual >= 0 && atual <= 5000 && Math.floor(atual) === atual);

    // Só reescreve se o valor atual estiver errado/corrompido
    if (!atualEhInteiroSao || atual !== correto) {
      shC.getRange(i + 1, CLI.TOTAL + 1).setValue(correto);
      corrigidos++;
      detalhes.push(cid + ' (' + tel + '): ' + JSON.stringify(atual) + '  ->  ' + correto);
    }
  }

  Logger.log('✅ Clientes corrigidos: ' + corrigidos);
  detalhes.forEach(function (l) { Logger.log(l); });
  return { corrigidos: corrigidos, detalhes: detalhes };
}
