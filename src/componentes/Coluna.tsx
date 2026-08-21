import { Draggable, Droppable } from '@hello-pangea/dnd';
import type { ReactNode } from 'react';

import type { Task } from '../tipos';
import { CartaoDeTask } from './CartaoDeTask';
import { IconeAbaixo, IconeAcima, IconeColapsar, IconePegar } from './icones';
import { MenuFlutuante, type ItemDeMenu } from './MenuFlutuante';
import './coluna.css';

/** Os dois tipos de arraste do quadro. O dnd só deixa soltar um Draggable num
 *  Droppable do MESMO tipo — é o que impede um card de ser solto entre colunas e
 *  uma coluna de cair dentro de uma lista de cards. */
export const TIPO_CARTAO = 'cartao';
export const TIPO_COLUNA = 'coluna';

/** Um bloco de cards com cabeçalho próprio dentro da coluna — usado pela
 *  "Done by me", que separa os cards por dia. */
export interface GrupoDaColuna {
  chave: string;
  rotulo: string;
  tasks: Task[];
}

interface Props {
  /** O id da coluna: um dos seis do Teams, ou o de uma coluna sua. É o
   *  `droppableId` do arraste, então precisa ser único no quadro. */
  status: string;
  rotulo: string;
  /** A cor da coluna, já como valor de CSS. Vem de fora porque as seis do Teams
   *  a tiram do status e as suas a tiram do que você escolheu — a coluna não
   *  precisa saber de qual das duas listas ela é. */
  cor: string;
  /** Sem grupos: uma lista corrida. Com grupos: um cabeçalho por bloco. */
  grupos: GrupoDaColuna[];
  /** Posição na fila de colunas. É o que o dnd usa para saber onde ela está
   *  quando você a arrasta para outro lugar. */
  indiceDaColuna: number;
  ultimaVisita: string | null;
  vazio?: string;
  /** Colapsada: a coluna vira uma faixa fina com o rótulo de pé e a contagem.
   *  Continua aceitando cards soltos nela — é o que permite guardar algo numa
   *  coluna que você não quer olhar agora. */
  colapsada: boolean;
  aoColapsar: (colapsar: boolean) => void;
  /** Modo de juntar ligado: o clique num card seleciona em vez de abrir. */
  selecionando: boolean;
  selecionados: Set<string>;
  /** Controle próprio no cabeçalho — hoje só a coluna da daily usa, para
   *  mostrar e trocar a reação que marca os cards como seus. */
  acessorio?: ReactNode;
  /** O menu de "…" do cabeçalho. Só as colunas suas têm: renomear e excluir não
   *  fazem sentido em coluna que é regra do Teams. */
  menu?: ItemDeMenu[];
  aoAbrir: (task: Task) => void;
  aoMarcarComoMeu: (task: Task) => void;
  aoCreditarOutro: (task: Task) => void;
  aoTirarCredito: (task: Task) => void;
  aoSoltarDaColuna: (task: Task) => void;
  aoDesmarcarComoMeu: (task: Task) => void;
  aoSelecionar: (task: Task) => void;
  aoSeparar: (task: Task) => void;
  aoEtiquetar: (task: Task) => void;
  aoIgnorar: (task: Task, ignorar: boolean) => void;
  aoApagar: (task: Task) => void;
  /** Todos os cards desta coluna recolhidos, ou todos expandidos. É escolha da
   *  coluna e não do card: metade alta e metade baixa é mais difícil de varrer
   *  com o olho que qualquer das duas alturas por inteiro. Mora no quadro porque
   *  sobrevive a recarregar a página. */
  cardsRecolhidos: boolean;
  aoRecolherCards: (recolher: boolean) => void;
}

export function Coluna({
  status,
  rotulo,
  cor,
  grupos,
  indiceDaColuna,
  ultimaVisita,
  acessorio,
  menu,
  vazio = 'Nada aqui',
  colapsada,
  aoColapsar,
  selecionando,
  selecionados,
  aoAbrir,
  aoMarcarComoMeu,
  aoCreditarOutro,
  aoTirarCredito,
  aoSoltarDaColuna,
  aoDesmarcarComoMeu,
  aoSelecionar,
  aoSeparar,
  aoEtiquetar,
  aoIgnorar,
  aoApagar,
  cardsRecolhidos,
  aoRecolherCards,
}: Props) {
  const total = grupos.reduce((s, g) => s + g.tasks.length, 0);
  const agrupada = grupos.length > 1 || (grupos[0] && grupos[0].rotulo !== '');

  // O índice do Draggable é posicional dentro do Droppable inteiro, não dentro
  // do grupo: repetir o 0 a cada bloco embaralharia o arraste.
  let indice = 0;

  // A coluna é ela mesma um Draggable — a ordem das colunas é escolha de quem
  // usa. O que se pega é o CABEÇALHO, não a coluna inteira: pegar pela coluna
  // roubaria o gesto dos cards que estão dentro dela.
  return (
    <Draggable draggableId={`coluna-${status}`} index={indiceDaColuna}>
      {(colunaFornecida, colunaEstado) => {
        const classe = [
          'coluna',
          colapsada ? 'colapsada' : '',
          colunaEstado.isDragging ? 'arrastando' : '',
        ]
          .filter(Boolean)
          .join(' ');

        // Colapsada, a coluna guarda o mínimo para ser reconhecida e reaberta — e
        // continua sendo alvo de soltar, porque arrastar para uma coluna fechada é
        // justamente o gesto de "guarda isso aí que eu não quero ver agora".
        if (colapsada) {
          return (
            <section
              className={classe}
              ref={colunaFornecida.innerRef}
              {...colunaFornecida.draggableProps}
            >
              <button
                className="expandir"
                onClick={() => aoColapsar(false)}
                title={`Expandir ${rotulo} — arraste para mudar a ordem`}
                {...colunaFornecida.dragHandleProps}
              >
                <span className="ponto" style={{ background: cor }} />
                <IconeAbaixo tamanho={13} />
                <span className="contagem">{total}</span>
                <span className="rotulo-de-pe">{rotulo}</span>
              </button>

              <Droppable droppableId={status} type={TIPO_CARTAO}>
                {(fornecido, estado) => (
                  <div
                    ref={fornecido.innerRef}
                    {...fornecido.droppableProps}
                    className={'faixa' + (estado.isDraggingOver ? ' recebendo' : '')}
                  >
                    {fornecido.placeholder}
                  </div>
                )}
              </Droppable>
            </section>
          );
        }

        return (
          <section
            className={classe}
            ref={colunaFornecida.innerRef}
            {...colunaFornecida.draggableProps}
          >
            <header {...colunaFornecida.dragHandleProps} title="Arraste para mudar a ordem">
              <span className="pegar" aria-hidden="true">
                <IconePegar tamanho={13} />
              </span>
              <span className="selo">
                <span className="ponto" style={{ background: cor }} />
                {rotulo}
              </span>
              {acessorio}
              <span className="contagem">{total}</span>
              <MenuFlutuante
                itens={[
                  {
                    rotulo: cardsRecolhidos ? 'Expandir os cards' : 'Recolher os cards',
                    icone: cardsRecolhidos ? <IconeAbaixo /> : <IconeAcima />,
                    aoEscolher: () => aoRecolherCards(!cardsRecolhidos),
                    dica: 'Vale para a coluna inteira',
                  },
                  ...(menu ?? []),
                ]}
                rotulo={`Ações da coluna ${rotulo}`}
              />
              <button
                className="colapsar"
                onClick={() => aoColapsar(true)}
                title={`Colapsar ${rotulo} — ela continua recebendo cards arrastados`}
                aria-label={`Colapsar ${rotulo}`}
              >
                <IconeColapsar />
              </button>
            </header>

            <Droppable droppableId={status} type={TIPO_CARTAO}>
              {(fornecido, estado) => (
                <div
                  ref={fornecido.innerRef}
                  {...fornecido.droppableProps}
                  className={'lista' + (estado.isDraggingOver ? ' recebendo' : '')}
                >
                  {total === 0 && !estado.isDraggingOver && <p className="vazio">{vazio}</p>}

                  {grupos.map((grupo) => (
                    <div className="grupo" key={grupo.chave}>
                      {agrupada && grupo.tasks.length > 0 && (
                        <div className="dia">
                          <span className="rotulo-dia">{grupo.rotulo}</span>
                          <span className="risco" />
                          <span className="quantos">{grupo.tasks.length}</span>
                        </div>
                      )}
                      {grupo.tasks.map((t) => (
                        <CartaoDeTask
                          key={t.id}
                          task={t}
                          indice={indice++}
                          naColunaDaDaily={status === 'meu'}
                          naColunaDeIgnoradas={status === 'ignorada'}
                          ultimaVisita={ultimaVisita}
                          colapsado={cardsRecolhidos}
                          selecionando={selecionando}
                          selecionado={selecionados.has(t.id)}
                          aoAbrir={aoAbrir}
                          aoMarcarComoMeu={aoMarcarComoMeu}
                          aoCreditarOutro={aoCreditarOutro}
                          aoTirarCredito={aoTirarCredito}
                          aoSoltarDaColuna={aoSoltarDaColuna}
                          aoDesmarcarComoMeu={aoDesmarcarComoMeu}
                          aoSelecionar={aoSelecionar}
                          aoSeparar={aoSeparar}
                          aoEtiquetar={aoEtiquetar}
                          aoIgnorar={aoIgnorar}
                          aoApagar={aoApagar}
                        />
                      ))}
                    </div>
                  ))}
                  {fornecido.placeholder}
                </div>
              )}
            </Droppable>
          </section>
        );
      }}
    </Draggable>
  );
}
