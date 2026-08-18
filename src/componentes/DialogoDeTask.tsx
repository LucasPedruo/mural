import { useState } from 'react';

import { CORES_DE_STATUS, rotuloDaColuna, STATUS } from '../rotulos';
import type { Mural, NovaTask, Status, Task } from '../tipos';
import './confirmar.css';
import './dialogo.css';

interface Props {
  /** Preenchido = edição; ausente = task nova. */
  task?: Task | null;
  mural: Mural | null;
  aoSalvar: (dados: NovaTask) => void;
  aoCancelar: () => void;
  aoRemover?: () => void;
}

/** Task que você escreve aqui dentro. Nem tudo que vira trabalho passa pelo
 *  canal — o que combinaram no corredor também precisa de um lugar. */
export function DialogoDeTask({ task, mural, aoSalvar, aoCancelar, aoRemover }: Props) {
  const [summary, setSummary] = useState(task?.summary ?? '');
  const [kind, setKind] = useState<'bug' | 'sugestao'>(task?.kind ?? 'sugestao');
  const [status, setStatus] = useState<Status>(task?.status ?? 'aberto');

  const texto = summary.trim();

  function salvar() {
    if (!texto) return;
    aoSalvar({ summary: texto, kind, status });
  }

  return (
    <div className="fundo-modal" onClick={aoCancelar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-task"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-task">{task ? 'Editar task' : 'Nova task'}</h2>
        <p className="explicacao">
          Esta task é sua: não veio do Teams, então nenhuma atualização vai mexer nela — nem no
          texto, nem na coluna.
        </p>

        <label className="campo">
          <span className="rotulo">O que precisa ser feito</span>
          <textarea
            rows={3}
            value={summary}
            autoFocus
            maxLength={1000}
            placeholder="Ex.: revisar o filtro de data do relatório com o financeiro"
            onChange={(e) => setSummary(e.target.value)}
            onKeyDown={(e) => {
              // Enter com Ctrl salva: o campo é multilinha, então Enter sozinho
              // precisa continuar quebrando linha.
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) salvar();
            }}
          />
        </label>

        <div className="campo">
          <span className="rotulo">Tipo</span>
          <div className="opcoes">
            {(['sugestao', 'bug'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={k === kind ? 'escolhida' : ''}
                onClick={() => setKind(k)}
              >
                {k === 'bug' ? 'bug' : 'sugestão'}
              </button>
            ))}
          </div>
        </div>

        <div className="campo">
          <span className="rotulo">Coluna</span>
          <div className="opcoes">
            {STATUS.map((s) => (
              <button
                key={s}
                type="button"
                className={s === status ? 'escolhida' : ''}
                style={{ ['--marca-escolha' as string]: CORES_DE_STATUS[s] }}
                onClick={() => setStatus(s)}
              >
                {rotuloDaColuna(s, mural ?? undefined)}
              </button>
            ))}
          </div>
          <span className="dica">
            Depois você pode arrastar esta task entre as colunas à vontade — a regra que prende os
            cards do Teams no lugar vale só para eles.
          </span>
        </div>

        <div className="acoes-modal">
          {aoRemover && (
            <>
              <button className="perigo" onClick={aoRemover}>
                Apagar
              </button>
              <span className="separador" />
            </>
          )}
          <button onClick={aoCancelar}>Cancelar</button>
          <button className="primario" onClick={salvar} disabled={!texto}>
            {task ? 'Salvar' : 'Criar task'}
          </button>
        </div>
      </div>
    </div>
  );
}
