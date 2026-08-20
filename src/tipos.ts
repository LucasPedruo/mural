/** `fazendo` sai de um emoji configurável (⚪ por padrão) na mensagem: é o
 *  único status além do check que tem símbolo próprio, porque é o único que
 *  alguém precisa ANUNCIAR — "peguei essa". `interagido` continua sendo o que
 *  sobra: reagiram com outra coisa. */
export type Status = 'aberto' | 'fazendo' | 'interagido' | 'feito';

/** As colunas do quadro. `meu` e `ignorada` não são status do Teams: são marcas
 *  pessoais, guardadas em campos separados justamente para o sync não as apagar.
 *  Ver `MeuFeito` e `Task.ignorada`. */
export type ColunaId = Status | 'meu' | 'ignorada';

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

/** Uma mensagem do Teams dentro de um card. Uma demanda raramente chega como
 *  uma mensagem só: o padrão é a rajada — dois prints e três linhas de texto do
 *  mesmo autor, em segundos, que são UMA task. Card solto tem um item aqui. */
export interface MensagemDaTask {
  id: string;
  author: string;
  createdDateTime: string;
  summary: string;
  kind: 'bug' | 'sugestao';
  reactions: string[];
  webUrl: string;
  /** Mensagem sem texto útil, só imagem — o print do erro. */
  soPrint: boolean;
}

export interface Task {
  id: string;
  /** `manual` = task que uma versão anterior do Mural deixou gravada, quando
   *  dava para criar task à mão. Nenhum sync alcança essas, então elas
   *  continuam móveis — o quadro não pode prender o que já está no histórico. */
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
  /** Quando você decidiu que esta não é sua — data da decisão. O card sai das
   *  colunas de trabalho e nada é escrito no Teams: ignorar é uma opinião sua
   *  sobre a mensagem, não um recado para o time. */
  ignorada: string | null;
  /** Suas etiquetas. O Teams não tem esse campo: quem escreve é você, aqui. */
  tags: string[];
  /** As mensagens que formam este card, da mais antiga para a mais nova. A
   *  primeira é a âncora: o id do card é o dela, e é ela que o clique abre. */
  mensagens: MensagemDaTask[];
  /** 'auto' = o Mural juntou a rajada; 'mao' = você juntou ou separou, e nenhuma
   *  leitura desfaz isso. null = mensagem solta. */
  agrupamento: 'auto' | 'mao' | null;
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
  /** A reação que quer dizer "alguém pegou esta": a coluna *Fazendo*. Diferente
   *  do emojiMeu, esta é uma convenção do TIME — qualquer um que reagir com ela
   *  move o card. Vazio desliga a coluna. */
  emojiFazendo: string;
}

export interface RespostaConsumo {
  usuario: string;
  estimativa: Estimativa | null;
  totais: TotaisDeConsumo;
  preferencias: Preferencias;
  /** Quem lê o Teams nesta instalação. `reportaCusto` falso esconde preço da
   *  tela: agente que não informa gasto não pode aparecer com zero dólar. */
  agente: AgenteEmUso;
}

export interface ResultadoSync extends RespostaTasks {
  ok: boolean;
  novos: string[];
  mudaram: string[];
  retomadas: string[];
  /** Ganharam a marca "feito por mim" pela sua reação nesta leitura. */
  marcados: string[];
  /** Cards que ganharam mensagens novas da mesma rajada — o autor continuou
   *  escrevendo depois da última leitura. */
  cresceram: string[];
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

// ------------------------------------------------------------------- sprints

/** Um ciclo com começo e fim. Existe para que "concluído" possa ser zerado de
 *  vez em quando: um quadro que acumula seis meses de check não serve para
 *  olhar. Quem não trabalha em sprint usa isso como o período que fecha. */
export interface Sprint {
  nome: string;
  /** Dia local, no formato ano-mês-dia. */
  inicio: string;
  fim: string;
  dias: number;
  criadaEm: string;
}

export interface SprintEncerrada extends Sprint {
  encerradaEm: string;
  /** Quantos cards foram para o arquivo desta sprint. */
  arquivadas: number;
}

export interface RespostaSprint {
  atual: Sprint | null;
  encerradas: SprintEncerrada[];
}

export interface ResultadoEncerramento extends RespostaTasks {
  arquivadas: number;
  sprints: RespostaSprint;
}

// ------------------------------------------------------------------- painéis

export interface TagComContagem {
  tag: string;
  quantas: number;
}

export interface LinhaDeSprint {
  nome: string;
  inicio: string;
  fim: string;
  atual: boolean;
  encerradaEm: string | null;
  arquivadas: number;
  chegaram: number;
  bugs: number;
  sugestoes: number;
  concluidas: number;
  minhas: number;
  ignoradas: number;
  emAberto: number;
  /** Quantas mensagens do Teams os cards desta sprint somam. A distância entre
   *  isso e 'chegaram' é o tamanho do ruído que o agrupamento absorveu. */
  mensagens: number;
}

export interface ItemDaDaily {
  id: string;
  summary: string;
  kind: 'bug' | 'sugestao';
  solucao: string;
  em: string;
  via: 'emoji' | 'mao';
  status: Status;
  origem: 'teams' | 'manual';
  autor: string;
  arquivada: boolean;
  sprint: string | null;
  mensagens: number;
  webUrl: string;
}

export interface DiaDaDaily {
  /** Dia local, no formato ano-mês-dia. */
  dia: string;
  itens: ItemDaDaily[];
}

export interface LinhaDeTag {
  tag: string;
  total: number;
  concluidas: number;
  abertas: number;
}

export interface RespostaPainel {
  /** As tags atravessam sprint: a pergunta "quanto de Financeiro chegou" não se
   *  responde olhando uma coluna do quadro. */
  tags: LinhaDeTag[];
  sprints: LinhaDeSprint[];
  /** O que chegou fora de qualquer sprint — histórico anterior ao ciclo. */
  foraDeSprint: { chegaram: number; bugs: number; concluidas: number } | null;
  daily: {
    porDia: DiaDaDaily[];
    total: number;
    bugs: number;
    diasAtivos: number;
    arquivadas: number;
  };
}

// ------------------------------------------------------------------- agentes

/** O Mural não fala com o Teams: ele pede a um agente de IA já autenticado que
 *  leia a conversa e grave um snapshot. Qual agente é isso — Claude Code,
 *  Codex, Gemini CLI ou outro — é escolha de quem instala. */
export type IdDeAgente = 'claude' | 'codex' | 'gemini' | 'personalizado';

export type FormatoDeEventos = 'claude' | 'codex' | 'nenhum';

/** Os nomes das tools que o agente usa para ler o Teams, e o molde do endereço
 *  das mensagens. Isto é vocabulário do MCP instalado no agente, não do Mural:
 *  o conector da claude.ai chama a leitura de uma coisa, outro MCP chama de
 *  outra — e é por isso que estes campos são editáveis. */
export interface FerramentasDoAgente {
  conta: string;
  chats: string;
  leitura: string;
  escrita: string;
  uriCanal: string;
  uriChat: string;
}

export interface AgenteDisponivel {
  id: IdDeAgente;
  nome: string;
  /** Só o adaptador do Claude Code foi verificado de verdade; os outros vão com
   *  as flags que a documentação deles descreve. A tela precisa dizer isso. */
  verificado: boolean;
  /** Você já corrigiu algum campo deste agente à mão. */
  ajustado: boolean;
  reportaCusto: boolean;
  requisitos: string;
  binario: string;
  argumentos: string;
  entrada: 'stdin' | 'arg';
  eventos: FormatoDeEventos;
  ferramentas: FerramentasDoAgente;
  /** null = ainda não detectado. Responder `--version` não prova que o MCP do
   *  Teams está configurado ali: isso só o passo da conta descobre. */
  instalado: boolean | null;
  versao: string;
  erro: string;
}

export interface RespostaAgentes {
  ok: boolean;
  escolhido: IdDeAgente;
  agentes: AgenteDisponivel[];
  erro?: string;
}

export interface AjustesDoAgente {
  binario?: string;
  argumentos?: string;
  entrada?: 'stdin' | 'arg';
  eventos?: FormatoDeEventos;
  ferramentas?: Partial<FerramentasDoAgente>;
}

export interface AgenteEmUso {
  id: IdDeAgente;
  nome: string;
  reportaCusto: boolean;
}

