import { useState } from 'react';

import type { Task } from '../tipos';
import './confirmar.css';
import './dialogo.css';

interface Props {
  task: Task;
  aoSalvar: (nota: string) => void;
  aoCancelar: () => void;
}

/** A nota livre de um card.
 *
 *  O quadro já tinha duas anotações, e as duas exigem que o trabalho tenha
 *  acabado: a do "fiz esta" e a do crédito a outra pessoa. Faltava a que não
 *  conclui nada — "o cliente vai testar sexta", "depende do deploy do financeiro"
 *  — que é o que se quer lembrar justamente enquanto a demanda está aberta. */
export function DialogoDeNota({ task, aoSalvar, aoCancelar }: Props) {
  const [nota, setNota] = useState(task.nota ?? '');

  return (
    <div className="fundo-modal" onClick={aoCancelar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-nota"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-nota">{task.nota ? 'Editar a nota' : 'Nota'}</h2>
        <p className="explicacao">{task.summary}</p>

        <label className="campo">
          <span className="rotulo">Sua nota</span>
          <textarea
            rows={4}
            value={nota}
            autoFocus
            maxLength={2000}
            placeholder="O que você quer lembrar sobre esta demanda…"
            onChange={(e) => setNota(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) aoSalvar(nota);
            }}
          />
          <span className="dica">Só sua. Nada é escrito no Teams.</span>
        </label>

        <div className="acoes-modal">
          <button onClick={aoCancelar}>Cancelar</button>
          <button className="primario" onClick={() => aoSalvar(nota)}>
            {task.nota && !nota.trim() ? 'Apagar a nota' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
