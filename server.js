// Mural — kanbans montados a partir das reacoes de conversas do Microsoft Teams.
//
// Cada mural aponta para uma conversa (canal ou chat) e tem historico proprio.
// O botao "Atualizar" roda o Claude Code headless, que apenas LE as mensagens e
// grava um snapshot cru. O merge com o historico e feito aqui, em JS
// deterministico — o LLM nunca toca no historico, para o acumulado nao poder
// ser inventado nem perdido.
//
// Nao ha login proprio: a autenticacao com a Microsoft e a do Claude Code e do
// conector Microsoft 365. Este servidor nunca ve nem guarda credencial.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ESM nao tem __dirname; o package.json declara "type": "module" por causa do
// Vite, entao o servidor tambem roda como modulo.
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, 'data');
const MURAIS_DIR = path.join(DATA_DIR, 'murais');
const PROMPTS_DIR = path.join(ROOT, 'prompts');
// A interface e um app React compilado pelo Vite. Em producao o proprio
// server.js serve o dist/; em desenvolvimento o Vite serve e repassa /api aqui.
const DIST_DIR = path.join(ROOT, 'dist');

const INDICE_FILE = path.join(DATA_DIR, 'murais.json');
const CONTA_FILE = path.join(DATA_DIR, 'conta.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');
const CONSUMO_FILE = path.join(DATA_DIR, 'consumo.json');
const PREFS_FILE = path.join(DATA_DIR, 'preferencias.json');

const PORT = Number(process.env.MURAL_PORT) || 4317;

fs.mkdirSync(MURAIS_DIR, { recursive: true });

// ---------------------------------------------------------------- classificacao

// O time nao usa um emoji fixo para "peguei" — cada um reage com o que quiser.
// Entao a unica regra confiavel e: check = concluido; QUALQUER outra reacao =
// alguem interagiu; nenhuma reacao = ninguem olhou. Nao ha lista de emojis a
// manter, e um emoji novo que apareca amanha ja cai no lugar certo sozinho.
const CHECKS = ['✅', '☑️', '✔️', '✔', '☑'];

// Variação de emoji (U+FE0F/U+FE0E) nao muda o significado, e o Teams devolve
// o mesmo emoji com e sem ela dependendo de quem reagiu.
function normalizarEmoji(emoji) {
  return (emoji || '').replace(/[️︎]/g, '');
}

function ehCheck(emoji) {
  const limpo = normalizarEmoji(emoji);
  return CHECKS.some((c) => normalizarEmoji(c) === limpo);
}

// O Graph NAO diz quem reagiu: `reactions[].users` volta com displayName, id e
// email nulos. Entao "fui eu que fiz" nao tem como sair da API — sai de uma
// convencao que voce controla: um emoji que so voce usa naquele canal.
function temEmojiDeAssinatura(reactions, assinatura) {
  const alvo = normalizarEmoji(assinatura);
  if (!alvo) return false;
  return (reactions || []).some((e) => normalizarEmoji(e) === alvo);
}

function statusDe(reactions) {
  const r = reactions || [];
  if (r.some(ehCheck)) return 'feito';
  if (r.length > 0) return 'interagido';
  return 'aberto';
}

// Os emojis que motivaram o "interagido" aparecem crus no card: sem lista fixa,
// ver qual reacao foi usada e a unica forma de saber o que aconteceu ali.
function emojisDoCard(reactions) {
  return (reactions || []).filter((e) => !ehCheck(e));
}

const STATUS_VALIDOS = ['aberto', 'interagido', 'feito'];

// ------------------------------------------------------------------ indice

// Um mural por conversa: o id vem da propria fonte, entao mapear a mesma
// conversa duas vezes reabre o mural existente em vez de duplicar historico.
function chaveDaFonte(f) {
  return f.tipo === 'chat' ? 'chat:' + f.chatId : 'canal:' + f.teamId + '/' + f.channelId;
}

function idDaFonte(f) {
  return crypto.createHash('sha1').update(chaveDaFonte(f)).digest('hex').slice(0, 10);
}

function lerJson(arquivo, padrao) {
  try {
    const bruto = fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, '');
    return bruto.trim() ? JSON.parse(bruto) : padrao;
  } catch (e) {
    if (e.code === 'ENOENT') return padrao;
    throw new Error(`${path.basename(arquivo)} esta ilegivel: ${e.message}`);
  }
}

function gravarJsonAtomico(arquivo, dados) {
  const tmp = arquivo + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, arquivo);
}

function lerIndice() {
  const i = lerJson(INDICE_FILE, { murais: [] });
  return Array.isArray(i.murais) ? i : { murais: [] };
}

function gravarIndice(indice) {
  gravarJsonAtomico(INDICE_FILE, indice);
}

function acharMural(id) {
  return lerIndice().murais.find((m) => m.id === id) || null;
}

function pastaDoMural(id) {
  return path.join(MURAIS_DIR, id);
}

function arquivoTasks(id) {
  return path.join(pastaDoMural(id), 'tasks.json');
}

function arquivoSnapshot(id) {
  return path.join(pastaDoMural(id), 'snapshot.json');
}

// ------------------------------------------------------------------ migracao

// Versao antiga guardava um unico mural em data/config.json + data/tasks.json.
// Migra uma vez, sem perder o historico acumulado.
function migrarFormatoAntigo() {
  const configAntigo = path.join(DATA_DIR, 'config.json');
  const tasksAntigo = path.join(DATA_DIR, 'tasks.json');
  if (!fs.existsSync(configAntigo) || fs.existsSync(INDICE_FILE)) return;

  const cfg = lerJson(configAntigo, null);
  if (!cfg || !cfg.fonte) return;

  const id = idDaFonte(cfg.fonte);
  fs.mkdirSync(pastaDoMural(id), { recursive: true });
  if (fs.existsSync(tasksAntigo)) fs.renameSync(tasksAntigo, arquivoTasks(id));

  gravarIndice({
    murais: [{
      id,
      ...cfg.fonte,
      criadoEm: cfg.criadoEm || new Date().toISOString(),
    }],
  });

  fs.renameSync(configAntigo, configAntigo + '.migrado');
  console.log(`  Mural existente migrado para murais/${id}`);
}

migrarFormatoAntigo();

// -------------------------------------------------------------------- consumo

// Cada atualizacao roda o Claude Code de verdade e custa dinheiro: so o system
// prompt da ferramenta ja consome dezenas de milhares de tokens de cache. O
// consumo e registrado por conta Microsoft (o Mural e local, mas a conta e o
// que identifica quem esta gastando) e serve para estimar a proxima.
const MAX_EXECUCOES_GUARDADAS = 200;

function usuarioAtual() {
  const conta = lerJson(CONTA_FILE, {});
  return conta.mail || conta.displayName || 'desconhecido';
}

function lerConsumo() {
  const c = lerJson(CONSUMO_FILE, { porUsuario: {} });
  return c && typeof c.porUsuario === 'object' ? c : { porUsuario: {} };
}

function lerPreferencias() {
  const p = lerJson(PREFS_FILE, { porUsuario: {} });
  return p && typeof p.porUsuario === 'object' ? p : { porUsuario: {} };
}

// O emoji de assinatura: a reacao que, na SUA mao, quer dizer "fui eu que fiz".
// Nao pode ser o check — esse todo mundo usa, e o significado dele ja e outro.
const EMOJI_MEU_PADRAO = '🟢';

function prefsDoUsuario(usuario) {
  const todas = lerPreferencias();
  // Confirmar e o padrao: gastar dinheiro sem avisar nao pode ser opt-out
  // silencioso de quem instalou.
  return {
    confirmarAntesDeAtualizar: true,
    emojiMeu: EMOJI_MEU_PADRAO,
    ...(todas.porUsuario[usuario] || {}),
  };
}

// Um emoji, nao uma frase: isto vira comparacao com o que o Teams devolve.
// Vazio desliga a deteccao automatica e deixa so o botao "fiz".
function validarEmojiMeu(valor, atual) {
  if (valor === undefined) return atual;
  const limpo = String(valor).trim().slice(0, 8);
  if (limpo && ehCheck(limpo)) {
    throw new Error(
      'O check ja significa "concluido" para o canal inteiro. ' +
      'Escolha um emoji que so voce use.'
    );
  }
  return limpo;
}

// O evento `result` do stream-json traz o custo real da execucao. Sem ele nao
// ha estimativa honesta — nao da para inferir preco a partir do numero de
// mensagens, porque o cache muda tudo entre uma execucao e outra.
function extrairConsumo(ev) {
  const u = ev.usage || {};
  const entrada = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  return {
    tokensEntrada: entrada,
    tokensSaida: u.output_tokens || 0,
    tokensCacheLido: u.cache_read_input_tokens || 0,
    // Cache lido conta para o total gasto, ainda que muito mais barato.
    tokensTotal: entrada + (u.output_tokens || 0) + (u.cache_read_input_tokens || 0),
    custoUsd: typeof ev.total_cost_usd === 'number' ? ev.total_cost_usd : null,
    duracaoMs: ev.duration_ms || null,
  };
}

// Toda ida ao Claude Code custa, nao so a atualizacao do quadro: verificar a
// conta e listar os chats no onboarding tambem sao leituras cobradas. `operacao`
// diz qual foi — todas entram no acumulado, mas so as de 'sync' servem para
// estimar a proxima atualizacao (misturar as baratas do onboarding na media
// faria o dialogo prometer um preco que nao acontece).
const OPERACOES = ['sync', 'conta', 'chats'];

// Execucoes gravadas antes deste campo existir eram todas de sync.
function operacaoDe(e) {
  return OPERACOES.includes(e.operacao) ? e.operacao : 'sync';
}

function registrarConsumo(usuario, muralId, consumo, mensagensLidas, operacao = 'sync') {
  const db = lerConsumo();
  const doUsuario = db.porUsuario[usuario] || { execucoes: [] };

  doUsuario.execucoes.push({
    muralId,
    operacao,
    quando: new Date().toISOString(),
    mensagensLidas,
    ...consumo,
  });
  // Histórico limitado: serve para estimar, não para auditoria eterna.
  if (doUsuario.execucoes.length > MAX_EXECUCOES_GUARDADAS) {
    doUsuario.execucoes = doUsuario.execucoes.slice(-MAX_EXECUCOES_GUARDADAS);
  }

  db.porUsuario[usuario] = doUsuario;
  gravarJsonAtomico(CONSUMO_FILE, db);
}

function somarConsumo(execucoes) {
  return execucoes.reduce(
    (acc, e) => ({
      execucoes: acc.execucoes + 1,
      tokensTotal: acc.tokensTotal + (e.tokensTotal || 0),
      custoUsd: acc.custoUsd + (e.custoUsd || 0),
    }),
    { execucoes: 0, tokensTotal: 0, custoUsd: 0 },
  );
}

// O total e de tudo que foi cobrado; a quebra por operacao mostra quanto do
// gasto foi quadro e quanto foi onboarding.
function totaisDoUsuario(usuario) {
  const doUsuario = lerConsumo().porUsuario[usuario];
  const todas = doUsuario ? doUsuario.execucoes : [];
  const porOperacao = {};
  for (const op of OPERACOES) {
    porOperacao[op] = somarConsumo(todas.filter((e) => operacaoDe(e) === op));
  }
  return { ...somarConsumo(todas), porOperacao };
}

// Estimativa = media das ultimas execucoes DESTE mural; sem historico proprio,
// cai para o de qualquer mural; sem nenhum, devolve null. Um numero inventado
// seria pior que admitir que a primeira vez e desconhecida.
function estimarProximaAtualizacao(usuario, muralId) {
  const doUsuario = lerConsumo().porUsuario[usuario];
  if (!doUsuario || !doUsuario.execucoes.length) return null;

  // So atualizacoes entram na media: as leituras do onboarding custam outra
  // coisa e puxariam a estimativa para um numero que nunca acontece.
  const syncs = doUsuario.execucoes.filter((e) => operacaoDe(e) === 'sync');
  if (!syncs.length) return null;

  const doMural = syncs.filter((e) => e.muralId === muralId);
  const base = (doMural.length ? doMural : syncs).slice(-5);
  if (!base.length) return null;

  const media = (campo) => base.reduce((s, e) => s + (e[campo] || 0), 0) / base.length;

  return {
    baseadoEm: base.length,
    doProprioMural: doMural.length > 0,
    tokensTotal: Math.round(media('tokensTotal')),
    tokensEntrada: Math.round(media('tokensEntrada')),
    tokensSaida: Math.round(media('tokensSaida')),
    tokensCacheLido: Math.round(media('tokensCacheLido')),
    custoUsd: Number(media('custoUsd').toFixed(4)),
    duracaoMs: Math.round(media('duracaoMs')),
  };
}

// ---------------------------------------------------------------------- tasks

// Ler o historico NAO pode falhar em silencio: se o arquivo existe mas esta
// corrompido, tratar como vazio faria o proximo sync sobrescrever tudo.
function lerTasks(muralId) {
  const arquivo = arquivoTasks(muralId);
  let bruto;
  try {
    bruto = fs.readFileSync(arquivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { lastSync: null, tasks: {} };
    throw new Error('Nao consegui ler o historico: ' + e.message);
  }

  if (bruto.charCodeAt(0) === 0xfeff) bruto = bruto.slice(1);
  if (!bruto.trim()) return { lastSync: null, tasks: {} };

  let db;
  try {
    db = JSON.parse(bruto);
  } catch (e) {
    throw new Error(
      'O historico deste mural esta corrompido (' + e.message + '). Nada foi tocado. ' +
      'Ha uma copia em tasks.json.bak dentro da pasta do mural.'
    );
  }
  if (!db || typeof db.tasks !== 'object' || db.tasks === null) {
    throw new Error('O historico deste mural tem formato inesperado. Nada foi tocado.');
  }
  return db;
}

function gravarTasks(muralId, db) {
  const arquivo = arquivoTasks(muralId);
  fs.mkdirSync(pastaDoMural(muralId), { recursive: true });
  const tmp = arquivo + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  try { fs.copyFileSync(arquivo, arquivo + '.bak'); } catch {}
  fs.renameSync(tmp, arquivo);
}

// Uma task esta "fora de alcance" quando nao veio no ultimo sync: saiu das ~20
// mensagens que a API devolve. Dali em diante o Teams nao conta mais nada sobre
// ela, entao o quadro para de receber atualizacoes automaticas desse card.
function foraDeAlcance(t, lastSync) {
  // Task criada aqui dentro nunca esteve na janela do Teams, entao "saiu dela"
  // nao quer dizer nada: ela e movivel por natureza, nao por ter se perdido.
  if (t.origem === 'manual') return false;
  return !!lastSync && t.lastSeen !== lastSync;
}

// Quem pode trocar de coluna a mao: as que o Teams nao acompanha mais e as que
// nasceram aqui. Nas demais a reacao manda, e o proximo sync desfaria o gesto.
function podeMover(t, lastSync) {
  return t.origem === 'manual' || foraDeAlcance(t, lastSync);
}

// Tirar a marca a mao so vale quando o Teams nao vai repo-la no proximo sync:
// se o card esta na coluna por causa da sua reacao, e la que ela tem de sair.
// Fora de alcance o Teams nao conta mais nada, entao a mao volta a mandar.
function podeDesmarcar(t, lastSync) {
  if (!t.meu) return false;
  return t.meu.via !== 'emoji' || foraDeAlcance(t, lastSync);
}

function tasksParaTela(muralId) {
  const db = lerTasks(muralId);
  const lista = Object.values(db.tasks).map((t) => ({
    ...t,
    origem: t.origem === 'manual' ? 'manual' : 'teams',
    meu: t.meu || null,
    emojis: emojisDoCard(t.reactions),
    foraDeAlcance: foraDeAlcance(t, db.lastSync),
    podeMover: podeMover(t, db.lastSync),
    podeDesmarcar: podeDesmarcar(t, db.lastSync),
  }));
  return { lastSync: db.lastSync, tasks: lista };
}

// ------------------------------------------------------------- tasks proprias

// Nem tudo que vira trabalho passa pelo canal: o que combinaram no corredor, o
// bug que voce mesmo achou. Essas tasks nascem aqui, tem id proprio e o sync
// nunca as toca — o merge so mexe em ids que vieram do snapshot.
function nomeDoUsuario() {
  const conta = lerJson(CONTA_FILE, {});
  return conta.displayName || conta.mail || 'você';
}

function textoDeTask(valor, campo) {
  const t = String(valor || '').trim();
  if (!t) throw new Error(`Escreva ${campo}.`);
  return t.slice(0, 1000);
}

function criarTaskManual(muralId, corpo) {
  const summary = textoDeTask(corpo.summary, 'o que precisa ser feito');
  const status = STATUS_VALIDOS.includes(corpo.status) ? corpo.status : 'aberto';

  const db = lerTasks(muralId);
  const agora = new Date().toISOString();
  const id = 'manual-' + crypto.randomUUID();

  db.tasks[id] = {
    id,
    origem: 'manual',
    author: nomeDoUsuario(),
    createdDateTime: agora,
    summary,
    kind: corpo.kind === 'bug' ? 'bug' : 'sugestao',
    reactions: [],
    webUrl: '',
    status,
    firstSeen: agora,
    statusChangedAt: agora,
    statusAnterior: null,
    lastSeen: agora,
    movidoAMao: false,
    meu: null,
  };
  gravarTasks(muralId, db);
  return id;
}

// So task manual pode ser editada ou apagada: mexer no texto de uma mensagem do
// Teams criaria um quadro que discorda da conversa, e o proximo sync desfaria.
function taskManual(db, id) {
  const t = db.tasks[String(id || '')];
  if (!t) throw new Error('Task desconhecida.');
  if (t.origem !== 'manual') {
    throw new Error('Esta task veio do Teams — edite a mensagem por lá e atualize.');
  }
  return t;
}

function editarTaskManual(muralId, corpo) {
  const db = lerTasks(muralId);
  const t = taskManual(db, corpo.id);

  t.summary = textoDeTask(corpo.summary, 'o que precisa ser feito');
  t.kind = corpo.kind === 'bug' ? 'bug' : 'sugestao';
  if (STATUS_VALIDOS.includes(corpo.status) && corpo.status !== t.status) {
    t.statusAnterior = t.status;
    t.status = corpo.status;
    t.statusChangedAt = new Date().toISOString();
  }
  gravarTasks(muralId, db);
}

function removerTaskManual(muralId, id) {
  const db = lerTasks(muralId);
  taskManual(db, id);
  delete db.tasks[String(id)];
  gravarTasks(muralId, db);
}

// "Feito por mim" NAO e um status do Teams — e uma marca pessoal, e por isso
// mora num campo separado. Assim a reacao continua mandando no status real e o
// proximo sync nao apaga o que voce anotou para contar na daily.
function marcarComoMeu(muralId, id, solucao) {
  const db = lerTasks(muralId);
  const t = db.tasks[String(id || '')];
  if (!t) throw new Error('Task desconhecida.');
  t.meu = {
    // A data de quando voce marcou, nao de quando reescreveu a anotacao: senao
    // corrigir uma virgula jogaria o card de ontem para o grupo de hoje.
    em: (t.meu && t.meu.em) || new Date().toISOString(),
    solucao: String(solucao || '').trim().slice(0, 2000),
    // Escrever a anotacao num card que a reacao trouxe nao o torna manual: se
    // voce tirar o 🟢 la, ele sai daqui — a nao ser pela regra da anotacao.
    via: (t.meu && t.meu.via) || 'mao',
  };
  gravarTasks(muralId, db);
}

function desmarcarComoMeu(muralId, id) {
  const db = lerTasks(muralId);
  const t = db.tasks[String(id || '')];
  if (!t) throw new Error('Task desconhecida.');
  if (!podeDesmarcar(t, db.lastSync)) {
    throw new Error(
      'Este card esta aqui por causa da sua reacao na mensagem. ' +
      'Tire a reacao no Teams e atualize — desmarcar aqui duraria ate o proximo sync.'
    );
  }
  t.meu = null;
  gravarTasks(muralId, db);
}

// ----------------------------------------------------------------------- merge

// Mescla o snapshot (janela de ~20) sobre o historico acumulado. Tasks que
// sairam da janela PERMANECEM no arquivo — e esse o ganho principal: a API so
// devolve 20, o arquivo lembra de tudo que ja passou.
// A sua reacao entra e sai do quadro sozinha, junto com o resto do merge. O dia
// que agrupa o card na daily e o da LEITURA que viu a reacao, nao o da reacao em
// si: o Teams nao devolve quando ela foi feita. Reagir na sexta e sincronizar na
// segunda joga o card para segunda — e por isso o dia fica editavel no card.
function aplicarAssinatura(t, agora, assinatura, marcados) {
  const assinado = temEmojiDeAssinatura(t.reactions, assinatura);

  if (assinado && !t.meu) {
    t.meu = { em: agora, solucao: '', via: 'emoji' };
    marcados.push(t.id);
    return;
  }

  if (!assinado && t.meu && t.meu.via === 'emoji') {
    // Tirar a reacao no Teams tira o card da coluna — menos quando ja existe
    // anotacao. Texto que voce escreveu nao pode sumir por causa de um clique
    // numa reacao; nesse caso a marca so deixa de ser automatica.
    if (t.meu.solucao) t.meu.via = 'mao';
    else t.meu = null;
  }
}

function merge(db, snapshot, agora, assinatura) {
  const novos = [];
  const mudaram = [];
  const retomadas = [];
  const marcados = [];

  for (const m of snapshot) {
    if (!m || !m.id) continue;

    const status = statusDe(m.reactions);
    const antigo = db.tasks[m.id];

    if (!antigo) {
      db.tasks[m.id] = {
        id: m.id,
        author: m.author || '?',
        createdDateTime: m.createdDateTime || agora,
        summary: m.summary || '(sem resumo)',
        kind: m.kind === 'bug' ? 'bug' : 'sugestao',
        reactions: m.reactions || [],
        webUrl: m.webUrl || '',
        status,
        firstSeen: agora,
        statusChangedAt: agora,
        statusAnterior: null,
        lastSeen: agora,
        movidoAMao: false,
        meu: null,
      };
      novos.push(m.id);
      aplicarAssinatura(db.tasks[m.id], agora, assinatura, marcados);
      continue;
    }

    // Campos que o Teams pode ter editado depois.
    antigo.summary = m.summary || antigo.summary;
    antigo.reactions = m.reactions || [];
    antigo.author = m.author || antigo.author;
    antigo.webUrl = m.webUrl || antigo.webUrl;
    antigo.kind = m.kind === 'bug' ? 'bug' : antigo.kind;
    antigo.lastSeen = agora;

    // A task voltou a aparecer na janela: o Teams volta a mandar. Se ela tinha
    // sido movida a mao enquanto estava fora de alcance, a reacao real vence —
    // a fonte da verdade e sempre o Teams.
    if (antigo.movidoAMao) {
      antigo.movidoAMao = false;
      if (antigo.status !== status) retomadas.push(m.id);
    }

    if (antigo.status !== status) {
      antigo.statusAnterior = antigo.status;
      antigo.status = status;
      antigo.statusChangedAt = agora;
      mudaram.push(m.id);
    }

    aplicarAssinatura(antigo, agora, assinatura, marcados);
  }

  db.lastSync = agora;
  return { novos, mudaram, retomadas, marcados, total: snapshot.length };
}

// ------------------------------------------------------------------ claude run

let syncEmAndamento = null; // id do mural sincronizando, ou null
let progresso = null;

const ESTIMATIVA_MENSAGENS = 20;

function zerarProgresso(etapa) {
  progresso = {
    etapa, lidas: 0, total: ESTIMATIVA_MENSAGENS,
    inicio: Date.now(), ultimaAtividade: Date.now(),
  };
}

// Depois de ler tudo, o Claude passa ~1 minuto resumindo sem chamar tool
// nenhuma. Sem nomear essa fase, o contador congela e a tela parece travada.
function etapaVisivel(p) {
  const paradoHa = Date.now() - p.ultimaAtividade;
  if (p.lidas > 0 && paradoHa > 7000 && p.etapa === 'lendo mensagens') {
    return 'resumindo e classificando';
  }
  return p.etapa;
}

// Cada evento do stream-json vem como uma linha JSON. So interessam os tool_use:
// a 1a leitura e a listagem, as seguintes sao as mensagens uma a uma.
// Preenchido pelo evento `result` no fim do stream — e a unica fonte do custo
// real da execucao.
let consumoDaExecucao = null;

function processarEvento(linha) {
  if (!linha.trim()) return;
  let ev;
  try { ev = JSON.parse(linha); } catch { return; }

  if (ev.type === 'result') {
    consumoDaExecucao = extrairConsumo(ev);
    return;
  }

  if (!progresso) return;
  if (ev.type !== 'assistant') return;
  const partes = ev.message && ev.message.content;
  if (!Array.isArray(partes)) return;

  for (const p of partes) {
    if (p.type !== 'tool_use') continue;
    progresso.ultimaAtividade = Date.now();
    const nome = p.name || '';
    if (nome.includes('read_resource')) {
      const uri = (p.input && p.input.uri) || '';
      if (/\/messages\/?$/.test(uri)) progresso.etapa = 'listando as mensagens';
      else { progresso.lidas++; progresso.etapa = 'lendo mensagens'; }
    } else if (nome === 'Write') {
      progresso.etapa = 'gravando';
    }
  }
}

function montarPrompt(nome, valores) {
  let txt = fs.readFileSync(path.join(PROMPTS_DIR, nome), 'utf8');
  for (const [chave, valor] of Object.entries(valores)) {
    txt = txt.split('{{' + chave + '}}').join(valor);
  }
  return txt;
}

// A URI que o Claude vai ler. Canal e chat tem formatos diferentes no Graph.
function uriDasMensagens(f) {
  if (f.tipo === 'chat') return `teams:///chats/${encodeURIComponent(f.chatId)}/messages`;
  return `teams:///teams/${f.teamId}/channels/${encodeURIComponent(f.channelId)}/messages`;
}

// Mensagem de chat volta com webUrl null, entao o link precisa ser montado.
function moldeDeWebUrl(f) {
  if (f.tipo === 'chat') {
    return 'https://teams.microsoft.com/l/message/' + encodeURIComponent(f.chatId) +
      '/{id}?context=%7B%22contextType%22%3A%22chat%22%7D';
  }
  return 'https://teams.microsoft.com/l/message/' + encodeURIComponent(f.channelId) +
    `/{id}?groupId=${f.teamId}&parentMessageId={id}`;
}

// Roda o Claude headless e espera que ele grave `arquivoSaida`. Usado pelos
// passos curtos do onboarding, que nao precisam de barra de progresso — mas
// custam dinheiro igual, entao saem em stream-json so para o evento `result`
// contar o gasto. Sem isso, listar chats (2 a 3 minutos de API) apareceria
// como leitura gratuita no registro, e nao e.
function rodarClaudeSimples(prompt, arquivoSaida, operacao, timeoutMs = 5 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    // A conta e lida antes porque o passo 'conta' apaga o proprio arquivo que
    // identifica o usuario: sem isso o gasto dele cairia sempre em "desconhecido".
    const usuarioAntes = usuarioAtual();
    try { fs.unlinkSync(arquivoSaida); } catch {}

    const proc = spawn('claude', [
      '-p',
      '--output-format', 'stream-json', '--verbose',
      '--allowedTools', 'mcp__claude_ai_Microsoft_365__get_me,' +
                        'mcp__claude_ai_Microsoft_365__teams_list_chats,Write',
      '--permission-mode', 'acceptEdits',
    ], { cwd: ROOT, shell: true });

    proc.stdin.write(prompt);
    proc.stdin.end();

    let stderr = '', buffer = '', consumo = null;
    proc.stderr.on('data', (d) => (stderr += d));
    // Sem consumir o stdout o processo trava com o buffer cheio; de quebra e
    // dali que sai o custo real desta leitura.
    proc.stdout.on('data', (d) => {
      buffer += d;
      const linhas = buffer.split('\n');
      buffer = linhas.pop();
      for (const l of linhas) {
        if (!l.trim()) continue;
        try {
          const ev = JSON.parse(l);
          if (ev.type === 'result') consumo = extrairConsumo(ev);
        } catch { /* linha parcial ou ruido: o que importa e o evento result */ }
      }
    });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('O Claude demorou demais para responder.'));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);

      // Registra antes de olhar o codigo de saida: se a leitura falhou no fim,
      // os tokens ja foram cobrados do mesmo jeito.
      if (consumo) {
        const agora = usuarioAtual();
        registrarConsumo(
          agora === 'desconhecido' ? usuarioAntes : agora,
          null, consumo, 0, operacao,
        );
      }

      if (code !== 0) {
        return reject(new Error(
          'O Claude Code saiu com erro (codigo ' + code + '). ' + stderr.slice(0, 300)
        ));
      }
      try { resolve(JSON.parse(fs.readFileSync(arquivoSaida, 'utf8'))); }
      catch { reject(new Error('O Claude rodou mas nao gravou um resultado legivel.')); }
    });

    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error('Nao consegui executar `claude`: ' + e.message));
    });
  });
}

function rodarSync(muralId) {
  return new Promise((resolve, reject) => {
    if (syncEmAndamento) {
      return reject(new Error('Ja existe uma atualizacao em andamento.'));
    }
    const mural = acharMural(muralId);
    if (!mural) return reject(new Error('Mural nao encontrado.'));

    syncEmAndamento = muralId;
    zerarProgresso('iniciando');
    consumoDaExecucao = null;

    const snapshotFile = arquivoSnapshot(muralId);
    fs.mkdirSync(pastaDoMural(muralId), { recursive: true });

    let prompt;
    try {
      prompt = montarPrompt('sincronizar.md', {
        URI_MENSAGENS: uriDasMensagens(mural),
        ARQUIVO_SNAPSHOT: snapshotFile,
        WEBURL_MOLDE: moldeDeWebUrl(mural),
      });
    } catch {
      syncEmAndamento = null; progresso = null;
      return reject(new Error('prompts/sincronizar.md nao encontrado.'));
    }

    try { fs.unlinkSync(snapshotFile); } catch {}

    // O prompt vai por STDIN, nao como argumento: e multi-linha, e no Windows o
    // shell mutila argumentos assim — o Claude recebia texto truncado.
    const proc = spawn('claude', [
      '-p',
      '--output-format', 'stream-json', '--verbose',
      '--allowedTools', 'mcp__claude_ai_Microsoft_365__read_resource,Write',
      '--permission-mode', 'acceptEdits',
    ], { cwd: ROOT, shell: true });

    proc.stdin.write(prompt);
    proc.stdin.end();

    let stdout = '', stderr = '', buffer = '';
    proc.stdout.on('data', (d) => {
      stdout += d;
      buffer += d;
      const linhas = buffer.split('\n');
      buffer = linhas.pop();
      for (const l of linhas) processarEvento(l);
    });
    proc.stderr.on('data', (d) => (stderr += d));

    const timer = setTimeout(() => {
      proc.kill();
      syncEmAndamento = null; progresso = null;
      reject(new Error('A atualizacao passou de 5 minutos sem terminar.'));
    }, 5 * 60 * 1000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const lidas = progresso ? progresso.lidas : 0;
      syncEmAndamento = null; progresso = null;

      // Uma leitura que falhou no fim ja gastou os tokens. Registrar antes de
      // qualquer saida por erro e o que impede o acumulado de mentir para menos.
      const usuario = usuarioAtual();
      if (consumoDaExecucao) {
        registrarConsumo(usuario, muralId, consumoDaExecucao, lidas, 'sync');
      }

      if (code !== 0) {
        return reject(new Error(`O Claude saiu com codigo ${code}. ${stderr.slice(0, 400)}`));
      }

      let snapshot;
      try { snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')); }
      catch {
        return reject(new Error(
          'O Claude rodou mas nao gravou um snapshot valido. ' + resumoDoResultado(stdout)
        ));
      }
      if (!Array.isArray(snapshot)) return reject(new Error('O snapshot nao e um array.'));

      try {
        const db = lerTasks(muralId);
        const r = merge(
          db, snapshot, new Date().toISOString(),
          prefsDoUsuario(usuario).emojiMeu,
        );
        gravarTasks(muralId, db);

        const indice = lerIndice();
        const m = indice.murais.find((x) => x.id === muralId);
        if (m) { m.ultimoSync = db.lastSync; gravarIndice(indice); }

        resolve({
          ...r,
          consumo: consumoDaExecucao,
          totaisDoUsuario: totaisDoUsuario(usuario),
        });
      } catch (e) {
        reject(e); // historico ilegivel: aborta sem gravar por cima
      }
    });

    proc.on('error', (e) => {
      clearTimeout(timer);
      syncEmAndamento = null; progresso = null;
      reject(new Error('Nao consegui executar `claude`: ' + e.message));
    });
  });
}

// Com stream-json o stdout e um monte de evento; para o erro so interessa o
// texto final que o Claude respondeu.
function resumoDoResultado(stdout) {
  const linhas = stdout.split('\n').filter(Boolean);
  for (let i = linhas.length - 1; i >= 0; i--) {
    try {
      const ev = JSON.parse(linhas[i]);
      if (ev.type === 'result' && typeof ev.result === 'string') {
        return 'Resposta: ' + ev.result.slice(0, 300);
      }
    } catch {}
  }
  return 'Sem resposta legivel do Claude.';
}

// ------------------------------------------------------------------ abrir teams

// Abrir o app pelo servidor, e nao pelo href do navegador: Chrome e Edge engolem
// protocolos customizados em silencio (sem permissao previa o clique nao faz
// nada e nenhum erro aparece). Aqui a falha e visivel.
//
// A URL NUNCA vem do cliente — o navegador manda so os ids, e o servidor busca o
// webUrl no proprio historico. Assim nao ha como injetar comando pelo request.
function abrirNoTeams(muralId, tarefaId) {
  return new Promise((resolve, reject) => {
    const db = lerTasks(muralId);
    const t = db.tasks[tarefaId];
    if (!t || !t.webUrl) return reject(new Error('Task desconhecida.'));

    if (!/^https:\/\/teams\.microsoft\.com\//.test(t.webUrl)) {
      return reject(new Error('Link inesperado nesta task, nao vou abrir.'));
    }
    const deep = t.webUrl.replace(
      /^https:\/\/teams\.microsoft\.com\//,
      'msteams://teams.microsoft.com/'
    );

    // execFile sem shell: o link vai como argumento literal, nunca interpretado.
    execFile('ms-teams.exe', [deep], (erro) => {
      if (!erro) return resolve({ via: 'ms-teams.exe' });
      execFile('cmd', ['/c', 'start', '', deep], (erro2) => {
        if (!erro2) return resolve({ via: 'protocolo do Windows' });
        reject(new Error('Nao consegui abrir o Teams: ' + erro2.message));
      });
    });
  });
}

// ---------------------------------------------------------------------- server

function json(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

const TIPOS_MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function servirArquivo(res, arquivo) {
  const ext = path.extname(arquivo).toLowerCase();
  // Assets do Vite tem hash no nome, entao podem ser cacheados para sempre.
  // O index.html nao: e ele que aponta para os hashes novos a cada build.
  const cache = arquivo.includes(`${path.sep}assets${path.sep}`) || ext === '.woff2'
    ? 'public, max-age=31536000, immutable'
    : 'no-store';
  res.writeHead(200, {
    'Content-Type': TIPOS_MIME[ext] || 'application/octet-stream',
    'Cache-Control': cache,
  });
  res.end(fs.readFileSync(arquivo));
}

function servirIndex(res) {
  const index = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(index)) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(
      '<!doctype html><meta charset="utf-8">' +
      '<div style="font:15px/1.6 system-ui;max-width:38rem;margin:15vh auto;padding:0 1.5rem">' +
      '<h1 style="font-size:1.2rem">A interface ainda nao foi compilada</h1>' +
      '<p>Rode <code style="background:#eee;padding:.1rem .35rem;border-radius:4px">npm install ' +
      '&amp;&amp; npm run build</code> na pasta do projeto e recarregue esta pagina.</p></div>'
    );
  }
  return servirArquivo(res, index);
}

function lerCorpoJson(req) {
  return new Promise((resolve, reject) => {
    // Acumula bytes, nao texto: um emoji tem 4 bytes e pode cair na fronteira
    // de dois chunks. Concatenar como string ali quebra o caractere ao meio, e
    // e justamente um emoji que o corpo carrega quando voce troca a assinatura.
    const pedacos = [];
    let bytes = 0;
    req.on('data', (d) => {
      pedacos.push(d);
      bytes += d.length;
      if (bytes > 64 * 1024) { req.destroy(); reject(new Error('Corpo grande demais.')); }
    });
    req.on('end', () => {
      const dados = Buffer.concat(pedacos).toString('utf8');
      try { resolve(JSON.parse(dados || '{}')); } catch { reject(new Error('JSON invalido.')); }
    });
    req.on('error', reject);
  });
}

// Valida a escolha do onboarding antes de gravar: os ids entram na URI que o
// Claude vai ler, entao formato solto aqui vira erro confuso la na frente.
function validarFonte(corpo) {
  const nome = String(corpo.nome || '').slice(0, 200).trim();
  if (!nome) throw new Error('Falta o nome da conversa.');

  if (corpo.tipo === 'chat') {
    const chatId = String(corpo.chatId || '').trim();
    if (!/^19:[\w\-.@]+$/.test(chatId)) throw new Error('chatId invalido.');
    const sub = ['oneOnOne', 'group', 'meeting'].includes(corpo.subtipo) ? corpo.subtipo : 'group';
    return { tipo: 'chat', subtipo: sub, chatId, nome };
  }

  if (corpo.tipo === 'canal') {
    const teamId = String(corpo.teamId || '').trim();
    const channelId = String(corpo.channelId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(teamId)) throw new Error('teamId invalido.');
    if (!/^19:[\w\-.@]+$/.test(channelId)) throw new Error('channelId invalido.');
    return { tipo: 'canal', subtipo: 'canal', teamId, channelId, nome };
  }

  throw new Error('Tipo de conversa desconhecido.');
}

// Remove recursivamente a pasta de um mural. Usado so no descarte explicito.
function apagarPasta(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const server = http.createServer(async (req, res) => {
  try {
    await rotear(req, res);
  } catch (e) {
    if (!res.headersSent) json(res, 500, { ok: false, erro: e.message });
  }
});

async function rotear(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  // ---- interface (SPA) ----
  // Toda rota que nao e /api e nao existe como arquivo cai no index.html: o
  // roteamento acontece no navegador. Sem isso, recarregar em /m/<id> daria 404.
  if (!p.startsWith('/api/')) {
    if (p === '/' || p === '/index.html') return servirIndex(res);

    const relativo = path.normalize(decodeURIComponent(p)).replace(/^[\\/]+/, '');
    const alvo = path.join(DIST_DIR, relativo);
    // Confere que o caminho resolvido continua dentro de dist/ — sem isso um
    // "../" no pedido leria arquivos de qualquer lugar do disco.
    if (alvo.startsWith(DIST_DIR) && fs.existsSync(alvo) && fs.statSync(alvo).isFile()) {
      return servirArquivo(res, alvo);
    }
    return servirIndex(res);
  }

  // ---- murais ----

  if (p === '/api/murais' && req.method === 'GET') {
    const indice = lerIndice();
    const murais = indice.murais.map((m) => {
      let totais = { aberto: 0, interagido: 0, feito: 0, meu: 0 };
      let foraDeAlcance = 0;
      try {
        const db = lerTasks(m.id);
        for (const t of Object.values(db.tasks)) {
          // Card marcado como seu sai da coluna do Teams e conta so na sua —
          // e a mesma regra do quadro, senao a home diria outro numero.
          if (t.meu) totais.meu++;
          else if (totais[t.status] !== undefined) totais[t.status]++;
          if (foraDeAlcance_(t, db.lastSync)) foraDeAlcance++;
        }
      } catch { /* historico ilegivel nao pode derrubar a lista inteira */ }
      return { ...m, totais, foraDeAlcance };
    });
    return json(res, 200, { murais });
  }

  if (p === '/api/murais' && req.method === 'POST') {
    try {
      const fonte = validarFonte(await lerCorpoJson(req));
      const id = idDaFonte(fonte);
      const indice = lerIndice();
      const existente = indice.murais.find((m) => m.id === id);

      // Mapear a mesma conversa de novo apenas reabre o mural — o historico
      // acumulado dela nunca e descartado por engano.
      if (existente) return json(res, 200, { ok: true, id, jaExistia: true });

      indice.murais.push({ id, ...fonte, criadoEm: new Date().toISOString(), ultimoSync: null });
      gravarIndice(indice);
      fs.mkdirSync(pastaDoMural(id), { recursive: true });
      return json(res, 200, { ok: true, id, jaExistia: false });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/murais' && req.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    const indice = lerIndice();
    const antes = indice.murais.length;
    indice.murais = indice.murais.filter((m) => m.id !== id);
    if (indice.murais.length === antes) return json(res, 404, { ok: false, erro: 'Mural nao encontrado.' });
    gravarIndice(indice);
    apagarPasta(pastaDoMural(id));
    return json(res, 200, { ok: true });
  }

  if (p === '/api/mural') {
    const m = acharMural(url.searchParams.get('id') || '');
    if (!m) return json(res, 404, { ok: false, erro: 'Mural nao encontrado.' });
    return json(res, 200, { ok: true, mural: m });
  }

  // ---- quadro ----

  if (p === '/api/tasks') {
    const id = url.searchParams.get('mural') || '';
    if (!acharMural(id)) return json(res, 404, { erro: 'Mural nao encontrado.' });
    return json(res, 200, tasksParaTela(id));
  }

  // Estimativa do que a proxima atualizacao vai custar, mais o acumulado da
  // conta. E o que a tela de confirmacao mostra antes de gastar.
  if (p === '/api/consumo') {
    const muralId = url.searchParams.get('mural') || '';
    const usuario = usuarioAtual();
    return json(res, 200, {
      usuario,
      estimativa: estimarProximaAtualizacao(usuario, muralId),
      totais: totaisDoUsuario(usuario),
      preferencias: prefsDoUsuario(usuario),
    });
  }

  if (p === '/api/preferencias' && req.method === 'POST') {
    try {
      const corpo = await lerCorpoJson(req);
      const usuario = usuarioAtual();
      const todas = lerPreferencias();
      // Cada campo so muda se veio no corpo: salvar o emoji nao pode religar a
      // confirmacao que a pessoa desmarcou, nem o contrario.
      const atuais = prefsDoUsuario(usuario);
      todas.porUsuario[usuario] = {
        ...atuais,
        confirmarAntesDeAtualizar: corpo.confirmarAntesDeAtualizar === undefined
          ? atuais.confirmarAntesDeAtualizar
          : corpo.confirmarAntesDeAtualizar !== false,
        emojiMeu: validarEmojiMeu(corpo.emojiMeu, atuais.emojiMeu),
      };
      gravarJsonAtomico(PREFS_FILE, todas);
      return json(res, 200, { ok: true, preferencias: todas.porUsuario[usuario] });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/sync' && req.method === 'POST') {
    const id = url.searchParams.get('mural') || '';
    try {
      const r = await rodarSync(id);
      return json(res, 200, { ok: true, ...r, ...tasksParaTela(id) });
    } catch (e) {
      return json(res, 500, { ok: false, erro: e.message });
    }
  }

  // Mover a mao so vale para task fora de alcance. Se ela ainda esta na janela,
  // o proximo sync desfaria a mudanca — deixar mover ali criaria um quadro que
  // mente por 2 minutos e depois se corrige sozinho.
  if (p === '/api/mover' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');

      const corpo = await lerCorpoJson(req);
      const tarefaId = String(corpo.id || '');
      const novo = String(corpo.status || '');
      if (!STATUS_VALIDOS.includes(novo)) throw new Error('Status invalido.');

      const db = lerTasks(muralId);
      const t = db.tasks[tarefaId];
      if (!t) throw new Error('Task desconhecida.');
      if (!podeMover(t, db.lastSync)) {
        throw new Error(
          'Esta task ainda aparece no Teams — reaja na mensagem de la e atualize. ' +
          'Mover a mao so vale para as que sairam do alcance e para as suas proprias.'
        );
      }

      if (t.status !== novo) {
        t.statusAnterior = t.status;
        t.status = novo;
        t.statusChangedAt = new Date().toISOString();
      }
      t.movidoAMao = true;
      gravarTasks(muralId, db);
      return json(res, 200, { ok: true, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  // ---- tasks proprias ----

  // Task que voce escreve aqui dentro: o que nao passou pelo canal mas e
  // trabalho igual. Nasce com id proprio, entao nenhum sync a alcanca.
  if (p === '/api/task' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const id = criarTaskManual(muralId, await lerCorpoJson(req));
      return json(res, 200, { ok: true, id, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/task' && req.method === 'PUT') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      editarTaskManual(muralId, await lerCorpoJson(req));
      return json(res, 200, { ok: true, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/task' && req.method === 'DELETE') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      removerTaskManual(muralId, url.searchParams.get('id') || '');
      return json(res, 200, { ok: true, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  // Marca pessoal "fiz isso", com a anotacao que voce le na daily. Vale para
  // qualquer card — inclusive os que o Teams ainda acompanha — porque nao mexe
  // no status: nao ha o que o proximo sync possa desfazer.
  if (p === '/api/meu' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const corpo = await lerCorpoJson(req);
      if (corpo.marcar === false) desmarcarComoMeu(muralId, corpo.id);
      else marcarComoMeu(muralId, corpo.id, corpo.solucao);
      return json(res, 200, { ok: true, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/abrir' && req.method === 'POST') {
    try {
      const r = await abrirNoTeams(
        url.searchParams.get('mural') || '',
        url.searchParams.get('id') || ''
      );
      return json(res, 200, { ok: true, ...r });
    } catch (e) {
      return json(res, 500, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/status') {
    return json(res, 200, {
      syncing: !!syncEmAndamento,
      muralSincronizando: syncEmAndamento,
      progresso: progresso
        ? {
            ...progresso,
            etapa: etapaVisivel(progresso),
            segundos: Math.round((Date.now() - progresso.inicio) / 1000),
          }
        : null,
    });
  }

  // ---- onboarding ----

  // Refazer a configuracao do zero: some com o cache do onboarding (conta,
  // lista de chats) e com a preferencia de confirmacao. NAO toca nos murais,
  // no historico de tasks nem no registro de consumo — esses sao dados, nao
  // configuracao, e um botao chamado "refazer configuracao" nao pode apagar
  // trabalho acumulado por tabela.
  if (p === '/api/setup/reset' && req.method === 'POST') {
    const apagados = [];
    for (const arquivo of [CONTA_FILE, CHATS_FILE, PREFS_FILE]) {
      try {
        fs.unlinkSync(arquivo);
        apagados.push(path.basename(arquivo));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    return json(res, 200, { ok: true, apagados });
  }

  if (p === '/api/setup/claude') {
    return new Promise((resolve) => {
      execFile('claude', ['--version'], { shell: true }, (erro, stdout) => {
        if (erro) {
          json(res, 200, {
            ok: false,
            erro: 'Claude Code nao encontrado no PATH. Instale em claude.com/claude-code.',
          });
        } else {
          json(res, 200, { ok: true, versao: String(stdout).trim() });
        }
        resolve();
      });
    });
  }

  if (p === '/api/setup/conta' && req.method === 'POST') {
    try {
      const conta = await rodarClaudeSimples(
        montarPrompt('verificar-conta.md', { ARQUIVO_SAIDA: CONTA_FILE }),
        CONTA_FILE,
        'conta'
      );
      if (conta.erro) return json(res, 200, { ok: false, erro: conta.erro });
      return json(res, 200, { ok: true, conta });
    } catch (e) {
      return json(res, 200, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/setup/chats' && req.method === 'POST') {
    try {
      const conta = lerJson(CONTA_FILE, {});
      const chats = await rodarClaudeSimples(
        montarPrompt('listar-chats.md', {
          ARQUIVO_SAIDA: CHATS_FILE,
          USUARIO_ATUAL: conta.displayName || 'a pessoa logada',
        }),
        CHATS_FILE,
        'chats'
      );
      if (chats.erro) return json(res, 200, { ok: false, erro: chats.erro });
      return json(res, 200, { ok: true, chats });
    } catch (e) {
      return json(res, 200, { ok: false, erro: e.message });
    }
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: false, erro: 'Rota nao encontrada.' }));
}

// Alias interno para uso dentro de rotear (mesma regra de foraDeAlcance).
function foraDeAlcance_(t, lastSync) {
  return foraDeAlcance(t, lastSync);
}

server.listen(PORT, '127.0.0.1', () => {
  const n = lerIndice().murais.length;
  console.log(`\n  Mural em  http://localhost:${PORT}`);
  console.log(`  ${n} mural(is) configurado(s). Ctrl+C para parar.\n`);
});
