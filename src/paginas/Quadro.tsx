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
import { DialogoDeFeitoPorOutro } from '../componentes/DialogoDeFeitoPorOutro';
import { DialogoDeSolucao } from '../componentes/DialogoDeSolucao';
import { DialogoDeTags } from '../componentes/DialogoDeTags';
import {
  IconeEtiqueta,
  IconeFechar,
  IconePessoa,
  IconeVoltar,
} from '../componentes/icones';
import { COLUNAS, dataDoDiaISO, diaLocal, rotuloDaColuna, rotuloDoDia } from '../rotulos';
import type {
  ColunaId,
  Mural,
  Progresso,
  RespostaConsumo,
  RespostaSprint,
  Status,
  TagComContagem,
  Task,
} from '../tipos';
import './quadro.css';

/** Mensagem de coluna vazia. A da daily não é "nada aqui": é uma instrução,
 *  porque a coluna só enche quando a sua reação aparece — ou quando você marca. */
function vazioDaColuna(coluna: ColunaId, emojiMeu: string): string | undefined {
  if (coluna === 'ignorada') {
    return 'nada aqui — no menu ⋯ de um card, "Não é pra mim"';
  }
  if (coluna !== 'meu') return undefined;
  return emojiMeu
    ? `nada ainda — reaja com ${emojiMeu} no Teams e atualize, ou "Fiz esta" no menu ⋯ do card`
    : 'nada ainda — use "Fiz esta" no menu ⋯ de um card para anotar o que você resolveu';
}

export function Quadro() {
  const { muralId = '' } = useParams();
  const navegar = useNavigate();

  const [mural, setMural] = useState<Mural | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [resumo, setResumo] = useState<string>('');
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
  const [ordem, setOrdem] = useState<ColunaId[]>(() => {
    try {
      const salva = JSON.parse(localStorage.getItem(chaveOrdem) || '[]') as ColunaId[];
      const conhecidas = salva.filter((c) => COLUNAS.includes(c));
      return [...conhecidas, ...COLUNAS.filter((c) => !conhecidas.includes(c))];
    } catch {
      return [...COLUNAS];
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
  const [colapsadas, setColapsadas] = useState<Set<ColunaId>>(() => {
    const salvo = localStorage.getItem(chaveColapsadas);
    if (!salvo) return new Set<ColunaId>(['ignorada']);
    try {
      return new Set<ColunaId>(JSON.parse(salvo) as ColunaId[]);
    } catch {
      return new Set<ColunaId>(['ignorada']);
    }
  });

  // Seleção do "juntar". Vazia = modo desligado, e o clique no card volta a
  // abrir o Teams. Um Set porque a ordem não importa: a âncora do card juntado
  // é sempre a mensagem mais antiga, não a primeira que você clicou.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    try {
      const [tarefas, info, custo, ciclo, etiquetas] = await Promise.all([
        api.tasks(muralId),
        api.lerMural(muralId),
        api.consumo(muralId),
        api.sprint(muralId),
        api.tags(muralId),
      ]);
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
    setResumo('');
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
      setResumo(partes.length ? partes.join(', ') : 'nada mudou');
      void api.consumo(muralId).then(setConsumo).catch(() => {});
    } catch (e) {
      setErro((e as Error).message);
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

  // O Graph não diz quem reagiu — `reactions[].users` vem com tudo nulo. Então
  // "fui eu" é uma convenção sua: um emoji que só você usa naquele canal.
  async function trocarEmojiMeu() {
    const atual = consumo?.preferencias.emojiMeu ?? '';
    const escolhido = window.prompt(
      'Qual reação você usa no Teams para dizer "fui eu que fiz"?\n\n' +
        'Toda mensagem com ela cai em "Concluído por mim" na próxima atualização. ' +
        'Escolha algo que só você use — o check não serve, ele já significa ' +
        '"concluído" para o canal inteiro.\n\n' +
        'Deixe em branco para desligar e usar só o botão "fiz".',
      atual,
    );
    if (escolhido === null) return;
    try {
      const r = await api.salvarPreferencias({ emojiMeu: escolhido.trim() });
      setConsumo((c) => (c ? { ...c, preferencias: r.preferencias } : c));
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // A coluna Em andamento sai de uma convenção do TIME, não sua: qualquer um que
  // reagir com esse emoji move o card. Por isso ela mora no cabeçalho da coluna
  // e não nas suas preferências de daily.
  async function trocarEmojiFazendo() {
    const atual = consumo?.preferencias.emojiFazendo ?? '';
    const escolhido = window.prompt(
      'Qual reação o time usa no Teams para dizer "peguei esta"?\n\n' +
        'Toda mensagem com ela cai na coluna Em andamento. Diferente do emoji de "fui eu", ' +
        'esta vale para qualquer pessoa que reagir.\n\n' +
        'Deixe em branco para desligar a coluna.',
      atual,
    );
    if (escolhido === null) return;
    try {
      const r = await api.salvarPreferencias({ emojiFazendo: escolhido.trim() });
      setConsumo((c) => (c ? { ...c, preferencias: r.preferencias } : c));
      setErro(null);
      // A regra de status mudou: o quadro precisa reler para os cards caírem na
      // coluna certa sem esperar a próxima atualização do Teams.
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
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

  async function apagar(task: Task) {
    const confirmado = window.confirm(
      `Apagar "${task.summary}" de vez?\n\n` +
        'O card sai do histórico e a mensagem entra na lista de arquivados: nenhuma ' +
        'atualização vai trazê-la de volta, mesmo que ela continue no Teams.\n\n' +
        'Isto não tem como desfazer pela interface.',
    );
    if (!confirmado) return;
    setErro(null);
    try {
      const r = await api.apagar(muralId, task.id);
      setTasks(r.tasks);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function reordenarColunas(de: number, para: number) {
    setOrdem((atual) => {
      const nova = [...atual];
      const [movida] = nova.splice(de, 1);
      nova.splice(para, 0, movida);
      localStorage.setItem(chaveOrdem, JSON.stringify(nova));
      return nova;
    });
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

  function colapsar(coluna: ColunaId, fechar: boolean) {
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

    const coluna = destino.droppableId as ColunaId;
    const task = tasks.find((t) => t.id === resultado.draggableId);
    if (!task) return;

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
      atual.map((t) => (t.id === task.id ? { ...t, status: coluna, movidoAMao: true } : t)),
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
  const grupos = useMemo(() => {
    const porColuna: Record<ColunaId, Task[]> = {
      aberto: [], fazendo: [], interagido: [], feito: [], meu: [], ignorada: [],
    };
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

    const resultado = {} as Record<ColunaId, GrupoDaColuna[]>;
    for (const c of COLUNAS) {
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
  }, [tasks, tagFiltro, autorFiltro]);

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
          {resumo && `  —  ${resumo}`}
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

      {creditando && (
        <DialogoDeFeitoPorOutro
          task={creditando}
          pessoas={autores.map((a) => a.autor)}
          aoSalvar={(quem, solucao) => void salvarCredito(quem, solucao)}
          aoCancelar={() => setCreditando(null)}
        />
      )}

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

      {foraDeAlcance > foraCiente && (
        <p className="aviso faixa atencao centrada">
          <span>
            {foraDeAlcance} {foraDeAlcance === 1 ? 'task saiu' : 'tasks saíram'} das mensagens que a
            API devolve — {foraDeAlcance === 1 ? 'ela' : 'elas'} não recebe
            {foraDeAlcance === 1 ? '' : 'm'} mais atualização do Teams. São os cards{' '}
            <strong>sem fundo, de borda tracejada</strong>: os únicos que você move arrastando.
          </span>
          <button
            className="fechar"
            onClick={() => fecharAvisoFora(foraDeAlcance)}
            title="Fechar — volta a aparecer se outra task sair da janela"
            aria-label="Fechar o aviso"
          >
            <IconeFechar tamanho={14} />
          </button>
        </p>
      )}

      {/* Select, e não pílulas: a lista de quem pede cresce com o time e a de
          etiquetas cresce com o uso, e uma barra que quebra em três linhas
          empurra o quadro para baixo da dobra. O select mantém a altura fixa por
          mais longa que a lista fique, e a contagem cabe na própria opção. */}
      {(autores.length > 1 || tags.length > 0) && (
        <div className="filtro">
          {autores.length > 1 && (
            <label className="campo-de-filtro">
              <span className="rotulo">
                <IconePessoa tamanho={13} /> quem pediu
              </span>
              <select
                className={autorFiltro ? 'ligado' : ''}
                value={autorFiltro ?? ''}
                onChange={(e) => setAutorFiltro(e.target.value || null)}
              >
                <option value="">todos ({tasks.length})</option>
                {autores.map((a) => (
                  <option key={a.autor} value={a.autor}>
                    {a.autor} ({a.quantas})
                  </option>
                ))}
              </select>
            </label>
          )}

          {tags.length > 0 && (
            <label className="campo-de-filtro">
              <span className="rotulo">
                <IconeEtiqueta tamanho={13} /> etiqueta
              </span>
              <select
                className={tagFiltro ? 'ligado' : ''}
                value={tagFiltro ?? ''}
                onChange={(e) => setTagFiltro(e.target.value || null)}
              >
                <option value="">todas</option>
                {tags.map((t) => (
                  <option key={t.tag} value={t.tag.toLowerCase()}>
                    {t.tag} ({t.quantas})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <DragDropContext onDragEnd={(r) => void aoSoltar(r)}>
        <Droppable droppableId="colunas" type={TIPO_COLUNA} direction="horizontal">
          {(fornecido) => (
            <main className="colunas" ref={fornecido.innerRef} {...fornecido.droppableProps}>
              {ordem.map((coluna, i) => (
                <Coluna
                  key={coluna}
                  status={coluna}
                  indiceDaColuna={i}
                  rotulo={rotuloDaColuna(coluna)}
                  grupos={grupos[coluna]}
                  vazio={vazioDaColuna(coluna, emojiMeu)}
                  colapsada={colapsadas.has(coluna)}
                  aoColapsar={(fechar) => colapsar(coluna, fechar)}
                  acessorio={
                    coluna === 'fazendo' ? (
                      <button
                        className="assinatura"
                        onClick={() => void trocarEmojiFazendo()}
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
                        onClick={() => void trocarEmojiMeu()}
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
                  aoApagar={(t) => void apagar(t)}
                  colapsados={cardsColapsados}
                  aoColapsarCartao={colapsarCartao}
                />
              ))}
              {fornecido.placeholder}
            </main>
          )}
        </Droppable>
      </DragDropContext>
    </>
  );
}
