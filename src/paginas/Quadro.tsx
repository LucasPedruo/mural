import { DragDropContext, Droppable, type DropResult } from '@hello-pangea/dnd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '../api';
import { BarraDeSync } from '../componentes/BarraDeSync';
import { Coluna, TIPO_COLUNA, type GrupoDaColuna } from '../componentes/Coluna';
import {
  ConfirmarAtualizacao,
  formatarTokens,
  formatarUsd,
} from '../componentes/ConfirmarAtualizacao';
import { DialogoDeColuna } from '../componentes/DialogoDeColuna';
import {
  DialogoDeConfirmacao,
  type PedidoDeConfirmacao,
} from '../componentes/DialogoDeConfirmacao';
import { DialogoDeEmojis } from '../componentes/DialogoDeEmojis';
import { DialogoDeFeitoPorOutro } from '../componentes/DialogoDeFeitoPorOutro';
import { DialogoDeSolucao } from '../componentes/DialogoDeSolucao';
import { DialogoDeTags } from '../componentes/DialogoDeTags';
import { FiltroDoQuadro } from '../componentes/FiltroDoQuadro';
import { Notificacoes } from '../componentes/Notificacoes';
import { Toasts } from '../componentes/Toasts';
import { IconeApagar, IconeEditar, IconeMais, IconeVoltar } from '../componentes/icones';
import {
  COLUNAS,
  CORES_DE_STATUS,
  dataDoDiaISO,
  diaLocal,
  rotuloDaColuna,
  rotuloDoDia,
} from '../rotulos';
import type {
  ColunaId,
  ColunaPersonalizada,
  CorDeColuna,
  Mural,
  Notificacao,
  Progresso,
  RespostaConsumo,
  RespostaSprint,
  Status,
  TagComContagem,
  Task,
} from '../tipos';
import './quadro.css';

/** O que uma coluna vazia diz.
 *
 *  Uma linha, e curta: a coluna tem 232px, e o vazio é uma legenda, não uma
 *  aula. Diz o estado, não o mecanismo — quem quer saber como um card chega ali
 *  descobre no menu do card, não numa coluna sem nada dentro.
 *
 *  Sem ponto final, sem instrução, sem exclamação. */
function vazioDaColuna(coluna: ColunaId, emojiMeu: string, emojiFazendo: string): string {
  switch (coluna) {
    case 'aberto':
      return 'Tudo já teve resposta';
    case 'fazendo':
      return emojiFazendo ? 'Ninguém pegou nada' : 'Sem emoji definido';
    case 'interagido':
      return 'Nenhuma reação ainda';
    case 'feito':
      return 'Nada concluído';
    case 'meu':
      return emojiMeu ? 'Nada seu ainda' : 'Marque um card com "Fiz esta"';
    case 'ignorada':
      return 'Nada descartado';
  }
}

export function Quadro() {
  const { muralId = '' } = useParams();
  const navegar = useNavigate();

  const [mural, setMural] = useState<Mural | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  // O que cada leitura deixou para contar. Antes isto era uma string que vivia
  // na linha de "última leitura" e sumia na ação seguinte — e o que some sozinho
  // não dá para reler depois de "espera, quanto custou mesmo?". Agora acumula,
  // por mural, no navegador: é relato da sua sessão, não dado do quadro.
  const chaveNotificacoes = `mural:notificacoes:${muralId}`;
  const chaveLidas = `mural:notificacoes-lidas:${muralId}`;

  const [notificacoes, setNotificacoes] = useState<Notificacao[]>(() => {
    try {
      const salvas = JSON.parse(localStorage.getItem(chaveNotificacoes) || '[]');
      return Array.isArray(salvas) ? (salvas as Notificacao[]) : [];
    } catch {
      return [];
    }
  });
  const [lidasEm, setLidasEm] = useState<string>(
    () => localStorage.getItem(chaveLidas) || '',
  );
  const [erro, setErro] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);

  // "Novo" e "mudou" são relativos à sua última visita a este mural. O valor é
  // lido uma vez, na montagem, e não muda enquanto a aba está aberta: os selos
  // precisam ficar de pé durante a visita inteira, senão desapareceriam no meio
  // da leitura. Quem grava a visita nova é o efeito abaixo, na saída.
  const chaveVisto = `mural:ultima-visita:${muralId}`;
  const [ultimaVisita] = useState<string | null>(() => localStorage.getItem(chaveVisto));

  const [consumo, setConsumo] = useState<RespostaConsumo | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const [anotando, setAnotando] = useState<Task | null>(null);
  const [creditando, setCreditando] = useState<Task | null>(null);

  const [sprint, setSprint] = useState<RespostaSprint | null>(null);

  // As colunas que você criou. Diferente das seis, elas não têm regra: quem põe
  // card ali é você, arrastando. Moram no servidor porque são do quadro — a
  // ordem e o colapso, que são de tela, continuam no navegador.
  const [colunasSuas, setColunasSuas] = useState<ColunaPersonalizada[]>([]);
  const [editandoColuna, setEditandoColuna] = useState<ColunaPersonalizada | null>(null);
  const [criandoColuna, setCriandoColuna] = useState(false);

  // As reações que decidem a coluna. As duas se editam no mesmo diálogo, aberto
  // por qualquer um dos dois cabeçalhos: escolher uma sem ver a outra é o que
  // fazia a regra de "não podem ser iguais" chegar como erro em vez de contexto.
  const [editandoEmojis, setEditandoEmojis] = useState(false);
  // O que se pergunta antes de apagar. Um estado só: apagar um card e excluir
  // uma coluna nunca acontecem ao mesmo tempo.
  const [pedido, setPedido] = useState<PedidoDeConfirmacao | null>(null);
  const [checks, setChecks] = useState<string[]>([]);


  // Etiquetas: as do mural (para reaproveitar em vez de redigitar), a task que
  // está sendo etiquetada e o filtro ligado.
  const [tags, setTags] = useState<TagComContagem[]>([]);
  const [etiquetando, setEtiquetando] = useState<Task | null>(null);
  const [tagFiltro, setTagFiltro] = useState<string | null>(null);

  // Filtro por quem pediu. Sai das tasks carregadas, não de uma rota: o autor já
  // vem em cada card, e uma volta ao servidor para descobrir o que está na tela
  // seria trabalho para saber o que já se sabe.
  const [autorFiltro, setAutorFiltro] = useState<string | null>(null);

  // Cards recolhidos, por mural. Recolher é sobre o que você quer ver agora, não
  // sobre a task — então é preferência de tela, e mora no navegador.
  // O aviso de "fora de alcance" guarda QUANTAS tasks havia quando você o
  // fechou, não um sim/não. Assim ele não volta a incomodar pelas mesmas 23 que
  // você já conhece, mas reaparece quando a 24ª sai da janela — que é a única
  // hora em que ele tem algo novo a dizer.
  // A ordem das colunas é sua. O que fica guardado é validado na leitura: uma
  // versão nova do Mural pode ter coluna que a ordem salva não conhece (e
  // vice-versa), e uma lista desatualizada no navegador não pode fazer coluna
  // desaparecer do quadro.
  const chaveOrdem = `mural:ordem-das-colunas:${muralId}`;
  const [ordem, setOrdem] = useState<string[]>(() => {
    try {
      const salva = JSON.parse(localStorage.getItem(chaveOrdem) || '[]') as string[];
      return Array.isArray(salva) ? salva : [];
    } catch {
      return [];
    }
  });

  const chaveAvisoFora = `mural:aviso-fora-de-alcance:${muralId}`;
  const [foraCiente, setForaCiente] = useState(
    () => Number(localStorage.getItem(chaveAvisoFora)) || 0,
  );

  const chaveCards = `mural:cards-colapsados:${muralId}`;
  const [cardsColapsados, setCardsColapsados] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(chaveCards) || '[]') as string[]);
    } catch {
      return new Set<string>();
    }
  });

  // Qualquer coluna pode ser colapsada: quem trabalha por sprint não olha
  // "Em atendimento" toda hora, e quem só quer ver o que está em aberto fecha o
  // resto. A coluna fechada continua recebendo cards arrastados — é o gesto de
  // guardar sem abrir.
  //
  // *Fora do escopo* nasce colapsada: ela é onde se põe o que não se quer ver, e
  // aberta por padrão roubaria largura das colunas que são trabalho.
  const chaveColapsadas = `mural:colunas-colapsadas:${muralId}`;
  const [colapsadas, setColapsadas] = useState<Set<string>>(() => {
    const salvo = localStorage.getItem(chaveColapsadas);
    if (!salvo) return new Set<string>(['ignorada']);
    try {
      return new Set<string>(JSON.parse(salvo) as string[]);
    } catch {
      return new Set<string>(['ignorada']);
    }
  });

  // Seleção do "juntar". Vazia = modo desligado, e o clique no card volta a
  // abrir o Teams. Um Set porque a ordem não importa: a âncora do card juntado
  // é sempre a mensagem mais antiga, não a primeira que você clicou.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    try {
      const [tarefas, info, custo, ciclo, etiquetas, suas, prefs] = await Promise.all([
        api.tasks(muralId),
        api.lerMural(muralId),
        api.consumo(muralId),
        api.sprint(muralId),
        api.tags(muralId),
        api.colunas(muralId),
        api.preferencias(),
      ]);
      setChecks(prefs.checks);
      setColunasSuas(suas.colunas);
      setTags(etiquetas.tags);
      setMural(info.mural);
      setTasks(tarefas.tasks);
      setLastSync(tarefas.lastSync);
      setConsumo(custo);
      setSprint(ciclo);
      document.title = `${info.mural.nome} · Mural`;
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [muralId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Sair do mural é o que marca como visto. Antes havia um botão para isso, mas
  // pedir um clique para dizer "eu li" é trabalho que o próprio ato de sair já
  // informa. O evento pagehide cobre fechar a aba; o cleanup cobre voltar para a home.
  useEffect(() => {
    const marcarVisto = () => localStorage.setItem(chaveVisto, new Date().toISOString());
    window.addEventListener('pagehide', marcarVisto);
    return () => {
      marcarVisto();
      window.removeEventListener('pagehide', marcarVisto);
    };
  }, [chaveVisto]);

  // ---- notificações ----------------------------------------------------

  // O teto existe para o histórico não virar um arquivo: trinta leituras é bem
  // mais do que alguém rola, e o navegador não é onde se guarda registro.
  const MAX_NOTIFICACOES = 30;

  // Os que estão aparecendo no canto agora. Só entram os que NASCEM nesta
  // sessão: os que vieram do disco já foram vistos quando aconteceram, e
  // despejar dez toasts ao abrir o quadro seria contar de novo o que já passou.
  const [toasts, setToasts] = useState<Notificacao[]>([]);

  function gravarNotificacoes(proximas: Notificacao[]) {
    localStorage.setItem(chaveNotificacoes, JSON.stringify(proximas));
    return proximas;
  }

  const avisar = useCallback(
    (texto: string, tom: Notificacao['tom'] = 'info') => {
      const nova: Notificacao = {
        // O instante já identifica: duas leituras não terminam no mesmo
        // milissegundo, e o sufixo cobre o empate improvável sem inventar uuid.
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        em: new Date().toISOString(),
        tom,
        texto,
      };
      setNotificacoes((atuais) => {
        const proximas = [nova, ...atuais].slice(0, MAX_NOTIFICACOES);
        localStorage.setItem(chaveNotificacoes, JSON.stringify(proximas));
        return proximas;
      });
      // Guardar sem contar faria você descobrir o resultado de uma leitura de
      // dois minutos só se lembrasse de abrir o sino. Três é o teto: uma pilha
      // maior que isso deixa de ser aviso e vira parede.
      setToasts((atuais) => [nova, ...atuais].slice(0, 3));
    },
    [chaveNotificacoes],
  );

  function fecharToast(id: string) {
    setToasts((atuais) => atuais.filter((t) => t.id !== id));
  }

  function marcarNotificacoesLidas() {
    const agora = new Date().toISOString();
    localStorage.setItem(chaveLidas, agora);
    setLidasEm(agora);
  }

  // A sua nota sobre uma leitura: o texto do item conta o que aconteceu, ela
  // conta o que aquilo significou. Nota vazia apaga o campo em vez de guardar
  // string vazia — o histórico não precisa registrar que você desistiu.
  function anotarNotificacao(id: string, nota: string) {
    const limpa = nota.trim();
    setNotificacoes((atuais) =>
      gravarNotificacoes(
        atuais.map((n) => (n.id === id ? { ...n, nota: limpa || undefined } : n)),
      ),
    );
  }

  function removerNotificacao(id: string) {
    setNotificacoes((atuais) => gravarNotificacoes(atuais.filter((n) => n.id !== id)));
  }

  // Limpar leva só o que você NÃO anotou. Nota é trabalho seu, e um botão
  // chamado "limpar" não pode descartar trabalho por tabela — o que tem nota
  // sai uma a uma, pelo ícone do item.
  function limparNotificacoes() {
    setNotificacoes((atuais) => gravarNotificacoes(atuais.filter((n) => n.nota)));
  }

  const naoLidas = notificacoes.filter((n) => n.em > lidasEm).length;

  // ---- progresso ao vivo -----------------------------------------------

  const timer = useRef<number | null>(null);

  const acompanhar = useCallback(() => {
    if (timer.current !== null) return;
    timer.current = window.setInterval(async () => {
      try {
        const estado = await api.estadoSync();
        setProgresso(estado.progresso);
        if (!estado.syncing) pararDeAcompanhar();
      } catch {
        /* servidor fora: o erro da acao principal ja aparece na tela */
      }
    }, 1000);
  }, []);

  const pararDeAcompanhar = () => {
    if (timer.current !== null) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setProgresso(null);
  };

  useEffect(() => pararDeAcompanhar, []);

  // Recarregar a pagina no meio de uma atualizacao nao pode fingir que nada
  // esta acontecendo: o quadro reencontra o processo em andamento.
  useEffect(() => {
    void (async () => {
      try {
        const estado = await api.estadoSync();
        if (estado.syncing && estado.muralSincronizando === muralId) {
          setSincronizando(true);
          acompanhar();
        }
      } catch { /* sem servidor, carregar() ja mostrou o erro */ }
    })();
  }, [muralId, acompanhar]);

  useEffect(() => {
    if (!sincronizando && timer.current === null) void carregar();
  }, [sincronizando, carregar]);

  // Gastar dinheiro sem avisar nao pode ser o padrao: a confirmacao so e
  // pulada se a pessoa desmarcou explicitamente.
  async function pedirAtualizacao() {
    const atual = consumo ?? (await api.consumo(muralId).catch(() => null));
    if (atual) setConsumo(atual);
    // Agente que não informa custo não tem o que confirmar: o diálogo existe
    // para perguntar antes de gastar, e um diálogo que diz "não sei quanto
    // custa" só adiciona um clique.
    const temCusto = atual?.agente?.reportaCusto !== false;
    if (temCusto && atual?.preferencias.confirmarAntesDeAtualizar !== false) {
      setConfirmando(true);
      return;
    }
    void atualizar();
  }

  async function confirmar(naoPerguntarDeNovo: boolean) {
    setConfirmando(false);
    if (naoPerguntarDeNovo) {
      try {
        await api.salvarPreferencias({ confirmarAntesDeAtualizar: false });
        setConsumo((c) =>
          c
            ? { ...c, preferencias: { ...c.preferencias, confirmarAntesDeAtualizar: false } }
            : c,
        );
      } catch {
        /* falhar em salvar a preferencia nao pode impedir a atualizacao */
      }
    }
    void atualizar();
  }

  async function atualizar() {
    setSincronizando(true);
    setErro(null);
    setProgresso({ etapa: 'iniciando o Claude', lidas: 0, total: 20, segundos: 0 });
    acompanhar();
    try {
      const r = await api.sincronizar(muralId);
      setTasks(r.tasks);
      setLastSync(r.lastSync);

      const partes: string[] = [];
      if (r.novos.length) partes.push(`${r.novos.length} nova(s)`);
      if (r.mudaram.length) partes.push(`${r.mudaram.length} mudou/mudaram de status`);
      // Uma task movida a mao que reapareceu no Teams volta a obedecer a reacao
      // real; avisar evita a impressao de que o quadro desfez a acao sozinho.
      if (r.retomadas.length) {
        partes.push(`${r.retomadas.length} voltou ao Teams e teve o status corrigido`);
      }
      // A marca automática move card de coluna sozinha; dizer quantas foram
      // evita a impressão de que o quadro perdeu tasks da coluna do Teams.
      if (r.marcados.length) {
        partes.push(
          `${r.marcados.length} ${r.marcados.length === 1 ? 'foi' : 'foram'} para Concluído por mim`,
        );
      }
      // Uma rajada pode continuar depois da leitura: o autor manda mais uma
      // linha e o card cresce em vez de nascer outro. Sem avisar, o quadro
      // parece não ter visto a mensagem nova.
      if (r.cresceram?.length) {
        partes.push(
          `${r.cresceram.length} ganhou/ganharam mensagem nova da mesma rajada`,
        );
      }
      // O custo real desta execução entra no resumo: a estimativa foi mostrada
      // antes, e ver o valor cobrado é o que torna a próxima estimativa crível.
      if (r.consumo) {
        partes.push(
          r.consumo.custoUsd === null
            ? `${formatarTokens(r.consumo.tokensTotal)} tokens`
            : `custou ${formatarUsd(r.consumo.custoUsd)} · ${formatarTokens(r.consumo.tokensTotal)} tokens`,
        );
      }
      avisar(partes.length ? partes.join(', ') : 'nada mudou');
      void api.consumo(muralId).then(setConsumo).catch(() => {});
    } catch (e) {
      // Só na notificação. A falha da leitura é a única coisa nesta tela que já
      // tem outro lugar para morar, e o contador do sino acende ao lado do botão
      // que você acabou de clicar — a faixa vermelha repetiria, dois centímetros
      // abaixo, o que o sino já está dizendo.
      //
      // Os outros erros continuam na faixa: "não dá para mover este card" existe
      // para explicar o gesto que acabou de voltar atrás, e explicação de gesto
      // atrasada por um clique no sino não explica nada.
      avisar(`a leitura do Teams falhou: ${(e as Error).message}`, 'erro');
    } finally {
      pararDeAcompanhar();
      setSincronizando(false);
    }
  }

  // ---- marca da daily --------------------------------------------------

  async function salvarSolucao(solucao: string) {
    const task = anotando;
    setAnotando(null);
    if (!task) return;
    setErro(null);
    try {
      const r = await api.marcarComoMeu(muralId, task.id, solucao);
      setTasks(r.tasks);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // ---- crédito a outra pessoa ------------------------------------------

  // O mesmo gesto do "fiz esta", virado para fora. Pela mesma razão de ser
  // manual: o Graph conta que alguém reagiu com o check, nunca quem — então o
  // nome de quem resolveu só existe se alguém escrever.
  async function salvarCredito(quem: string, solucao: string) {
    const task = creditando;
    setCreditando(null);
    if (!task) return;
    setErro(null);
    try {
      const r = await api.marcarFeitoPorOutro(muralId, task.id, quem, solucao);
      setTasks(r.tasks);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function tirarCredito(task: Task) {
    setErro(null);
    try {
      const r = await api.desmarcarFeitoPorOutro(muralId, task.id);
      setTasks(r.tasks);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // As duas reações que o quadro entende. Eram dois `window.prompt`, um em cada
  // cabeçalho de coluna: sem sugestão, sem ver a outra, e com a regra de que não
  // podem ser iguais aparecendo só depois, como erro. Agora as duas moram no
  // mesmo diálogo — que é como a escolha realmente se faz.
  //
  // Devolve a mensagem de recusa em vez de lançar: quem valida é o servidor, e a
  // regra ("não pode ser o check, não pode ser a outra") é dele porque é ela que
  // decide a coluna de cada card.
  async function salvarEmojis(quais: {
    emojiFazendo?: string;
    emojiMeu?: string;
  }): Promise<string | null> {
    try {
      const r = await api.salvarPreferencias(quais);
      setConsumo((c) => (c ? { ...c, preferencias: r.preferencias } : c));
      // A regra de status mudou: o quadro relê para os cards caírem na coluna
      // certa sem esperar a próxima leitura do Teams.
      if (quais.emojiFazendo !== undefined) await carregar();
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }


  async function desmarcar(task: Task) {
    setErro(null);
    try {
      const r = await api.desmarcarComoMeu(muralId, task.id);
      setTasks(r.tasks);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // ---- marcas pessoais: etiquetar, ignorar, apagar ---------------------

  async function salvarTags(novas: string[]) {
    const task = etiquetando;
    setEtiquetando(null);
    if (!task) return;
    setErro(null);
    try {
      const r = await api.salvarTags(muralId, task.id, novas);
      setTasks(r.tasks);
      setTags(r.tags);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function ignorar(task: Task, marcar: boolean) {
    setErro(null);
    try {
      const r = await api.ignorar(muralId, task.id, marcar);
      setTasks(r.tasks);
      // Ignorar com a coluna fechada faria o card desaparecer sem explicação: ela
      // abre uma vez, para você ver onde ele foi.
      if (marcar) colapsar('ignorada', false);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function apagar(task: Task) {
    setPedido({
      titulo: 'Apagar de vez?',
      rotulo: 'Apagar de vez',
      perigo: true,
      corpo: (
        <>
          {/* O texto do card na pergunta, e não só o título do diálogo: com o
              card já sumindo atrás do modal, é a última chance de conferir que
              o que vai embora é o que você acha que é. */}
          <p className="citacao-do-card">{task.summary}</p>
          <p>
            O card sai do histórico e a mensagem entra na lista de arquivados: nenhuma atualização
            vai trazê-la de volta, mesmo que ela continue no Teams.
          </p>
          <p>
            <strong>Isto não tem como desfazer pela interface.</strong>
          </p>
        </>
      ),
      aoConfirmar: () => void apagarMesmo(task),
    });
  }

  async function apagarMesmo(task: Task) {
    setErro(null);
    try {
      const r = await api.apagar(muralId, task.id);
      setTasks(r.tasks);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function reordenarColunas(de: number, para: number) {
    const nova = [...todasAsColunas];
    const [movida] = nova.splice(de, 1);
    nova.splice(para, 0, movida);
    localStorage.setItem(chaveOrdem, JSON.stringify(nova));
    setOrdem(nova);
  }

  // ---- colunas suas ----------------------------------------------------

  async function salvarColuna(dados: { nome: string; cor: CorDeColuna }) {
    const alvo = editandoColuna;
    setEditandoColuna(null);
    setCriandoColuna(false);
    setErro(null);
    try {
      const r = await api.salvarColuna(muralId, { ...dados, id: alvo?.id });
      setColunasSuas(r.colunas);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // Excluir leva os cards junto, e não tem volta: eles saem do arquivo e as
  // mensagens entram na lista de arquivados, para nenhuma leitura futura as
  // ressuscitar. Por isso o número vai na frente, na pergunta.
  function excluirColuna(coluna: ColunaPersonalizada) {
    const dentro = tasks.filter((t) => t.coluna === coluna.id).length;
    setPedido({
      titulo: `Excluir a coluna "${coluna.nome}"?`,
      rotulo: dentro === 0 ? 'Excluir a coluna' : `Excluir e apagar ${dentro}`,
      perigo: dentro > 0,
      corpo:
        dentro === 0 ? (
          <p>Ela está vazia — nenhum card é afetado.</p>
        ) : (
          <>
            <p>
              Os <strong>{dentro}</strong> card(s) que estão nela são <strong>apagados</strong>{' '}
              junto, de vez.
            </p>
            <p>
              Eles saem do histórico e as mensagens entram na lista de arquivados: nenhuma
              atualização vai trazê-las de volta, mesmo que continuem no Teams.
            </p>
            <p>
              <strong>Isto não tem como desfazer pela interface.</strong>
            </p>
          </>
        ),
      aoConfirmar: () => void excluirColunaMesmo(coluna),
    });
  }

  async function excluirColunaMesmo(coluna: ColunaPersonalizada) {
    setErro(null);
    try {
      const r = await api.excluirColuna(muralId, coluna.id);
      setColunasSuas(r.colunas);
      setTasks(r.tasks);
      if (r.apagadas > 0) {
        avisar(`coluna "${r.nome}" excluída — ${r.apagadas} card(s) apagados junto`);
      }
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // Soltar o card de volta ao fluxo do Teams. Não precisa de nova leitura: o
  // `status` nunca parou de ser atualizado por baixo enquanto ele estava preso.
  async function soltarDaColuna(task: Task) {
    setErro(null);
    try {
      const r = await api.prenderNaColuna(muralId, task.id, null);
      setTasks(r.tasks);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function fecharAvisoFora(quantas: number) {
    localStorage.setItem(chaveAvisoFora, String(quantas));
    setForaCiente(quantas);
  }

  function colapsarCartao(task: Task, fechar: boolean) {
    setCardsColapsados((atual) => {
      const proximo = new Set(atual);
      if (fechar) proximo.add(task.id);
      else proximo.delete(task.id);
      localStorage.setItem(chaveCards, JSON.stringify([...proximo]));
      return proximo;
    });
  }

  function colapsar(coluna: string, fechar: boolean) {
    setColapsadas((atual) => {
      const proximo = new Set(atual);
      if (fechar) proximo.add(coluna);
      else proximo.delete(coluna);
      localStorage.setItem(chaveColapsadas, JSON.stringify([...proximo]));
      return proximo;
    });
  }

  // ---- rajadas: juntar e separar ---------------------------------------

  // O agrupamento automático erra em alguns casos — e card errado que não dá
  // para consertar é pior que card errado. Estes dois gestos são a saída, e o
  // que eles decidem nenhuma atualização desfaz.
  function alternarSelecao(task: Task) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(task.id)) proximo.delete(task.id);
      else proximo.add(task.id);
      return proximo;
    });
  }

  async function juntarSelecionadas() {
    const ids = [...selecionados];
    if (ids.length < 2) return;
    setErro(null);
    try {
      const r = await api.juntar(muralId, ids);
      setTasks(r.tasks);
      setSelecionados(new Set());
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function separar(task: Task) {
    setErro(null);
    try {
      const r = await api.separar(muralId, task.id);
      setTasks(r.tasks);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // ---- drag ------------------------------------------------------------

  async function aoSoltar(resultado: DropResult) {
    const destino = resultado.destination;
    if (!destino) return;

    // Coluna e card viajam no mesmo DragDropContext, separados por `type`. Sem
    // este desvio, arrastar uma coluna cairia na lógica de mover task.
    if (resultado.type === TIPO_COLUNA) {
      if (destino.index !== resultado.source.index) {
        reordenarColunas(resultado.source.index, destino.index);
      }
      return;
    }

    const coluna = destino.droppableId;
    const task = tasks.find((t) => t.id === resultado.draggableId);
    if (!task) return;

    // Uma coluna sua é o único destino que aceita QUALQUER card — inclusive o
    // que o Teams ainda acompanha. É a diferença que a torna útil: prender ali
    // é dizer "este saiu do fluxo do canal por enquanto". O `status` continua
    // sendo atualizado por baixo, então soltar devolve o card na hora.
    if (colunasSuas.some((c) => c.id === coluna)) {
      if (task.coluna === coluna) return;
      setErro(null);
      const antes = tasks;
      setTasks((atual) =>
        atual.map((t) => (t.id === task.id ? { ...t, coluna, ignorada: null } : t)),
      );
      try {
        const r = await api.prenderNaColuna(muralId, task.id, coluna);
        setTasks(r.tasks);
      } catch (e) {
        setTasks(antes);
        setErro((e as Error).message);
      }
      return;
    }

    // Saindo de uma coluna sua para uma das seis: solta primeiro, senão ele
    // voltaria sozinho no render seguinte. Se o destino for a coluna que a
    // reação já manda, soltar é tudo o que precisa acontecer.
    if (task.coluna) {
      await soltarDaColuna(task);
      if (coluna !== 'meu' && coluna !== 'ignorada' && (!task.podeMover || task.status === coluna)) {
        return;
      }
    }

    // Soltar na coluna da daily não muda o status: abre a anotação. É a mesma
    // coisa que o botão "fiz" do card faz, só que pelo gesto.
    if (coluna === 'meu') {
      if (!task.meu) setAnotando(task);
      return;
    }

    // Ignorar é uma decisão, não um status: soltar aqui só marca, sem tocar no
    // Teams.
    if (coluna === 'ignorada') {
      if (!task.ignorada) await ignorar(task, true);
      return;
    }

    // Saindo das ignoradas: a marca sai e o card volta para a coluna que a
    // reação manda. Se ele for móvel e você largou noutra coluna, a mudança de
    // status vai junto.
    if (task.ignorada) {
      await ignorar(task, false);
      if (!task.podeMover || task.status === coluna) return;
    }

    // "Em atendimento" não é um destino: não existe emoji que signifique isso. É o
    // que sobra quando alguém reage com outra coisa.
    if (coluna === 'interagido') {
      setErro(
        '"Em atendimento" não é um estado que se escolhe: é o que sobra quando alguém reage com ' +
          'outra coisa na mensagem. Arraste para Backlog, Em andamento ou Concluído.',
      );
      return;
    }

    // Quem põe o card em "Concluído" pode ser o crédito, não o
    // Teams. Soltá-lo na mesma coluna não muda nada; sair de lá exige tirar o
    // crédito primeiro, senão ele voltaria sozinho no render seguinte.
    if (task.feitoPor) {
      if (coluna === 'feito') return;
      await tirarCredito(task);
      if (!task.podeMover || task.status === coluna) return;
    }

    // Saindo da daily: a marca sai e o card volta para a coluna que o Teams
    // manda. Se ele for móvel e você largou noutra coluna, a mudança de status
    // vai junto.
    if (task.meu) {
      await desmarcar(task);
      if (!task.podeMover || task.status === coluna) return;
    }

    if (task.status === coluna) return;

    // Otimista: o card muda de coluna na hora e o servidor confirma. Se ele
    // recusar, o estado volta ao que era e o motivo aparece na tela.
    const anterior = tasks;
    setTasks((atual) =>
      atual.map((t) =>
        t.id === task.id ? { ...t, status: coluna as Status, movidoAMao: true } : t,
      ),
    );
    setErro(null);

    try {
      const r = await api.mover(muralId, task.id, coluna as Status);
      setTasks(r.tasks);
    } catch (e) {
      setTasks(anterior);
      setErro((e as Error).message);
    }
  }

  // Card do Teams abre a mensagem original. Card `manual` — resquício de quando
  // dava para criar task aqui dentro — não tem mensagem para abrir, e dizer isso
  // é melhor que mandar o Teams procurar um id que ele nunca viu.
  async function abrir(task: Task) {
    if (task.origem === 'manual') {
      setErro(
        'Esta task foi criada à mão numa versão anterior do Mural: ela não tem mensagem no ' +
          'Teams para abrir. Você ainda pode arrastá-la entre as colunas.',
      );
      return;
    }
    try {
      await api.abrirNoTeams(muralId, task.id);
      setErro(null);
    } catch (e) {
      setErro(
        'Não consegui abrir o Teams: ' + (e as Error).message + ' — use o atalho "web" no card.',
      );
    }
  }

  // ---- render ----------------------------------------------------------

  // Card marcado como seu sai da coluna do Teams: o status real continua no
  // dado (e visível como badge no card), mas o card mora numa coluna só —
  // senão a mesma task apareceria duas vezes no quadro.
  // Todas as colunas do quadro, na sua ordem. O que está salvo é validado na
  // leitura: uma coluna sua pode ter sido excluída noutra aba, e uma lista velha
  // no navegador não pode fazer coluna desaparecer nem ressuscitar.
  const todasAsColunas = useMemo(() => {
    const ids = [...COLUNAS, ...colunasSuas.map((c) => c.id)] as string[];
    const conhecidas = ordem.filter((c) => ids.includes(c));
    return [...conhecidas, ...ids.filter((c) => !conhecidas.includes(c))];
  }, [ordem, colunasSuas]);

  const grupos = useMemo(() => {
    const porColuna: Record<string, Task[]> = {
      aberto: [], fazendo: [], interagido: [], feito: [], meu: [], ignorada: [],
    };
    for (const c of colunasSuas) porColuna[c.id] = [];
    // Os filtros cortam o quadro inteiro: as perguntas que eles respondem — "o
    // que existe de Financeiro", "o que o Bernardo pediu" — não têm coluna.
    const visiveis = tasks.filter(
      (t) =>
        (!tagFiltro || t.tags.some((x) => x.toLowerCase() === tagFiltro)) &&
        (!autorFiltro || t.author === autorFiltro),
    );

    for (const t of visiveis) {
      // Ignorada vence a marca de "fiz": se você decidiu que não é sua, ela não
      // aparece na daily por causa de um clique antigo.
      if (t.ignorada) porColuna.ignorada.push(t);
      // Preso numa coluna sua: vence a regra do Teams, porque foi um gesto seu e
      // mais recente que qualquer reação. Se a coluna não existe mais — excluída
      // noutra aba — o card volta a valer pelo status, em vez de sumir da tela.
      else if (t.coluna && porColuna[t.coluna]) porColuna[t.coluna].push(t);
      else if (t.meu) porColuna.meu.push(t);
      // Creditada a outra pessoa mora em "Concluído" mesmo que o
      // check ainda não tenha aparecido no Teams: alguém disse aqui que está
      // feita, e é isso que a coluna significa. O `status` real continua no
      // dado — a marca move o card, não reescreve o que o canal disse.
      else if (t.feitoPor) porColuna.feito.push(t);
      else (porColuna[t.status] ?? porColuna.aberto).push(t);
    }
    porColuna.ignorada.sort((a, b) => (b.ignorada ?? '').localeCompare(a.ignorada ?? ''));

    // Abertas: mais antigas primeiro — o que está parado há mais tempo sobe.
    porColuna.aberto.sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime));
    for (const k of ['fazendo', 'interagido', 'feito'] as const) {
      porColuna[k].sort((a, b) => b.statusChangedAt.localeCompare(a.statusChangedAt));
    }
    // Na daily o mais recente é o que você conta primeiro.
    porColuna.meu.sort((a, b) => (b.meu?.em ?? '').localeCompare(a.meu?.em ?? ''));

    // Nas suas, o mais recente em cima: você acabou de pôr o card ali.
    for (const c of colunasSuas) {
      porColuna[c.id].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
    }

    const resultado: Record<string, GrupoDaColuna[]> = {};
    for (const c of Object.keys(porColuna)) {
      resultado[c] = [{ chave: c, rotulo: '', tasks: porColuna[c] }];
    }

    // A coluna da daily é a única quebrada por dia: na reunião você conta o de
    // ontem e o de hoje, e uma lista corrida obrigaria a ler data por data.
    const porDia: GrupoDaColuna[] = [];
    for (const t of porColuna.meu) {
      const chave = diaLocal(t.meu!.em);
      const ultimo = porDia[porDia.length - 1];
      if (ultimo && ultimo.chave === chave) ultimo.tasks.push(t);
      else porDia.push({ chave, rotulo: rotuloDoDia(t.meu!.em), tasks: [t] });
    }
    resultado.meu = porDia;

    return resultado;
  }, [tasks, tagFiltro, autorFiltro, colunasSuas]);

  // Quem pediu, e quantas. Ordenado por quantidade: numa lista de dez pessoas,
  // quem manda mais demanda é quem você procura primeiro.
  const autores = useMemo(() => {
    const por = new Map<string, number>();
    for (const t of tasks) por.set(t.author, (por.get(t.author) ?? 0) + 1);
    return [...por.entries()]
      .map(([autor, quantas]) => ({ autor, quantas }))
      .sort((a, b) => b.quantas - a.quantas || a.autor.localeCompare(b.autor));
  }, [tasks]);

  const foraDeAlcance = tasks.filter((t) => !t.ignorada && t.foraDeAlcance).length;
  const emojiMeu = consumo?.preferencias.emojiMeu ?? '';
  const emojiFazendo = consumo?.preferencias.emojiFazendo ?? '';

  return (
    <>
      <header className="topo-quadro">
        <button
          className="icone"
          onClick={() => navegar('/')}
          title="Voltar para meus murais"
          aria-label="Voltar para meus murais"
        >
          <IconeVoltar />
        </button>
        <span className="marca">
          <span className="ponto-marca" />
          <h1>{mural?.nome ?? 'Mural'}</h1>
        </span>
        <span className="info">
          {lastSync
            ? 'última leitura: ' + new Date(lastSync).toLocaleString('pt-BR')
            : 'nunca sincronizado — clique em Atualizar'}
        </span>
        <span className="espaco" />
        {consumo && !consumo.agente.reportaCusto && (
          <span
            className="gasto"
            title={
              `${consumo.agente.nome} lê o Teams nesta instalação e não informa custo em dólar. ` +
              'O registro guarda tokens e duração; o preço não aparece porque não existe dado.'
            }
          >
            via {consumo.agente.nome}
          </span>
        )}
        {consumo && consumo.agente.reportaCusto && consumo.totais.execucoes > 0 && (
          <span
            className="gasto"
            title={
              `${consumo.usuario} · ${formatarTokens(consumo.totais.tokensTotal)} tokens em ` +
              `${consumo.totais.execucoes} leituras do Claude Code\n` +
              `atualizações do quadro: ${consumo.totais.porOperacao.sync.execucoes} · ` +
              `${formatarUsd(consumo.totais.porOperacao.sync.custoUsd)}\n` +
              `listagem de chats: ${consumo.totais.porOperacao.chats.execucoes} · ` +
              `${formatarUsd(consumo.totais.porOperacao.chats.custoUsd)}\n` +
              `verificação da conta: ${consumo.totais.porOperacao.conta.execucoes} · ` +
              `${formatarUsd(consumo.totais.porOperacao.conta.custoUsd)}`
            }
          >
            {formatarUsd(consumo.totais.custoUsd)} gastos
          </span>
        )}
        {/* A sprint aparece, mas não se mexe daqui: definir e encerrar são
            gestos de organização, e organização é o assunto da listagem. Aqui o
            ciclo é contexto — saber até quando vale o que está na tela. */}
        {sprint?.atual && (
          <span
            className="sprint"
            title={
              `${sprint.atual.nome}: ${dataDoDiaISO(sprint.atual.inicio)} a ` +
              `${dataDoDiaISO(sprint.atual.fim)}. Para mudar ou encerrar, volte para meus murais.`
            }
          >
            {sprint.atual.nome} · até {dataDoDiaISO(sprint.atual.fim)}
          </span>
        )}
        {/* Filtro e sino juntos, à direita: um diz o que a tela está te
            escondendo, o outro o que ela tem a te contar. A barra de selects que
            morava acima das colunas custava uma faixa de altura o tempo todo por
            uma escolha que se faz de vez em quando. */}
        <FiltroDoQuadro
          autores={autores}
          tags={tags}
          autorFiltro={autorFiltro}
          tagFiltro={tagFiltro}
          aoFiltrarAutor={setAutorFiltro}
          aoFiltrarTag={setTagFiltro}
        />
        {/* O sino fica ao lado de Atualizar porque é dela que quase tudo aqui
            dentro vem: o resumo de uma leitura se lê logo depois de pedir uma. */}
        <Notificacoes
          itens={notificacoes}
          naoLidas={naoLidas}
          fixado={
            foraDeAlcance > foraCiente
              ? {
                  texto: (
                    <>
                      {foraDeAlcance} {foraDeAlcance === 1 ? 'task saiu' : 'tasks saíram'} das
                      mensagens que a API devolve — {foraDeAlcance === 1 ? 'ela' : 'elas'} não
                      recebe{foraDeAlcance === 1 ? '' : 'm'} mais atualização do Teams. São os
                      cards <strong>sem fundo, de borda tracejada</strong>: os únicos que você
                      move arrastando.
                    </>
                  ),
                  aoDispensar: () => fecharAvisoFora(foraDeAlcance),
                }
              : null
          }
          aoAbrir={marcarNotificacoesLidas}
          aoAnotar={anotarNotificacao}
          aoRemover={removerNotificacao}
          aoLimpar={limparNotificacoes}
        />
        {/* Atualizar não ganha destaque de cor: fazer o quadro sugerir que ler o
            Teams é o que você veio fazer aqui seria mentir sobre o uso normal. */}
        <button className="acao-topo" onClick={pedirAtualizacao} disabled={sincronizando}>
          {sincronizando ? 'Lendo o Teams…' : 'Atualizar'}
        </button>
      </header>

      {confirmando && consumo && (
        <ConfirmarAtualizacao
          estimativa={consumo.estimativa}
          totais={consumo.totais}
          usuario={consumo.usuario}
          aoConfirmar={confirmar}
          aoCancelar={() => setConfirmando(false)}
        />
      )}

      {etiquetando && (
        <DialogoDeTags
          task={etiquetando}
          existentes={tags}
          aoSalvar={(t) => void salvarTags(t)}
          aoCancelar={() => setEtiquetando(null)}
        />
      )}

      {anotando && (
        <DialogoDeSolucao
          task={anotando}
          aoSalvar={(s) => void salvarSolucao(s)}
          aoCancelar={() => setAnotando(null)}
        />
      )}

      <DialogoDeConfirmacao pedido={pedido} aoCancelar={() => setPedido(null)} />

      {editandoEmojis && (
        <DialogoDeEmojis
          emojiFazendo={emojiFazendo}
          emojiMeu={emojiMeu}
          checks={checks}
          aoSalvar={salvarEmojis}
          aoFechar={() => setEditandoEmojis(false)}
        />
      )}

      {(criandoColuna || editandoColuna) && (
        <DialogoDeColuna
          coluna={editandoColuna}
          aoSalvar={(d) => void salvarColuna(d)}
          aoCancelar={() => {
            setCriandoColuna(false);
            setEditandoColuna(null);
          }}
        />
      )}

      {creditando && (
        <DialogoDeFeitoPorOutro
          task={creditando}
          pessoas={autores.map((a) => a.autor)}
          aoSalvar={(quem, solucao) => void salvarCredito(quem, solucao)}
          aoCancelar={() => setCreditando(null)}
        />
      )}

      <Toasts itens={toasts} aoFechar={fecharToast} />

      <BarraDeSync progresso={progresso} />

      {erro && <p className="aviso erro faixa">{erro}</p>}

      {selecionados.size > 0 && (
        <p className="aviso faixa selecao">
          {selecionados.size === 1
            ? '1 card selecionado — escolha outro para juntar os dois num só.'
            : `${selecionados.size} cards selecionados. Juntar cria um card só, com a mensagem mais antiga como âncora; a anotação da daily vai junto.`}
          <button
            className="primario"
            disabled={selecionados.size < 2}
            onClick={() => void juntarSelecionadas()}
          >
            Juntar em um card
          </button>
          <button onClick={() => setSelecionados(new Set())}>Cancelar</button>
        </p>
      )}

      <DragDropContext onDragEnd={(r) => void aoSoltar(r)}>
        <Droppable droppableId="colunas" type={TIPO_COLUNA} direction="horizontal">
          {(fornecido) => (
            <main className="colunas" ref={fornecido.innerRef} {...fornecido.droppableProps}>
              {todasAsColunas.map((coluna, i) => {
                const sua = colunasSuas.find((c) => c.id === coluna);
                return (
                <Coluna
                  key={coluna}
                  status={coluna}
                  indiceDaColuna={i}
                  rotulo={sua ? sua.nome : rotuloDaColuna(coluna as ColunaId)}
                  cor={sua ? `var(--coluna-${sua.cor})` : CORES_DE_STATUS[coluna as ColunaId]}
                  grupos={grupos[coluna] ?? []}
                  vazio={
                    sua
                      ? 'Arraste um card para cá'
                      : vazioDaColuna(coluna as ColunaId, emojiMeu, emojiFazendo)
                  }
                  colapsada={colapsadas.has(coluna)}
                  aoColapsar={(fechar) => colapsar(coluna, fechar)}
                  menu={
                    sua
                      ? [
                          {
                            rotulo: 'Renomear',
                            icone: <IconeEditar />,
                            aoEscolher: () => setEditandoColuna(sua),
                            dica: 'Nome e cor',
                          },
                          {
                            rotulo: 'Excluir a coluna',
                            icone: <IconeApagar />,
                            aoEscolher: () => void excluirColuna(sua),
                            perigo: true,
                            dica: 'Apaga junto os cards que estão nela',
                          },
                        ]
                      : undefined
                  }
                  acessorio={
                    coluna === 'fazendo' ? (
                      <button
                        className="assinatura"
                        onClick={() => setEditandoEmojis(true)}
                        title={
                          emojiFazendo
                            ? `Cards com a reação ${emojiFazendo} de QUALQUER pessoa caem aqui. Clique para trocar.`
                            : 'Coluna desligada — clique para escolher o emoji de "peguei esta"'
                        }
                      >
                        {emojiFazendo || 'sem emoji'}
                      </button>
                    ) : coluna === 'meu' ? (
                      <button
                        className="assinatura"
                        onClick={() => setEditandoEmojis(true)}
                        title={
                          emojiMeu
                            ? `Cards com a reação ${emojiMeu} caem aqui sozinhos. Clique para trocar.`
                            : 'Nenhuma reação configurada — clique para escolher a sua'
                        }
                      >
                        {emojiMeu || 'sem reação'}
                      </button>
                    ) : undefined
                  }
                  ultimaVisita={ultimaVisita}
                  selecionando={selecionados.size > 0}
                  selecionados={selecionados}
                  aoAbrir={(t) => void abrir(t)}
                  aoMarcarComoMeu={setAnotando}
                  aoCreditarOutro={setCreditando}
                  aoTirarCredito={(t) => void tirarCredito(t)}
                  aoDesmarcarComoMeu={(t) => void desmarcar(t)}
                  aoSelecionar={alternarSelecao}
                  aoSeparar={(t) => void separar(t)}
                  aoEtiquetar={setEtiquetando}
                  aoIgnorar={(t, marcar) => void ignorar(t, marcar)}
                  aoApagar={apagar}
                  aoSoltarDaColuna={(t) => void soltarDaColuna(t)}
                  colapsados={cardsColapsados}
                  aoColapsarCartao={colapsarCartao}
                />
                );
              })}
              {fornecido.placeholder}

              {/* Fora do Droppable de propósito: é um botão, não uma coluna, e
                  arrastar uma coluna para depois dele não pode dar em nada. */}
              <button
                className="nova-coluna"
                onClick={() => setCriandoColuna(true)}
                title="Uma coluna sua — recebe só o que você arrastar"
              >
                <IconeMais tamanho={16} />
                nova coluna
              </button>
            </main>
          )}
        </Droppable>
      </DragDropContext>
    </>
  );
}
