import type {
  ChatDisponivel,
  EstadoSync,
  FonteEscolhida,
  Mural,
  MuralNaLista,
  Preferencias,
  RespostaConsumo,
  RespostaTasks,
  ResultadoSync,
  Status,
} from './tipos';

// O servidor devolve { ok:false, erro } com status 4xx/5xx em falha esperada.
// Trazer essa mensagem para o throw evita o generico "Failed to fetch" na tela.
async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, init);
  let corpo: unknown;
  try {
    corpo = await resposta.json();
  } catch {
    throw new Error(`Resposta ilegível do servidor (HTTP ${resposta.status}).`);
  }
  const dados = corpo as { ok?: boolean; erro?: string };
  if (!resposta.ok || dados.ok === false) {
    throw new Error(dados.erro || `Falhou com HTTP ${resposta.status}.`);
  }
  return corpo as T;
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

  sincronizar: (muralId: string) =>
    pedir<ResultadoSync>(`/api/sync?mural=${muralId}`, { method: 'POST' }),

  mover: (muralId: string, id: string, status: Status) =>
    pedir<RespostaTasks>(`/api/mover?mural=${muralId}`, json({ id, status })),

  abrirNoTeams: (muralId: string, id: string) =>
    pedir<{ via: string }>(
      `/api/abrir?mural=${muralId}&id=${encodeURIComponent(id)}`,
      { method: 'POST' },
    ),

  estadoSync: () => pedir<EstadoSync>('/api/status'),

  consumo: (muralId: string) => pedir<RespostaConsumo>(`/api/consumo?mural=${muralId}`),

  salvarPreferencias: (prefs: Preferencias) =>
    pedir<{ preferencias: Preferencias }>('/api/preferencias', json(prefs)),

  // --- onboarding ---
  // Estas rotas respondem HTTP 200 com { ok:false, erro } de proposito: "o
  // Claude nao esta instalado" e uma resposta valida do diagnostico, nao uma
  // falha do servidor. Por isso passam por `pedirBruto`, sem o throw.
  verificarClaude: () =>
    pedirBruto<{ ok: boolean; versao?: string; erro?: string }>('/api/setup/claude'),

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
};

async function pedirBruto<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, init);
  try {
    return (await resposta.json()) as T;
  } catch {
    throw new Error(`Resposta ilegível do servidor (HTTP ${resposta.status}).`);
  }
}
