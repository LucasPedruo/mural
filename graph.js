// Escrita no Teams.
//
// O resto do Mural LE o Teams por um agente de IA. Escrever reacao e outra
// historia: e um POST de 200ms, deterministico, que nao tem por que passar por
// um modelo — custaria tokens e meio minuto para um gesto de arrastar card.
//
// O preco disso e explicito e vale ser dito em voz alta: este e o UNICO lugar do
// Mural que guarda credencial. Fica em data/graph.json, o servidor escuta so em
// 127.0.0.1, e o fluxo e device code — nao ha segredo de aplicacao aqui, so um
// refresh token que voce revoga em myaccount.microsoft.com quando quiser.
//
// Os dois hosts sao sobrescritiveis por variavel de ambiente porque e isso que
// permite testar a FORMA das requisicoes contra um servidor de mentira, em vez
// de confiar que o que escrevi aqui e o que o Graph espera.

const LOGIN = process.env.MURAL_LOGIN_BASE || 'https://login.microsoftonline.com';
const GRAPH = process.env.MURAL_GRAPH_BASE || 'https://graph.microsoft.com/v1.0';

// `offline_access` e o que da o refresh token; sem ele a escrita duraria uma
// hora. Canal e chat pedem permissoes diferentes, e nenhuma delas exige
// consentimento de admin — a reacao sai como sendo VOCE, nao um robo.
export const ESCOPOS = 'offline_access ChannelMessage.Send ChatMessage.Send Chat.ReadWrite';

const FORMULARIO = { 'Content-Type': 'application/x-www-form-urlencoded' };

function corpoDeFormulario(campos) {
  return new URLSearchParams(campos).toString();
}

async function lerResposta(res) {
  const texto = await res.text();
  if (!texto) return {};
  try { return JSON.parse(texto); } catch { return { erroBruto: texto.slice(0, 400) }; }
}

/** A mensagem de erro que o Azure devolve e melhor que qualquer uma que eu
 *  escreveria: ela diz exatamente qual permissao ou consentimento falta. */
function erroDoAzure(dados, padrao) {
  const detalhe =
    dados.error_description ||
    (dados.error && dados.error.message) ||
    dados.erroBruto ||
    dados.error ||
    '';
  return new Error(padrao + (detalhe ? ' ' + String(detalhe).split('\n')[0] : ''));
}

function urlDeToken(tenant) {
  return `${LOGIN}/${encodeURIComponent(tenant || 'organizations')}/oauth2/v2.0/token`;
}

// ------------------------------------------------------------- device code

/** Passo 1: pedir o codigo. Devolve o que a tela mostra — o codigo curto e o
 *  endereco onde ele e digitado — mais o `device_code`, que e o segredo do
 *  fluxo e nunca aparece na interface. */
export async function iniciarDeviceCode({ clientId, tenant }) {
  const res = await fetch(
    `${LOGIN}/${encodeURIComponent(tenant || 'organizations')}/oauth2/v2.0/devicecode`,
    {
      method: 'POST',
      headers: FORMULARIO,
      body: corpoDeFormulario({ client_id: clientId, scope: ESCOPOS }),
    },
  );
  const dados = await lerResposta(res);
  if (!res.ok || !dados.device_code) {
    throw erroDoAzure(dados, 'O Azure recusou o pedido de codigo.');
  }
  return {
    deviceCode: dados.device_code,
    codigoDoUsuario: dados.user_code,
    endereco: dados.verification_uri,
    expiraEmSegundos: dados.expires_in || 900,
    intervaloSegundos: dados.interval || 5,
  };
}

/** Passo 2, chamado em laco: enquanto ninguem digitou o codigo, o Azure
 *  responde `authorization_pending` — que NAO e erro, e a razao de este retorno
 *  distinguir "ainda nao" de "deu errado". */
export async function trocarDeviceCode({ clientId, tenant, deviceCode }) {
  const res = await fetch(urlDeToken(tenant), {
    method: 'POST',
    headers: FORMULARIO,
    body: corpoDeFormulario({
      client_id: clientId,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: deviceCode,
    }),
  });
  const dados = await lerResposta(res);

  if (res.ok && dados.access_token) return { pronto: true, tokens: normalizarTokens(dados) };
  if (dados.error === 'authorization_pending' || dados.error === 'slow_down') {
    return { pronto: false, esperarMais: dados.error === 'slow_down' };
  }
  if (dados.error === 'expired_token' || dados.error === 'code_expired') {
    throw new Error('O codigo expirou antes de ser autorizado. Peca outro.');
  }
  if (dados.error === 'authorization_declined') {
    throw new Error('A autorizacao foi recusada no navegador.');
  }
  throw erroDoAzure(dados, 'Nao consegui concluir a autorizacao.');
}

export async function renovar({ clientId, tenant, refreshToken }) {
  const res = await fetch(urlDeToken(tenant), {
    method: 'POST',
    headers: FORMULARIO,
    body: corpoDeFormulario({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: ESCOPOS,
    }),
  });
  const dados = await lerResposta(res);
  if (!res.ok || !dados.access_token) {
    throw erroDoAzure(dados, 'A autorizacao de escrita expirou e nao pude renovar.');
  }
  return normalizarTokens(dados);
}

function normalizarTokens(dados) {
  return {
    accessToken: dados.access_token,
    // O Azure as vezes nao reemite o refresh token na renovacao; quem chama
    // mantem o anterior nesse caso.
    refreshToken: dados.refresh_token || null,
    expiraEm: new Date(Date.now() + (dados.expires_in || 3600) * 1000).toISOString(),
    escopos: dados.scope || ESCOPOS,
  };
}

// ------------------------------------------------------------------ reacao

/** O endereco da mensagem no Graph. Canal e chat sao rotas diferentes, e a
 *  mensagem alvo e sempre a ANCORA do card: e a que o card representa, a que o
 *  clique abre, e a que continua existindo se a rajada crescer. */
function urlDaMensagem(fonte, mensagemId, acao) {
  const id = encodeURIComponent(mensagemId);
  if (fonte.tipo === 'chat') {
    return `${GRAPH}/chats/${encodeURIComponent(fonte.chatId)}/messages/${id}/${acao}`;
  }
  return (
    `${GRAPH}/teams/${encodeURIComponent(fonte.teamId)}` +
    `/channels/${encodeURIComponent(fonte.channelId)}/messages/${id}/${acao}`
  );
}

async function reagir(acao, { fonte, mensagemId, emoji, accessToken }) {
  const res = await fetch(urlDaMensagem(fonte, mensagemId, acao), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reactionType: emoji }),
  });

  // 204 e o sucesso documentado. 404 ao TIRAR uma reacao que nao existe nao e
  // falha: o estado desejado ja e o atual, e tratar como erro faria o quadro
  // reclamar de um gesto que deu certo.
  if (res.status === 204 || res.status === 200) return;
  if (res.status === 404 && acao === 'unsetReaction') return;

  const dados = await lerResposta(res);
  if (res.status === 401 || res.status === 403) {
    throw erroDoAzure(
      dados,
      'O Teams recusou a escrita (sem permissao). Confira os escopos do app no Azure.'
    );
  }
  throw erroDoAzure(dados, `O Teams recusou a reacao (HTTP ${res.status}).`);
}

export function setReaction(opcoes) {
  return reagir('setReaction', opcoes);
}

export function unsetReaction(opcoes) {
  return reagir('unsetReaction', opcoes);
}
