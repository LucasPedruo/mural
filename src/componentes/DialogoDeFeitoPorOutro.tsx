import { useState } from 'react';

import type { Task } from '../tipos';
import './confirmar.css';
import './dialogo.css';

interface Props {
  task: Task;
  /** Nomes já vistos neste mural — quem escreveu no canal. São sugestão, não
   *  lista fechada: quem resolveu pode ser alguém que nunca pediu nada ali. */
  pessoas: string[];
  aoSalvar: (quem: string, solucao: string) => void;
  aoCancelar: () => void;
}

/** O espelho do "Fiz esta". O Teams conta que alguém deu o check, nunca quem —
 *  o Graph devolve `reactions[].users` vazio. Então o crédito é uma anotação
 *  sua, e sem ela o quadro sabe que a task acabou mas não sabe por obra de quem;
 *  na retrospectiva isso é justamente a pergunta. */
export function DialogoDeFeitoPorOutro({ task, pessoas, aoSalvar, aoCancelar }: Props) {
  const [quem, setQuem] = useState(task.feitoPor?.quem ?? '');
  const [solucao, setSolucao] = useState(task.feitoPor?.solucao ?? '');

  const valido = !!quem.trim();
  const salvar = () => {
    if (valido) aoSalvar(quem.trim(), solucao);
  };

  return (
    <div className="fundo-modal" onClick={aoCancelar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-feito-por"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-feito-por">
          {task.feitoPor ? 'Editar o crédito' : 'Feito por outra pessoa'}
        </h2>
        <p className="explicacao">{task.summary}</p>

        <label className="campo">
          <span className="rotulo">Quem fez</span>
          <input
            type="text"
            value={quem}
            autoFocus
            maxLength={80}
            list="pessoas-do-mural"
            placeholder="Ex.: Vinicius"
            onChange={(e) => setQuem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') salvar();
            }}
          />
          <datalist id="pessoas-do-mural">
            {pessoas.map((p) => (
              <option value={p} key={p} />
            ))}
          </datalist>
          <span className="dica">Campo livre — quem resolve nem sempre é quem pediu.</span>
        </label>

        <label className="campo">
          <span className="rotulo">Como foi resolvido (opcional)</span>
          <textarea
            rows={3}
            value={solucao}
            maxLength={2000}
            placeholder="Como foi resolvido…"
            onChange={(e) => setSolucao(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) salvar();
            }}
          />
          <span className="dica">O card vai para Concluído. Nada é escrito no Teams.</span>
        </label>

        <div className="acoes-modal">
          <button onClick={aoCancelar}>Cancelar</button>
          <button className="primario" disabled={!valido} onClick={salvar}>
            {task.feitoPor ? 'Salvar' : 'Creditar'}
          </button>
        </div>
      </div>
    </div>
  );
}
