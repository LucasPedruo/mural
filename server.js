// Mural — um kanban montado a partir das reacoes de uma conversa do Teams.
//
// O botao "Atualizar" chama POST /api/sync, que roda o Claude Code em modo
// headless. O Claude apenas LE as mensagens e grava data/snapshot.json cru.
// O merge com o historico acumulado e feito aqui, em JS deterministico — o LLM
// nunca toca no tasks.json, para o historico nao poder ser inventado nem perdido.
//
// Nao ha login proprio: a autenticacao com a Microsoft e a do Claude Code e do
// conector Microsoft 365. Este servidor nunca ve nem guarda credencial.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const PROMPTS_DIR = path.join(ROOT, 'prompts');
const PUBLIC_DIR = path.join(ROOT, 'public');

const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'snapshot.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const CONTA_FILE = path.join(DATA_DIR, 'conta.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

const PORT = Number(process.env.MURAL_PORT) || 4317;

fs.mkdirSync(DATA_DIR, { recursive: true });

// ------------------------------------------------------------------- config

// Sem config.json o servidor sobe em modo onboarding: a raiz serve a tela de
// configuracao em vez do quadro.
function lerConfig() {
  try {
    const bruto = fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^﻿/, '');
    const c = JSON.parse(bruto);
    return c && c.fonte ? c : null;
  } catch {
    return null;
  }
}

// A URI que o Claude vai ler. Canal e chat tem formatos diferentes no Graph.
function uriDasMensagens(fonte) {
  if (fonte.tipo === 'chat') {
    return `teams:///chats/${encodeURIComponent(fonte.chatId)}/messages`;
  }
  return (
    `teams:///teams/${fonte.teamId}` +
    `/channels/${encodeURIComponent(fonte.channelId)}/messages`
  );
}

// Mensagem de chat volta com webUrl null, entao o link precisa ser montado.
// Em canal o proprio Graph devolve o webUrl pronto.
function moldeDeWebUrl(fonte) {
  if (fonte.tipo === 'chat') {
    return (
      'https://teams.microsoft.com/l/message/' +
      encodeURIComponent(fonte.chatId) +
      '/{id}?context=%7B%22contextType%22%3A%22chat%22%7D'
    );
  }
  return (
    'https://teams.microsoft.com/l/message/' +
    encodeURIComponent(fonte.channelId) +
    `/{id}?groupId=${fonte.teamId}&parentMessageId={id}`
  );
}

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

// ---------------------------------------------------------------------- estado

// Ler o historico NAO pode falhar em silencio. Se o arquivo existe mas esta
// corrompido, um `catch` que devolve {} faria o proximo sync tratar todas as
// tasks como novas e sobrescrever o acumulado — perda invisivel de historico.
// Entao: arquivo ausente = comeco legitimo; arquivo ilegivel = erro que aborta.
function lerTasks() {
  let bruto;
  try {
    bruto = fs.readFileSync(TASKS_FILE, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { lastSync: null, tasks: {} };
    throw new Error('Nao consegui ler tasks.json: ' + e.message);
  }

  if (bruto.charCodeAt(0) === 0xfeff) bruto = bruto.slice(1); // BOM (o PowerShell poe)
  if (!bruto.trim()) return { lastSync: null, tasks: {} };

  let db;
  try {
    db = JSON.parse(bruto);
  } catch (e) {
    throw new Error(
      'tasks.json esta corrompido (' + e.message + '). O historico NAO foi tocado. ' +
      'Ha uma copia em tasks.json.bak — conserte ou apague o arquivo para recomecar do zero.'
    );
  }
  if (!db || typeof db.tasks !== 'object' || db.tasks === null) {
    throw new Error('tasks.json tem formato inesperado. O historico NAO foi tocado.');
  }
  return db;
}

// Gravacao atomica + backup: um crash no meio da escrita nao deixa o historico
// pela metade.
function gravarTasks(db) {
  const tmp = TASKS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  try { fs.copyFileSync(TASKS_FILE, TASKS_FILE + '.bak'); } catch {}
  fs.renameSync(tmp, TASKS_FILE);
}

// ----------------------------------------------------------------------- merge

// Mescla o snapshot (janela de ~20) sobre o historico acumulado.
// Tasks que sairam da janela do Teams PERMANECEM no arquivo — e esse o ganho
// principal: o Teams so devolve 20, o arquivo lembra de tudo que ja passou.
function merge(db, snapshot, agora) {
  const novos = [];
  const mudaram = [];

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
      };
      novos.push(m.id);
      continue;
    }

    // Campos que o Teams pode ter editado depois — texto e reacoes sao voláteis.
    antigo.summary = m.summary || antigo.summary;
    antigo.reactions = m.reactions || [];
    antigo.author = m.author || antigo.author;
    antigo.webUrl = m.webUrl || antigo.webUrl;
    antigo.kind = m.kind === 'bug' ? 'bug' : antigo.kind;
    antigo.lastSeen = agora;

    if (antigo.status !== status) {
      antigo.statusAnterior = antigo.status;
      antigo.status = status;
      antigo.statusChangedAt = agora;
      mudaram.push(m.id);
    }
  }

  db.lastSync = agora;
  return { novos, mudaram, total: snapshot.length };
}

// ------------------------------------------------------------------ claude run

let syncEmAndamento = false;

// Progresso ao vivo, alimentado pelos eventos do Claude. O painel le isso em
// /api/status: um sync leva 1-2 minutos e sem esse retorno a tela parece travada.
let progresso = null;

const ESTIMATIVA_MENSAGENS = 20; // o Teams devolve no maximo 20 por leitura

function zerarProgresso(etapa) {
  progresso = {
    etapa, lidas: 0, total: ESTIMATIVA_MENSAGENS,
    inicio: Date.now(), ultimaAtividade: Date.now(),
  };
}

// Depois de ler tudo, o Claude passa ~1 minuto resumindo e classificando sem
// chamar nenhuma tool. Sem nomear essa fase, o contador congela em 20/20 e a
// tela volta a parecer travada — que era o problema original.
function etapaVisivel(p) {
  const paradoHa = Date.now() - p.ultimaAtividade;
  if (p.lidas > 0 && paradoHa > 7000 && p.etapa === 'lendo mensagens') {
    return 'resumindo e classificando';
  }
  return p.etapa;
}

// Cada evento do stream-json vem como uma linha JSON. So interessam os tool_use:
// a 1a leitura e a listagem do canal, as seguintes sao as mensagens uma a uma.
function processarEvento(linha) {
  if (!linha.trim() || !progresso) return;
  let ev;
  try { ev = JSON.parse(linha); } catch { return; } // linha partida ou ruido: ignora

  if (ev.type !== 'assistant') return;
  const partes = ev.message && ev.message.content;
  if (!Array.isArray(partes)) return;

  for (const p of partes) {
    if (p.type !== 'tool_use') continue;
    progresso.ultimaAtividade = Date.now();
    const nome = p.name || '';
    if (nome.includes('read_resource')) {
      const uri = (p.input && p.input.uri) || '';
      // URI que termina em /messages e a listagem; com /{id} no fim e uma mensagem
      if (/\/messages\/?$/.test(uri)) {
        progresso.etapa = 'listando o canal';
      } else {
        progresso.lidas++;
        progresso.etapa = 'lendo mensagens';
      }
    } else if (nome === 'Write') {
      progresso.etapa = 'gravando';
    }
  }
}

// Monta um prompt a partir do template, trocando os {{PLACEHOLDERS}}.
function montarPrompt(nome, valores) {
  let txt = fs.readFileSync(path.join(PROMPTS_DIR, nome), 'utf8');
  for (const [chave, valor] of Object.entries(valores)) {
    txt = txt.split('{{' + chave + '}}').join(valor);
  }
  return txt;
}

// Roda o Claude headless com um prompt e espera que ele grave `arquivoSaida`.
// Usado pelos passos do onboarding (verificar conta, listar chats), que sao
// curtos e nao precisam de barra de progresso.
function rodarClaudeSimples(prompt, arquivoSaida, timeoutMs = 3 * 60 * 1000) {
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
      try {
        resolve(JSON.parse(fs.readFileSync(arquivoSaida, 'utf8')));
      } catch {
        reject(new Error('O Claude rodou mas nao gravou um resultado legivel.'));
      }
    });

    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error('Nao consegui executar `claude`: ' + e.message));
    });
  });
}

function rodarSync() {
  return new Promise((resolve, reject) => {
    if (syncEmAndamento) return reject(new Error('Ja existe um sync em andamento.'));

    const config = lerConfig();
    if (!config) {
      return reject(new Error('Nenhuma conversa configurada. Refaca o onboarding.'));
    }

    syncEmAndamento = true;
    zerarProgresso('iniciando');

    let prompt;
    try {
      prompt = montarPrompt('sincronizar.md', {
        URI_MENSAGENS: uriDasMensagens(config.fonte),
        ARQUIVO_SNAPSHOT: SNAPSHOT_FILE,
        WEBURL_MOLDE: moldeDeWebUrl(config.fonte),
      });
    } catch (e) {
      syncEmAndamento = false;
      return reject(new Error('prompts/sincronizar.md nao encontrado.'));
    }

    // snapshot antigo sai da frente para nao mascarar uma falha silenciosa
    try { fs.unlinkSync(SNAPSHOT_FILE); } catch {}

    // O prompt vai por STDIN, nao como argumento: e multi-linha, e no Windows o
    // shell mutila argumentos assim — o Claude recebia texto truncado e respondia
    // outra coisa em vez de ler o canal.
    const args = [
      '-p',
      '--output-format', 'stream-json', '--verbose',
      '--allowedTools', 'mcp__claude_ai_Microsoft_365__read_resource,Write',
      '--permission-mode', 'acceptEdits',
    ];

    const proc = spawn('claude', args, { cwd: ROOT, shell: true });
    proc.stdin.write(prompt);
    proc.stdin.end();

    let stdout = '';
    let stderr = '';
    let buffer = '';

    proc.stdout.on('data', (d) => {
      stdout += d;
      // Um chunk pode cortar uma linha no meio; guarda o resto para o proximo.
      buffer += d;
      const linhas = buffer.split('\n');
      buffer = linhas.pop();
      for (const l of linhas) processarEvento(l);
    });
    proc.stderr.on('data', (d) => (stderr += d));

    const timer = setTimeout(() => {
      proc.kill();
      syncEmAndamento = false;
      progresso = null;
      reject(new Error('Timeout: o sync passou de 5 minutos sem terminar.'));
    }, 5 * 60 * 1000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      syncEmAndamento = false;
      progresso = null;

      if (code !== 0) {
        return reject(new Error(`claude saiu com codigo ${code}. ${stderr.slice(0, 400)}`));
      }

      let snapshot;
      try {
        snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, 'utf8'));
      } catch {
        return reject(new Error(
          'O Claude rodou mas nao gravou um snapshot.json valido. ' + resumoDoResultado(stdout)
        ));
      }
      if (!Array.isArray(snapshot)) {
        return reject(new Error('snapshot.json nao e um array.'));
      }

      try {
        const db = lerTasks();
        const r = merge(db, snapshot, new Date().toISOString());
        gravarTasks(db);
        resolve(r);
      } catch (e) {
        reject(e); // historico ilegivel: aborta sem gravar nada por cima
      }
    });

    proc.on('error', (e) => {
      clearTimeout(timer);
      syncEmAndamento = false;
      progresso = null;
      reject(new Error('Nao consegui executar `claude`: ' + e.message));
    });
  });
}

// Com stream-json o stdout e um monte de evento; para a mensagem de erro so
// interessa o texto final que o Claude respondeu.
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

// Abrir o app pelo servidor, e nao pelo href do navegador: o Chrome/Edge engolem
// protocolos customizados em silencio (sem permissao previa, o clique nao faz nada
// e nenhum erro aparece). Aqui o processo e chamado direto e a falha e visivel.
//
// A URL NUNCA vem do cliente — o navegador manda so o id, e o servidor busca o
// webUrl no proprio tasks.json. Assim nao ha como injetar comando pelo request.
function abrirNoTeams(id) {
  return new Promise((resolve, reject) => {
    const db = lerTasks();
    const t = db.tasks[id];
    if (!t || !t.webUrl) return reject(new Error('Task desconhecida: ' + id));

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
      // Teams classico ou instalacao diferente: deixa o Windows resolver o protocolo.
      execFile('cmd', ['/c', 'start', '', deep], (erro2) => {
        if (!erro2) return resolve({ via: 'protocolo do Windows' });
        reject(new Error('Nao consegui abrir o Teams: ' + erro2.message));
      });
    });
  });
}

// ---------------------------------------------------------------------- server

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(s);
}

function chaveDaFonte(f) {
  return f.tipo === 'chat' ? 'chat:' + f.chatId : 'canal:' + f.teamId + '/' + f.channelId;
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

// Valida a escolha do onboarding antes de gravar. Os ids entram na URI que o
// Claude vai ler, entao formato solto aqui vira erro confuso la na frente.
function validarFonte(corpo) {
  const nome = String(corpo.nome || '').slice(0, 200).trim();
  if (!nome) throw new Error('Falta o nome da conversa.');

  if (corpo.tipo === 'chat') {
    const chatId = String(corpo.chatId || '').trim();
    if (!/^19:[\w\-.@]+$/.test(chatId)) throw new Error('chatId invalido.');
    return { tipo: 'chat', chatId, nome };
  }

  if (corpo.tipo === 'canal') {
    const teamId = String(corpo.teamId || '').trim();
    const channelId = String(corpo.channelId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(teamId)) throw new Error('teamId invalido.');
    if (!/^19:[\w\-.@]+$/.test(channelId)) throw new Error('channelId invalido.');
    return { tipo: 'canal', teamId, channelId, nome };
  }

  throw new Error('Tipo de conversa desconhecido.');
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

  // Sem conversa configurada, a raiz e o onboarding. Assim quem clona o repo
  // cai direto na configuracao em vez de um quadro vazio sem explicacao.
  if (url.pathname === '/' || url.pathname === '/index.html') {
    const config = lerConfig();
    const pagina = config ? 'kanban.html' : 'onboarding.html';
    const html = fs.readFileSync(path.join(PUBLIC_DIR, pagina), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(html);
  }

  // ---- onboarding ----

  // Rota explicita para reconfigurar sem apagar nada a mao.
  if (url.pathname === '/onboarding') {
    const html = fs.readFileSync(path.join(PUBLIC_DIR, 'onboarding.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(html);
  }

  if (url.pathname === '/api/setup/config') {
    const config = lerConfig();
    return json(res, 200, { configurado: !!config, fonte: config ? config.fonte : null });
  }

  // Passo 1: existe Claude Code nesta maquina?
  if (url.pathname === '/api/setup/claude') {
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

  // Passo 2: o conector Microsoft 365 esta ligado? Quem esta logado?
  if (url.pathname === '/api/setup/conta' && req.method === 'POST') {
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

  // Passo 3a: listar os chats para escolher na tela.
  if (url.pathname === '/api/setup/chats' && req.method === 'POST') {
    try {
      const conta = fs.existsSync(CONTA_FILE)
        ? JSON.parse(fs.readFileSync(CONTA_FILE, 'utf8'))
        : {};
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

  // Passo 3b: gravar a escolha.
  if (url.pathname === '/api/setup/salvar' && req.method === 'POST') {
    try {
      const corpo = await lerCorpoJson(req);
      const fonte = validarFonte(corpo);

      // Trocar de conversa nao pode misturar historicos: as tasks da conversa
      // anterior sao arquivadas, nao apagadas nem reaproveitadas.
      const anterior = lerConfig();
      const mudou = anterior && chaveDaFonte(anterior.fonte) !== chaveDaFonte(fonte);
      if (mudou && fs.existsSync(TASKS_FILE)) {
        const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
        fs.renameSync(TASKS_FILE, path.join(DATA_DIR, `tasks-${carimbo}.json`));
      }

      fs.writeFileSync(
        CONFIG_FILE,
        JSON.stringify({ fonte, criadoEm: new Date().toISOString() }, null, 2),
        'utf8'
      );
      return json(res, 200, { ok: true, fonte, historicoArquivado: !!mudou });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  if (url.pathname === '/api/abrir' && req.method === 'POST') {
    const id = url.searchParams.get('id') || '';
    try {
      const r = await abrirNoTeams(id);
      return json(res, 200, { ok: true, ...r });
    } catch (e) {
      return json(res, 500, { ok: false, erro: e.message });
    }
  }

  if (url.pathname === '/api/status') {
    return json(res, 200, {
      syncing: syncEmAndamento,
      progresso: progresso
        ? {
            ...progresso,
            etapa: etapaVisivel(progresso),
            segundos: Math.round((Date.now() - progresso.inicio) / 1000),
          }
        : null,
    });
  }

  if (url.pathname === '/api/tasks') {
    const db = lerTasks();
    const lista = Object.values(db.tasks).map((t) => ({
      ...t,
      emojis: emojisDoCard(t.reactions),
    }));
    return json(res, 200, { lastSync: db.lastSync, tasks: lista, syncing: syncEmAndamento });
  }

  if (url.pathname === '/api/sync' && req.method === 'POST') {
    try {
      const r = await rodarSync();
      const db = lerTasks();
      const lista = Object.values(db.tasks).map((t) => ({
        ...t,
        emojis: emojisDoCard(t.reactions),
      }));
      return json(res, 200, { ok: true, ...r, lastSync: db.lastSync, tasks: lista });
    } catch (e) {
      return json(res, 500, { ok: false, erro: e.message });
    }
  }

  // DM Sans servida localmente (copiada de apps/status): a mesma fonte do design
  // system, sem depender de CDN nem de internet.
  if (url.pathname.startsWith('/assets/') && url.pathname.endsWith('.woff2')) {
    const arquivo = path.join(ROOT, 'assets', path.basename(url.pathname));
    if (fs.existsSync(arquivo)) {
      res.writeHead(200, {
        'Content-Type': 'font/woff2',
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      return res.end(fs.readFileSync(arquivo));
    }
  }

  res.writeHead(404);
  res.end('nao encontrado');
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Painel de tasks rodando em  http://localhost:${PORT}\n`);
  console.log(`  Ctrl+C para parar.\n`);
});
