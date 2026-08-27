import { useState } from 'react';

import { api } from '../api';
import type { Task } from '../tipos';
import './confirmar.css';
import './dialogo.css';

interface Props {
  task: Task;
  aoSalvar: (solucao: string, prUrl: string) => void;
  aoCancelar: () => void;
}

/** A anotação que você lê na daily. Escrita na hora em que a solução ainda
 *  está fresca — dois dias depois ninguém lembra o que foi feito. */
export function DialogoDeSolucao({ task, aoSalvar, aoCancelar }: Props) {
  const [solucao, setSolucao] = useState(task.meu?.solucao ?? '');
  const [prUrl, setPrUrl] = useState(task.meu?.prUrl ?? '');
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function resumirPr() {
    const link = prUrl.trim();
    if (!link) return;
    setLendo(true);
    setErro(null);
    try {
      const r = await api.resumirPr(link);
      setPrUrl(r.url || link);
      setSolucao(
        [r.titulo, r.resumo].filter(Boolean).join(' — ').slice(0, 2000),
      );
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setLendo(false);
    }
  }

  return (
    <div className="fundo-modal" onClick={aoCancelar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-solucao"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-solucao">{task.meu ? 'Editar entrega' : 'Done by me'}</h2>
        <p className="explicacao">{task.summary}</p>

        <label className="campo">
          <span className="rotulo">Link do PR</span>
          <input
            type="text"
            value={prUrl}
            autoFocus
            placeholder="https://github.com/.../pull/123 ou Azure DevOps"
            onChange={(e) => setPrUrl(e.target.value)}
          />
          <span className="dica">Use o botão abaixo para preencher a daily com o resumo do PR.</span>
        </label>

        <label className="campo">
          <span className="rotulo">Resumo para daily</span>
          <textarea
            rows={4}
            value={solucao}
            maxLength={2000}
            placeholder="O resumo do PR aparece aqui, mas você pode editar antes de salvar."
            onChange={(e) => setSolucao(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) aoSalvar(solucao, prUrl);
            }}
          />
          <span className="dica">O card vai para Done by me, no dia de hoje.</span>
        </label>

        {erro && <p className="aviso erro">{erro}</p>}

        <div className="acoes-modal">
          <button onClick={aoCancelar}>Cancelar</button>
          <button onClick={() => void resumirPr()} disabled={!prUrl.trim() || lendo}>
            {lendo ? 'Lendo PR...' : 'Ler PR'}
          </button>
          <button className="primario" onClick={() => aoSalvar(solucao, prUrl)}>
            {task.meu ? 'Salvar' : 'Marcar como feito'}
          </button>
        </div>
      </div>
    </div>
  );
}
