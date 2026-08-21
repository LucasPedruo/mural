// Os agentes de IA que o Mural sabe operar.
//
// O Mural nao fala com o Teams: ele pede para um agente de IA ja autenticado
// ler a conversa e gravar um snapshot em disco. Qual agente e isso — Claude
// Code, Codex, Gemini CLI, outro — e escolha de quem instala, e este arquivo
// existe para que essa escolha nao vire um `if` espalhado pelo servidor.
//
// Um adaptador descreve cinco coisas:
//
//   binario      o executavel a chamar
//   argumentos   o molde da linha de comando, com {{FERRAMENTAS}} e {{PROMPT}}
//   entrada      por onde o prompt entra: 'stdin' ou 'arg'
//   eventos      como ler o stdout: 'claude', 'codex' ou 'nenhum'
//   ferramentas  os nomes das tools de leitura do Teams e o molde das URIs
//
// TODO honesto: so o adaptador do Claude Code foi verificado de verdade. Os
// outros vao com as flags que a documentacao deles descreve, e por isso TODO
// campo acima e editavel na tela de configuracao — corrigir uma flag errada nao
// pode exigir editar codigo.

import { execFile } from 'node:child_process';

// As ferramentas do conector Microsoft 365 da claude.ai. Este e o acoplamento
// mais fundo do projeto e o unico que trocar de CLI nao resolve: quem le o Teams
// e o conector, nao o agente. Outro agente precisa de um MCP de Microsoft Graph
// configurado nele, com os nomes de tool e o endereco das mensagens que aquele
// MCP usa — e e por isso que estes campos existem em vez de estarem no codigo.
const FERRAMENTAS_CLAUDE = {
  conta: 'mcp__claude_ai_Microsoft_365__get_me',
  chats: 'mcp__claude_ai_Microsoft_365__teams_list_chats',
  leitura: 'mcp__claude_ai_Microsoft_365__read_resource',
  escrita: 'Write',
  uriCanal: 'teams:///teams/{teamId}/channels/{channelId}/messages',
  uriChat: 'teams:///chats/{chatId}/messages',
};

const BASE = [
  {
    id: 'claude',
    nome: 'Claude Code',
    verificado: true,
    binario: 'claude',
    // O prompt vai por STDIN, nao como argumento: e multi-linha, e no Windows o
    // shell mutila argumentos assim — o agente recebia texto truncado.
    argumentos:
      '-p --output-format stream-json --verbose ' +
      '--allowedTools {{FERRAMENTAS}} --permission-mode acceptEdits',
    entrada: 'stdin',
    eventos: 'claude',
    reportaCusto: true,
    ferramentas: { ...FERRAMENTAS_CLAUDE },
    requisitos: 'Precisa do conector Microsoft 365 ligado e autorizado no Claude Code.',
  },
  {
    id: 'codex',
    nome: 'Codex CLI',
    /** Binario e flags verificados nesta maquina; o que continua sem teste e a
     *  leitura do Teams, que depende do MCP de Graph que voce configurar. */
    verificado: true,
    binario: 'codex',
    // `exec` e o modo nao-interativo; `-` faz o prompt vir do stdin; a sandbox
    // de escrita e necessaria porque o agente grava o snapshot em disco.
    // Flags conferidas no `codex exec --help` do codex-cli 0.146.0: `-` faz o
    // prompt vir do stdin e a sandbox de escrita e necessaria porque o agente
    // grava o snapshot em disco.
    argumentos: 'exec --json --skip-git-repo-check --sandbox workspace-write -',
    entrada: 'stdin',
    eventos: 'codex',
    // O Codex nao devolve custo em dolar no stream; tokens, quando vem, sao
    // registrados. Prometer um preco que nao existe seria pior que nao mostrar.
    reportaCusto: false,
    ferramentas: {
      conta: 'get_me',
      chats: 'teams_list_chats',
      leitura: 'read_resource',
      escrita: 'write_file',
      uriCanal: 'teams:///teams/{teamId}/channels/{channelId}/messages',
      uriChat: 'teams:///chats/{chatId}/messages',
    },
    requisitos: 'Precisa de um MCP de Microsoft Graph no ~/.codex/config.toml.',
  },
  {
    id: 'gemini',
    nome: 'Gemini CLI',
    verificado: false,
    binario: 'gemini',
    // Sem stream de eventos util: o prompt vai como argumento e a saida e texto.
    // O quadro perde a barra de progresso detalhada, nao a leitura.
    argumentos: '-p {{PROMPT}} --yolo',
    entrada: 'arg',
    eventos: 'nenhum',
    reportaCusto: false,
    ferramentas: {
      conta: 'get_me',
      chats: 'teams_list_chats',
      leitura: 'read_resource',
      escrita: 'write_file',
      uriCanal: 'teams:///teams/{teamId}/channels/{channelId}/messages',
      uriChat: 'teams:///chats/{chatId}/messages',
    },
    requisitos: 'Precisa de um MCP de Microsoft Graph no settings.json do Gemini CLI.',
  },
  {
    id: 'personalizado',
    nome: 'Outro agente',
    verificado: false,
    binario: '',
    argumentos: '',
    entrada: 'stdin',
    eventos: 'nenhum',
    reportaCusto: false,
    ferramentas: {
      conta: '',
      chats: '',
      leitura: '',
      escrita: '',
      uriCanal: 'teams:///teams/{teamId}/channels/{channelId}/messages',
      uriChat: 'teams:///chats/{chatId}/messages',
    },
    requisitos: 'Qualquer CLI que leia o Teams e grave arquivo. Preencha os campos abaixo.',
  },
];

export const IDS_DE_AGENTE = BASE.map((a) => a.id);

const ENTRADAS = ['stdin', 'arg'];
const FORMATOS = ['claude', 'codex', 'nenhum'];

/** Config gravada por cima do padrao. Campo vazio = fica o padrao, para que
 *  limpar uma flag nao deixe o agente sem como rodar. */
function comOverride(base, over) {
  if (!over) return { ...base, ferramentas: { ...base.ferramentas } };
  const texto = (valor, padrao) => {
    const t = typeof valor === 'string' ? valor.trim() : '';
    return t || padrao;
  };
  const ferramentas = { ...base.ferramentas };
  for (const chave of Object.keys(ferramentas)) {
    ferramentas[chave] = texto(over.ferramentas?.[chave], ferramentas[chave]);
  }
  const eventos = FORMATOS.includes(over.eventos) ? over.eventos : base.eventos;
  return {
    ...base,
    binario: texto(over.binario, base.binario),
    argumentos: texto(over.argumentos, base.argumentos),
    entrada: ENTRADAS.includes(over.entrada) ? over.entrada : base.entrada,
    eventos,
    // Custo em dolar so aparece no evento `result` do Claude. Quem le outro
    // formato registra tokens e duracao; prometer preco seria inventar.
    reportaCusto: eventos === 'claude',
    ferramentas,
    /** Configurado a mao deixa de ser "nao verificado" por palpite nosso: quem
     *  ajustou sabe o que pos ali. */
    ajustado: true,
  };
}

export function adaptadores(config) {
  const over = (config && config.porAgente) || {};
  return BASE.map((a) => comOverride(a, over[a.id]));
}

export function idEscolhido(config) {
  const id = config && config.escolhido;
  return IDS_DE_AGENTE.includes(id) ? id : 'claude';
}

export function adaptadorEscolhido(config) {
  const id = idEscolhido(config);
  return adaptadores(config).find((a) => a.id === id);
}

/** As tools que a operacao precisa. Menos que isso o agente nao consegue
 *  trabalhar; mais que isso e permissao dada de graca. */
function ferramentasDaOperacao(ad, operacao) {
  const f = ad.ferramentas;
  const lista =
    operacao === 'conta' ? [f.conta, f.escrita]
    : operacao === 'chats' ? [f.chats, f.escrita]
    : [f.leitura, f.escrita];
  return lista.filter(Boolean).join(',');
}

/** A linha de comando pronta. `prompt` entra aqui porque em agente de entrada
 *  'arg' ele e um dos argumentos — e precisa sobreviver inteiro, sem passar por
 *  split de espaco. */
export function comandoDe(ad, operacao, prompt) {
  if (!ad.binario) {
    throw new Error(
      `O agente "${ad.nome}" nao tem binario configurado. ` +
      'Abra a configuracao e escolha ou complete um agente.'
    );
  }
  const ferramentas = ferramentasDaOperacao(ad, operacao);
  const args = [];
  for (const pedaco of String(ad.argumentos).split(/\s+/).filter(Boolean)) {
    if (pedaco === '{{PROMPT}}') args.push(prompt);
    else if (pedaco === '{{FERRAMENTAS}}') args.push(ferramentas);
    else args.push(pedaco);
  }
  // Entrada por argumento sem {{PROMPT}} no molde: o prompt vai no fim, que e
  // onde todo CLI aceita o texto livre.
  if (ad.entrada === 'arg' && !String(ad.argumentos).includes('{{PROMPT}}')) {
    args.push(prompt);
  }
  return { binario: ad.binario, args, viaStdin: ad.entrada === 'stdin' };
}

// ------------------------------------------------------------------ eventos

// Cada agente narra o que esta fazendo num formato proprio. O servidor nao
// precisa saber qual: daqui sai sempre a mesma dupla — o gasto da execucao e a
// ferramenta que o agente acabou de usar.

function consumoClaude(ev) {
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

function eventoClaude(ev) {
  if (ev.type === 'result') return { consumo: consumoClaude(ev) };
  if (ev.type !== 'assistant') return null;
  const partes = ev.message && ev.message.content;
  if (!Array.isArray(partes)) return null;
  const usos = [];
  for (const p of partes) {
    if (p.type !== 'tool_use') continue;
    usos.push({ nome: p.name || '', uri: (p.input && p.input.uri) || '' });
  }
  return usos.length ? { usos } : null;
}

// O formato abaixo foi conferido contra o codex-cli 0.146.0, rodando de verdade:
//
//   {"type":"turn.completed","usage":{"input_tokens":30015,"cached_input_tokens":19200,
//    "cache_write_input_tokens":0,"output_tokens":38,"reasoning_output_tokens":0}}
//   {"type":"item.completed","item":{"id":"item_0","type":"file_change","changes":[...]}}
//
// Duas licoes que so os dados reais deram: escrever arquivo NAO e tool call ali,
// e um `item` NARRA DUAS VEZES (started e completed). Contar os dois faria a
// barra de progresso dizer 40 leituras onde houve 20.
function eventoCodex(ev) {
  if (ev.type === 'item.started') return null;

  const uso = ev.usage || (ev.item && ev.item.usage);
  if (uso && (uso.input_tokens !== undefined || uso.output_tokens !== undefined)) {
    // `input_tokens` do Codex ja inclui o que veio do cache, entao somar
    // `cached_input_tokens` contaria duas vezes. O cache fica a parte, como
    // informacao, e o total e o que foi realmente processado nesta execucao.
    const cacheLido = uso.cached_input_tokens || 0;
    const entradaTotal = uso.input_tokens || 0;
    const saida = (uso.output_tokens || 0) + (uso.reasoning_output_tokens || 0);
    return {
      consumo: {
        tokensEntrada: Math.max(0, entradaTotal - cacheLido),
        tokensSaida: saida,
        tokensCacheLido: cacheLido,
        tokensTotal: entradaTotal + saida,
        // O Codex nao devolve preco. Um numero inventado aqui viraria estimativa
        // na tela de confirmacao, que e onde ele faria mais estrago.
        custoUsd: null,
        duracaoMs: null,
      },
    };
  }

  const item = ev.item || ev.msg;
  if (!item || typeof item !== 'object') return null;

  // Gravar o snapshot aparece como mudanca de arquivo, nao como uso de tool.
  if (item.type === 'file_change') return { usos: [{ nome: '__arquivo__', uri: '' }] };

  const nome = item.tool_name || item.tool || item.name || '';
  if (!nome) return null;
  const argumentos = item.arguments || item.input || item.args || {};
  let uri = '';
  if (typeof argumentos === 'string') {
    const achado = argumentos.match(/"uri"\s*:\s*"([^"]+)"/);
    if (achado) uri = achado[1];
  } else {
    uri = argumentos.uri || '';
  }
  return { usos: [{ nome: String(nome), uri: String(uri) }] };
}

export function interpretarLinha(ad, linha) {
  if (ad.eventos === 'nenhum') return null;
  if (!linha || !linha.trim()) return null;
  let ev;
  try { ev = JSON.parse(linha); } catch { return null; }
  if (!ev || typeof ev !== 'object') return null;
  return ad.eventos === 'codex' ? eventoCodex(ev) : eventoClaude(ev);
}

// ------------------------------------------------------------------ deteccao

/** Se o binario responde, o agente esta instalado. Nao prova que o MCP do Teams
 *  esta configurado nele — isso so o passo da conta descobre, e por isso a tela
 *  chama este passo de "escolher", nao de "verificar". */
export function detectarVersao(ad) {
  return new Promise((resolve) => {
    if (!ad.binario) return resolve({ instalado: false, erro: 'sem binario configurado' });
    execFile(ad.binario, ['--version'], { shell: true, timeout: 15000 }, (erro, stdout) => {
      if (erro) {
        return resolve({
          instalado: false,
          erro: `\`${ad.binario}\` nao respondeu no PATH`,
        });
      }
      resolve({ instalado: true, versao: String(stdout).trim().split('\n')[0] });
    });
  });
}

/** O que a interface precisa saber de cada agente. Sem `requisitos` a escolha
 *  seria um chute: o que muda entre eles nao e o nome, e o que precisa estar
 *  configurado do outro lado. */
export function paraTela(ad, deteccao) {
  return {
    id: ad.id,
    nome: ad.nome,
    verificado: !!ad.verificado,
    ajustado: !!ad.ajustado,
    reportaCusto: !!ad.reportaCusto,
    requisitos: ad.requisitos,
    binario: ad.binario,
    argumentos: ad.argumentos,
    entrada: ad.entrada,
    eventos: ad.eventos,
    ferramentas: { ...ad.ferramentas },
    instalado: deteccao ? !!deteccao.instalado : null,
    versao: deteccao ? deteccao.versao || '' : '',
    erro: deteccao ? deteccao.erro || '' : '',
  };
}
