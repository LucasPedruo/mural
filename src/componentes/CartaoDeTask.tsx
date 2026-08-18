import { Draggable } from '@hello-pangea/dnd';
import type { CSSProperties } from 'react';

import { CORES_DE_STATUS, dataCurta, diasDesde } from '../rotulos';
import type { Task } from '../tipos';
import './cartao.css';

interface Props {
  task: Task;
  indice: number;
  /** Na coluna da daily o card mostra a anotação e troca o botão por "desfazer". */
  naColunaDaDaily: boolean;
  ultimaVisita: string | null;
  aoAbrir: (task: Task) => void;
  aoMarcarComoMeu: (task: Task) => void;
  aoDesmarcarComoMeu: (task: Task) => void;
}

export function CartaoDeTask({
  task,
  indice,
  naColunaDaDaily,
  ultimaVisita,
  aoAbrir,
  aoMarcarComoMeu,
  aoDesmarcarComoMeu,
}: Props) {
  const ehNovo = !!ultimaVisita && task.firstSeen > ultimaVisita;
  const mudou = !!ultimaVisita && task.statusChangedAt > ultimaVisita && !ehNovo;
  const dias = diasDesde(task.createdDateTime);
  const parado = task.status === 'aberto' && dias >= 3 ? ` · parada há ${dias}d` : '';
  const propria = task.origem === 'manual';

  // Arrastar entre as colunas do Teams so vale para task fora de alcance ou
  // criada aqui: enquanto a mensagem aparece no Teams, a reacao de la manda e a
  // proxima atualizacao desfaria o movimento. O servidor recusa esse caso, e
  // aqui o gesto nem comeca. Marcar como "feito por mim" e outra historia — nao
  // mexe no status, entao vale para qualquer card, pelo botao do rodape.
  const podeArrastar = task.podeMover;

  const dicaDeArraste = propria
    ? 'Task sua: arraste para mudar de coluna'
    : podeArrastar
      ? 'Fora de alcance: arraste para mudar de coluna'
      : 'Esta mensagem ainda aparece no Teams — reaja por lá e clique em Atualizar';

  return (
    <Draggable draggableId={task.id} index={indice} isDragDisabled={!podeArrastar}>
      {(fornecido, estado) => {
        const estilo: CSSProperties = {
          ...fornecido.draggableProps.style,
          ['--linha' as string]: CORES_DE_STATUS[task.meu ? 'meu' : task.status],
        };
        return (
          <article
            ref={fornecido.innerRef}
            {...fornecido.draggableProps}
            {...fornecido.dragHandleProps}
            style={estilo}
            className={[
              'cartao',
              podeArrastar ? 'fora' : 'preso',
              propria ? 'propria' : '',
              estado.isDragging ? 'arrastando' : '',
            ].join(' ')}
            title={dicaDeArraste}
          >
            <button
              className="texto"
              type="button"
              onClick={() => aoAbrir(task)}
              title={propria ? 'Editar esta task' : 'Abrir a mensagem no Teams'}
            >
              {task.summary}
            </button>

            {/* Na coluna da daily o card existe para ser lido: a solução vem
                junto, não escondida atrás de um clique. */}
            {naColunaDaDaily && task.meu && (
              <p className="solucao">
                {task.meu.solucao || <span className="sem-nota">sem anotação — clique em ✎</span>}
              </p>
            )}

            <div className="rodape">
              {ehNovo && <span className="badge info">novo</span>}
              {mudou && <span className="badge warning">mudou</span>}
              {task.kind === 'bug' && <span className="badge danger">bug</span>}
              {propria && (
                <span className="badge marca" title="Task criada por você, não veio do Teams">
                  minha
                </span>
              )}
              {/* Na coluna da daily o status real do Teams continua visível: a
                  marca pessoal move o card de lugar, não muda o que o canal diz. */}
              {naColunaDaDaily && !propria && (
                <span className="badge neutral" title="Status da mensagem no Teams">
                  no Teams: {task.status === 'feito' ? 'concluído' : task.status}
                </span>
              )}
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

              <span className="acoes">
                {naColunaDaDaily ? (
                  <>
                    <button
                      className="acao"
                      type="button"
                      title="Editar a anotação da daily"
                      onClick={(e) => {
                        e.stopPropagation();
                        aoMarcarComoMeu(task);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="acao"
                      type="button"
                      title="Tirar de Feito por mim — o card volta para a coluna do Teams"
                      onClick={(e) => {
                        e.stopPropagation();
                        aoDesmarcarComoMeu(task);
                      }}
                    >
                      ↩
                    </button>
                  </>
                ) : (
                  <button
                    className="acao"
                    type="button"
                    title="Fui eu que fiz — anotar a solução para a daily"
                    onClick={(e) => {
                      e.stopPropagation();
                      aoMarcarComoMeu(task);
                    }}
                  >
                    fiz
                  </button>
                )}

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
              </span>
            </div>
          </article>
        );
      }}
    </Draggable>
  );
}
