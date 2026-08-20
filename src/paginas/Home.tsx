import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../api';
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
  // A sprint se define e se encerra daqui, não de dentro do quadro: no quadro
  // ela é contexto do que está na tela, e mexer no ciclo é organizar o mural —
  // o mesmo assunto de criar e remover, que já mora nesta página.
  const [editandoSprint, setEditandoSprint] = useState<MuralNaLista | null>(null);

  const carregar = useCallback(async () => {
    try {
      const d = await api.listarMurais();
      setMurais(d.murais);
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

  async function resetarOnboarding() {
    const confirmado = window.confirm(
      'Refazer a configuração?\n\n' +
        'Apaga o cache do onboarding: o agente de IA escolhido, a conta Microsoft ' +
        'verificada, a lista de chats e a preferência de confirmar antes de atualizar.\n\n' +
        'Seus murais, o histórico de tasks e o registro de gastos NÃO são tocados.',
    );
    if (!confirmado) return;
    try {
      await api.resetarOnboarding();
      navegar('/onboarding');
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function remover(m: MuralNaLista) {
    const confirmado = window.confirm(
      `Remover "${m.nome}"?\n\n` +
        'O histórico acumulado deste mural é apagado. A conversa no Teams não é tocada.',
    );
    if (!confirmado) return;
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
  async function encerrarSprint(m: MuralNaLista) {
    if (!m.sprint) return;
    const terminadas = m.totais.feito + m.totais.meu;
    const confirmado = window.confirm(
      `Encerrar a ${m.sprint.nome} em "${m.nome}"?\n\n` +
        `${terminadas} card(s) de Concluído e de Concluído por mim saem do quadro e vão para o ` +
        'arquivo desta sprint. Nada é apagado: o dashboard e os painéis leem de lá, com as ' +
        'anotações da daily.\n\nA sprint seguinte começa hoje.',
    );
    if (!confirmado) return;
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

  return (
    <div className="pagina-home">
      <div className="topo">
        <span className="ponto-marca" />
        <h1>Mural</h1>
        <span className="espaco" />
        <button onClick={resetarOnboarding} title="Limpa o cache do onboarding e recomeça">
          Refazer configuração
        </button>
        <button className="primario" onClick={() => navegar('/onboarding')}>
          Novo mural
        </button>
      </div>
      <p className="sub">Seus quadros. Cada um acompanha uma conversa do Teams.</p>

      {erro && <p className="aviso erro">{erro}</p>}

      <div className="lista-murais">
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
                      title="Arquiva Concluído e Concluído por mim, e abre a sprint seguinte"
                    >
                      encerrar
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="numeros">
              {/* Inclui "Concluído por mim": um card marcado sai da coluna do
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
                title="Ritmo, distribuição e quem carrega o quê, em gráficos"
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
      </div>

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
