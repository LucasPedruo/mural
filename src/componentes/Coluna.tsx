import { Droppable } from '@hello-pangea/dnd';
import type { ReactNode } from 'react';

import { CORES_DE_STATUS } from '../rotulos';
import type { ColunaId, Task } from '../tipos';
import { CartaoDeTask } from './CartaoDeTask';
import './coluna.css';

/** Um bloco de cards com cabeçalho próprio dentro da coluna — usado pela
 *  "Feito por mim", que separa os cards por dia. */
export interface GrupoDaColuna {
  chave: string;
  rotulo: string;
  tasks: Task[];
}

interface Props {
  status: ColunaId;
  rotulo: string;
  /** Sem grupos: uma lista corrida. Com grupos: um cabeçalho por bloco. */
  grupos: GrupoDaColuna[];
  ultimaVisita: string | null;
  vazio?: string;
  /** Controle próprio no cabeçalho — hoje só a coluna da daily usa, para
   *  mostrar e trocar a reação que marca os cards como seus. */
  acessorio?: ReactNode;
  aoAbrir: (task: Task) => void;
  aoMarcarComoMeu: (task: Task) => void;
  aoDesmarcarComoMeu: (task: Task) => void;
}

export function Coluna({
  status,
  rotulo,
  grupos,
  ultimaVisita,
  acessorio,
  vazio = 'nada aqui',
  aoAbrir,
  aoMarcarComoMeu,
  aoDesmarcarComoMeu,
}: Props) {
  const total = grupos.reduce((s, g) => s + g.tasks.length, 0);
  const agrupada = grupos.length > 1 || (grupos[0] && grupos[0].rotulo !== '');

  // O índice do Draggable é posicional dentro do Droppable inteiro, não dentro
  // do grupo: repetir o 0 a cada bloco embaralharia o arraste.
  let indice = 0;

  return (
    <section className="coluna">
      <header>
        <span className="selo">
          <span className="ponto" style={{ background: CORES_DE_STATUS[status] }} />
          {rotulo}
        </span>
        {acessorio}
        <span className="contagem">{total}</span>
      </header>

      <Droppable droppableId={status}>
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
                    ultimaVisita={ultimaVisita}
                    aoAbrir={aoAbrir}
                    aoMarcarComoMeu={aoMarcarComoMeu}
                    aoDesmarcarComoMeu={aoDesmarcarComoMeu}
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
}
