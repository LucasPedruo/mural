import { Draggable } from '@hello-pangea/dnd';
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react';

import { CORES_DE_STATUS, dataCurta, diasDesde, horaCurta } from '../rotulos';
import type { Task } from '../tipos';
import {
  IconeAbrirFora,
  IconeApagar,
  IconeDesfazer,
  IconeEditar,
  IconeEtiqueta,
  IconeFeito,
  IconeIgnorar,
  IconeImagem,
  IconeJuntar,
  IconeNota,
  IconePessoa,
  IconeSeparar,
} from './icones';
import { MenuFlutuante, type ItemDeMenu } from './MenuFlutuante';
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
  /** Na coluna das ignoradas o card troca as ações por "desfazer" e "apagar":
   *  ali não há trabalho a fazer, só decisão a rever. */
  naColunaDeIgnoradas: boolean;
  ultimaVisita: string | null;
  /** Recolhido: uma linha do texto e o rodapé. Prints, continuação da rajada e a
   *  anotação da daily somem — é o que faz uma coluna cheia caber na tela.
   *
   *  Quem decide é a COLUNA, não o card: recolher card por card produzia uma
   *  coluna metade alta e metade baixa, que é mais difícil de varrer com o olho
   *  que qualquer das duas alturas por inteiro. */
  colapsado: boolean;
  /** Modo de juntar ligado: o clique no card seleciona em vez de abrir o Teams. */
  selecionando: boolean;
  selecionado: boolean;
  aoAbrir: (task: Task) => void;
  aoMarcarComoMeu: (task: Task) => void;
  aoCreditarOutro: (task: Task) => void;
  aoTirarCredito: (task: Task) => void;
  /** Solta o card de volta ao fluxo do Teams. Só aparece quando ele está preso
   *  numa coluna sua — que é a única situação em que o quadro deixa de refletir
   *  o que a reação no canal diz. */
  aoSoltarDaColuna: (task: Task) => void;
  aoDesmarcarComoMeu: (task: Task) => void;
  aoSelecionar: (task: Task) => void;
  aoSeparar: (task: Task) => void;
  aoEtiquetar: (task: Task) => void;
  aoAnotar: (task: Task) => void;
  aoIgnorar: (task: Task, ignorar: boolean) => void;
  aoApagar: (task: Task) => void;
}

export function CartaoDeTask({
  task,
  indice,
  naColunaDaDaily,
  naColunaDeIgnoradas,
  ultimaVisita,
  colapsado,
  selecionando,
  selecionado,
  aoAbrir,
  aoMarcarComoMeu,
  aoCreditarOutro,
  aoTirarCredito,
  aoSoltarDaColuna,
  aoDesmarcarComoMeu,
  aoSelecionar,
  aoSeparar,
  aoEtiquetar,
  aoAnotar,
  aoIgnorar,
  aoApagar,
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
  // gravada por uma versao anterior: enquanto a mensagem aparece no Teams, a
  // reacao de la manda e a proxima atualizacao desfaria o movimento. O servidor
  // recusa esse caso, e aqui o gesto nem comeca. Marcar como "feito por mim" e
  // outra historia — nao mexe no status, entao vale para qualquer card.
  const podeArrastar = task.podeMover;

  const dica = selecionando
    ? selecionado
      ? 'Clique para tirar da seleção'
      : 'Clique para juntar com o outro'
    : propria
      ? 'Criada à mão — não tem mensagem no Teams'
      : podeArrastar
        ? 'Clique para abrir no Teams · arraste para mudar de coluna'
        : 'Clique para abrir no Teams';

  // Tudo o que se faz num card mora no menu de "…". Antes eram sete botões
  // disputando o canto do rodapé, todos escondidos atrás de hover e sem nome.
  const acoes: ItemDeMenu[] = [];

  // Preso numa coluna sua, o card não tem status a mexer: ele saiu do fluxo do
  // Teams por escolha sua, e a única coisa a fazer é devolvê-lo. As ações de
  // "fiz esta" e crédito continuam adiante, porque essas não são posição.
  if (task.coluna) {
    acoes.push({
      rotulo: 'Devolver ao Teams',
      icone: <IconeDesfazer />,
      aoEscolher: () => aoSoltarDaColuna(task),
      dica: 'Volta para a coluna que a reação manda',
    });
  }

  if (naColunaDeIgnoradas) {
    acoes.push({
      rotulo: 'Devolver ao quadro',
      icone: <IconeDesfazer />,
      aoEscolher: () => aoIgnorar(task, false),
    });
  } else if (naColunaDaDaily) {
    acoes.push({
      rotulo: 'Editar a anotação',
      icone: <IconeEditar />,
      aoEscolher: () => aoMarcarComoMeu(task),
    });
    if (task.podeDesmarcar) {
      acoes.push({
        rotulo: 'Tirar de Done by me',
        icone: <IconeDesfazer />,
        aoEscolher: () => aoDesmarcarComoMeu(task),
        dica: 'O card volta para a coluna que a reação manda',
      });
    }
  } else {
    acoes.push({
      rotulo: 'Fiz esta',
      icone: <IconeFeito />,
      aoEscolher: () => aoMarcarComoMeu(task),
      dica: 'Anotar a solução',
    });
    // O crédito de quem não é você. Fica ao lado do "Fiz esta" porque é a mesma
    // pergunta — quem resolveu — e o Teams não responde nenhuma das duas: ele
    // conta que alguém deu o check, nunca quem.
    if (task.feitoPor) {
      acoes.push({
        rotulo: 'Editar o crédito',
        icone: <IconePessoa />,
        aoEscolher: () => aoCreditarOutro(task),
        dica: `Hoje: ${task.feitoPor.quem}`,
      });
      acoes.push({
        rotulo: 'Tirar o crédito',
        icone: <IconeDesfazer />,
        aoEscolher: () => aoTirarCredito(task),
        dica: 'O card volta para a coluna que a reação manda',
      });
    } else {
      acoes.push({
        rotulo: 'Feito por outra pessoa',
        icone: <IconePessoa />,
        aoEscolher: () => aoCreditarOutro(task),
        dica: 'Anotar quem resolveu',
      });
    }
  }

  acoes.push({
    rotulo: task.nota ? 'Editar a nota' : 'Anotar',
    icone: <IconeNota />,
    aoEscolher: () => aoAnotar(task),
    dica: task.nota ? undefined : 'Algo que você queira lembrar',
  });

  acoes.push({
    rotulo: 'Etiquetas',
    icone: <IconeEtiqueta />,
    aoEscolher: () => aoEtiquetar(task),
  });

  if (!propria) {
    acoes.push({
      rotulo: selecionado ? 'Tirar da seleção' : 'Juntar com outro',
      icone: <IconeJuntar />,
      aoEscolher: () => aoSelecionar(task),
      dica: 'Quando a mesma demanda virou dois cards',
    });
  }

  if (agrupado) {
    acoes.push({
      rotulo: 'Separar',
      icone: <IconeSeparar />,
      aoEscolher: () => aoSeparar(task),
      dica: 'Cada mensagem volta a ser um card',
    });
  }

  if (!naColunaDeIgnoradas) {
    acoes.push({
      rotulo: 'Não é pra mim',
      icone: <IconeIgnorar />,
      aoEscolher: () => aoIgnorar(task, true),
      dica: 'Tira do quadro, sem tocar no Teams',
    });
  }

  if (task.webUrl) {
    acoes.push({
      rotulo: 'Abrir no navegador',
      icone: <IconeAbrirFora />,
      aoEscolher: () => window.open(task.webUrl, '_blank', 'noopener'),
    });
  }

  if (naColunaDeIgnoradas) {
    acoes.push({
      rotulo: 'Apagar de vez',
      icone: <IconeApagar />,
      aoEscolher: () => aoApagar(task),
      perigo: true,
      dica: 'Não tem volta',
    });
  }

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
          ['--linha' as string]: CORES_DE_STATUS[task.meu ? 'meu' : task.feitoPor ? 'feito' : task.status],
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
              propria ? 'propria' : '',
              agrupado ? 'rajada' : '',
              task.ignorada ? 'ignorada' : '',
              colapsado ? 'colapsado' : '',
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

            {!colapsado && (
              <>
                {/* Print não é texto: mostrar "(só print)" como se fosse título
                    faz o card parecer vazio. A faixa ocupa o lugar da imagem que
                    está no Teams e diz, pela forma, que há algo para ver lá. */}
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
                    {task.meu.solucao || (
                      <span className="sem-nota">Sem anotação</span>
                    )}
                  </p>
                )}

                {/* O que a outra pessoa fez, quando você anotou. O nome fica no
                    rodapé, com os outros selos; aqui vai só o texto — repetir
                    "Fulano" duas vezes no mesmo card não conta nada a mais. */}
                {task.feitoPor?.solucao && <p className="solucao">{task.feitoPor.solucao}</p>}

                {/* A sua nota. Recuada e com filete próprio, para não se
                    confundir com a continuação da rajada, que é texto de
                    outra pessoa. */}
                {task.nota && <p className="nota-do-card">{task.nota}</p>}
              </>
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
                  title="Criada à mão numa versão anterior — não veio do Teams"
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
              {/* Recolhido, o card precisa avisar que esconde algo — senão a
                  faixa de print desaparecida parece card sem print. */}

              {/* Na coluna da daily o status real do Teams continua visível: a
                  marca pessoal move o card de lugar, não muda o que o canal diz. */}
              {naColunaDaDaily && !propria && (
                <span className="badge neutral" title="Status da mensagem no Teams">
                  no Teams: {task.status === 'feito' ? 'concluído' : task.status}
                </span>
              )}
              {/* Quem resolveu. É a única forma de saber: o check do Teams diz
                  que a task acabou, nunca por obra de quem. */}
              {task.feitoPor && (
                <span
                  className="badge marca"
                  title={`Creditado a ${task.feitoPor.quem} em ${dataCurta(task.feitoPor.em)}`}
                >
                  feito por {task.feitoPor.quem}
                </span>
              )}
              {task.meu?.via === 'emoji' && (
                <span
                  className="badge marca"
                  title="Está aqui pela sua reação na mensagem"
                >
                  pela reação
                </span>
              )}
              {/* Preso à mão: o quadro deixou de refletir o canal neste card, e
                  isso precisa estar escrito nele — senão a coluna mente sobre o
                  que o Teams diz. O status real vai no title. */}
              {task.coluna && (
                <span
                  className="badge marca"
                  title={`Preso por você. No Teams está como "${task.status}".`}
                >
                  fora do fluxo
                </span>
              )}
              {task.foraDeAlcance && !propria && (
                <span
                  className="badge alerta"
                  title="O Teams não atualiza mais este card — quem move é você, arrastando"
                >
                  sem sinal do Teams
                </span>
              )}
              {task.movidoAMao && <span className="badge neutral">movido à mão</span>}
              {/* Etiquetas suas. Ficam antes das reações porque são o que você
                  escreveu, e as reações são o que o Teams contou. */}
              {task.tags.map((tag) => (
                <span className="badge etiqueta" key={tag}>
                  {tag}
                </span>
              ))}
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
                <MenuFlutuante itens={acoes} rotulo="Ações deste card" />
              </span>
            </div>
          </article>
        );
      }}
    </Draggable>
  );
}
