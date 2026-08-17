import { Droppable } from '@hello-pangea/dnd';

import { CORES_DE_STATUS } from '../rotulos';
import type { Status, Task } from '../tipos';
import { CartaoDeTask } from './CartaoDeTask';
import './coluna.css';

interface Props {
  status: Status;
  rotulo: string;
  tasks: Task[];
  ultimaVisita: string | null;
  aoAbrir: (task: Task) => void;
}

export function Coluna({ status, rotulo, tasks, ultimaVisita, aoAbrir }: Props) {
  return (
    <section className="coluna">
      <header>
        <span className="selo">
          <span className="ponto" style={{ background: CORES_DE_STATUS[status] }} />
          {rotulo}
        </span>
        <span className="contagem">{tasks.length}</span>
      </header>

      <Droppable droppableId={status}>
        {(fornecido, estado) => (
          <div
            ref={fornecido.innerRef}
            {...fornecido.droppableProps}
            className={'lista' + (estado.isDraggingOver ? ' recebendo' : '')}
          >
            {tasks.length === 0 && !estado.isDraggingOver && (
              <p className="vazio">nada aqui</p>
            )}
            {tasks.map((t, i) => (
              <CartaoDeTask
                key={t.id}
                task={t}
                indice={i}
                ultimaVisita={ultimaVisita}
                aoAbrir={aoAbrir}
              />
            ))}
            {fornecido.placeholder}
          </div>
        )}
      </Droppable>
    </section>
  );
}
