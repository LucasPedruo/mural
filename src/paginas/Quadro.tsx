import { DragDropContext, type DropResult } from '@hello-pangea/dnd';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { api } from '../api';
import { BarraDeSync } from '../componentes/BarraDeSync';
import { Coluna } from '../componentes/Coluna';
import {
  ConfirmarAtualizacao,
  formatarTokens,
  formatarUsd,
} from '../componentes/ConfirmarAtualizacao';
import { COLUNAS, rotuloDaColuna } from '../rotulos';
import type { Mural, Progresso, RespostaConsumo, Status, Task } from '../tipos';
import './quadro.css';

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

  const chaveVisto = `mural:ultima-visita:${muralId}`;
  const [ultimaVisita, setUltimaVisita] = useState<string | null>(
    () => localStorage.getItem(chaveVisto),
  );

  const [consumo, setConsumo] = useState<RespostaConsumo | null>(null);
  const [confirmando, setConfirmando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const [tarefas, info, custo] = await Promise.all([
        api.tasks(muralId),
        api.lerMural(muralId),
        api.consumo(muralId),
      ]);
      setMural(info.mural);
      setTasks(tarefas.tasks);
      setLastSync(tarefas.lastSync);
      setConsumo(custo);
      document.title = `${info.mural.nome} · Mural`;
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [muralId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

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
    if (atual?.preferencias.confirmarAntesDeAtualizar !== false) {
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
          c ? { ...c, preferencias: { confirmarAntesDeAtualizar: false } } : c,
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
      // O custo real desta execução entra no resumo: a estimativa foi mostrada
      // antes, e ver o valor cobrado é o que torna a próxima estimativa crível.
      if (r.consumo) {
        partes.push(
          `custou ${formatarUsd(r.consumo.custoUsd)} · ${formatarTokens(r.consumo.tokensTotal)} tokens`,
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

  // ---- drag ------------------------------------------------------------

  async function aoSoltar(resultado: DropResult) {
    const destino = resultado.destination;
    if (!destino) return;

    const novoStatus = destino.droppableId as Status;
    const task = tasks.find((t) => t.id === resultado.draggableId);
    if (!task || task.status === novoStatus) return;

    // Otimista: o card muda de coluna na hora e o servidor confirma. Se ele
    // recusar, o estado volta ao que era e o motivo aparece na tela.
    const anterior = tasks;
    setTasks((atual) =>
      atual.map((t) => (t.id === task.id ? { ...t, status: novoStatus, movidoAMao: true } : t)),
    );
    setErro(null);

    try {
      const r = await api.mover(muralId, task.id, novoStatus);
      setTasks(r.tasks);
    } catch (e) {
      setTasks(anterior);
      setErro((e as Error).message);
    }
  }

  async function abrirNoTeams(task: Task) {
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

  const porColuna = useMemo(() => {
    const grupos: Record<Status, Task[]> = { aberto: [], interagido: [], feito: [] };
    for (const t of tasks) (grupos[t.status] ?? grupos.aberto).push(t);

    // Abertas: mais antigas primeiro — o que está parado há mais tempo sobe.
    grupos.aberto.sort((a, b) => a.createdDateTime.localeCompare(b.createdDateTime));
    for (const k of ['interagido', 'feito'] as const) {
      grupos[k].sort((a, b) => b.statusChangedAt.localeCompare(a.statusChangedAt));
    }
    return grupos;
  }, [tasks]);

  const foraDeAlcance = tasks.filter((t) => t.foraDeAlcance).length;

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
        {consumo && consumo.totais.execucoes > 0 && (
          <span
            className="gasto"
            title={
              `${consumo.usuario}: ${consumo.totais.execucoes} atualizações, ` +
              `${formatarTokens(consumo.totais.tokensTotal)} tokens no total`
            }
          >
            {formatarUsd(consumo.totais.custoUsd)} gastos
          </span>
        )}
        <button
          onClick={() => {
            const agora = new Date().toISOString();
            localStorage.setItem(chaveVisto, agora);
            setUltimaVisita(agora);
          }}
          title="Zera as marcas NOVO e MUDOU"
        >
          Marcar como visto
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

      <BarraDeSync progresso={progresso} />

      {erro && <p className="aviso erro faixa">{erro}</p>}

      {foraDeAlcance > 0 && (
        <p className="aviso info faixa">
          {foraDeAlcance} {foraDeAlcance === 1 ? 'task saiu' : 'tasks saíram'} das mensagens que a
          API devolve — {foraDeAlcance === 1 ? 'ela' : 'elas'} não recebe
          {foraDeAlcance === 1 ? '' : 'm'} mais atualização do Teams. Só{' '}
          {foraDeAlcance === 1 ? 'esse card' : 'esses cards'} (borda tracejada) pode
          {foraDeAlcance === 1 ? '' : 'm'} ser arrastado entre colunas.
        </p>
      )}

      <DragDropContext onDragEnd={aoSoltar}>
        <main className="colunas">
          {COLUNAS.map((status) => (
            <Coluna
              key={status}
              status={status}
              rotulo={rotuloDaColuna(status, mural ?? undefined)}
              tasks={porColuna[status]}
              ultimaVisita={ultimaVisita}
              aoAbrir={abrirNoTeams}
            />
          ))}
        </main>
      </DragDropContext>
    </>
  );
}
