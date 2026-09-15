import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import pino from 'pino';
import qrcode from 'qrcode-terminal';

dotenv.config({ path: '.env.local' });
dotenv.config();

const API_URL = process.env.MURAL_API_URL || `http://127.0.0.1:${process.env.MURAL_PORT || 4317}`;
const AUTH_DIR = process.env.WHATSAPP_AUTH_DIR || 'data/whatsapp';
const GRUPOS_PERMITIDOS = new Set(
  String(process.env.WHATSAPP_PERSONAL_GROUPS || '')
    .split(',')
    .map((grupo) => grupo.trim())
    .filter(Boolean),
);
const PAIRING_PHONE = String(process.env.WHATSAPP_PAIRING_PHONE_NUMBER || '').replace(/\D/g, '');
const BAILEYS_LOG_LEVEL = process.env.BAILEYS_LOG_LEVEL || 'silent';

function textoDaMensagem(message) {
  const conteudo = message.message || {};
  return (
    conteudo.conversation ||
    conteudo.extendedTextMessage?.text ||
    conteudo.imageMessage?.caption ||
    conteudo.videoMessage?.caption ||
    ''
  ).trim();
}

function grupoAutorizado(remoteJid) {
  return remoteJid?.endsWith('@g.us') && (GRUPOS_PERMITIDOS.size === 0 || GRUPOS_PERMITIDOS.has(remoteJid));
}

function campo(texto, nomes) {
  for (const nome of nomes) {
    const re = new RegExp(`(?:^|[\\n;|])\\s*${nome}\\s*[:=]\\s*([^\\n;|]+)`, 'i');
    const encontrado = texto.match(re);
    if (encontrado?.[1]) return encontrado[1].trim();
  }
  return '';
}

function removerCampos(texto) {
  return texto
    .replace(/(?:^|[\n;|])\s*(titulo|título|descricao|descrição|prazo|parceiro|valor|canal|categoria|parcelas|recorrencia|recorrência|tempo)\s*[:=]\s*[^\n;|]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectarAcao(texto) {
  const bruto = texto.trim();
  const lower = bruto.toLowerCase();
  if (/^!(resumo|status)\b/.test(lower)) return { tipo: 'resumo', corpo: '' };

  const regras = [
    { tipo: 'diarias', re: /^(?:!todo|!tarefa|todo:|tarefa:|#todo)\s*/i },
    { tipo: 'publicidade', re: /^(?:!pub|!publicidade|pub:|publicidade:|#pub)\s*/i },
    { tipo: 'financas', re: /^(?:!fin|!financas|!finanças|fin:|financas:|finanças:|#fin)\s*/i },
  ];
  for (const regra of regras) {
    if (regra.re.test(bruto)) {
      return { tipo: regra.tipo, corpo: bruto.replace(regra.re, '').trim() };
    }
  }
  return null;
}

function dadosDoTexto(texto, tipo) {
  const titulo = campo(texto, ['titulo', 'título']) || removerCampos(texto);
  return {
    titulo: titulo || texto.slice(0, 180),
    descricao: campo(texto, ['descricao', 'descrição']),
    prioridade: /alta/i.test(texto) ? 'alta' : /baixa/i.test(texto) ? 'baixa' : 'media',
    prazo: campo(texto, ['prazo']),
    parceiro: tipo === 'publicidade' ? campo(texto, ['parceiro', 'marca']) : '',
    valor: tipo === 'publicidade' || tipo === 'financas' ? campo(texto, ['valor']) : '',
    canal: tipo === 'publicidade' ? campo(texto, ['canal']) : '',
    categoria: tipo === 'financas' ? campo(texto, ['categoria']) : '',
    parcelas: tipo === 'financas' ? campo(texto, ['parcelas']) : '',
    recorrencia:
      tipo === 'publicidade'
        ? campo(texto, ['tempo', 'recorrencia', 'recorrência'])
        : tipo === 'financas'
          ? campo(texto, ['recorrencia', 'recorrência'])
          : '',
  };
}

async function chamarApi(caminho, init) {
  const resposta = await fetch(`${API_URL}${caminho}`, init);
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok || corpo.ok === false) {
    throw new Error(corpo.erro || `API respondeu HTTP ${resposta.status}`);
  }
  return corpo;
}

async function criarCard(tipo, dados) {
  return chamarApi(`/api/pessoal/item?tipo=${tipo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  });
}

async function lerQuadro(tipo) {
  const { quadro } = await chamarApi(`/api/pessoal?tipo=${tipo}`);
  return quadro;
}

function resumoQuadro(quadro) {
  const periodo = quadro.periodoAtual?.nome || 'periodo atual';
  const pendentes = quadro.itens.filter((item) => item.coluna !== 'feito' && item.coluna !== 'pago');
  const linhas = pendentes.slice(0, 5).map((item) => `- ${item.titulo}${item.prazo ? ` (${item.prazo})` : ''}`);
  return [`${quadro.titulo} - ${periodo}: ${pendentes.length} pendentes`, ...linhas].join('\n');
}

async function resumoGeral() {
  const quadros = await Promise.all(['diarias', 'publicidade', 'financas'].map(lerQuadro));
  return quadros.map(resumoQuadro).join('\n\n');
}

async function enviar(socket, jid, texto) {
  await socket.sendMessage(jid, { text: texto });
}

async function tratarMensagem(socket, message) {
  const remoteJid = message.key?.remoteJid;
  if (!grupoAutorizado(remoteJid)) return;

  const texto = textoDaMensagem(message);
  if (!texto) return;

  const acao = detectarAcao(texto);
  if (!acao) return;

  try {
    if (acao.tipo === 'resumo') {
      await enviar(socket, remoteJid, await resumoGeral());
      return;
    }

    const dados = dadosDoTexto(acao.corpo, acao.tipo);
    if (!dados.titulo.trim()) return;
    const { quadro } = await criarCard(acao.tipo, dados);
    await enviar(
      socket,
      remoteJid,
      `Adicionado em ${quadro.titulo} (${quadro.periodoAtual?.nome || 'periodo atual'}): ${dados.titulo}`,
    );
  } catch (e) {
    await enviar(socket, remoteJid, `Nao consegui processar: ${(e instanceof Error ? e.message : String(e))}`);
  }
}

async function iniciar() {
  await fs.mkdir(AUTH_DIR, { recursive: true });
  const logger = pino({ level: BAILEYS_LOG_LEVEL });
  const { state, saveCreds } = await useMultiFileAuthState(path.resolve(AUTH_DIR));
  const { version } = await fetchLatestBaileysVersion();
  const socket = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ['Agente Lucas', 'Chrome', '1.0.0'],
    printQRInTerminal: false,
  });

  socket.ev.on('creds.update', saveCreds);
  socket.ev.on('messages.upsert', ({ messages }) => {
    for (const message of messages) void tratarMensagem(socket, message);
  });
  socket.ev.on('connection.update', async (update) => {
    if (update.qr) {
      qrcode.generate(update.qr, { small: true });
      if (PAIRING_PHONE && !state.creds.registered) {
        const codigo = await socket.requestPairingCode(PAIRING_PHONE);
        console.log(`Codigo de pareamento: ${codigo}`);
      }
    }

    if (update.connection === 'open') {
      console.log(`WhatsApp conectado. API: ${API_URL}`);
      if (GRUPOS_PERMITIDOS.size === 0) {
        console.log('WHATSAPP_PERSONAL_GROUPS vazio: escutando qualquer grupo onde o bot estiver.');
      }
    }

    if (update.connection === 'close') {
      const statusCode = new Boom(update.lastDisconnect?.error).output.statusCode;
      if (statusCode !== DisconnectReason.loggedOut) {
        setTimeout(() => void iniciar(), 3000);
      } else {
        console.log('WhatsApp desconectado. Apague o diretorio de auth para parear de novo.');
      }
    }
  });
}

void iniciar().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
