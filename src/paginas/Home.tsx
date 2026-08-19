import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api } from '../api';
import { COLUNAS, CORES_DE_STATUS, rotuloDaColuna, rotuloDoTipo, tempoRelativo } from '../rotulos';
import type { MuralNaLista } from '../tipos';
import './home.css';

export function Home() {
  const navegar = useNavigate();
  const [murais, setMurais] = useState<MuralNaLista[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

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
        'Apaga o cache do onboarding: a conta Microsoft verificada, a lista de chats e ' +
        'a preferência de confirmar antes de atualizar.\n\n' +
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
              </div>
            </div>

            <div className="numeros">
              {/* Inclui "Feito por mim": um card marcado sai da coluna do
                  Teams, então sem essa pílula a soma da linha não fecharia. */}
              {COLUNAS.map((s) => (
                <span className="pilula" key={s} title={rotuloDaColuna(s, m)}>
                  <span className="ponto" style={{ background: CORES_DE_STATUS[s] }} />
                  {m.totais[s]}
                </span>
              ))}
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
              ✕
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
}
