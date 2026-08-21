import { horaCurta } from '../rotulos';
import type { MensagemDaTask, Task } from '../tipos';
import { IconeAbrirFora, IconeImagem } from './icones';
import './confirmar.css';
import './dialogo.css';

interface Props {
  task: Task;
  aoAbrirMensagem: (m: MensagemDaTask) => void;
  aoFechar: () => void;
}

/** As mensagens que formam um card.
 *
 *  Um card agrupado é várias mensagens do Teams — dois prints e três linhas que
 *  são uma demanda só. Clicar nele abria a **âncora**, a primeira, e as outras
 *  ficavam sem porta: o card dizia "4 mensagens" e entregava uma.
 *
 *  Aqui cada uma é clicável, e abre a si mesma no Teams. Card de uma mensagem
 *  não passa por aqui — para ele, o clique continua indo direto. */
export function DialogoDaRajada({ task, aoAbrirMensagem, aoFechar }: Props) {
  const mensagens = task.mensagens ?? [];

  return (
    <div className="fundo-modal" onClick={aoFechar} role="presentation">
      <div
        className="modal largo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-rajada"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-rajada">
          {mensagens.length} mensagens neste card
        </h2>
        <p className="explicacao">
          {task.agrupamento === 'mao'
            ? 'Você juntou estas mensagens. Clique numa para abrir no Teams.'
            : 'O Mural juntou estas mensagens numa demanda. Clique numa para abrir no Teams.'}
        </p>

        <div className="lista-da-rajada">
          {mensagens.map((m, i) => (
            <button
              className={'mensagem-da-rajada' + (i === 0 ? ' ancora' : '')}
              key={m.id}
              onClick={() => aoAbrirMensagem(m)}
              title="Abrir esta mensagem no Teams"
            >
              <span className="cabeca">
                <span className="autor">{m.author}</span>
                <span className="hora">{horaCurta(m.createdDateTime)}</span>
                {/* A âncora é a que dá nome ao card e a que o id do card usa.
                    Dizer qual é evita a pergunta "por que o título é esta e não
                    aquela". */}
                {i === 0 && <span className="badge marca">âncora</span>}
                {m.kind === 'bug' && <span className="badge danger">bug</span>}
                <span className="abrir">
                  <IconeAbrirFora tamanho={13} />
                </span>
              </span>
              <span className="corpo-da-mensagem">
                {m.soPrint ? (
                  <span className="so-print">
                    <IconeImagem tamanho={14} /> print — abrir para ver
                  </span>
                ) : (
                  m.summary
                )}
              </span>
              {m.reactions.length > 0 && (
                <span className="reacoes">{m.reactions.join(' ')}</span>
              )}
            </button>
          ))}
        </div>

        <div className="acoes-modal">
          <button onClick={aoFechar}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
