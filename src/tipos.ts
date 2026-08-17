export type Status = 'aberto' | 'interagido' | 'feito';

export type TipoFonte = 'canal' | 'chat';
export type SubtipoFonte = 'canal' | 'oneOnOne' | 'group' | 'meeting';

export interface Mural {
  id: string;
  tipo: TipoFonte;
  subtipo: SubtipoFonte;
  nome: string;
  teamId?: string;
  channelId?: string;
  chatId?: string;
  criadoEm: string;
  ultimoSync: string | null;
}

export interface MuralNaLista extends Mural {
  totais: Record<Status, number>;
  foraDeAlcance: number;
}

export interface Task {
  id: string;
  author: string;
  createdDateTime: string;
  summary: string;
  kind: 'bug' | 'sugestao';
  reactions: string[];
  emojis: string[];
  webUrl: string;
  status: Status;
  firstSeen: string;
  statusChangedAt: string;
  statusAnterior: Status | null;
  lastSeen: string;
  /** Saiu das ~20 mensagens que a API devolve: o Teams nao atualiza mais. */
  foraDeAlcance: boolean;
  movidoAMao: boolean;
}

export interface RespostaTasks {
  lastSync: string | null;
  tasks: Task[];
}

export interface ResultadoSync extends RespostaTasks {
  ok: boolean;
  novos: string[];
  mudaram: string[];
  retomadas: string[];
  total: number;
}

export interface Progresso {
  etapa: string;
  lidas: number;
  total: number;
  segundos: number;
}

export interface EstadoSync {
  syncing: boolean;
  muralSincronizando: string | null;
  progresso: Progresso | null;
}

export interface ChatDisponivel {
  id: string;
  nome: string;
  tipo: 'oneOnOne' | 'group' | 'meeting';
  membros: number;
}

export interface FonteEscolhida {
  tipo: TipoFonte;
  subtipo: SubtipoFonte;
  nome: string;
  teamId?: string;
  channelId?: string;
  chatId?: string;
}
