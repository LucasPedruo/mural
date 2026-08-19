import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api } from '../api';
import { BarraDeSync } from '../componentes/BarraDeSync';
import { Coluna, type GrupoDaColuna } from '../componentes/Coluna';
import {
  ConfirmarAtualizacao,
  formatarTokens,
  formatarUsd,
} from '../componentes/ConfirmarAtualizacao';
import { DialogoDeSolucao } from '../componentes/DialogoDeSolucao';
import { DialogoDeSprint } from '../componentes/DialogoDeSprint';
import { DialogoDeTask } from '../componentes/DialogoDeTask';
import { COLUNAS, dataDoDiaISO, diaLocal, rotuloDaColuna, rotuloDoDia } from '../rotulos';
import type {
  ColunaId,
  Mural,
  NovaTask,
  Progresso,
  RespostaConsumo,
  RespostaSprint,
  Status,
  Task,
} from '../tipos';
import './quadro.css';

/** Mensagem de coluna vazia. A da daily não é "nada aqui": é uma instrução,
 *  porque a coluna só enche quando a sua reação aparece — ou quando você marca. */
function vazioDaColuna(coluna: ColunaId, emojiMeu: string): string | undefined {
  if (coluna !== 'meu') return undefined;
  return emojiMeu
    ? `nada ainda — reaja com ${emojiMeu} no Teams e atualize, ou use "fiz" num card`
    : 'nada ainda — use "fiz" num card para anotar o que você resolveu';
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

  // 'nova' = criando; uma Task = editando aquela. Só task própria chega aqui.
  const [editando, setEditando] = useState<Task | 'nova' | null>(null);
  const [anotando, setAnotando] = useState<Task | null>(null);

  const [sprint, setSprint] = useState<RespostaSprint | null>(null);
  const [editandoSprint, setEditandoSprint] = useState(false);

  // Seleção do "juntar". Vazia = modo desligado, e o clique no card volta a
  // abrir o Teams. Um Set porque a ordem não importa: a âncora do card juntado
  // é sempre a mensagem mais antiga, não a primeira que você clicou.
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    try {
      const [tarefas, info, custo, ciclo] = await Promise.all([
        api.tasks(muralId),
        api.lerMural(muralId),
        api.consumo(muralId),
        api.sprint(muralId),
      ]);
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
          `${r.marcados.length} ${r.marcados.length === 1 ? 'foi' : 'foram'} para Feito por mim`,
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

  // ---- tasks próprias e marca da daily ---------------------------------

  async function salvarTask(dados: NovaTask) {
    const alvo = editando;
    setEditando(null);
    setErro(null);
    try {
      const r =
        alvo === 'nova'
          ? await api.criarTask(muralId, dados)
          : await api.editarTask(muralId, { ...dados, id: (alvo as Task).id });
      setTasks(r.tasks);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function removerTask(task: Task) {
    const confirmado = window.confirm(
      `Apagar "${task.summary}"?\n\nEla foi criada aqui dentro, então não há como recuperá-la ` +
        'por uma atualização — o Teams nunca soube dela.',
    );
    if (!confirmado) return;
    setEditando(null);
    try {
      const r = await api.removerTask(muralId, task.id);
      setTasks(r.tasks);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

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

  // O Graph não diz quem reagiu — `reactions[].users` vem com tudo nulo. Então
  // "fui eu" é uma convenção sua: um emoji que só você usa naquele canal.
  async function trocarEmojiMeu() {
    const atual = consumo?.preferencias.emojiMeu ?? '';
    const escolhido = window.prompt(
      'Qual reação você usa no Teams para dizer "fui eu que fiz"?\n\n' +
        'Toda mensagem com ela cai em "Feito por mim" na próxima atualização. ' +
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

  async function desmarcar(task: Task) {
    setErro(null);
    try {
      const r = await api.desmarcarComoMeu(muralId, task.id);
      setTasks(r.tasks);
    } catch (e) {
      setErro((e as Error).message);
    }
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

  // ---- sprint ----------------------------------------------------------

  async function salvarSprint(dados: { nome: string; inicio: string; dias: number }) {
    setEditandoSprint(false);
    setErro(null);
    try {
      setSprint(await api.definirSprint(muralId, dados));
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function encerrarSprint() {
    const atual = sprint?.atual;
    if (!atual) return;
    const terminadas = tasks.filter((t) => t.meu || t.status === 'feito').length;
    const confirmado = window.confirm(
      `Encerrar a ${atual.nome}?\n\n` +
        `${terminadas} card(s) de Concluído e de Feito por mim saem do quadro e vão para o ` +
        'arquivo desta sprint. Nada é apagado: os painéis leem de lá, com as anotações da ' +
        'daily.\n\nA sprint seguinte começa hoje.',
    );
    if (!confirmado) return;
    setErro(null);
    try {
      const r = await api.encerrarSprint(muralId);
      setTasks(r.tasks);
      setSprint(r.sprints);
      setResumo(
        r.arquivadas === 0
          ? `${atual.nome} encerrada — não havia nada concluído para arquivar`
          : `${atual.nome} encerrada: ${r.arquivadas} card(s) arquivado(s)`,
      );
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // ---- drag ------------------------------------------------------------

  async function aoSoltar(resultado: DropResult) {
    const destino = resultado.destination;
    if (!destino) return;

    const coluna = destino.droppableId as ColunaId;
    const task = tasks.find((t) => t.id === resultado.draggableId);
    if (!task) return;

    // Soltar na coluna da daily não muda o status: abre a anotação. É a mesma
    // coisa que o botão "fiz" do card faz, só que pelo gesto.
    if (coluna === 'meu') {
      if (!task.meu) setAnotando(task);
      return;
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

  // Card do Teams abre a mensagem original; card seu abre a própria edição —
  // não há mensagem para abrir.
  async function abrir(task: Task) {
    if (task.origem === 'manual') {
      setEditando(task);
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
      aberto: [], interagido: [], feito: [], meu: [],
    };
    for (const t of tasks) {
      if (t.meu) porColuna.meu.push(t);
      else (porColuna[t.status] ?? porColuna.aberto).push(t);
    }

    // Abertas: mais antigas primeiro — o que está parado há mais tempo sobe.
    porColuna.aberto.sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime));
    for (const k of ['interagido', 'feito'] as const) {
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
  }, [tasks]);

  const foraDeAlcance = tasks.filter((t) => t.foraDeAlcance).length;
  const emojiMeu = consumo?.preferencias.emojiMeu ?? '';

  return (
    <>
      <header className="topo-quadro">
        <button className="icone" onClick={() => navegar('/')} title="Voltar para meus murais">
          ←
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
        {/* A sprint fica no cabeçalho porque é ali que ela age: é o botão ao
            lado que a encerra e zera o que já terminou. */}
        <button
          className="sprint"
          onClick={() => setEditandoSprint(true)}
          title={
            sprint?.atual
              ? `${sprint.atual.nome}: ${dataDoDiaISO(sprint.atual.inicio)} a ${dataDoDiaISO(sprint.atual.fim)}. Clique para corrigir.`
              : 'Definir o ciclo que você fecha de vez em quando'
          }
        >
          {sprint?.atual
            ? `${sprint.atual.nome} · até ${dataDoDiaISO(sprint.atual.fim)}`
            : 'definir sprint'}
        </button>
        {sprint?.atual && (
          <button
            onClick={() => void encerrarSprint()}
            title="Arquiva Concluído e Feito por mim, e abre a sprint seguinte"
          >
            Encerrar sprint
          </button>
        )}
        <Link className="botao-link" to={`/m/${muralId}/painel`} title="Sprints e daily">
          Painéis
        </Link>
        <button onClick={() => setEditando('nova')} title="Criar uma task que não veio do Teams">
          Nova task
        </button>
        <button className="primario" onClick={pedirAtualizacao} disabled={sincronizando}>
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

      {editando && (
        <DialogoDeTask
          task={editando === 'nova' ? null : editando}
          mural={mural}
          aoSalvar={(d) => void salvarTask(d)}
          aoCancelar={() => setEditando(null)}
          aoRemover={
            editando === 'nova' ? undefined : () => void removerTask(editando)
          }
        />
      )}

      {editandoSprint && (
        <DialogoDeSprint
          sprint={sprint?.atual ?? null}
          primeiraVez={!sprint?.atual}
          aoSalvar={(d) => void salvarSprint(d)}
          aoCancelar={() => setEditandoSprint(false)}
        />
      )}

      {anotando && (
        <DialogoDeSolucao
          task={anotando}
          aoSalvar={(s) => void salvarSolucao(s)}
          aoCancelar={() => setAnotando(null)}
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

      {foraDeAlcance > 0 && (
        <p className="aviso faixa legado">
          {foraDeAlcance} {foraDeAlcance === 1 ? 'task saiu' : 'tasks saíram'} das mensagens que a
          API devolve — {foraDeAlcance === 1 ? 'ela' : 'elas'} não recebe
          {foraDeAlcance === 1 ? '' : 'm'} mais atualização do Teams. São os cards de{' '}
          <strong>borda âmbar tracejada</strong>, os únicos que você move arrastando, junto com as
          tasks criadas por você.
        </p>
      )}

      <DragDropContext onDragEnd={(r) => void aoSoltar(r)}>
        <main className="colunas">
          {COLUNAS.map((coluna) => (
            <Coluna
              key={coluna}
              status={coluna}
              rotulo={rotuloDaColuna(coluna, mural ?? undefined)}
              grupos={grupos[coluna]}
              vazio={vazioDaColuna(coluna, emojiMeu)}
              acessorio={
                coluna === 'meu' ? (
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
              aoDesmarcarComoMeu={(t) => void desmarcar(t)}
              aoSelecionar={alternarSelecao}
              aoSeparar={(t) => void separar(t)}
            />
          ))}
        </main>
      </DragDropContext>
    </>
  );
}
