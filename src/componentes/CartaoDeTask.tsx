import { Draggable } from '@hello-pangea/dnd';
import type { CSSProperties } from 'react';

import { CORES_DE_STATUS, dataCurta, diasDesde } from '../rotulos';
import type { Task } from '../tipos';
import './cartao.css';

interface Props {
  task: Task;
  indice: number;
  ultimaVisita: string | null;
  aoAbrir: (task: Task) => void;
}

export function CartaoDeTask({ task, indice, ultimaVisita, aoAbrir }: Props) {
  const ehNovo = !!ultimaVisita && task.firstSeen > ultimaVisita;
  const mudou = !!ultimaVisita && task.statusChangedAt > ultimaVisita && !ehNovo;
  const dias = diasDesde(task.createdDateTime);
  const parado = task.status === 'aberto' && dias >= 3 ? ` · parada há ${dias}d` : '';

  // Arrastar so vale para task fora de alcance: enquanto a mensagem ainda
  // aparece no Teams, a reacao de la manda e a proxima atualizacao desfaria o
  // movimento. O servidor recusa esse caso, e aqui o gesto nem comeca.
  const podeArrastar = task.foraDeAlcance;

  return (
    <Draggable draggableId={task.id} index={indice} isDragDisabled={!podeArrastar}>
      {(fornecido, estado) => {
        const estilo: CSSProperties = {
          ...fornecido.draggableProps.style,
          ['--linha' as string]: CORES_DE_STATUS[task.status],
        };
        return (
          <article
            ref={fornecido.innerRef}
            {...fornecido.draggableProps}
            {...fornecido.dragHandleProps}
            style={estilo}
            className={[
              'cartao',
              task.foraDeAlcance ? 'fora' : 'preso',
              estado.isDragging ? 'arrastando' : '',
            ].join(' ')}
            title={
              podeArrastar
                ? 'Fora de alcance: arraste para mudar de coluna'
                : 'Esta mensagem ainda aparece no Teams — reaja por lá e clique em Atualizar'
            }
          >
            <button className="texto" type="button" onClick={() => aoAbrir(task)}>
              {task.summary}
            </button>

            <div className="rodape">
              {ehNovo && <span className="badge info">novo</span>}
              {mudou && <span className="badge warning">mudou</span>}
              {task.kind === 'bug' && <span className="badge danger">bug</span>}
              {task.foraDeAlcance && (
                <span
                  className="badge neutral"
                  title="Saiu das mensagens que a API devolve. O Teams não atualiza mais este card."
                >
                  fora de alcance
                </span>
              )}
              {task.movidoAMao && <span className="badge neutral">movido à mão</span>}
              {/* Sem emoji fixo para "peguei", ver a reação usada é a única
                  forma de saber o que aconteceu na mensagem. */}
              {task.emojis.map((emoji, i) => (
                <span className="badge reacao" key={`${emoji}-${i}`}>
                  {emoji}
                </span>
              ))}

              <span className="autor">
                {task.author} · {dataCurta(task.createdDateTime)}
                {parado}
              </span>

              {task.webUrl && (
                <a
                  className="abrir-web"
                  href={task.webUrl}
                  target="_blank"
                  rel="noopener"
                  title="Abrir no Teams do navegador"
                  onClick={(e) => e.stopPropagation()}
                >
                  web
                </a>
              )}
            </div>
          </article>
        );
      }}
    </Draggable>
  );
}
