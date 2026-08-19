import { Draggable } from '@hello-pangea/dnd';
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';

import { CORES_DE_STATUS, dataCurta, diasDesde, horaCurta } from '../rotulos';
import type { Task } from '../tipos';
import { IconeImagem } from './icones';
import './cartao.css';

/** Quantos prints e quantas linhas de continuação o card mostra antes de
 *  resumir o resto num "+N". Um card de rajada longa não pode virar uma coluna
 *  inteira: ele é a chamada para abrir a conversa, não a conversa. */
const PRINTS_VISIVEIS = 3;
const LINHAS_VISIVEIS = 2;

interface Props {
  task: Task;
  indice: number;
  /** Na coluna da daily o card mostra a anotação e troca o botão por "desfazer". */
  naColunaDaDaily: boolean;
  ultimaVisita: string | null;
  /** Modo de juntar ligado: o clique no card seleciona em vez de abrir o Teams. */
  selecionando: boolean;
  selecionado: boolean;
  aoAbrir: (task: Task) => void;
  aoMarcarComoMeu: (task: Task) => void;
  aoDesmarcarComoMeu: (task: Task) => void;
  aoSelecionar: (task: Task) => void;
  aoSeparar: (task: Task) => void;
}

export function CartaoDeTask({
  task,
  indice,
  naColunaDaDaily,
  ultimaVisita,
  selecionando,
  selecionado,
  aoAbrir,
  aoMarcarComoMeu,
  aoDesmarcarComoMeu,
  aoSelecionar,
  aoSeparar,
}: Props) {
  const ehNovo = !!ultimaVisita && task.firstSeen > ultimaVisita;
  const mudou = !!ultimaVisita && task.statusChangedAt > ultimaVisita && !ehNovo;
  const dias = diasDesde(task.createdDateTime);
  const parado = task.status === 'aberto' && dias >= 3 ? ` · parada há ${dias}d` : '';
  const propria = task.origem === 'manual';

  // Uma demanda quase nunca chega como uma mensagem só: o padrão é a rajada —
  // prints seguidos das linhas de texto que os explicam. O card mostra o texto
  // que dá nome à task, os prints como faixas e o resto como continuação.
  const mensagens = task.mensagens?.length ? task.mensagens : [];
  const prints = mensagens.filter((m) => m.soPrint);
  const linhas = mensagens.filter((m) => !m.soPrint && m.summary !== task.summary);
  const agrupado = mensagens.length > 1;

  // Arrastar entre as colunas do Teams so vale para task fora de alcance ou
  // criada aqui: enquanto a mensagem aparece no Teams, a reacao de la manda e a
  // proxima atualizacao desfaria o movimento. O servidor recusa esse caso, e
  // aqui o gesto nem comeca. Marcar como "feito por mim" e outra historia — nao
  // mexe no status, entao vale para qualquer card, pelo botao do rodape.
  const podeArrastar = task.podeMover;

  const dica = selecionando
    ? selecionado
      ? 'Selecionada para juntar — clique para tirar da seleção'
      : 'Clique para incluir na task que vai ser juntada'
    : propria
      ? 'Criada à mão numa versão anterior: não tem mensagem no Teams, mas você pode arrastá-la'
      : podeArrastar
        ? 'Clique para abrir no Teams · arraste para mudar de coluna'
        : 'Clique para abrir a mensagem no Teams';

  return (
    <Draggable draggableId={task.id} index={indice} isDragDisabled={!podeArrastar}>
      {(fornecido, estado) => {
        // O card inteiro é o alvo do clique, não só o texto: o gesto natural em
        // cima de um card é clicar nele, e mirar na linha do título era um
        // detalhe de implementação vazando para a mão de quem usa.
        const abrir = (e: MouseEvent | KeyboardEvent) => {
          if (estado.isDragging) return;
          // Selecionar texto com o mouse não pode abrir o Teams por acidente.
          if (window.getSelection()?.toString()) return;
          e.stopPropagation();
          if (selecionando) aoSelecionar(task);
          else aoAbrir(task);
        };

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
              task.foraDeAlcance && !propria ? 'fora' : 'preso',
              podeArrastar ? 'movivel' : '',
              propria ? 'propria' : '',
              agrupado ? 'rajada' : '',
              selecionado ? 'selecionado' : '',
              estado.isDragging ? 'arrastando' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={dica}
            aria-label={task.summary}
            onClick={abrir}
            // Enter abre; espaço fica com o dnd, que usa a tecla para pegar o
            // card. Roubá-la aqui quebraria o arraste por teclado.
            onKeyDown={(e) => {
              if (e.key === 'Enter') abrir(e);
            }}
          >
            <div className="texto">{task.summary}</div>

            {/* Print não é texto: mostrar "(só print)" como se fosse título faz
                o card parecer vazio. A faixa ocupa o lugar da imagem que está
                no Teams e diz, pela forma, que há algo para ver lá. */}
            {prints.length > 0 && (
              <div className="prints" aria-label={`${prints.length} print(s) na conversa`}>
                {prints.slice(0, PRINTS_VISIVEIS).map((m) => (
                  <span className="print" key={m.id}>
                    <IconeImagem />
                  </span>
                ))}
                {prints.length > PRINTS_VISIVEIS && (
                  <span className="mais">+{prints.length - PRINTS_VISIVEIS} prints</span>
                )}
              </div>
            )}

            {/* O resto da rajada: as linhas que a pessoa mandou em seguida.
                Ficam visíveis porque é nelas que costuma estar o detalhe que
                faz a task ser entendida. */}
            {linhas.slice(0, LINHAS_VISIVEIS).map((m) => (
              <p className="continuacao" key={m.id}>
                {m.summary}
              </p>
            ))}
            {linhas.length > LINHAS_VISIVEIS && (
              <p className="continuacao mais">
                +{linhas.length - LINHAS_VISIVEIS} mensagens nesta rajada
              </p>
            )}

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
              {/* Resquício de quando dava para criar task aqui dentro. O selo
                  fica para o card do histórico antigo continuar legível — o
                  Mural não cria mais task nenhuma. */}
              {propria && (
                <span
                  className="badge marca"
                  title="Criada à mão numa versão anterior do Mural, não veio do Teams"
                >
                  à mão
                </span>
              )}
              {/* Quantas mensagens do Teams este card representa. Sem isso o
                  agrupamento seria invisível, e um card que esconde quatro
                  mensagens não pode parecer igual a um que tem uma. */}
              {agrupado && (
                <span
                  className="badge neutral"
                  title={mensagens
                    .map((m) => `${horaCurta(m.createdDateTime)} ${m.soPrint ? 'print' : m.summary}`)
                    .join('\n')}
                >
                  {mensagens.length} mensagens
                  {task.agrupamento === 'mao' ? ' · à mão' : ''}
                </span>
              )}
              {/* Na coluna da daily o status real do Teams continua visível: a
                  marca pessoal move o card de lugar, não muda o que o canal diz. */}
              {naColunaDaDaily && !propria && (
                <span className="badge neutral" title="Status da mensagem no Teams">
                  no Teams: {task.status === 'feito' ? 'concluído' : task.status}
                </span>
              )}
              {task.meu?.via === 'emoji' && (
                <span
                  className="badge marca"
                  title="Está aqui porque a sua reação está na mensagem. Para tirar, remova a reação no Teams."
                >
                  pela reação
                </span>
              )}
              {task.foraDeAlcance && !propria && (
                <span
                  className="badge alerta"
                  title="Saiu das ~20 mensagens que a API devolve. O Teams não conta mais nada sobre este card: quem move é você, arrastando."
                >
                  sem sinal do Teams
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
                {/* Juntar e separar existem porque a heurística de rajada erra
                    em alguns casos — e card errado que não dá para consertar é
                    pior que card errado. O que você decide aqui nenhuma
                    atualização desfaz. */}
                {!propria && (
                  <button
                    className={'acao' + (selecionado ? ' ligada' : '')}
                    type="button"
                    title={
                      selecionado
                        ? 'Tirar da seleção'
                        : 'Juntar com outro card — para quando a mesma demanda virou dois'
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      aoSelecionar(task);
                    }}
                  >
                    ⧉
                  </button>
                )}
                {agrupado && (
                  <button
                    className="acao"
                    type="button"
                    title="Separar: cada mensagem volta a ser um card"
                    onClick={(e) => {
                      e.stopPropagation();
                      aoSeparar(task);
                    }}
                  >
                    ⑃
                  </button>
                )}

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
                    {/* Se foi a sua reação que trouxe o card para cá, tirar a
                        marca aqui duraria até o próximo sync repor. O gesto nem
                        aparece — a saída é tirar a reação no Teams. */}
                    {task.podeDesmarcar && (
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
                    )}
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
