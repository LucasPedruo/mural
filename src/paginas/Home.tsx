import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../api';
import {
  DialogoDeConfirmacao,
  type PedidoDeConfirmacao,
} from '../componentes/DialogoDeConfirmacao';
import { DialogoDeNota } from '../componentes/DialogoDeNota';
import { DialogoDeSprint } from '../componentes/DialogoDeSprint';
import { IconeFechar } from '../componentes/icones';
import {
  COLUNAS,
  CORES_DE_STATUS,
  dataDoDiaISO,
  rotuloDaColuna,
  rotuloDoDiaISO,
  rotuloDoTipo,
  tempoRelativo,
} from '../rotulos';
import type { MuralNaLista, RespostaPainel, Task } from '../tipos';
import './home.css';

export function Home() {
  const navegar = useNavigate();
  const [murais, setMurais] = useState<MuralNaLista[] | null>(null);
  const [secao, setSecao] = useState<'murais' | 'daily'>('murais');
  const [muralDailyId, setMuralDailyId] = useState<string | null>(null);
  const [daily, setDaily] = useState<RespostaPainel | null>(null);
  const [tasksDaily, setTasksDaily] = useState<Task[]>([]);
  const [anotando, setAnotando] = useState<Task | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // A sprint se define e se encerra daqui, não de dentro do quadro: no quadro
  // ela é contexto do que está na tela, e mexer no ciclo é organizar o mural —
  // o mesmo assunto de criar e remover, que já mora nesta página.
  const [editandoSprint, setEditandoSprint] = useState<MuralNaLista | null>(null);
  // O que se pergunta antes de um gesto que não volta. Um estado só para os
  // três: eles nunca acontecem ao mesmo tempo, e um diálogo por gesto seria três
  // cópias da mesma caixa.
  const [pedido, setPedido] = useState<PedidoDeConfirmacao | null>(null);

  const carregar = useCallback(async () => {
    try {
      const d = await api.listarMurais();
      setMurais(d.murais);
      setMuralDailyId((atual) => atual ?? d.murais[0]?.id ?? null);
      // Sem nenhum mural, a lista vazia nao ajuda: manda direto para a criacao.
      if (d.murais.length === 0) navegar('/onboarding', { replace: true });
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [navegar]);

  useEffect(() => {
    void carregar();
    document.title = 'Mural';
  }, [carregar]);

  useEffect(() => {
    if (secao !== 'daily' || !muralDailyId) return;
    let ativo = true;
    Promise.all([api.painel(muralDailyId), api.tasks(muralDailyId)])
      .then(([painel, tasks]) => {
        if (!ativo) return;
        setDaily(painel);
        setTasksDaily(tasks.tasks);
      })
      .catch((e) => {
        if (ativo) setErro((e as Error).message);
      });
    return () => {
      ativo = false;
    };
  }, [secao, muralDailyId]);

  function resetarOnboarding() {
    setPedido({
      titulo: 'Refazer a configuração?',
      rotulo: 'Refazer a configuração',
      corpo: (
        <>
          <p>Apaga o agente escolhido, a conta verificada e a lista de chats.</p>
          <p>
            Seus murais e o histórico <strong>não</strong> são tocados.
          </p>
        </>
      ),
      aoConfirmar: () => void refazerConfiguracao(),
    });
  }

  async function refazerConfiguracao() {
    try {
      await api.resetarOnboarding();
      navegar('/onboarding');
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  function remover(m: MuralNaLista) {
    setPedido({
      titulo: `Remover "${m.nome}"?`,
      rotulo: 'Remover o mural',
      perigo: true,
      corpo: (
        <p>
          O histórico deste mural é apagado — anotações, etiquetas e sprints arquivadas. A conversa
          no Teams não é tocada.
        </p>
      ),
      aoConfirmar: () => void removerMesmo(m),
    });
  }

  async function removerMesmo(m: MuralNaLista) {
    try {
      await api.removerMural(m.id);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function salvarSprint(dados: { nome: string; inicio: string; dias: number }) {
    const mural = editandoSprint;
    setEditandoSprint(null);
    if (!mural) return;
    setErro(null);
    try {
      await api.definirSprint(mural.id, dados);
      await carregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  // Encerrar tira do quadro o que já terminou e guarda no arquivo da sprint.
  // Nada é apagado — é de lá que o dashboard e os painéis leem o histórico.
  function encerrarSprint(m: MuralNaLista) {
    if (!m.sprint) return;
    const terminadas = m.totais.feito + m.totais.meu;
    setPedido({
      titulo: `Encerrar a ${m.sprint.nome} em "${m.nome}"?`,
      rotulo: 'Encerrar a sprint',
      corpo: (
        <>
          <p>
            <strong>{terminadas}</strong> card(s) de <em>Done</em> e de <em>Done by me</em> saem
            do quadro e vão para o arquivo desta sprint.
          </p>
          <p>Nada é apagado. A sprint seguinte começa hoje.</p>
        </>
      ),
      aoConfirmar: () => void encerrarMesmo(m),
    });
  }

  async function encerrarMesmo(m: MuralNaLista) {
    if (!m.sprint) return;
    setErro(null);
    try {
      const r = await api.encerrarSprint(m.id);
      await carregar();
      if (r.arquivadas === 0) {
        setErro(`${m.sprint.nome} encerrada — não havia nada concluído para arquivar.`);
      }
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function abrirNoTeams(task: Task) {
    const muralId = muralDaily?.id;
    if (!muralId) return;
    if (task.origem === 'manual') {
      setErro('Esta task foi criada a mao e nao tem mensagem no Teams para abrir.');
      return;
    }
    try {
      await api.abrirNoTeams(muralId, task.id);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function abrirItemDaDaily(id: string) {
    const muralId = muralDaily?.id;
    if (!muralId) return;
    try {
      await api.abrirNoTeams(muralId, id);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function salvarNota(nota: string) {
    const task = anotando;
    const muralId = muralDaily?.id;
    setAnotando(null);
    if (!task || !muralId) return;
    try {
      const r = await api.anotar(muralId, task.id, nota);
      setTasksDaily(r.tasks);
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  const muralDaily = murais?.find((m) => m.id === muralDailyId) ?? murais?.[0] ?? null;
  const itensEmAndamento = tasksDaily
    .filter((t) => !t.ignorada && !t.coluna && !t.meu && !t.feitoPor && t.status === 'fazendo')
    .sort((a, b) => b.statusChangedAt.localeCompare(a.statusChangedAt))
    .map((t) => ({
      task: t,
      id: t.id,
      summary: t.summary,
      autor: t.author,
      coluna: 'In progress',
      solucao: t.meu?.solucao ?? t.feitoPor?.solucao ?? '',
      prUrl: t.meu?.prUrl ?? '',
      nota: t.nota ?? '',
      mensagens: t.mensagens?.length || 1,
    }));
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  const chaveOntem =
    `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, '0')}-` +
    String(ontem.getDate()).padStart(2, '0');
  const diaAnteriorDaDaily = daily?.daily.porDia.find((dia) => dia.dia === chaveOntem) ?? null;

  return (
    <div className="pagina-home">
      <aside className="sidebar-home">
        <div className="marca-sidebar">
          <span className="ponto-marca" />
          <strong>Mural</strong>
        </div>
        <button
          className={secao === 'murais' ? 'ativo' : ''}
          onClick={() => setSecao('murais')}
        >
          Murais
        </button>
        <div className="grupo-sidebar">
          <span>Daily</span>
          {murais?.map((m) => (
            <button
              key={m.id}
              className={secao === 'daily' && muralDailyId === m.id ? 'ativo' : ''}
              onClick={() => {
                setSecao('daily');
                setMuralDailyId(m.id);
                setDaily(null);
                setTasksDaily([]);
              }}
            >
              {m.nome}
            </button>
          ))}
        </div>
      </aside>

      <main className="conteudo-home">
      <div className="topo">
        <h1>{secao === 'daily' ? `Daily · ${muralDaily?.nome ?? 'Mural'}` : 'Murais'}</h1>
        <span className="espaco" />
        <button onClick={resetarOnboarding} title="Recomeçar a configuração">
          Refazer configuração
        </button>
        <button className="primario" onClick={() => navegar('/onboarding')}>
          Novo mural
        </button>
      </div>
      <p className="sub">
        {secao === 'daily'
          ? 'Cola simples para a daily: o que esta em andamento e o que ja foi entregue.'
          : 'Cada quadro acompanha uma conversa do Teams.'}
      </p>

      {erro && <p className="aviso erro">{erro}</p>}

      {secao === 'murais' && <div className="lista-murais">
        {murais?.map((m) => (
          <Link className="cartao-mural" to={`/m/${m.id}`} key={m.id}>
            <div className="info">
              <div className="nome">{m.nome}</div>
              <div className="meta">
                <span className="badge neutral">{rotuloDoTipo(m.tipo, m.subtipo)}</span>
                {' · '}
                {tempoRelativo(m.ultimoSync)}
                {m.foraDeAlcance > 0 && (
                  <>
                    {' · '}
                    <span className="badge warning">{m.foraDeAlcance} fora de alcance</span>
                  </>
                )}
                {' · '}
                {/* O ciclo do mural. Fica na linha de baixo, em texto, porque é
                    ajuste raro — mexer nele não pode competir com abrir o
                    quadro, que é o que se vem fazer aqui. */}
                <button
                  className="ligacao"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditandoSprint(m);
                  }}
                  title={
                    m.sprint
                      ? `${m.sprint.nome}: ${dataDoDiaISO(m.sprint.inicio)} a ${dataDoDiaISO(m.sprint.fim)}. Clique para corrigir.`
                      : 'Definir o ciclo que você fecha de vez em quando'
                  }
                >
                  {m.sprint
                    ? `${m.sprint.nome} · até ${dataDoDiaISO(m.sprint.fim)}`
                    : 'definir sprint'}
                </button>
                {m.sprint && (
                  <>
                    {' · '}
                    <button
                      className="ligacao"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        void encerrarSprint(m);
                      }}
                      title="Arquiva o que está concluído e abre a sprint seguinte"
                    >
                      encerrar
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="numeros">
              {/* Inclui "Done by me": um card marcado sai da coluna do
                  Teams, então sem essa pílula a soma da linha não fecharia. */}
              {COLUNAS.map((s) => (
                <span className="pilula" key={s} title={rotuloDaColuna(s)}>
                  <span className="ponto" style={{ background: CORES_DE_STATUS[s] }} />
                  {m.totais[s]}
                </span>
              ))}
            </div>

            {/* As duas leituras do histórico. Saíram do quadro: lá elas
                disputavam o cabeçalho com Atualizar, e nenhuma das duas é algo
                que se faz no meio de mexer nos cards. */}
            <div className="acessos">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navegar(`/m/${m.id}/dashboard`);
                }}
                title="Ritmo e distribuição, em gráficos"
              >
                Dashboard
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navegar(`/m/${m.id}/painel`);
                }}
                title="Sprints e daily, item a item"
              >
                Painéis
              </button>
            </div>

            <button
              className="icone perigo"
              title="Remover este mural"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void remover(m);
              }}
            >
              <IconeFechar />
            </button>
          </Link>
        ))}
      </div>}

      {secao === 'daily' && (
        <div className="daily-home">
          <section className="bloco-daily-home">
            <div className="cabeca-daily-home">
              <h2>Em andamento</h2>
              <span>{itensEmAndamento.length}</span>
            </div>
            {itensEmAndamento.length === 0 ? (
              <p className="vazio">Nada em andamento neste mural.</p>
            ) : (
              <ul>
                {itensEmAndamento.map((item) => (
                  <li
                    key={item.id}
                    className="clicavel"
                    onClick={() => void abrirNoTeams(item.task)}
                    title="Abrir no Teams"
                  >
                    <p className="titulo">{item.summary}</p>
                    <p className="meta">
                      {item.coluna} · pedido por {item.autor}
                      {item.mensagens > 1 ? ` · ${item.mensagens} mensagens` : ''}
                    </p>
                    {item.nota && <p className="nota">{item.nota}</p>}
                    {item.solucao && <p className="solucao">{item.solucao}</p>}
                    <div className="acoes-daily-item">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setAnotando(item.task);
                        }}
                      >
                        {item.nota ? 'editar nota' : 'adicionar nota'}
                      </button>
                      {item.prUrl && (
                        <a
                          href={item.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          abrir PR
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="bloco-daily-home">
            <div className="cabeca-daily-home">
              <h2>Entregas recentes</h2>
              <span>{diaAnteriorDaDaily?.itens.length ?? 0}</span>
            </div>
            {!diaAnteriorDaDaily ? (
              <p className="vazio">Nada marcado como feito ontem.</p>
            ) : (
              <div className="dia-daily-home">
                <h3>{rotuloDoDiaISO(diaAnteriorDaDaily.dia)}</h3>
                <ul>
                  {diaAnteriorDaDaily.itens.map((item) => (
                    <li
                      key={item.id}
                      className="clicavel"
                      onClick={() => void abrirItemDaDaily(item.id)}
                      title="Abrir no Teams"
                    >
                      <p className="titulo">{item.summary}</p>
                      <p className="solucao">{item.solucao || 'sem resumo'}</p>
                      <p className="meta">
                        pedido por {item.autor}
                        {item.prUrl ? ' · PR vinculado' : ''}
                      </p>
                      {item.prUrl && (
                        <a
                          href={item.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          abrir PR
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}
      </main>

      <DialogoDeConfirmacao pedido={pedido} aoCancelar={() => setPedido(null)} />

      {editandoSprint && (
        <DialogoDeSprint
          sprint={editandoSprint.sprint}
          primeiraVez={!editandoSprint.sprint}
          aoSalvar={(d) => void salvarSprint(d)}
          aoCancelar={() => setEditandoSprint(null)}
        />
      )}

      {anotando && (
        <DialogoDeNota
          task={anotando}
          aoSalvar={(nota) => void salvarNota(nota)}
          aoCancelar={() => setAnotando(null)}
        />
      )}
    </div>
  );
}
