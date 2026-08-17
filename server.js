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

const PORT = Number(process.env.MURAL_PORT) || 4317;

fs.mkdirSync(MURAIS_DIR, { recursive: true });

// ---------------------------------------------------------------- classificacao

// O time nao usa um emoji fixo para "peguei" — cada um reage com o que quiser.
// Entao a unica regra confiavel e: check = concluido; QUALQUER outra reacao =
// alguem interagiu; nenhuma reacao = ninguem olhou. Nao ha lista de emojis a
// manter, e um emoji novo que apareca amanha ja cai no lugar certo sozinho.
const CHECKS = ['✅', '☑️', '✔️', '✔', '☑'];

function ehCheck(emoji) {
  // Variação de emoji (U+FE0F) e tom de pele nao mudam o significado.
  const limpo = (emoji || '').replace(/[️︎]/g, '');
  return CHECKS.some((c) => c.replace(/[️︎]/g, '') === limpo);
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
  return !!lastSync && t.lastSeen !== lastSync;
}

function tasksParaTela(muralId) {
  const db = lerTasks(muralId);
  const lista = Object.values(db.tasks).map((t) => ({
    ...t,
    emojis: emojisDoCard(t.reactions),
    foraDeAlcance: foraDeAlcance(t, db.lastSync),
  }));
  return { lastSync: db.lastSync, tasks: lista };
}

// ----------------------------------------------------------------------- merge

// Mescla o snapshot (janela de ~20) sobre o historico acumulado. Tasks que
// sairam da janela PERMANECEM no arquivo — e esse o ganho principal: a API so
// devolve 20, o arquivo lembra de tudo que ja passou.
function merge(db, snapshot, agora) {
  const novos = [];
  const mudaram = [];
  const retomadas = [];

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
      };
      novos.push(m.id);
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
  }

  db.lastSync = agora;
  return { novos, mudaram, retomadas, total: snapshot.length };
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
function processarEvento(linha) {
  if (!linha.trim() || !progresso) return;
  let ev;
  try { ev = JSON.parse(linha); } catch { return; }

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
// passos curtos do onboarding, que nao precisam de barra de progresso.
function rodarClaudeSimples(prompt, arquivoSaida, timeoutMs = 5 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    try { fs.unlinkSync(arquivoSaida); } catch {}

    const proc = spawn('claude', [
      '-p',
      '--allowedTools', 'mcp__claude_ai_Microsoft_365__get_me,' +
                        'mcp__claude_ai_Microsoft_365__teams_list_chats,Write',
      '--permission-mode', 'acceptEdits',
    ], { cwd: ROOT, shell: true });

    proc.stdin.write(prompt);
    proc.stdin.end();

    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d));
    proc.stdout.resume(); // sem consumir, o processo trava com o buffer cheio

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('O Claude demorou demais para responder.'));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
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
      syncEmAndamento = null; progresso = null;

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
        const r = merge(db, snapshot, new Date().toISOString());
        gravarTasks(muralId, db);

        const indice = lerIndice();
        const m = indice.murais.find((x) => x.id === muralId);
        if (m) { m.ultimoSync = db.lastSync; gravarIndice(indice); }

        resolve(r);
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
    let dados = '';
    req.on('data', (d) => {
      dados += d;
      if (dados.length > 64 * 1024) { req.destroy(); reject(new Error('Corpo grande demais.')); }
    });
    req.on('end', () => {
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
      let totais = { aberto: 0, interagido: 0, feito: 0 };
      let foraDeAlcance = 0;
      try {
        const db = lerTasks(m.id);
        for (const t of Object.values(db.tasks)) {
          if (totais[t.status] !== undefined) totais[t.status]++;
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
      if (!foraDeAlcance_(t, db.lastSync)) {
        throw new Error(
          'Esta task ainda aparece no Teams — reaja na mensagem de la e atualize. ' +
          'Mover a mao so vale para as que sairam do alcance.'
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
        CONTA_FILE
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
        CHATS_FILE
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
