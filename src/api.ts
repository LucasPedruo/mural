import type {
  AgenteDisponivel,
  AjustesDoAgente,
  ChatDisponivel,
  EstadoSync,
  FonteEscolhida,
  Mural,
  MuralNaLista,
  Preferencias,
  RespostaAgentes,
  ColunaPersonalizada,
  ResultadoExclusaoDeColuna,
  RespostaColunas,
  RespostaConsumo,
  RespostaDashboard,
  RespostaPainel,
  RespostaSprint,
  RespostaTasks,
  TagComContagem,
  ResultadoEncerramento,
  ResultadoSync,
  SomaDeConsumo,
  Status,
  TotaisDeConsumo,
} from './tipos';

// Corpo que não é JSON quase nunca vem do Mural: vem de quem está NA FRENTE
// dele. Em desenvolvimento é o proxy do Vite respondendo erro em HTML porque a
// API não está de pé na 4317 — e dizer só "resposta ilegível" esconde o único
// fato que resolve o problema.
function erroDeCorpoIlegivel(status: number): string {
  if (status === 0 || status >= 500) {
    return (
      `A API do Mural não respondeu (HTTP ${status}). ` +
      "Ela roda em outro processo: confira se `node server.js` está de pé na porta 4317."
    );
  }
  return `Resposta ilegível do servidor (HTTP ${status}).`;
}

// O servidor devolve { ok:false, erro } com status 4xx/5xx em falha esperada.
// Trazer essa mensagem para o throw evita o generico "Failed to fetch" na tela.
async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, init);
  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    throw new Error(erroDeCorpoIlegivel(resposta.status));
  }
  const dados = corpo as { ok?: boolean; erro?: string };
  if (!resposta.ok || dados.ok === false) {
    throw new Error(dados.erro || `Falhou com HTTP ${resposta.status}.`);
  }
  return corpo as T;
}

const SEM_CONSUMO: SomaDeConsumo = { execucoes: 0, tokensTotal: 0, custoUsd: 0 };

// Um servidor mais velho que esta interface — o processo que ficou de pé desde
// antes do último build — devolve os totais sem a quebra por operação. Faltar
// um detalhe de custo não pode derrubar o quadro inteiro: aqui a quebra vira
// zero e o resto da tela segue.
function comQuebraPorOperacao(totais: TotaisDeConsumo): TotaisDeConsumo {
  const q = totais.porOperacao;
  return {
    ...totais,
    porOperacao: {
      sync: q?.sync ?? SEM_CONSUMO,
      conta: q?.conta ?? SEM_CONSUMO,
      chats: q?.chats ?? SEM_CONSUMO,
    },
  };
}

function json(corpo: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  };
}

export const api = {
  listarMurais: () => pedir<{ murais: MuralNaLista[] }>('/api/murais'),

  lerMural: (id: string) => pedir<{ mural: Mural }>(`/api/mural?id=${id}`),

  criarMural: (fonte: FonteEscolhida) =>
    pedir<{ id: string; jaExistia: boolean }>('/api/murais', json(fonte)),

  removerMural: (id: string) =>
    pedir<{ ok: true }>(`/api/murais?id=${id}`, { method: 'DELETE' }),

  tasks: (muralId: string) => pedir<RespostaTasks>(`/api/tasks?mural=${muralId}`),

  sincronizar: async (muralId: string): Promise<ResultadoSync> => {
    const r = await pedir<ResultadoSync>(`/api/sync?mural=${muralId}`, { method: 'POST' });
    return { ...r, totaisDoUsuario: comQuebraPorOperacao(r.totaisDoUsuario) };
  },

  // --- rajadas ---
  // O agrupamento automático erra em alguns casos, e card errado que não dá
  // para consertar é pior que card errado. O que estes dois gestos decidem
  // nenhuma leitura desfaz.

  juntar: (muralId: string, ids: string[]) =>
    pedir<RespostaTasks & { id: string }>(`/api/juntar?mural=${muralId}`, json({ ids })),

  separar: (muralId: string, id: string) =>
    pedir<RespostaTasks & { quantas: number }>(`/api/separar?mural=${muralId}`, json({ id })),

  // --- marcas pessoais: ignorar, apagar, etiquetar ---
  // Nenhuma delas toca no Teams: são opiniões suas sobre a mensagem, guardadas
  // em campo próprio para o sync não as apagar.

  ignorar: (muralId: string, id: string, ignorar = true) =>
    pedir<RespostaTasks>(`/api/ignorar?mural=${muralId}`, json({ id, ignorar })),

  // Irreversível: o card sai do arquivo e a mensagem entra na lista de
  // arquivados, para a próxima leitura não a trazer de volta.
  apagar: (muralId: string, id: string) =>
    pedir<RespostaTasks>(`/api/apagar?mural=${muralId}`, json({ id })),

  tags: (muralId: string) => pedir<{ tags: TagComContagem[] }>(`/api/tags?mural=${muralId}`),

  salvarTags: (muralId: string, id: string, tags: string[]) =>
    pedir<RespostaTasks & { tags: TagComContagem[] }>(
      `/api/tags?mural=${muralId}`,
      json({ id, tags }),
    ),

  // A nota livre de um card. Nota vazia apaga.
  anotar: (muralId: string, id: string, nota: string) =>
    pedir<RespostaTasks>(`/api/nota?mural=${muralId}`, json({ id, nota })),

  // --- colunas suas ---
  // Elas não têm regra: quem põe card ali é você, arrastando. Por isso a coluna
  // mora no servidor (é do quadro, não da sua tela) e o card guarda em qual
  // delas está preso.

  colunas: (muralId: string) => pedir<RespostaColunas>(`/api/colunas?mural=${muralId}`),

  salvarColuna: (muralId: string, dados: { id?: string; nome: string; cor?: string }) =>
    pedir<RespostaColunas & { coluna: ColunaPersonalizada }>(
      `/api/colunas?mural=${muralId}`,
      json(dados),
    ),

  // Irreversível: leva os cards da coluna junto. Quem confirma é a interface,
  // com o número na frente.
  excluirColuna: (muralId: string, id: string) =>
    pedir<ResultadoExclusaoDeColuna>(`/api/colunas?mural=${muralId}&id=${id}`, {
      method: 'DELETE',
    }),

  // Prender e soltar. Rota própria, e não `mover`: mover recusa card que o Teams
  // acompanha, e prender existe justamente para tirar um desses do fluxo.
  prenderNaColuna: (muralId: string, id: string, coluna: string | null) =>
    pedir<RespostaTasks>(`/api/coluna?mural=${muralId}`, json({ id, coluna })),

  // --- sprint ---

  sprint: (muralId: string) => pedir<RespostaSprint>(`/api/sprint?mural=${muralId}`),

  definirSprint: (muralId: string, sprint: { nome: string; inicio: string; dias: number }) =>
    pedir<RespostaSprint>(`/api/sprint?mural=${muralId}`, json(sprint)),

  // Arquiva o que terminou e abre a sprint seguinte. Não é destrutivo: os cards
  // continuam no disco, e é deles que os painéis vivem.
  encerrarSprint: (muralId: string) =>
    pedir<ResultadoEncerramento>(`/api/sprint/encerrar?mural=${muralId}`, { method: 'POST' }),

  painel: (muralId: string) => pedir<RespostaPainel>(`/api/painel?mural=${muralId}`),

  // Séries já agregadas, prontas para virar gráfico. Rota própria porque a
  // pergunta é outra: o painel quer a lista de itens da daily para copiar no
  // chat, o dashboard quer a forma. Nenhum dos dois deve pagar o peso do outro.
  dashboard: (muralId: string) => pedir<RespostaDashboard>(`/api/dashboard?mural=${muralId}`),

  mover: (muralId: string, id: string, status: Status) =>
    pedir<RespostaTasks>(`/api/mover?mural=${muralId}`, json({ id, status })),

  // A marca pessoal vale para qualquer card, inclusive os que o Teams ainda
  // acompanha: ela não mexe no status, então não há o que o sync desfazer.
  marcarComoMeu: (muralId: string, id: string, solucao: string) =>
    pedir<RespostaTasks>(`/api/meu?mural=${muralId}`, json({ id, solucao })),

  desmarcarComoMeu: (muralId: string, id: string) =>
    pedir<RespostaTasks>(`/api/meu?mural=${muralId}`, json({ id, marcar: false })),

  // O espelho do de cima. O Graph conta que alguém reagiu com o check, nunca
  // QUEM — `reactions[].users` vem vazio. Então o nome de quem resolveu é uma
  // anotação sua, guardada em campo próprio, que nenhuma leitura sobrescreve.
  marcarFeitoPorOutro: (muralId: string, id: string, quem: string, solucao: string) =>
    pedir<RespostaTasks>(`/api/feito-por?mural=${muralId}`, json({ id, quem, solucao })),

  desmarcarFeitoPorOutro: (muralId: string, id: string) =>
    pedir<RespostaTasks>(`/api/feito-por?mural=${muralId}`, json({ id, marcar: false })),

  abrirNoTeams: (muralId: string, id: string) =>
    pedir<{ via: string }>(
      `/api/abrir?mural=${muralId}&id=${encodeURIComponent(id)}`,
      { method: 'POST' },
    ),

  estadoSync: () => pedir<EstadoSync>('/api/status'),

  consumo: async (muralId: string): Promise<RespostaConsumo> => {
    const r = await pedir<RespostaConsumo>(`/api/consumo?mural=${muralId}`);
    return {
      ...r,
      totais: comQuebraPorOperacao(r.totais),
      agente: r.agente ?? { id: 'claude', nome: 'Claude Code', reportaCusto: true },
    };
  },

  // As três reações que o quadro entende. Rota sem `mural` de propósito: a
  // pergunta "qual emoji significa o quê" é do usuário, e o onboarding precisa
  // respondê-la antes de existir quadro nenhum.
  preferencias: () =>
    pedir<{ preferencias: Preferencias; checks: string[] }>('/api/preferencias'),

  // Parcial de proposito: o servidor so mexe no que veio, entao salvar o emoji
  // nao religa a confirmação que você desmarcou.
  salvarPreferencias: (prefs: Partial<Preferencias>) =>
    pedir<{ preferencias: Preferencias }>('/api/preferencias', json(prefs)),

  // --- onboarding ---
  // Estas rotas respondem HTTP 200 com { ok:false, erro } de proposito: "o
  // Claude nao esta instalado" e uma resposta valida do diagnostico, nao uma
  // falha do servidor. Por isso passam por `pedirBruto`, sem o throw.
  // Escolher o agente, não verificar um agente: a pergunta do primeiro passo é
  // "com qual CLI de IA eu leio o Teams?".
  agentes: () => pedirBruto<RespostaAgentes>('/api/setup/agentes'),

  escolherAgente: (id: string, ajustes?: AjustesDoAgente) =>
    pedir<{ agente: AgenteDisponivel }>('/api/setup/agente', json({ id, ajustes })),

  verificarConta: () =>
    pedirBruto<{ ok: boolean; conta?: { displayName: string; mail: string }; erro?: string }>(
      '/api/setup/conta',
      { method: 'POST' },
    ),

  listarChats: () =>
    pedirBruto<{ ok: boolean; chats?: ChatDisponivel[]; erro?: string }>(
      '/api/setup/chats',
      { method: 'POST' },
    ),

  resetarOnboarding: () =>
    pedir<{ apagados: string[] }>('/api/setup/reset', { method: 'POST' }),
};

async function pedirBruto<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, init);
  try {
    return (await resposta.json()) as T;
  } catch {
    throw new Error(erroDeCorpoIlegivel(resposta.status));
  }
}
