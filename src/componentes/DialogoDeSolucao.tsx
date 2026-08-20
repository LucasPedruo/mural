import { useState } from 'react';

import type { Task } from '../tipos';
import './confirmar.css';
import './dialogo.css';

interface Props {
  task: Task;
  aoSalvar: (solucao: string) => void;
  aoCancelar: () => void;
}

/** A anotação que você lê na daily. Escrita na hora em que a solução ainda
 *  está fresca — dois dias depois ninguém lembra o que foi feito. */
export function DialogoDeSolucao({ task, aoSalvar, aoCancelar }: Props) {
  const [solucao, setSolucao] = useState(task.meu?.solucao ?? '');

  return (
    <div className="fundo-modal" onClick={aoCancelar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-solucao"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-solucao">{task.meu ? 'Editar a anotação' : 'Concluído por mim'}</h2>
        <p className="explicacao">{task.summary}</p>

        <label className="campo">
          <span className="rotulo">Como você resolveu</span>
          <textarea
            rows={4}
            value={solucao}
            autoFocus
            maxLength={2000}
            placeholder="Ex.: era o cache do relatório; limpei na virada do mês e subi o fix na 2.4.1"
            onChange={(e) => setSolucao(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) aoSalvar(solucao);
            }}
          />
          <span className="dica">
            Uma ou duas frases, no tom em que você falaria na daily. O card sai da coluna do Teams
            e passa a viver em "Concluído por mim", agrupado pelo dia de hoje.
          </span>
        </label>

        <div className="acoes-modal">
          <button onClick={aoCancelar}>Cancelar</button>
          <button className="primario" onClick={() => aoSalvar(solucao)}>
            {task.meu ? 'Salvar' : 'Marcar como feito'}
          </button>
        </div>
      </div>
    </div>
  );
}
