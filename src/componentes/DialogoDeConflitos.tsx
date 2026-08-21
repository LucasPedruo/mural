import { rotuloDaColuna } from '../rotulos';
import type { ColunaId, Task } from '../tipos';
import { IconeFeito, IconePessoa } from './icones';
import './confirmar.css';
import './dialogo.css';

interface Props {
  /** Os cards em que o seu gesto e a reação no canal discordam. */
  tasks: Task[];
  aoDecidir: (task: Task, decisao: 'teams' | 'meu') => void;
  aoFechar: () => void;
}

/** O desacordo entre onde VOCÊ pôs o card e o que a reação no Teams diz.
 *
 *  Arrastar um card que o Teams acompanha era proibido, e a razão era boa: a
 *  próxima leitura desfaria o gesto. A razão contra era melhor — um quadro que
 *  recusa o gesto obriga você a ir reagir no Teams antes de poder organizar o
 *  próprio quadro, e as duas coisas não acontecem no mesmo minuto.
 *
 *  Então o gesto passa, e a leitura seguinte pergunta em vez de desfazer. Nada
 *  se move sozinho aqui: cada card espera a sua resposta. */
export function DialogoDeConflitos({ tasks, aoDecidir, aoFechar }: Props) {
  return (
    <div className="fundo-modal" role="presentation">
      <div
        className="modal largo"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-conflitos"
      >
        <h2 id="titulo-conflitos">
          {tasks.length === 1
            ? 'Um card discorda do Teams'
            : `${tasks.length} cards discordam do Teams`}
        </h2>
        <p className="explicacao">
          Você moveu {tasks.length === 1 ? 'este card' : 'estes cards'} à mão, e a reação na
          mensagem diz outra coisa. Nada foi movido — escolha por card.
        </p>

        <div className="lista-conflitos">
          {tasks.map((t) => (
            <div className="conflito" key={t.id}>
              <p className="texto-do-card">{t.summary}</p>

              <div className="lados">
                <span className="lado">
                  <span className="de-quem">
                    <IconePessoa tamanho={12} /> você pôs em
                  </span>
                  <strong>{rotuloDaColuna(t.status as ColunaId)}</strong>
                </span>
                <span className="lado">
                  <span className="de-quem">
                    <IconeFeito tamanho={12} /> a reação diz
                  </span>
                  <strong>{rotuloDaColuna(t.conflito!.statusDoTeams)}</strong>
                  {t.emojis.length > 0 && <span className="emojis">{t.emojis.join(' ')}</span>}
                </span>
              </div>

              <div className="decisao">
                <button onClick={() => aoDecidir(t, 'teams')}>
                  Aceitar o Teams
                </button>
                <button className="primario" onClick={() => aoDecidir(t, 'meu')}>
                  Manter onde eu pus
                </button>
              </div>
              <p className="dica">
                Mantendo, a pergunta só volta se as reações da mensagem mudarem — e aí é porque
                alguém mexeu, não porque o Mural esqueceu.
              </p>
            </div>
          ))}
        </div>

        <div className="acoes-modal">
          <button onClick={aoFechar}>Decidir depois</button>
        </div>
      </div>
    </div>
  );
}
