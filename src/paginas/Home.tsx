import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../api';
import {
  DialogoDeConfirmacao,
  type PedidoDeConfirmacao,
} from '../componentes/DialogoDeConfirmacao';
import { DialogoDeSprint } from '../componentes/DialogoDeSprint';
import { IconeFechar } from '../componentes/icones';
import {
  COLUNAS,
  CORES_DE_STATUS,
  dataDoDiaISO,
  rotuloDaColuna,
  rotuloDoTipo,
  tempoRelativo,
} from '../rotulos';
import type { MuralNaLista } from '../tipos';
import './home.css';

export function Home() {
  const navegar = useNavigate();
  const [murais, setMurais] = useState<MuralNaLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editandoSprint, setEditandoSprint] = useState<MuralNaLista | null>(null);
  const [pedido, setPedido] = useState<PedidoDeConfirmacao | null>(null);

  const carregar = useCallback(async () => {
    try {
      const d = await api.listarMurais();
      setMurais(d.murais);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
    document.title = 'Tarefas de trabalho';
  }, [carregar]);

  function remover(m: MuralNaLista) {
    setPedido({
      titulo: `Remover "${m.nome}"?`,
      rotulo: 'Remover o mural',
      perigo: true,
      corpo: (
        <p>
          O historico deste mural e apagado: anotacoes e sprints arquivadas. A conversa no
          Teams nao e tocada.
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

  function encerrarSprint(m: MuralNaLista) {
    if (!m.sprint) return;
    const terminadas = m.totais.feito + m.totais.meu;
    setPedido({
      titulo: `Encerrar a ${m.sprint.nome} em "${m.nome}"?`,
      rotulo: 'Encerrar a sprint',
      corpo: (
        <>
          <p>
            <strong>{terminadas}</strong> card(s) de <em>Done</em> e de{' '}
            <em>Done by me</em> saem do quadro e vao para o arquivo desta sprint.
          </p>
          <p>Nada e apagado. A sprint seguinte comeca hoje.</p>
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
        setErro(`${m.sprint.nome} encerrada: nao havia nada concluido para arquivar.`);
      }
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <div className="pagina-home">
      <aside className="sidebar-home">
        <div className="marca-sidebar">
          <span className="ponto-marca" />
          <strong>Agente Lucas</strong>
        </div>

        <button className="ativo" type="button">
          Tarefas de trabalho
        </button>

        <div className="grupo-sidebar">
          <span>Pessoal</span>
          <button type="button" onClick={() => navegar('/p/diarias')}>
            Tarefas diarias
          </button>
          <button type="button" onClick={() => navegar('/p/publicidade')}>
            Publicidade
          </button>
          <button type="button" onClick={() => navegar('/p/financas')}>
            Financas
          </button>
        </div>

        <div className="usuario-sidebar">
          <div className="perfil-sidebar" aria-label="Usuario atual">
            <span className="avatar-sidebar">LP</span>
            <span className="dados-perfil-sidebar">
              <strong>Lucas Pedro</strong>
              <small>Agente pessoal</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="conteudo-home">
        <div className="topo">
          <div className="identidade-topo">
            <h1>Tarefas de trabalho</h1>
            <p>Cada quadro acompanha uma conversa de trabalho do Teams.</p>
          </div>
          <span className="espaco" />
          <button className="primario" onClick={() => navegar('/onboarding')}>
            Novo quadro
          </button>
        </div>

        {erro && <p className="aviso erro">{erro}</p>}

        <div className="lista-murais">
          {murais?.map((m) => (
            <Link className="cartao-mural" to={`/m/${m.id}`} key={m.id}>
              <div className="info">
                <div className="nome">{m.nome}</div>
                <div className="meta">
                  <span className="badge neutral">{rotuloDoTipo(m.tipo, m.subtipo)}</span>
                  {' - '}
                  {tempoRelativo(m.ultimoSync)}
                  {m.foraDeAlcance > 0 && (
                    <>
                      {' - '}
                      <span className="badge warning">{m.foraDeAlcance} fora de alcance</span>
                    </>
                  )}
                  {' - '}
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
                        : 'Definir o ciclo que voce fecha de vez em quando'
                    }
                  >
                    {m.sprint
                      ? `${m.sprint.nome} - ate ${dataDoDiaISO(m.sprint.fim)}`
                      : 'definir sprint'}
                  </button>
                  {m.sprint && (
                    <>
                      {' - '}
                      <button
                        className="ligacao"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          void encerrarSprint(m);
                        }}
                        title="Arquiva o que esta concluido e abre a sprint seguinte"
                      >
                        encerrar
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="numeros">
                {COLUNAS.map((s) => (
                  <span className="pilula" key={s} title={rotuloDaColuna(s)}>
                    <span className="ponto" style={{ background: CORES_DE_STATUS[s] }} />
                    {m.totais[s]}
                  </span>
                ))}
              </div>

              <div className="acessos">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    navegar(`/m/${m.id}/dashboard`);
                  }}
                  title="Ritmo e distribuicao, em graficos"
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
                  Paineis
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
          {murais?.length === 0 && <p className="vazio">Nenhum mural do Teams configurado.</p>}
        </div>
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
    </div>
  );
}
