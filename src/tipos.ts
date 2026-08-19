export type Status = 'aberto' | 'interagido' | 'feito';

/** As colunas do quadro. `meu` não é um status do Teams: é a marca pessoal
 *  "eu fiz isso", que vive num campo separado justamente para o sync não a
 *  apagar. Ver `MeuFeito`. */
export type ColunaId = Status | 'meu';

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
  totais: Record<ColunaId, number>;
  foraDeAlcance: number;
}

/** O que você anotou ao marcar a task como feita por você. `em` é a data da
 *  marcação, não a da última edição do texto — é ela que agrupa os cards por
 *  dia na coluna da daily. */
export interface MeuFeito {
  em: string;
  solucao: string;
  /** `emoji` = veio da sua reação no Teams; `mao` = você marcou aqui. */
  via: 'emoji' | 'mao';
}

export interface Task {
  id: string;
  /** `manual` = você escreveu aqui dentro; nenhum sync alcança essa task. */
  origem: 'teams' | 'manual';
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
  /** Pode trocar de coluna à mão: fora de alcance ou criada por você. */
  podeMover: boolean;
  /** Pode sair de "Feito por mim" pelo quadro. Falso quando é a sua reação que
   *  põe o card lá: nesse caso quem manda é o Teams. */
  podeDesmarcar: boolean;
  movidoAMao: boolean;
  meu: MeuFeito | null;
}

/** O que o formulário de task própria manda para o servidor. */
export interface NovaTask {
  summary: string;
  kind: 'bug' | 'sugestao';
  status: Status;
}

export interface RespostaTasks {
  lastSync: string | null;
  tasks: Task[];
}

/** O que uma execução do Claude Code realmente consumiu. Vem do evento
 *  `result` do stream-json — é o custo cobrado, não uma estimativa nossa. */
export interface Consumo {
  tokensEntrada: number;
  tokensSaida: number;
  tokensCacheLido: number;
  tokensTotal: number;
  custoUsd: number | null;
  duracaoMs: number | null;
}

export interface Estimativa extends Consumo {
  /** Quantas execuções passadas entraram na média. */
  baseadoEm: number;
  /** false = média de outros murais, porque este ainda não tem histórico. */
  doProprioMural: boolean;
  duracaoMs: number;
}

export interface SomaDeConsumo {
  execucoes: number;
  tokensTotal: number;
  custoUsd: number;
}

/** Toda ida ao Claude Code custa, não só a atualização do quadro: `conta` e
 *  `chats` são as leituras do onboarding. */
export type Operacao = 'sync' | 'conta' | 'chats';

export interface TotaisDeConsumo extends SomaDeConsumo {
  porOperacao: Record<Operacao, SomaDeConsumo>;
}

export interface Preferencias {
  confirmarAntesDeAtualizar: boolean;
  /** A reação que, na sua mão, quer dizer "fui eu que fiz". Vazio desliga a
   *  detecção e deixa só o botão "fiz" — o Graph não diz quem reagiu, então
   *  isso é uma convenção sua, não um dado da API. */
  emojiMeu: string;
}

export interface RespostaConsumo {
  usuario: string;
  estimativa: Estimativa | null;
  totais: TotaisDeConsumo;
  preferencias: Preferencias;
}

export interface ResultadoSync extends RespostaTasks {
  ok: boolean;
  novos: string[];
  mudaram: string[];
  retomadas: string[];
  /** Ganharam a marca "feito por mim" pela sua reação nesta leitura. */
  marcados: string[];
  total: number;
  consumo: Consumo | null;
  totaisDoUsuario: TotaisDeConsumo;
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
