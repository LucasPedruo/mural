// Mural — kanbans montados a partir das reacoes de conversas do Microsoft Teams.
//
// Cada mural aponta para uma conversa (canal ou chat) e tem historico proprio.
// O botao "Atualizar" roda o AGENTE ESCOLHIDO em modo headless — Claude Code,
// Codex, Gemini CLI ou outro, ver agentes.js — que apenas LE as mensagens e
// grava um snapshot cru. O merge com o historico e feito aqui, em JS
// deterministico: o LLM nunca toca no historico, para o acumulado nao poder ser
// inventado nem perdido.
//
// Nao ha login proprio: a autenticacao com a Microsoft e a do agente e do MCP
// que ele usa para o Graph. Este servidor nunca ve nem guarda credencial, e o
// Mural so LE o Teams — nao existe caminho de escrita aqui.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Quem fala com o Teams e um agente de IA ja autenticado — Claude Code, Codex,
// Gemini CLI ou outro. Qual deles e escolha de quem instala, e mora aqui para
// nao virar um `if` espalhado pelo servidor.
import {
  adaptadorEscolhido,
  adaptadores,
  comandoDe,
  detectarVersao,
  idEscolhido,
  IDS_DE_AGENTE,
  interpretarLinha,
  paraTela,
} from './agentes.js';

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
const AGENTES_FILE = path.join(DATA_DIR, 'agentes.json');

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

// O emoji de "fazendo" e o unico status alem do check que tem emoji proprio, e
// por isso e configuravel: ele existe porque alguem PRECISA anunciar que pegou a
// demanda, e cada time faz isso com um simbolo diferente. Sem ele configurado a
// regra e a de antes, e nada muda.
//
// O check ganha do "fazendo": quem terminou terminou, mesmo com a bolinha ainda
// na mensagem — e tirar as duas reacoes para o quadro ficar certo seria trabalho
// que o quadro pode fazer sozinho.
function statusDe(reactions, emojiFazendo) {
  const r = reactions || [];
  if (r.some(ehCheck)) return 'feito';
  if (temEmojiDeAssinatura(r, emojiFazendo)) return 'fazendo';
  if (r.length > 0) return 'interagido';
  return 'aberto';
}

// Os emojis que motivaram o "interagido" aparecem crus no card: sem lista fixa,
// ver qual reacao foi usada e a unica forma de saber o que aconteceu ali.
function emojisDoCard(reactions, emojiFazendo) {
  const fazendo = normalizarEmoji(emojiFazendo);
  return (reactions || []).filter(
    (e) => !ehCheck(e) && (!fazendo || normalizarEmoji(e) !== fazendo),
  );
}

const STATUS_VALIDOS = ['aberto', 'fazendo', 'interagido', 'feito'];

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

function arquivoSprints(id) {
  return path.join(pastaDoMural(id), 'sprints.json');
}

function arquivoColunas(id) {
  return path.join(pastaDoMural(id), 'colunas.json');
}

// --------------------------------------------------------- colunas suas
//
// As seis colunas do quadro nao sao listas: sao REGRAS. Nenhum card e posto
// nelas — `statusDe` calcula a coluna a partir da reacao no Teams, e `meu` e
// `ignorada` saem de campos seus. Por isso elas nao se criam nem se apagam:
// apagar "Backlog" seria apagar a pergunta "o que ninguem pegou".
//
// As colunas daqui sao o contrario: NAO tem regra. Sao lugares, e o unico jeito
// de um card entrar e voce arrastar. Isso as torna a unica parte do quadro que
// nao responde ao Teams — e e de proposito, porque e para isso que servem: o
// passo do SEU processo que o canal nao conhece.
const MAX_COLUNAS = 8;
const MAX_LETRAS_DA_COLUNA = 24;

// Cores nomeadas, nao hex: o quadro tem tema claro e escuro, e um #7c3aed
// gravado no disco ficaria ilegivel num dos dois. O nome vira variavel de CSS
// na interface, que e quem sabe o tom certo de cada tema.
const CORES_DE_COLUNA = ['roxo', 'ciano', 'rosa', 'lima', 'ambar', 'cinza'];

function lerColunas(muralId) {
  const c = lerJson(arquivoColunas(muralId), { colunas: [] });
  return Array.isArray(c.colunas) ? c : { colunas: [] };
}

function gravarColunas(muralId, c) {
  fs.mkdirSync(pastaDoMural(muralId), { recursive: true });
  gravarJsonAtomico(arquivoColunas(muralId), c);
}

function nomeDeColunaValido(valor) {
  const nome = String(valor || '').trim().replace(/\s+/g, ' ').slice(0, MAX_LETRAS_DA_COLUNA);
  if (!nome) throw new Error('Dê um nome à coluna.');
  return nome;
}

function criarColuna(muralId, corpo) {
  const c = lerColunas(muralId);
  if (c.colunas.length >= MAX_COLUNAS) {
    throw new Error(
      `O quadro ja tem ${MAX_COLUNAS} colunas suas. Uma fila que nao cabe na tela deixa de ser ` +
      'um quadro — exclua uma antes de criar outra.'
    );
  }
  const nome = nomeDeColunaValido(corpo.nome);
  if (c.colunas.some((x) => x.nome.toLowerCase() === nome.toLowerCase())) {
    throw new Error('Ja existe uma coluna sua com esse nome.');
  }
  const coluna = {
    id: `c${Date.now().toString(36)}`,
    nome,
    cor: CORES_DE_COLUNA.includes(corpo.cor) ? corpo.cor : CORES_DE_COLUNA[c.colunas.length % CORES_DE_COLUNA.length],
    criadaEm: new Date().toISOString(),
  };
  c.colunas.push(coluna);
  gravarColunas(muralId, c);
  return coluna;
}

function renomearColuna(muralId, id, corpo) {
  const c = lerColunas(muralId);
  const coluna = c.colunas.find((x) => x.id === String(id));
  if (!coluna) throw new Error('Coluna desconhecida.');
  if (corpo.nome !== undefined) {
    const nome = nomeDeColunaValido(corpo.nome);
    if (c.colunas.some((x) => x.id !== coluna.id && x.nome.toLowerCase() === nome.toLowerCase())) {
      throw new Error('Ja existe uma coluna sua com esse nome.');
    }
    coluna.nome = nome;
  }
  if (corpo.cor !== undefined && CORES_DE_COLUNA.includes(corpo.cor)) coluna.cor = corpo.cor;
  gravarColunas(muralId, c);
  return coluna;
}

// Excluir leva os cards junto, e isso e irreversivel: eles saem do arquivo e as
// mensagens entram na lista de arquivados, para nenhuma leitura futura as
// ressuscitar. E a mesma maquina do "apagar de vez" de um card — nao existe
// meia exclusao aqui, e a interface avisa antes com o numero na frente.
function excluirColuna(muralId, id) {
  const c = lerColunas(muralId);
  const coluna = c.colunas.find((x) => x.id === String(id));
  if (!coluna) throw new Error('Coluna desconhecida.');

  const db = lerTasks(muralId);
  if (!db.arquivados) db.arquivados = {};
  let apagadas = 0;
  for (const t of Object.values(db.tasks)) {
    if (t.coluna !== coluna.id) continue;
    if (t.origem !== 'manual') {
      for (const m of mensagensDaTask(t)) db.arquivados[m.id] = `coluna:${coluna.nome}`;
      db.arquivados[t.id] = `coluna:${coluna.nome}`;
    }
    delete db.tasks[t.id];
    apagadas++;
  }
  gravarTasks(muralId, db);

  c.colunas = c.colunas.filter((x) => x.id !== coluna.id);
  gravarColunas(muralId, c);
  return { apagadas, nome: coluna.nome };
}

/** Prender um card numa coluna sua, ou solta-lo de volta ao fluxo do Teams.
 *
 *  Diferente de `/api/mover`, que so aceita card fora de alcance: aqui o card
 *  PODE estar sendo acompanhado pelo canal, e prende-lo e justamente dizer "este
 *  saiu do fluxo do Teams por enquanto". O `status` continua sendo atualizado a
 *  cada leitura, intocado — e por isso soltar o card o devolve na hora para a
 *  coluna que a reacao mandar, sem precisar de nova sincronizacao. */
function prenderNaColuna(muralId, id, colunaId) {
  const db = lerTasks(muralId);
  const t = db.tasks[String(id || '')];
  if (!t) throw new Error('Task desconhecida.');
  if (colunaId) {
    const existe = lerColunas(muralId).colunas.some((x) => x.id === String(colunaId));
    if (!existe) throw new Error('Coluna desconhecida.');
    t.coluna = String(colunaId);
  } else {
    t.coluna = null;
  }
  gravarTasks(muralId, db);
}

// ------------------------------------------------------------------- sprints

// A sprint aqui e so um ciclo com comeco e fim: o time nem precisa usar a
// palavra. Ela existe para que "concluido" possa ser zerado de vez em quando —
// um quadro que acumula seis meses de check nao serve para olhar.
const DIAS_DE_SPRINT_PADRAO = 14;

function lerSprints(muralId) {
  const s = lerJson(arquivoSprints(muralId), { atual: null, encerradas: [] });
  if (!Array.isArray(s.encerradas)) s.encerradas = [];
  return s;
}

function gravarSprints(muralId, s) {
  fs.mkdirSync(pastaDoMural(muralId), { recursive: true });
  gravarJsonAtomico(arquivoSprints(muralId), s);
}

// Dia LOCAL, nao UTC: a sprint comeca no dia que a pessoa marcou no calendario
// dela, e comparar com o `createdDateTime` cru jogaria o fim da tarde para o dia
// seguinte.
function diaLocalDe(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function hojeLocal() {
  return diaLocalDe(new Date().toISOString());
}

function diaValido(valor, padrao) {
  const t = String(valor || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : padrao;
}

function somarDias(dia, dias) {
  const [a, m, d] = dia.split('-').map(Number);
  const data = new Date(a, m - 1, d + dias);
  return diaLocalDe(data.toISOString());
}

// "Sprint 42" vira "Sprint 43". Sem numero no fim, ganha um — encerrar uma
// sprint tem de abrir a seguinte sozinho, senao o quadro fica sem ciclo e o
// proximo encerramento nao tem onde arquivar.
function proximoNomeDeSprint(nome) {
  const m = String(nome || '').match(/^(.*?)(\d+)(\D*)$/);
  if (m) return `${m[1]}${Number(m[2]) + 1}${m[3]}`;
  return `${String(nome || 'Sprint').trim()} 2`;
}

function definirSprint(muralId, corpo) {
  const s = lerSprints(muralId);
  const nome = String(corpo.nome || '').trim() || 'Sprint 1';
  const inicio = diaValido(corpo.inicio, s.atual?.inicio || hojeLocal());
  const dias = Math.min(120, Math.max(1, Math.round(Number(corpo.dias) || DIAS_DE_SPRINT_PADRAO)));
  s.atual = {
    nome,
    inicio,
    dias,
    fim: somarDias(inicio, dias - 1),
    criadaEm: s.atual?.criadaEm || new Date().toISOString(),
  };
  gravarSprints(muralId, s);
  return s.atual;
}

// A lista de sprints sem os cards arquivados dentro: a tela de cima so precisa
// dos nomes e das datas, e mandar o arquivo inteiro em cada leitura do quadro
// seria carregar meses de historico para desenhar um botao.
function sprintsResumidas(s) {
  return {
    atual: s.atual || null,
    encerradas: s.encerradas.map((e) => ({
      nome: e.nome,
      inicio: e.inicio,
      fim: e.fim,
      dias: e.dias,
      encerradaEm: e.encerradaEm,
      arquivadas: (e.tasks || []).length,
    })),
  };
}

// Encerrar a sprint tira do quadro o que ja terminou — Concluido e Feito por
// mim — e guarda dentro da sprint encerrada. NADA e apagado: os dois paineis
// leem dali, inclusive a anotacao da daily.
//
// O merge passa a ignorar essas mensagens para sempre (`db.arquivados`). Sem
// isso, a mensagem que continua na janela das ~20 voltaria como task NOVA na
// leitura seguinte, e a coluna que voce acabou de zerar se enche de novo.
function encerrarSprint(muralId) {
  const s = lerSprints(muralId);
  if (!s.atual) throw new Error('Este mural nao tem sprint definida.');

  const db = lerTasks(muralId);
  if (!db.arquivados) db.arquivados = {};
  const agora = new Date().toISOString();
  const arquivadas = [];

  for (const t of Object.values(db.tasks)) {
    // Ignorada tambem sai do quadro no encerramento: ela ja foi decidida, e
    // arrastar a mesma lista de descartes de sprint em sprint nao serve a nada.
    // Card preso numa coluna sua nao e "terminado": ele esta num passo do SEU
    // processo, e encerrar a sprint nao pode arrancar de la o que voce ainda
    // esta segurando — nem que o time ja tenha dado o check no Teams.
    if (t.coluna) continue;
    if (t.status !== 'feito' && !t.meu && !t.feitoPor && !t.ignorada) continue;
    arquivadas.push({ ...t, sprint: s.atual.nome, arquivadaEm: agora });
    // Task sua nunca esteve no Teams: nao ha mensagem para o merge ressuscitar,
    // e marcar o id dela em `arquivados` so sujaria o arquivo.
    if (t.origem !== 'manual') {
      for (const m of mensagensDaTask(t)) db.arquivados[m.id] = s.atual.nome;
      db.arquivados[t.id] = s.atual.nome;
    }
    delete db.tasks[t.id];
  }

  s.encerradas.unshift({ ...s.atual, encerradaEm: agora, tasks: arquivadas });
  s.atual = {
    nome: proximoNomeDeSprint(s.atual.nome),
    inicio: hojeLocal(),
    dias: s.atual.dias || DIAS_DE_SPRINT_PADRAO,
    fim: somarDias(hojeLocal(), (s.atual.dias || DIAS_DE_SPRINT_PADRAO) - 1),
    criadaEm: agora,
  };

  gravarTasks(muralId, db);
  gravarSprints(muralId, s);
  return { arquivadas: arquivadas.length, sprints: sprintsResumidas(s) };
}

// ------------------------------------------------------------- mcp do agente

// Perguntar ao proprio CLI se o conector do Teams esta ligado, sem entrar na TUI
// dele. Existe porque a resposta anterior para "nao conecta" era mandar a pessoa
// abrir um terminal e digitar /mcp — um comando que so existe DENTRO da interface
// interativa, e que esta tela nao tem como executar por ela.
//
// O que da para fazer daqui e melhor que abrir um terminal: o CLI tem os mesmos
// dados fora da TUI, entao a pergunta se responde na propria pagina.

/** Uma linha de `claude mcp list`:
 *    claude.ai Microsoft 365: https://... - ✔ Connected
 *  Texto, e nao JSON, porque o comando nao oferece JSON. O formato pode mudar
 *  numa versao nova do CLI — por isso a linha crua vai junto, e a interface
 *  mostra ela quando nao consegue interpretar. */
function lerLinhaDeMcp(linha) {
  const m = String(linha).match(/^(.+?):\s+(\S+)(?:\s+\(\w+\))?\s+-\s+(.+)$/);
  if (!m) return null;
  const estado = m[3].trim();
  return {
    nome: m[1].trim(),
    endereco: m[2].trim(),
    estado,
    conectado: /✔|connected/i.test(estado) && !/needs|failed|✘|!/i.test(estado),
    linha: String(linha).trim(),
  };
}

function rodarComandoDoAgente(ad, args, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    if (!ad.binario) return reject(new Error('O agente nao tem binario configurado.'));
    const proc = spawn(ad.binario, args, { cwd: ROOT, shell: true });
    let saida = '';
    let erro = '';
    const relogio = setTimeout(() => {
      proc.kill();
      reject(new Error('O agente nao respondeu a tempo.'));
    }, timeoutMs);
    proc.stdout.on('data', (d) => { saida += d.toString(); });
    proc.stderr.on('data', (d) => { erro += d.toString(); });
    proc.on('error', (e) => { clearTimeout(relogio); reject(e); });
    proc.on('close', (codigo) => {
      clearTimeout(relogio);
      resolve({ codigo, saida, erro });
    });
  });
}

async function listarMcpDoAgente() {
  const ad = agenteEmUso();
  if (!ad.mcp || !ad.mcp.listar) {
    throw new Error(`${ad.nome} nao sabe listar MCPs pela linha de comando.`);
  }
  const r = await rodarComandoDoAgente(ad, ad.mcp.listar);
  const NL = String.fromCharCode(10);
  const linhas = [r.saida, r.erro]
    .join(NL)
    .split(NL)
    .map((l) => l.trim())
    .filter(Boolean);
  const servidores = linhas.map(lerLinhaDeMcp).filter(Boolean);
  const doTeams = ad.mcp.procurar
    ? servidores.find((sv) => ad.mcp.procurar.test(sv.nome))
    : null;
  return { servidores, doTeams: doTeams || null, bruto: linhas.join(NL) };
}

/** Dispara o fluxo de autorizacao do conector. O CLI abre o navegador e espera o
 *  retorno; quem autoriza e a pessoa, na tela da Microsoft. Este servidor nunca
 *  ve credencial nenhuma — continua sendo verdade depois deste botao. */
async function conectarMcpDoAgente(nome) {
  const ad = agenteEmUso();
  if (!ad.mcp || !ad.mcp.conectar) {
    throw new Error(`${ad.nome} nao sabe autenticar MCPs pela linha de comando.`);
  }
  const alvo = String(nome || '').trim();
  if (!alvo) throw new Error('Diga qual MCP conectar.');
  const args = ad.mcp.conectar.map((a) => (a === '{{NOME}}' ? alvo : a));
  // Cinco minutos: o tempo e de quem esta autorizando no navegador, nao do CLI.
  const r = await rodarComandoDoAgente(ad, args, 5 * 60 * 1000);
  return { codigo: r.codigo, saida: (r.saida + r.erro).trim().slice(-2000) };
}

// ------------------------------------------------- incluir por link

/** Le um link de mensagem do Teams: de que conversa ele fala e qual mensagem.
 *
 *  O onboarding le o mesmo formato para descobrir um canal; aqui interessa
 *  TAMBEM o id da mensagem, que e a ultima parte do caminho. Link de canal traz
 *  `groupId`; link de chat nao traz — e e so por isso que da para distinguir os
 *  dois, porque o resto do endereco e igual. */
function lerLinkDeMensagem(bruto) {
  let u;
  try {
    u = new URL(String(bruto || '').trim());
  } catch {
    throw new Error('Isso nao parece um link. No Teams: "..." da mensagem > Copiar link.');
  }
  if (!/teams\.microsoft\.com$/i.test(u.hostname)) {
    throw new Error('Este link nao e do Teams.');
  }
  const m = u.pathname.match(/\/l\/message\/([^/]+)\/([^/?#]+)/);
  if (!m) {
    throw new Error('Nao achei a mensagem neste link. No Teams: "..." da mensagem > Copiar link.');
  }
  const conversa = decodeURIComponent(m[1]);
  const mensagemId = decodeURIComponent(m[2]).trim();
  if (!/^\d+$/.test(mensagemId)) {
    throw new Error('O link nao aponta para uma mensagem especifica.');
  }
  const teamId = u.searchParams.get('groupId');
  const fonte = teamId
    ? { tipo: 'canal', subtipo: 'canal', teamId, channelId: conversa }
    : { tipo: 'chat', subtipo: 'group', chatId: conversa };
  return { fonte, mensagemId };
}

/** A mensagem do link e da conversa que este mural acompanha? Se nao for, o card
 *  entra igual — mas marcado, porque nenhuma leitura futura vai atualiza-lo: o
 *  sync le uma conversa so, a do mural. */
function ehDaMesmaConversa(mural, fonte) {
  if (mural.tipo !== fonte.tipo) return false;
  if (fonte.tipo === 'chat') return String(mural.chatId) === String(fonte.chatId);
  return (
    String(mural.teamId) === String(fonte.teamId) &&
    String(mural.channelId) === String(fonte.channelId)
  );
}

/** Traz UMA mensagem para o quadro a partir do link dela.
 *
 *  Custa uma execucao do agente, e e de proposito: o card entra com autor, data,
 *  texto e reacoes de verdade, em vez de com o que voce lembrar de digitar. Uma
 *  mensagem em vez de vinte e uma, entao e uma fracao do preco de uma leitura —
 *  mas nao e gratis, e quem chama confirma antes.
 *
 *  O `lastSeen` fica no instante da inclusao, nao no `lastSync`: assim o card
 *  nasce "fora de alcance" e movivel a mao, que e a verdade sobre ele. Se a
 *  mensagem estiver na conversa do mural E na janela das ~20, a proxima leitura o
 *  encontra e ele volta a ser um card comum, sem nenhum caso especial aqui.
 */
async function incluirPorLink(muralId, link) {
  const mural = acharMural(muralId);
  if (!mural) throw new Error('Mural nao encontrado.');
  const { fonte, mensagemId } = lerLinkDeMensagem(link);

  const db = lerTasks(muralId);
  if (db.tasks[mensagemId]) throw new Error('Esta mensagem ja esta no quadro.');
  for (const t of Object.values(db.tasks)) {
    if (mensagensDaTask(t).some((m) => String(m.id) === mensagemId)) {
      throw new Error('Esta mensagem ja esta no quadro, dentro de outro card.');
    }
  }
  if (db.arquivados && db.arquivados[mensagemId]) {
    throw new Error(
      'Esta mensagem foi arquivada ou apagada aqui antes. Trazer de volta exigiria ' +
      'desfazer isso a mao, no tasks.json.'
    );
  }

  const ad = agenteEmUso();
  const arquivo = path.join(pastaDoMural(muralId), 'mensagem.json');
  fs.mkdirSync(pastaDoMural(muralId), { recursive: true });

  const prompt = montarPrompt('ler-mensagem.md', {
    URI_MENSAGEM: uriDasMensagens(fonte, ad) + '/' + mensagemId,
    ARQUIVO_SNAPSHOT: arquivo,
    FERRAMENTA_LEITURA: ad.ferramentas.leitura,
    FERRAMENTA_ESCRITA: ad.ferramentas.escrita,
    LINK_ORIGINAL: link,
  });

  // `rodarAgenteSimples` resolve com o JSON que o agente gravou — o gasto ele
  // registra sozinho, no consumo.json, como qualquer outra execucao.
  const lista = await rodarAgenteSimples(prompt, arquivo, 'sync');
  const crua = Array.isArray(lista) ? lista.find((x) => x && x.id) : null;
  if (!crua) {
    throw new Error(
      'O agente nao achou essa mensagem. Ela pode ter sido apagada, ou a conta ' +
      'autenticada pode nao ter acesso a essa conversa.'
    );
  }

  const agora = new Date().toISOString();
  const mensagem = mensagemDoSnapshot({ ...crua, id: mensagemId }, agora);
  if (!mensagem.webUrl) mensagem.webUrl = link;

  const daMesma = ehDaMesmaConversa(mural, fonte);
  const t = aplicarMensagensNaTask(
    {
      id: mensagemId,
      origem: 'teams',
      agrupamento: null,
      firstSeen: agora,
      statusChangedAt: agora,
      statusAnterior: null,
      lastSeen: agora,
      movidoAMao: false,
      meu: null,
      feitoPor: null,
      coluna: null,
      nota: null,
      ignorada: null,
      tags: [],
      // Vindo de outra conversa, nenhuma leitura futura o alcanca: o sync le a
      // conversa do mural, e so ela. O selo existe para o card nao parecer um
      // card comum que por acaso parou de atualizar.
      deOutraConversa: !daMesma,
      incluidoPorLink: agora,
    },
    [mensagem],
  );
  t.status = statusDe(t.reactions, prefsDoUsuario(usuarioAtual()).emojiFazendo);
  db.tasks[mensagemId] = t;
  gravarTasks(muralId, db);

  try { fs.unlinkSync(arquivo); } catch {}
  return { id: mensagemId, deOutraConversa: !daMesma };
}

// ------------------------------------------------------------------- paineis

// Tudo que ja passou pelo mural: o que esta no quadro agora mais o que as
// sprints encerradas guardaram. Os paineis precisam das duas metades — a conta de
// "quantos chegaram na sprint 3" nao pode mudar porque a sprint 3 foi fechada.
function historicoCompleto(muralId) {
  const db = lerTasks(muralId);
  const sprints = lerSprints(muralId);
  const vivas = Object.values(db.tasks).map((t) => ({ ...t, arquivada: false, sprint: null }));
  const arquivadas = sprints.encerradas.flatMap((e) =>
    (e.tasks || []).map((t) => ({ ...t, arquivada: true, sprint: t.sprint || e.nome })),
  );
  return { db, sprints, tasks: [...vivas, ...arquivadas] };
}

function janelasDeSprint(sprints) {
  const janelas = [];
  if (sprints.atual) janelas.push({ ...sprints.atual, atual: true, encerradaEm: null, arquivadas: 0 });
  for (const e of sprints.encerradas) {
    janelas.push({ ...e, atual: false, arquivadas: (e.tasks || []).length, tasks: undefined });
  }
  return janelas;
}

// Concluida e uma pergunta com tres respostas certas: o check do Teams, o "fiz
// esta" e o credito a outra pessoa. Mora aqui porque painel, dashboard e a
// listagem precisam responder a mesma coisa — se cada um decidisse sozinho, a
// mesma task apareceria concluida numa tela e aberta na outra.
function tarefaConcluida(t) {
  return t.status === 'feito' || !!t.meu || !!t.feitoPor;
}

// A coluna em que o card esta HOJE, pela mesma regra do quadro. Ignorada vence
// tudo; depois o credito (seu ou de outra pessoa); e so entao o status do Teams.
function colunaDaTask(t) {
  if (t.ignorada) return 'ignorada';
  // Uma coluna sua vence a regra do Teams: prender o card ali foi um gesto seu,
  // explicito, e mais recente que qualquer reacao. O status continua sendo
  // atualizado por baixo — e por isso soltar o card o devolve na hora.
  if (t.coluna) return t.coluna;
  if (t.meu) return 'meu';
  if (t.feitoPor) return 'feito';
  return t.status || 'aberto';
}

// Uma linha por sprint, mais o que chegou fora de qualquer uma delas. Usada
// pelos dois paineis: a conta de "quantos chegaram na sprint 3" tem de dar o
// mesmo numero nas duas telas.
function linhasDeSprint(sprints, tasks) {
  const janelas = janelasDeSprint(sprints);
  const dia = (t) => diaLocalDe(t.createdDateTime);
  const dentroDe = (j) => tasks.filter((t) => dia(t) >= j.inicio && dia(t) <= j.fim);

  const linhas = janelas.map((j) => {
    const dentro = dentroDe(j);
    return {
      nome: j.nome,
      inicio: j.inicio,
      fim: j.fim,
      atual: j.atual,
      encerradaEm: j.encerradaEm || null,
      arquivadas: j.arquivadas,
      chegaram: dentro.length,
      bugs: dentro.filter((t) => t.kind === 'bug').length,
      sugestoes: dentro.filter((t) => t.kind !== 'bug').length,
      concluidas: dentro.filter((t) => t.status === 'feito' || t.meu || t.feitoPor).length,
      minhas: dentro.filter((t) => t.meu).length,
      ignoradas: dentro.filter((t) => t.ignorada).length,
      // Ignorada nao e "em aberto": ela foi decidida, so nao foi feita.
      emAberto: dentro.filter((t) => !t.meu && !t.feitoPor && !t.ignorada && t.status !== 'feito').length,
      mensagens: dentro.reduce((s, t) => s + mensagensDaTask(t).length, 0),
    };
  });

  // O que chegou antes de existir sprint neste mural nao pode desaparecer da
  // conta: some numa linha propria em vez de sumir da soma.
  const cobertas = new Set();
  for (const j of janelas) for (const t of dentroDe(j)) cobertas.add(t.id);
  const soltas = tasks.filter((t) => !cobertas.has(t.id));

  return { linhas, soltas };
}

// As tags atravessam sprint: a pergunta "quanto de Financeiro chegou este mes"
// nao se responde olhando uma coluna do quadro.
function tagsDoHistorico(tasks) {
  const porTag = new Map();
  for (const t of tasks) {
    for (const tag of t.tags || []) {
      const chave = tag.toLowerCase();
      const atual = porTag.get(chave) || { tag, total: 0, concluidas: 0, abertas: 0 };
      atual.total++;
      if (tarefaConcluida(t)) atual.concluidas++;
      else if (!t.ignorada) atual.abertas++;
      porTag.set(chave, atual);
    }
  }
  return [...porTag.values()].sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag));
}

function painelDoMural(muralId) {
  const { sprints, tasks } = historicoCompleto(muralId);
  const { linhas, soltas } = linhasDeSprint(sprints, tasks);

  // A daily le por dia da MARCA, nao da mensagem: o que importa na reuniao e o
  // dia em que voce fez, nao o dia em que o pedido chegou.
  const feitas = tasks
    .filter((t) => t.meu && t.meu.em)
    .sort((a, b) => String(b.meu.em).localeCompare(String(a.meu.em)));

  const porDia = [];
  for (const t of feitas) {
    const chave = diaLocalDe(t.meu.em);
    let grupo = porDia[porDia.length - 1];
    if (!grupo || grupo.dia !== chave) {
      grupo = { dia: chave, itens: [] };
      porDia.push(grupo);
    }
    grupo.itens.push({
      id: t.id,
      summary: t.summary,
      kind: t.kind === 'bug' ? 'bug' : 'sugestao',
      solucao: t.meu.solucao || '',
      em: t.meu.em,
      via: t.meu.via,
      status: t.status,
      origem: t.origem === 'manual' ? 'manual' : 'teams',
      autor: t.author,
      arquivada: !!t.arquivada,
      sprint: t.sprint || (sprints.atual ? sprints.atual.nome : null),
      mensagens: mensagensDaTask(t).length,
      webUrl: t.webUrl || '',
    });
  }

  return {
    tags: tagsDoHistorico(tasks),
    sprints: linhas,
    foraDeSprint: soltas.length
      ? {
          chegaram: soltas.length,
          bugs: soltas.filter((t) => t.kind === 'bug').length,
          concluidas: soltas.filter((t) => t.status === 'feito' || t.meu || t.feitoPor).length,
        }
      : null,
    daily: {
      porDia,
      total: feitas.length,
      bugs: feitas.filter((t) => t.kind === 'bug').length,
      diasAtivos: porDia.length,
      arquivadas: feitas.filter((t) => t.arquivada).length,
    },
  };
}

// ------------------------------------------------------------------ dashboard

// O painel responde "o que aconteceu nesta sprint" em texto, para ler em voz
// alta na daily. O dashboard responde "como esta este mural" em forma — ritmo,
// distribuicao, quem carrega o que. Sao perguntas diferentes, e por isso duas
// rotas: mandar a lista inteira da daily para desenhar seis graficos, ou mandar
// series agregadas para quem quer copiar o texto de um item, seria o peso de uma
// tela pagando pela outra.

const DIAS_DO_DASHBOARD = 30;

function dashboardDoMural(muralId) {
  const { sprints, tasks } = historicoCompleto(muralId);

  // As seis do Teams sempre aparecem, mesmo zeradas — "nada em Backlog" e uma
  // resposta. As suas so entram se existirem, e um card preso numa coluna ja
  // excluida nao pode sumir da conta: ele volta a valer pelo status do Teams.
  const porColuna = { aberto: 0, fazendo: 0, interagido: 0, feito: 0, meu: 0, ignorada: 0 };
  for (const c of lerColunas(muralId).colunas) porColuna[c.id] = 0;
  for (const t of tasks) {
    const c = colunaDaTask(t);
    if (porColuna[c] !== undefined) porColuna[c]++;
    else if (porColuna[t.status] !== undefined) porColuna[t.status]++;
    else porColuna.aberto++;
  }

  // Quando a task foi concluida. So o que foi marcado AQUI tem data propria: o
  // check do Teams nao carrega horario, e o mais proximo disso e a leitura em
  // que o status virou 'feito'.
  const concluidaEm = (t) => {
    if (t.meu && t.meu.em) return t.meu.em;
    if (t.feitoPor && t.feitoPor.em) return t.feitoPor.em;
    return t.status === 'feito' ? t.statusChangedAt || null : null;
  };

  // Os ultimos 30 dias COM os dias vazios: um grafico que pula o fim de semana
  // mente sobre o ritmo do time — o vale de sabado faz parte da resposta.
  const hoje = hojeLocal();
  const porDia = [];
  const indiceDoDia = new Map();
  for (let i = DIAS_DO_DASHBOARD - 1; i >= 0; i--) {
    const linha = { dia: somarDias(hoje, -i), chegaram: 0, bugs: 0, concluidas: 0 };
    porDia.push(linha);
    indiceDoDia.set(linha.dia, linha);
  }
  for (const t of tasks) {
    const chegou = indiceDoDia.get(diaLocalDe(t.createdDateTime));
    if (chegou) {
      chegou.chegaram++;
      if (t.kind === 'bug') chegou.bugs++;
    }
    const em = concluidaEm(t);
    const fechou = em ? indiceDoDia.get(diaLocalDe(em)) : null;
    if (fechou) fechou.concluidas++;
  }

  // Quem resolveu. O Graph nunca diz quem reagiu — `reactions[].users` vem nulo
  // — entao aqui so aparece quem foi creditado A MAO: voce, pelo "fiz esta", e
  // as pessoas do "feito por outra pessoa". O resto vira `semCredito`, que e
  // justamente o numero que mede o quanto do quadro esta concluido sem dono
  // conhecido. Escondê-lo faria os graficos parecerem mais completos do que sao.
  const porPessoa = new Map();
  let semCredito = 0;
  for (const t of tasks) {
    if (!tarefaConcluida(t)) continue;
    const quem = t.meu ? 'Você' : t.feitoPor ? t.feitoPor.quem : null;
    if (!quem) {
      semCredito++;
      continue;
    }
    const atual = porPessoa.get(quem) || { pessoa: quem, total: 0, ehVoce: !!t.meu };
    atual.total++;
    porPessoa.set(quem, atual);
  }

  // Quem PEDE — outra pergunta, e a unica das duas que o Teams responde sozinho.
  const porAutor = new Map();
  for (const t of tasks) {
    const nome = t.author || 'sem autor';
    const atual = porAutor.get(nome) || { autor: nome, total: 0, bugs: 0, concluidas: 0 };
    atual.total++;
    if (t.kind === 'bug') atual.bugs++;
    if (tarefaConcluida(t)) atual.concluidas++;
    porAutor.set(nome, atual);
  }

  // Quanto tempo uma task leva do pedido ate ficar pronta. So entram as que tem
  // as duas pontas: sem data de conclusao nao ha o que medir, e chutar a data
  // faria a metrica dizer qualquer coisa.
  const duracoes = [];
  for (const t of tasks) {
    const em = concluidaEm(t);
    if (!em || !t.createdDateTime) continue;
    const dias = (new Date(em).getTime() - new Date(t.createdDateTime).getTime()) / 86_400_000;
    if (Number.isFinite(dias) && dias >= 0) duracoes.push(dias);
  }
  duracoes.sort((a, b) => a - b);
  // Mediana, nao media: uma task esquecida por seis meses puxaria a media para
  // um numero que nao descreve nenhuma semana real do time.
  const medianaDeDias = duracoes.length
    ? Math.round(duracoes[Math.floor(duracoes.length / 2)] * 10) / 10
    : null;

  const abertas = tasks.filter((t) => !tarefaConcluida(t) && !t.ignorada);

  return {
    totais: {
      tasks: tasks.length,
      bugs: tasks.filter((t) => t.kind === 'bug').length,
      sugestoes: tasks.filter((t) => t.kind !== 'bug').length,
      concluidas: tasks.filter(tarefaConcluida).length,
      emAberto: abertas.length,
      ignoradas: tasks.filter((t) => t.ignorada).length,
      minhas: tasks.filter((t) => t.meu).length,
      porOutros: tasks.filter((t) => !t.meu && t.feitoPor).length,
      semCredito,
      medianaDeDias,
      // A mais velha ainda em aberto: um numero que o quadro nao mostra, porque
      // la ela e so mais um card no fim da coluna.
      maisAntigaEmAbertoDias: abertas.length
        ? Math.max(
            ...abertas.map((t) =>
              Math.floor((Date.now() - new Date(t.createdDateTime).getTime()) / 86_400_000),
            ),
          )
        : null,
    },
    porColuna,
    porDia,
    sprints: linhasDeSprint(sprints, tasks).linhas,
    tags: tagsDoHistorico(tasks),
    porPessoa: [...porPessoa.values()].sort(
      (a, b) => b.total - a.total || a.pessoa.localeCompare(b.pessoa),
    ),
    porAutor: [...porAutor.values()].sort(
      (a, b) => b.total - a.total || a.autor.localeCompare(b.autor),
    ),
  };
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

// O agente escolhido e os ajustes dele. E configuracao, nao dado: `refazer
// configuracao` limpa este arquivo junto com o resto do onboarding.
function lerConfigAgentes() {
  const c = lerJson(AGENTES_FILE, { escolhido: 'claude', porAgente: {} });
  if (!c.porAgente || typeof c.porAgente !== 'object') c.porAgente = {};
  return c;
}

function gravarConfigAgentes(config) {
  gravarJsonAtomico(AGENTES_FILE, config);
}

function agenteEmUso() {
  return adaptadorEscolhido(lerConfigAgentes());
}

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
const EMOJI_FAZENDO_PADRAO = '⚪';

function prefsDoUsuario(usuario) {
  const todas = lerPreferencias();
  // Confirmar e o padrao: gastar dinheiro sem avisar nao pode ser opt-out
  // silencioso de quem instalou.
  return {
    confirmarAntesDeAtualizar: true,
    emojiMeu: EMOJI_MEU_PADRAO,
    emojiFazendo: EMOJI_FAZENDO_PADRAO,
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

// "In progress" e "fui eu" nao podem ser o mesmo emoji: um card cairia em duas
// colunas e a contagem do quadro passaria a mentir.
function validarEmojiFazendo(valor, atual, emojiMeu) {
  if (valor === undefined) return atual;
  const limpo = String(valor).trim().slice(0, 8);
  if (limpo && ehCheck(limpo)) {
    throw new Error('O check ja significa "concluido". Escolha outro emoji para "fazendo".');
  }
  if (limpo && normalizarEmoji(limpo) === normalizarEmoji(emojiMeu)) {
    throw new Error(
      'Este emoji ja e o da sua assinatura em "Done by me". ' +
      'Um card nao pode estar em duas colunas.'
    );
  }
  return limpo;
}

// Quem extrai o gasto de cada evento e o adaptador do agente, em agentes.js:
// o formato do stream muda de CLI para CLI, e agente que nao informa custo
// devolve `custoUsd: null` em vez de um numero inventado.

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
  // `manual` e task que uma versao anterior do Mural deixou gravada, quando dava
  // para criar task a mao. Ela nunca esteve na janela do Teams, entao "saiu
  // dela" nao quer dizer nada — e continua movivel, para nao virar um card
  // preso no quadro de quem atualizou.
  if (t.origem === 'manual') return false;
  return !!lastSync && t.lastSeen !== lastSync;
}

// Quem pode trocar de coluna arrastando: as que o Teams nao acompanha mais e as
// `manual` do historico antigo. Nas demais a reacao de la manda, e o proximo sync
// desfaria o gesto — um quadro que mente por dois minutos e pior que um quadro
// que nao deixa voce fazer o gesto.
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
  const prefs = prefsDoUsuario(usuarioAtual());
  const lista = Object.values(db.tasks).map((t) => ({
    ...t,
    origem: t.origem === 'manual' ? 'manual' : 'teams',
    meu: t.meu || null,
    feitoPor: t.feitoPor || null,
    coluna: t.coluna || null,
    nota: t.nota || null,
    deOutraConversa: !!t.deOutraConversa,
    conflito: t.conflito || null,
    ignorada: t.ignorada || null,
    tags: Array.isArray(t.tags) ? t.tags : [],
    mensagens: mensagensDaTask(t),
    agrupamento: t.agrupamento || null,
    emojis: emojisDoCard(t.reactions, prefs.emojiFazendo),
    foraDeAlcance: foraDeAlcance(t, db.lastSync),
    podeMover: podeMover(t, db.lastSync),
    podeDesmarcar: podeDesmarcar(t, db.lastSync),
  }));
  return { lastSync: db.lastSync, tasks: lista };
}

// ---------------------------------------------------- ignorar, apagar e tags

// Tres marcas pessoais, e nenhuma delas e status do Teams: elas moram em campos
// proprios justamente para o sync nao as apagar. A mesma escolha do "feito por
// mim" — o que voce escreveu no quadro nao pode sumir porque alguem reagiu.

const MAX_TAGS = 6;
const MAX_LETRAS_DA_TAG = 24;

/** "Nao e pra mim" e uma decisao sua sobre uma mensagem do time: ela nao pode
 *  virar reacao no Teams (ignorar em publico seria outra coisa) nem apagar o
 *  historico. So tira o card das colunas de trabalho. */
function ignorarTask(muralId, id, ignorar) {
  const db = lerTasks(muralId);
  const t = db.tasks[String(id)];
  if (!t) throw new Error('Task desconhecida.');
  t.ignorada = ignorar === false ? null : new Date().toISOString();
  gravarTasks(muralId, db);
}

/** Apagar de vez. Diferente de ignorar: o card sai do arquivo e a mensagem entra
 *  na lista de arquivados, para a proxima leitura nao a ressuscitar. E o unico
 *  gesto irreversivel do Mural, e por isso a interface confirma antes. */
function apagarTask(muralId, id) {
  const db = lerTasks(muralId);
  const t = db.tasks[String(id)];
  if (!t) throw new Error('Task desconhecida.');
  if (!db.arquivados) db.arquivados = {};
  if (t.origem !== 'manual') {
    for (const m of mensagensDaTask(t)) db.arquivados[m.id] = 'apagada';
    db.arquivados[t.id] = 'apagada';
  }
  delete db.tasks[String(id)];
  gravarTasks(muralId, db);
}

/** As tags sao suas, escritas aqui — o Teams nao tem esse campo. Normalizar na
 *  entrada e o que impede "Financeiro", "financeiro" e "financeiro " de virarem
 *  tres colunas diferentes na hora de filtrar. */
function normalizarTags(valor) {
  if (!Array.isArray(valor)) throw new Error('Mande uma lista de tags.');
  const vistas = new Set();
  const tags = [];
  for (const bruta of valor) {
    const tag = String(bruta || '').trim().replace(/\s+/g, ' ').slice(0, MAX_LETRAS_DA_TAG);
    if (!tag) continue;
    const chave = tag.toLowerCase();
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    tags.push(tag);
    if (tags.length >= MAX_TAGS) break;
  }
  return tags;
}

function definirTags(muralId, id, valor) {
  const db = lerTasks(muralId);
  const t = db.tasks[String(id)];
  if (!t) throw new Error('Task desconhecida.');
  t.tags = normalizarTags(valor);
  gravarTasks(muralId, db);
  return t.tags;
}

/** Todas as tags que existem neste mural, com quantas tasks cada uma tem. E o
 *  que a barra de filtro mostra, e o que faz uma tag ser reaproveitada em vez de
 *  redigitada com outra grafia. */
function tagsDoMural(muralId) {
  const db = lerTasks(muralId);
  const por = new Map();
  for (const t of Object.values(db.tasks)) {
    for (const tag of t.tags || []) {
      const chave = tag.toLowerCase();
      const atual = por.get(chave) || { tag, quantas: 0 };
      atual.quantas++;
      por.set(chave, atual);
    }
  }
  return [...por.values()].sort((a, b) => b.quantas - a.quantas || a.tag.localeCompare(b.tag));
}

// "Done by me" NAO e um status do Teams — e uma marca pessoal, e por isso
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

// O espelho do "fiz esta": o card foi resolvido, mas nao por voce. O Teams so
// conta que ALGUEM reagiu com check — nunca QUEM — entao o nome de quem fez e
// uma anotacao sua, do mesmo naipe da tag e da solucao da daily. Por isso mora
// em campo proprio, que nenhuma leitura sobrescreve.
//
// Nao mexe em `status`: o card muda de coluna na tela (ver o agrupamento do
// quadro), e o status continua sendo o que o canal diz. Escrever 'feito' aqui
// seria inventar uma reacao que ninguem deu — e o proximo sync desfaria.
function marcarFeitoPorOutro(muralId, id, quem, solucao) {
  const db = lerTasks(muralId);
  const t = db.tasks[String(id || '')];
  if (!t) throw new Error('Task desconhecida.');
  const nome = String(quem || '').trim().slice(0, 80);
  if (!nome) throw new Error('Diga quem fez esta task.');
  t.feitoPor = {
    // A data da marcacao, nao a da ultima edicao do texto — a mesma regra do
    // `meu`: corrigir uma virgula nao pode mudar o dia em que a coisa foi feita.
    em: (t.feitoPor && t.feitoPor.em) || new Date().toISOString(),
    quem: nome,
    solucao: String(solucao || '').trim().slice(0, 2000),
  };
  // O credito e de uma pessoa so. Se estava marcada como sua, deixa de estar —
  // senao o card apareceria em duas colunas e contaria duas vezes no dashboard.
  t.meu = null;
  gravarTasks(muralId, db);
}

// A nota livre do card: o que VOCE quer lembrar sobre esta demanda, sem que ela
// precise estar concluida. Diferente das outras duas anotacoes — a do "fiz esta"
// e a do credito — que so existem depois de alguem ter terminado o trabalho. Aqui
// cabe "o cliente vai testar sexta", que nao e conclusao de nada.
//
// Marca pessoal como as outras: campo proprio, nada escrito no Teams, e nenhuma
// leitura a apaga.
function anotarTask(muralId, id, nota) {
  const db = lerTasks(muralId);
  const t = db.tasks[String(id || '')];
  if (!t) throw new Error('Task desconhecida.');
  const limpa = String(nota || '').trim().slice(0, 2000);
  t.nota = limpa || null;
  gravarTasks(muralId, db);
}

function desmarcarFeitoPorOutro(muralId, id) {
  const db = lerTasks(muralId);
  const t = db.tasks[String(id || '')];
  if (!t) throw new Error('Task desconhecida.');
  t.feitoPor = null;
  gravarTasks(muralId, db);
}

// ---------------------------------------------------------------------- rajadas

// Uma demanda quase nunca chega como uma mensagem so. O padrao real e a rajada:
// dois prints e tres linhas de texto, do mesmo autor, em segundos — cinco
// mensagens que sao UMA task. Sem agrupar, o quadro conta cinco cards e quatro
// deles dizem apenas "(so print)".
//
// Quem decide o agrupamento e este codigo, nao o modelo. O JS acha as rajadas
// candidatas (mesmo autor, consecutivas, dentro da janela) e o LLM so pode
// DIVIDIR uma candidata, pelo campo `mesmaDemandaQueAnterior`. Ele nao consegue
// juntar autores diferentes nem horarios distantes, porque isso nem chega a ele
// como candidata. O pior erro possivel do modelo e deixar um card solto — que
// voce junta com um clique — nunca fundir duas demandas num card so.
const JANELA_RAJADA_MS = 3 * 60 * 1000;

const SENTINELA_PRINT = '(só print — abrir para ver)';

function ehSoPrint(m) {
  if (typeof m.soPrint === 'boolean') return m.soPrint;
  return String(m.summary || '').trim() === SENTINELA_PRINT;
}

/** As reacoes de um card viradas numa string comparavel. Serve para saber se a
 *  mensagem MUDOU desde a ultima vez que voce decidiu sobre ela: e a diferenca
 *  entre avisar de novo porque alguem reagiu, e avisar de novo porque o codigo
 *  esqueceu que voce ja respondeu. Ordenada, porque a ordem em que as reacoes
 *  chegam nao e informacao. */
function assinaturaDeReacoes(reactions) {
  return (reactions || []).map(normalizarEmoji).filter(Boolean).sort().join('|');
}

function normalizarAutor(nome) {
  return String(nome || '').trim().toLowerCase();
}

function mensagemDoSnapshot(m, agora) {
  return {
    id: String(m.id),
    author: m.author || '?',
    createdDateTime: m.createdDateTime || agora,
    // O agente devolve `texto` — o corpo da mensagem verbatim. `summary` e o
    // nome antigo do mesmo campo, de quando o modelo escrevia um resumo de uma
    // linha: card que dizia outra coisa que a pessoa escreveu fazia o time
    // discutir uma demanda que ninguem pediu. O fallback existe para o historico
    // ja gravado continuar legivel — nao para o agente voltar a resumir.
    summary: m.texto || m.summary || '(sem texto)',
    kind: m.kind === 'bug' ? 'bug' : 'sugestao',
    reactions: Array.isArray(m.reactions) ? m.reactions : [],
    webUrl: m.webUrl || '',
    soPrint: ehSoPrint(m),
  };
}

// Task gravada antes deste campo existir — e toda task sua — nao tem
// `mensagens`: ela E uma mensagem. Ler assim evita migrar o arquivo: o campo
// aparece sozinho na primeira atualizacao, e nada quebra enquanto nao aparece.
function mensagensDaTask(t) {
  if (Array.isArray(t.mensagens) && t.mensagens.length) return t.mensagens;
  return [{
    id: t.id,
    author: t.author,
    createdDateTime: t.createdDateTime,
    summary: t.summary,
    kind: t.kind,
    reactions: t.reactions || [],
    webUrl: t.webUrl || '',
    soPrint: ehSoPrint(t),
  }];
}

// Toda mensagem que ja virou card fica presa nele — sozinha ou dentro de um
// grupo. E isso que impede o quadro de piscar: se o modelo mudar de ideia na
// leitura seguinte, o agrupamento de antes continua valendo.
//
// A consequencia importante e que um card NUNCA e absorvido por outro: ele so
// cresce, ganhando mensagens novas da mesma rajada que apareceram depois. Nada
// que voce escreveu — anotacao da daily, movimento a mao — pode se perder num
// reagrupamento, porque reagrupamento nao existe. Fundir dois cards que ja
// existem so acontece se voce pedir, em /api/juntar.
function mensagensJaConhecidas(db) {
  const dono = new Map();
  for (const t of Object.values(db.tasks)) {
    if (t.origem === 'manual') continue;
    for (const m of mensagensDaTask(t)) dono.set(m.id, t.id);
    dono.set(t.id, t.id);
  }
  return dono;
}

function podeContinuarRajada(grupo, bruto, msg) {
  const ultima = grupo.mensagens[grupo.mensagens.length - 1];
  if (!ultima) return false;
  // Grupo que voce mesmo montou ou separou nao aceita palpite: a mao mandou
  // ali, e a leitura seguinte nao pode refazer o gesto por cima.
  if (grupo.travado) return false;
  if (normalizarAutor(ultima.author) !== normalizarAutor(msg.author)) return false;
  // O default do prompt e dividir: so `true` explicito junta.
  if (bruto.mesmaDemandaQueAnterior !== true) return false;
  const dt = new Date(msg.createdDateTime).getTime() - new Date(ultima.createdDateTime).getTime();
  return Number.isFinite(dt) && dt >= 0 && dt <= JANELA_RAJADA_MS;
}

function ordenarMensagens(mensagens) {
  return mensagens.slice().sort(
    (a, b) =>
      String(a.createdDateTime).localeCompare(String(b.createdDateTime)) ||
      String(a.id).localeCompare(String(b.id)),
  );
}

// A mensagem do Teams pode ter sido editada depois; a versao nova ganha. Manter
// as antigas que nao vieram na janela e o que permite um grupo sobreviver quando
// so parte dele ainda esta nas ~20 mensagens.
function fundirMensagens(antigas, novas) {
  const por = new Map();
  for (const m of antigas) por.set(m.id, m);
  for (const m of novas) por.set(m.id, m);
  return ordenarMensagens([...por.values()]);
}

function agruparRajadas(snapshot, db, agora) {
  const dono = mensagensJaConhecidas(db);
  const ordenado = snapshot
    .filter((m) => m && m.id)
    .slice()
    .sort(
      (a, b) =>
        String(a.createdDateTime || '').localeCompare(String(b.createdDateTime || '')) ||
        String(a.id).localeCompare(String(b.id)),
    );

  const grupos = [];
  const porAncora = new Map();
  let atual = null;

  const noGrupo = (ancora, msg) => {
    const existente = porAncora.get(ancora);
    if (existente) {
      existente.mensagens.push(msg);
      return existente;
    }
    const g = { ancora, mensagens: [msg], travado: db.tasks[ancora]?.agrupamento === 'mao' };
    grupos.push(g);
    porAncora.set(ancora, g);
    return g;
  };

  for (const bruto of ordenado) {
    const msg = mensagemDoSnapshot(bruto, agora);
    const conhecido = dono.get(msg.id);

    // Ja tem dono: volta para ele, mesmo que a ancora tenha saido da janela.
    if (conhecido) {
      atual = noGrupo(conhecido, msg);
      continue;
    }
    if (atual && podeContinuarRajada(atual, bruto, msg)) {
      atual.mensagens.push(msg);
      continue;
    }
    atual = noGrupo(msg.id, msg);
  }

  return grupos;
}

// O titulo do card sai da primeira mensagem com texto de verdade, nao da
// primeira mensagem: a rajada costuma comecar pelos prints, e "so print" nao
// diz o que a task e.
function mensagemPrincipal(mensagens) {
  return (
    mensagens.find(
      (m) => !m.soPrint && m.summary && m.summary !== '(sem resumo)' && m.summary !== '(sem texto)',
    ) || mensagens[0]
  );
}

function resumoDoGrupo(mensagens) {
  const principal = mensagemPrincipal(mensagens);
  if (principal && !principal.soPrint) return principal.summary;
  const prints = mensagens.filter((m) => m.soPrint).length;
  return prints > 1 ? `${prints} prints — abrir para ver` : SENTINELA_PRINT;
}

// A reacao pode estar em qualquer mensagem da rajada: as pessoas reagem na que
// estao vendo, nao na "principal" — que so existe para o Mural. Por isso o
// status do card sai da UNIAO das reacoes do grupo.
function reacoesDoGrupo(mensagens) {
  const vistas = new Set();
  const uniao = [];
  for (const m of mensagens) {
    for (const e of m.reactions || []) {
      const chave = normalizarEmoji(e);
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      uniao.push(e);
    }
  }
  return uniao;
}

function kindDoGrupo(mensagens, padrao) {
  if (mensagens.some((m) => m.kind === 'bug')) return 'bug';
  return padrao || 'sugestao';
}

// Campos que saem inteiramente das mensagens do grupo. Recalcular tudo de uma
// vez, aqui, e o que garante que juntar, separar e crescer produzam o mesmo card
// que uma leitura limpa produziria.
function aplicarMensagensNaTask(t, mensagens) {
  const todas = ordenarMensagens(mensagens);
  const primeira = todas[0];
  t.mensagens = todas;
  t.summary = resumoDoGrupo(todas);
  t.reactions = reacoesDoGrupo(todas);
  t.kind = kindDoGrupo(todas, t.kind);
  t.author = primeira.author || t.author;
  t.createdDateTime = primeira.createdDateTime || t.createdDateTime;
  t.webUrl = primeira.webUrl || t.webUrl;
  return t;
}

// ------------------------------------------------- juntar e separar a mao

const ORDEM_DE_STATUS = { aberto: 0, interagido: 1, feito: 2 };

function statusMaisAvancado(a, b) {
  return (ORDEM_DE_STATUS[a] ?? 0) >= (ORDEM_DE_STATUS[b] ?? 0) ? a : b;
}

// A heuristica vai errar em alguns casos, e card errado que nao da para
// consertar e pior que card errado. Estas duas rotas sao a saida — e o que elas
// decidem vence a automatica: `agrupamento: 'mao'` nunca e desfeito por leitura
// nenhuma, do mesmo jeito que `movidoAMao`.
function juntarTasks(muralId, ids) {
  const db = lerTasks(muralId);
  const escolhidas = [...new Set(ids.map(String))].map((id) => {
    const t = db.tasks[id];
    if (!t) throw new Error('Uma das tasks escolhidas nao existe mais.');
    if (t.origem === 'manual') {
      throw new Error(
        'Esta task foi criada a mao numa versao anterior e nao tem mensagem no Teams para juntar.'
      );
    }
    return t;
  });
  if (escolhidas.length < 2) throw new Error('Escolha pelo menos duas tasks para juntar.');

  escolhidas.sort((a, b) => String(a.createdDateTime).localeCompare(String(b.createdDateTime)));
  const ancora = escolhidas[0];
  const agora = new Date().toISOString();

  let mensagens = [];
  let status = ancora.status;
  let meu = null;
  let feitoPor = null;
  let nota = null;
  let movidoAMao = false;
  let firstSeen = ancora.firstSeen;
  let lastSeen = ancora.lastSeen;

  for (const t of escolhidas) {
    mensagens = mensagens.concat(mensagensDaTask(t));
    status = statusMaisAvancado(status, t.status);
    movidoAMao = movidoAMao || !!t.movidoAMao;
    if (String(t.firstSeen) < String(firstSeen)) firstSeen = t.firstSeen;
    if (String(t.lastSeen) > String(lastSeen)) lastSeen = t.lastSeen;
    // Anotacao da daily nao pode se perder num gesto de organizacao: as duas
    // viram uma, na ordem em que foram escritas.
    if (t.meu) {
      if (!meu) meu = { ...t.meu };
      else {
        const primeiro = String(t.meu.em) < String(meu.em) ? t.meu : meu;
        const segundo = primeiro === meu ? t.meu : meu;
        meu = {
          em: primeiro.em,
          via: primeiro.via === 'emoji' && segundo.via === 'emoji' ? 'emoji' : 'mao',
          solucao: [primeiro.solucao, segundo.solucao].filter(Boolean).join('\n'),
        };
      }
    }
    // O credito a outra pessoa segue a mesma regra da anotacao: juntar dois
    // cards e um gesto de organizacao, e nao pode apagar o nome de quem
    // resolveu. Nomes diferentes ficam os dois — duas pessoas mexeram nisso, e
    // escolher uma seria o codigo decidindo por voce.
    if (t.feitoPor) {
      if (!feitoPor) feitoPor = { ...t.feitoPor };
      else {
        const primeiro = String(t.feitoPor.em) < String(feitoPor.em) ? t.feitoPor : feitoPor;
        const segundo = primeiro === feitoPor ? t.feitoPor : feitoPor;
        const nomes = [...new Set([primeiro.quem, segundo.quem].filter(Boolean))];
        feitoPor = {
          em: primeiro.em,
          quem: nomes.join(' e ').slice(0, 80),
          solucao: [primeiro.solucao, segundo.solucao].filter(Boolean).join('\n'),
        };
      }
    }
  }

  // Juntar e gesto de organizacao: nao pode apagar o que voce escreveu. As notas
  // dos dois cards viram uma, na ordem em que estavam.
  for (const t of escolhidas) {
    if (t.nota) nota = nota ? `${nota}
${t.nota}` : t.nota;
  }

  // O credito e de uma pessoa so — a mesma regra de marcarFeitoPorOutro.
  if (meu) feitoPor = null;

  for (const t of escolhidas) if (t.id !== ancora.id) delete db.tasks[t.id];

  const juntada = {
    ...ancora,
    status,
    statusAnterior: ancora.status !== status ? ancora.status : ancora.statusAnterior,
    statusChangedAt: ancora.status !== status ? agora : ancora.statusChangedAt,
    firstSeen,
    lastSeen,
    movidoAMao,
    meu,
    feitoPor,
    nota,
    agrupamento: 'mao',
  };
  aplicarMensagensNaTask(juntada, mensagens);
  db.tasks[ancora.id] = juntada;
  gravarTasks(muralId, db);
  return ancora.id;
}

function separarTask(muralId, id) {
  const db = lerTasks(muralId);
  const emojiFazendo = prefsDoUsuario(usuarioAtual()).emojiFazendo;
  const t = db.tasks[String(id)];
  if (!t) throw new Error('Task desconhecida.');
  const mensagens = mensagensDaTask(t);
  if (mensagens.length < 2) throw new Error('Esta task e uma mensagem so — nao ha o que separar.');

  const agora = new Date().toISOString();
  const [primeira, ...resto] = ordenarMensagens(mensagens);

  // A ancora fica com a primeira mensagem e com a anotacao: dividir texto que
  // voce escreveu entre cards seria adivinhar a qual metade ele pertencia.
  aplicarMensagensNaTask(t, [primeira]);
  t.agrupamento = 'mao';

  for (const m of resto) {
    // Cada mensagem volta a ser um card com o id dela — e, por isso, com dono
    // proprio no mapa da proxima leitura: o agrupamento automatico nao a
    // reabsorve.
    db.tasks[m.id] = aplicarMensagensNaTask(
      {
        id: m.id,
        origem: 'teams',
        status: statusDe(m.reactions, emojiFazendo),
        firstSeen: t.firstSeen,
        statusChangedAt: agora,
        statusAnterior: null,
        lastSeen: t.lastSeen,
        movidoAMao: t.movidoAMao,
        meu: null,
        agrupamento: 'mao',
        kind: m.kind,
        author: m.author,
        createdDateTime: m.createdDateTime,
        webUrl: m.webUrl,
      },
      [m],
    );
  }

  gravarTasks(muralId, db);
  return resto.length + 1;
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

function merge(db, snapshot, agora, assinatura, emojiFazendo) {
  const novos = [];
  const mudaram = [];
  const conflitos = [];
  const marcados = [];
  const cresceram = [];
  if (!db.arquivados) db.arquivados = {};

  // O snapshot vem mensagem por mensagem; daqui para baixo o que existe e o
  // card — que pode ser uma rajada de varias mensagens do mesmo autor.
  for (const g of agruparRajadas(snapshot, db, agora)) {
    // Mensagem arquivada no encerramento de uma sprint nao volta ao quadro. Sem
    // isso a proxima leitura ressuscitaria como "nova" tudo que voce fechou.
    if (db.arquivados[g.ancora]) continue;
    const vindas = g.mensagens.filter((m) => !db.arquivados[m.id]);
    if (!vindas.length) continue;

    const antigo = db.tasks[g.ancora];

    if (!antigo) {
      const t = aplicarMensagensNaTask(
        {
          id: g.ancora,
          origem: 'teams',
          agrupamento: vindas.length > 1 ? 'auto' : null,
          firstSeen: agora,
          statusChangedAt: agora,
          statusAnterior: null,
          lastSeen: agora,
          movidoAMao: false,
          meu: null,
        },
        vindas,
      );
      t.status = statusDe(t.reactions, emojiFazendo);
      db.tasks[g.ancora] = t;
      novos.push(g.ancora);
      aplicarAssinatura(t, agora, assinatura, marcados);
      continue;
    }

    // Cresceu: o autor mandou mais uma mensagem na mesma rajada depois da
    // ultima leitura. O card e o mesmo — a ancora nao muda — mas o resumo e as
    // reacoes podem ter mudado, e vale avisar no resumo da atualizacao.
    const antes = mensagensDaTask(antigo).length;
    aplicarMensagensNaTask(antigo, fundirMensagens(mensagensDaTask(antigo), vindas));
    if (antigo.mensagens.length > antes) cresceram.push(g.ancora);
    if (antigo.agrupamento !== 'mao' && antigo.mensagens.length > 1) antigo.agrupamento = 'auto';
    antigo.lastSeen = agora;

    const status = statusDe(antigo.reactions, emojiFazendo);

    // Card movido a mao que discorda do Teams. Antes o Teams vencia calado e o
    // resumo dizia "1 teve o status corrigido" — o que e verdadeiro e inutil:
    // nao dizia QUAL, nem para onde, nem por que, e desfazia um gesto seu sem
    // perguntar. Agora o desacordo fica registrado e o card NAO se move: quem
    // decide e voce, no dialogo que a leitura abre.
    //
    // `reacaoAceita` e o que impede isso de virar um aviso eterno. Se voce
    // respondeu "mantenho aqui", a pergunta so volta quando as reacoes da
    // mensagem MUDAREM — e nao a cada leitura, pelas mesmas reacoes de sempre.
    if (antigo.movidoAMao && antigo.status !== status) {
      const assinaturaAtual = assinaturaDeReacoes(antigo.reactions);
      if (antigo.reacaoAceita !== assinaturaAtual) {
        antigo.conflito = { statusDoTeams: status, em: agora, reacoes: assinaturaAtual };
        conflitos.push(g.ancora);
      }
      // O status do Teams nao e aplicado: o card fica onde voce o pos.
      aplicarAssinatura(antigo, agora, assinatura, marcados);
      continue;
    }

    // Concordaram: o gesto a mao virou verdade no canal e nao precisa mais de
    // marca nenhuma.
    if (antigo.movidoAMao && antigo.status === status) {
      antigo.movidoAMao = false;
      antigo.conflito = null;
      antigo.reacaoAceita = null;
    }

    if (antigo.status !== status) {
      antigo.statusAnterior = antigo.status;
      antigo.status = status;
      antigo.statusChangedAt = agora;
      mudaram.push(g.ancora);
    }

    aplicarAssinatura(antigo, agora, assinatura, marcados);
  }

  db.lastSync = agora;
  return { novos, mudaram, conflitos, marcados, cresceram, total: snapshot.length };
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

// A etapa sai da ferramenta que o agente acabou de usar, e o nome dela vem da
// configuracao — nao de uma constante: em outro agente a leitura do Teams se
// chama outra coisa. Por isso a comparacao e com `ferramentas.leitura`, e o
// fallback por sufixo cobre o MCP que prefixa o nome com o servidor.
function processarEvento(linha, ad) {
  const lido = interpretarLinha(ad, linha);
  if (!lido) return;

  if (lido.consumo) consumoDaExecucao = lido.consumo;
  if (!progresso || !lido.usos) return;

  const f = ad.ferramentas;
  const ehTool = (nome, alvo) => !!alvo && (nome === alvo || nome.endsWith(alvo));

  for (const uso of lido.usos) {
    progresso.ultimaAtividade = Date.now();
    if (ehTool(uso.nome, f.leitura)) {
      if (/\/messages\/?$/.test(uso.uri)) progresso.etapa = 'listando as mensagens';
      else { progresso.lidas++; progresso.etapa = 'lendo mensagens'; }
    } else if (uso.nome === '__arquivo__' || ehTool(uso.nome, f.escrita)) {
      // `__arquivo__` e o nome que o leitor do Codex da para uma mudanca de
      // arquivo: gravar o snapshot nao aparece como tool call ali.
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

// A URI que o agente vai ler. Canal e chat tem formatos diferentes, e o molde
// vem do adaptador: o endereco das mensagens e vocabulario do MCP que le o
// Teams, nao do Mural. Outro MCP, outro molde — sem tocar em codigo.
function uriDasMensagens(f, ad = agenteEmUso()) {
  const molde = f.tipo === 'chat' ? ad.ferramentas.uriChat : ad.ferramentas.uriCanal;
  return molde
    .split('{chatId}').join(encodeURIComponent(f.chatId || ''))
    .split('{teamId}').join(f.teamId || '')
    .split('{channelId}').join(encodeURIComponent(f.channelId || ''));
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

// Roda o agente headless e espera que ele grave `arquivoSaida`. Usado pelos
// passos curtos do onboarding, que nao precisam de barra de progresso — mas
// custam dinheiro igual, entao o stdout e lido de qualquer forma, para o gasto
// entrar no registro. Sem isso, listar chats (2 a 3 minutos de API) apareceria
// como leitura gratuita, e nao e.
function rodarAgenteSimples(prompt, arquivoSaida, operacao, timeoutMs = 5 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    // A conta e lida antes porque o passo 'conta' apaga o proprio arquivo que
    // identifica o usuario: sem isso o gasto dele cairia sempre em "desconhecido".
    const usuarioAntes = usuarioAtual();
    const ad = agenteEmUso();
    try { fs.unlinkSync(arquivoSaida); } catch {}

    let cmd;
    try { cmd = comandoDe(ad, operacao, prompt); }
    catch (e) { return reject(e); }

    const proc = spawn(cmd.binario, cmd.args, { cwd: ROOT, shell: true });

    if (cmd.viaStdin) {
      proc.stdin.write(prompt);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }

    let stderr = '', buffer = '', consumo = null;
    proc.stderr.on('data', (d) => (stderr += d));
    // Sem consumir o stdout o processo trava com o buffer cheio; de quebra e
    // dali que sai o custo real desta leitura.
    proc.stdout.on('data', (d) => {
      buffer += d;
      const linhas = buffer.split('\n');
      buffer = linhas.pop();
      for (const l of linhas) {
        const lido = interpretarLinha(ad, l);
        if (lido && lido.consumo) consumo = lido.consumo;
      }
    });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`O ${ad.nome} demorou demais para responder.`));
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
          `O ${ad.nome} saiu com erro (codigo ${code}). ` + stderr.slice(0, 300)
        ));
      }
      try { resolve(JSON.parse(fs.readFileSync(arquivoSaida, 'utf8'))); }
      catch {
        reject(new Error(`O ${ad.nome} rodou mas nao gravou um resultado legivel.`));
      }
    });

    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`Nao consegui executar \`${cmd.binario}\`: ` + e.message));
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

    // O agente escolhido dita tres coisas do prompt: como se chama a tool que
    // le o Teams, como se chama a que grava arquivo e como se enderecam as
    // mensagens. Sem isso o prompt falaria o dialeto de um conector so.
    const ad = agenteEmUso();

    let prompt;
    try {
      prompt = montarPrompt('sincronizar.md', {
        URI_MENSAGENS: uriDasMensagens(mural, ad),
        ARQUIVO_SNAPSHOT: snapshotFile,
        WEBURL_MOLDE: moldeDeWebUrl(mural),
        FERRAMENTA_LEITURA: ad.ferramentas.leitura,
        FERRAMENTA_ESCRITA: ad.ferramentas.escrita,
      });
    } catch {
      syncEmAndamento = null; progresso = null;
      return reject(new Error('prompts/sincronizar.md nao encontrado.'));
    }

    try { fs.unlinkSync(snapshotFile); } catch {}

    // No Claude o prompt vai por STDIN, nao como argumento: e multi-linha, e no
    // Windows o shell mutila argumentos assim — o agente recebia texto truncado.
    // Agente de entrada 'arg' recebe o prompt como um unico argv, sem passar por
    // split de espaco, pelo mesmo motivo.
    let cmd;
    try { cmd = comandoDe(ad, 'sync', prompt); }
    catch (e) {
      syncEmAndamento = null; progresso = null;
      return reject(e);
    }

    const proc = spawn(cmd.binario, cmd.args, { cwd: ROOT, shell: true });

    if (cmd.viaStdin) proc.stdin.write(prompt);
    proc.stdin.end();

    let stdout = '', stderr = '', buffer = '';
    proc.stdout.on('data', (d) => {
      stdout += d;
      buffer += d;
      const linhas = buffer.split('\n');
      buffer = linhas.pop();
      for (const l of linhas) processarEvento(l, ad);
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
        return reject(new Error(`O ${ad.nome} saiu com codigo ${code}. ${stderr.slice(0, 400)}`));
      }

      let snapshot;
      try { snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')); }
      catch {
        return reject(new Error(
          `O ${ad.nome} rodou mas nao gravou um snapshot valido. ` + resumoDoResultado(stdout)
        ));
      }
      if (!Array.isArray(snapshot)) return reject(new Error('O snapshot nao e um array.'));

      try {
        const db = lerTasks(muralId);
        const r = merge(
          db, snapshot, new Date().toISOString(),
          prefsDoUsuario(usuario).emojiMeu,
          prefsDoUsuario(usuario).emojiFazendo,
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
      reject(new Error(`Nao consegui executar \`${cmd.binario}\`: ` + e.message));
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
      let totais = { aberto: 0, fazendo: 0, interagido: 0, feito: 0, meu: 0, ignorada: 0, suas: 0 };
      let foraDeAlcance = 0;
      try {
        const db = lerTasks(m.id);
        for (const t of Object.values(db.tasks)) {
          // Card marcado como seu sai da coluna do Teams e conta so na sua —
          // e a mesma regra do quadro, senao a home diria outro numero. Ignorada
          // vence tudo: ela nao esta em nenhuma coluna de trabalho.
          if (t.ignorada) totais.ignorada++;
          // Preso numa coluna sua: conta so ali, senao a home diria um numero e
          // o quadro mostraria outro.
          else if (t.coluna) totais.suas++;
          else if (t.meu) totais.meu++;
          // Creditada a outra pessoa conta como concluida, igual ao quadro: o
          // status pode ainda ser 'aberto' porque ninguem deu o check no Teams,
          // mas alguem disse aqui que esta feita.
          else if (t.feitoPor) totais.feito++;
          else if (totais[t.status] !== undefined) totais[t.status]++;
          if (foraDeAlcance_(t, db.lastSync)) foraDeAlcance++;
        }
      } catch { /* historico ilegivel nao pode derrubar a lista inteira */ }
      // A sprint vem junto porque e daqui que ela passa a ser editada: o quadro
      // so a mostra, quem a define e a listagem.
      let sprint = null;
      try {
        sprint = lerSprints(m.id).atual || null;
      } catch { /* idem: sprint ilegivel nao derruba a lista */ }
      return { ...m, totais, foraDeAlcance, sprint };
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
    const ad = agenteEmUso();
    return json(res, 200, {
      usuario,
      estimativa: estimarProximaAtualizacao(usuario, muralId),
      totais: totaisDoUsuario(usuario),
      preferencias: prefsDoUsuario(usuario),
      // Agente que nao informa custo nao pode ter preco na tela: a interface
      // esconde o total e a confirmacao de gasto em vez de mostrar zero.
      agente: { id: ad.id, nome: ad.nome, reportaCusto: ad.reportaCusto },
    });
  }

  // As tres reacoes que o quadro entende. O onboarding precisa lelas antes de
  // existir mural: a pergunta "qual emoji significa o que" e do usuario, nao do
  // quadro, e por isso a rota nao pede `mural`.
  if (p === '/api/preferencias' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      preferencias: prefsDoUsuario(usuarioAtual()),
      // O check nao e configuravel, e a tela precisa poder dizer POR QUE: sao
      // varias formas do mesmo simbolo, e o Teams devolve a que a pessoa usou.
      checks: CHECKS,
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
        emojiFazendo: validarEmojiFazendo(
          corpo.emojiFazendo,
          atuais.emojiFazendo,
          validarEmojiMeu(corpo.emojiMeu, atuais.emojiMeu),
        ),
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

  // Mover a mao so vale para task fora de alcance. Se ela ainda aparece no Teams,
  // a reacao de la manda e o proximo sync desfaria a mudanca — deixar mover ali
  // criaria um quadro que mente por 2 minutos e depois se corrige sozinho.
  if (p === '/api/mover' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');

      const corpo = await lerCorpoJson(req);
      const tarefaId = String(corpo.id || '');
      const novo = String(corpo.status || '');
      if (!STATUS_VALIDOS.includes(novo)) throw new Error('Status invalido.');
      // "In review" nunca foi um estado que se escolhe, com ou sem escrita: e o
      // que sobra quando alguem reage com outra coisa.
      if (novo === 'interagido') {
        throw new Error(
          '"In review" nao e um estado que se escolhe: e o que sobra quando alguem reage ' +
          'com outra coisa. Arraste para Backlog, In progress ou Done.'
        );
      }

      const db = lerTasks(muralId);
      const t = db.tasks[tarefaId];
      if (!t) throw new Error('Task desconhecida.');
      // Mover a mao vale para QUALQUER card, inclusive o que o Teams acompanha.
      // O gesto nao mente: ele fica marcado como `movidoAMao`, e a proxima
      // leitura compara com a reacao no canal. Discordando, ela NAO desfaz nada
      // — abre a pergunta, e quem responde e voce.
      //
      // Antes isto era recusado para nao "mentir por dois minutos". A troca:
      // um quadro que recusa o gesto obriga voce a ir reagir no Teams antes de
      // poder organizar o proprio quadro, e as duas coisas nao acontecem no
      // mesmo minuto.
      if (t.status !== novo) {
        t.statusAnterior = t.status;
        t.status = novo;
        t.statusChangedAt = new Date().toISOString();
        // Decidir de novo zera o que voce havia aceitado antes.
        t.conflito = null;
        t.reacaoAceita = null;
      }
      t.movidoAMao = true;
      gravarTasks(muralId, db);
      return json(res, 200, { ok: true, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  // Nao e pra mim: tira o card das colunas de trabalho sem tocar no Teams e sem
  // apagar nada. E marca sua, entao nenhum sync a desfaz.
  if (p === '/api/ignorar' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const corpo = await lerCorpoJson(req);
      ignorarTask(muralId, corpo.id, corpo.ignorar);
      return json(res, 200, { ok: true, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  // O unico gesto irreversivel do Mural: o card sai do arquivo e a mensagem
  // entra na lista de arquivados, para nao voltar na proxima leitura.
  if (p === '/api/apagar' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const corpo = await lerCorpoJson(req);
      apagarTask(muralId, corpo.id);
      return json(res, 200, { ok: true, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/tags' && req.method === 'GET') {
    const muralId = url.searchParams.get('mural') || '';
    if (!acharMural(muralId)) return json(res, 404, { ok: false, erro: 'Mural nao encontrado.' });
    return json(res, 200, { ok: true, tags: tagsDoMural(muralId) });
  }

  if (p === '/api/tags' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const corpo = await lerCorpoJson(req);
      definirTags(muralId, corpo.id, corpo.tags);
      return json(res, 200, { ok: true, tags: tagsDoMural(muralId), ...tasksParaTela(muralId) });
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

  // O credito de quem NAO e voce. Mesma familia do /api/meu: marca pessoal, em
  // campo proprio, que o sync nao encosta.
  if (p === '/api/feito-por' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const corpo = await lerCorpoJson(req);
      if (corpo.marcar === false) desmarcarFeitoPorOutro(muralId, corpo.id);
      else marcarFeitoPorOutro(muralId, corpo.id, corpo.quem, corpo.solucao);
      return json(res, 200, { ok: true, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  // ---- colunas suas ----

  if (p === '/api/colunas' && req.method === 'GET') {
    const muralId = url.searchParams.get('mural') || '';
    if (!acharMural(muralId)) return json(res, 404, { ok: false, erro: 'Mural nao encontrado.' });
    return json(res, 200, { ok: true, ...lerColunas(muralId) });
  }

  if (p === '/api/colunas' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const corpo = await lerCorpoJson(req);
      const coluna = corpo.id ? renomearColuna(muralId, corpo.id, corpo) : criarColuna(muralId, corpo);
      return json(res, 200, { ok: true, coluna, ...lerColunas(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  // Irreversivel: apaga a coluna E os cards que estao nela. A interface confirma
  // antes, com o numero na frente — este servidor nao adivinha se voce leu.
  if (p === '/api/colunas' && req.method === 'DELETE') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const r = excluirColuna(muralId, url.searchParams.get('id') || '');
      return json(res, 200, { ok: true, ...r, ...lerColunas(muralId), ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  // Prender um card numa coluna sua, ou solta-lo. Rota propria e nao `/api/mover`
  // porque a regra e outra: mover recusa card que o Teams acompanha, e prender
  // existe justamente para tirar um card desses do fluxo do canal.
  if (p === '/api/coluna' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const corpo = await lerCorpoJson(req);
      prenderNaColuna(muralId, corpo.id, corpo.coluna || null);
      return json(res, 200, { ok: true, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  // A nota livre do card. Nota vazia apaga em vez de gravar string vazia: o
  // historico nao precisa registrar que voce desistiu de escrever.
  if (p === '/api/nota' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const corpo = await lerCorpoJson(req);
      anotarTask(muralId, corpo.id, corpo.nota);
      return json(res, 200, { ok: true, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  // Traz uma mensagem para o quadro pelo link dela. Custa uma execucao do
  // agente: uma mensagem em vez de vinte e uma, mas nao e gratis — quem confirma
  // e a interface, com a estimativa na frente.
  if (p === '/api/incluir-por-link' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      const corpo = await lerCorpoJson(req);
      const r = await incluirPorLink(muralId, corpo.link);
      return json(res, 200, { ok: true, ...r, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  // Voce decide o desacordo entre o seu gesto e a reacao no canal.
  //
  // `teams` = a reacao venceu: o card volta para a coluna que ela manda.
  // `meu`   = o seu gesto venceu: o card fica, e a pergunta so volta quando as
  //           reacoes da mensagem mudarem — e nao a cada leitura.
  if (p === '/api/conflito' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const corpo = await lerCorpoJson(req);
      const db = lerTasks(muralId);
      const t = db.tasks[String(corpo.id || '')];
      if (!t) throw new Error('Task desconhecida.');
      if (!t.conflito) throw new Error('Esta task nao tem desacordo pendente.');

      if (corpo.decisao === 'teams') {
        t.statusAnterior = t.status;
        t.status = t.conflito.statusDoTeams;
        t.statusChangedAt = new Date().toISOString();
        t.movidoAMao = false;
        t.reacaoAceita = null;
      } else if (corpo.decisao === 'meu') {
        t.reacaoAceita = t.conflito.reacoes;
      } else {
        throw new Error('Decisao invalida.');
      }
      t.conflito = null;
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

  // ---- rajadas: juntar e separar a mao ----

  // O agrupamento automatico erra em alguns casos — e card errado que nao da
  // para consertar e pior que card errado. Estas duas rotas sao a saida, e o que
  // elas decidem nao e desfeito por leitura nenhuma.
  if (p === '/api/juntar' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const corpo = await lerCorpoJson(req);
      if (!Array.isArray(corpo.ids)) throw new Error('Mande os ids das tasks a juntar.');
      const id = juntarTasks(muralId, corpo.ids);
      return json(res, 200, { ok: true, id, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/separar' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const corpo = await lerCorpoJson(req);
      const quantas = separarTask(muralId, corpo.id);
      return json(res, 200, { ok: true, quantas, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  // ---- sprint ----

  if (p === '/api/sprint' && req.method === 'GET') {
    const muralId = url.searchParams.get('mural') || '';
    if (!acharMural(muralId)) return json(res, 404, { ok: false, erro: 'Mural nao encontrado.' });
    return json(res, 200, { ok: true, ...sprintsResumidas(lerSprints(muralId)) });
  }

  if (p === '/api/sprint' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      definirSprint(muralId, await lerCorpoJson(req));
      return json(res, 200, { ok: true, ...sprintsResumidas(lerSprints(muralId)) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  // Encerrar arquiva o que terminou e abre a sprint seguinte. E irreversivel
  // pela interface, mas nao destrutivo: os cards continuam no sprints.json,
  // e e de la que os dois paineis leem.
  if (p === '/api/sprint/encerrar' && req.method === 'POST') {
    try {
      const muralId = url.searchParams.get('mural') || '';
      if (!acharMural(muralId)) throw new Error('Mural nao encontrado.');
      const r = encerrarSprint(muralId);
      return json(res, 200, { ok: true, ...r, ...tasksParaTela(muralId) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/painel') {
    const muralId = url.searchParams.get('mural') || '';
    if (!acharMural(muralId)) return json(res, 404, { ok: false, erro: 'Mural nao encontrado.' });
    try {
      return json(res, 200, { ok: true, ...painelDoMural(muralId) });
    } catch (e) {
      return json(res, 500, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/dashboard') {
    const muralId = url.searchParams.get('mural') || '';
    if (!acharMural(muralId)) return json(res, 404, { ok: false, erro: 'Mural nao encontrado.' });
    try {
      return json(res, 200, { ok: true, ...dashboardDoMural(muralId) });
    } catch (e) {
      return json(res, 500, { ok: false, erro: e.message });
    }
  }

  // ---- onboarding ----

  // Refazer a configuracao do zero: some com o cache do onboarding (conta,
  // lista de chats) e com a preferencia de confirmacao. NAO toca nos murais,
  // no historico de tasks nem no registro de consumo — esses sao dados, nao
  // configuracao, e um botao chamado "refazer configuracao" nao pode apagar
  // trabalho acumulado por tabela.
  // Pergunta ao proprio CLI se o conector do Teams esta ligado. Substitui "abra
  // um terminal e digite /mcp" — um comando que so existe dentro da TUI, e que
  // esta tela nao tem como executar por ninguem.
  if (p === '/api/setup/mcp' && req.method === 'GET') {
    try {
      return json(res, 200, { ok: true, ...(await listarMcpDoAgente()) });
    } catch (e) {
      return json(res, 200, { ok: false, erro: e.message });
    }
  }

  // Dispara a autorizacao. O CLI abre o navegador e espera o retorno; quem
  // autoriza e a pessoa, na tela da Microsoft. Este servidor continua sem ver
  // credencial nenhuma.
  if (p === '/api/setup/mcp/login' && req.method === 'POST') {
    try {
      const corpo = await lerCorpoJson(req);
      const r = await conectarMcpDoAgente(corpo.nome);
      // Depois de autorizar, a lista e a unica fonte de verdade sobre o
      // resultado: codigo de saida zero nao prova que o conector ficou de pe.
      const depois = await listarMcpDoAgente().catch(() => null);
      return json(res, 200, { ok: true, ...r, lista: depois });
    } catch (e) {
      return json(res, 200, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/setup/reset' && req.method === 'POST') {
    const apagados = [];
    for (const arquivo of [CONTA_FILE, CHATS_FILE, PREFS_FILE, AGENTES_FILE]) {
      try {
        fs.unlinkSync(arquivo);
        apagados.push(path.basename(arquivo));
      } catch (e) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    return json(res, 200, { ok: true, apagados });
  }

  // Escolher o agente, nao verificar UM agente. A pergunta do primeiro passo do
  // onboarding e "com qual CLI de IA eu leio o Teams?" — e a resposta nao pode
  // ser um binario cravado no codigo.
  if (p === '/api/setup/agentes') {
    const config = lerConfigAgentes();
    const lista = adaptadores(config);
    const detectados = await Promise.all(lista.map((ad) => detectarVersao(ad)));
    return json(res, 200, {
      ok: true,
      escolhido: idEscolhido(config),
      agentes: lista.map((ad, i) => paraTela(ad, detectados[i])),
    });
  }

  if (p === '/api/setup/agente' && req.method === 'POST') {
    try {
      const corpo = await lerCorpoJson(req);
      const id = String(corpo.id || '');
      if (!IDS_DE_AGENTE.includes(id)) throw new Error('Agente desconhecido.');

      const config = lerConfigAgentes();
      config.escolhido = id;
      // Os ajustes ficam guardados por agente, nao no escolhido: trocar de
      // agente e voltar nao pode apagar as flags que voce corrigiu no outro.
      if (corpo.ajustes && typeof corpo.ajustes === 'object') {
        config.porAgente[id] = { ...(config.porAgente[id] || {}), ...corpo.ajustes };
      }
      gravarConfigAgentes(config);

      const ad = adaptadorEscolhido(config);
      const deteccao = await detectarVersao(ad);
      return json(res, 200, { ok: true, agente: paraTela(ad, deteccao) });
    } catch (e) {
      return json(res, 400, { ok: false, erro: e.message });
    }
  }

  if (p === '/api/setup/conta' && req.method === 'POST') {
    try {
      const conta = await rodarAgenteSimples(
        montarPrompt('verificar-conta.md', {
          ARQUIVO_SAIDA: CONTA_FILE,
          FERRAMENTA_CONTA: agenteEmUso().ferramentas.conta,
          FERRAMENTA_ESCRITA: agenteEmUso().ferramentas.escrita,
        }),
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
      const chats = await rodarAgenteSimples(
        montarPrompt('listar-chats.md', {
          ARQUIVO_SAIDA: CHATS_FILE,
          USUARIO_ATUAL: conta.displayName || 'a pessoa logada',
          FERRAMENTA_CHATS: agenteEmUso().ferramentas.chats,
          FERRAMENTA_ESCRITA: agenteEmUso().ferramentas.escrita,
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
