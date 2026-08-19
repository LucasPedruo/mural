import { useState } from 'react';

import type { TagComContagem, Task } from '../tipos';
import './confirmar.css';
import './dialogo.css';

interface Props {
  task: Task;
  /** As tags que já existem neste mural, com quantas tasks cada uma tem. Estão
   *  aqui para serem clicadas: tag redigitada é tag nova, e duas grafias da
   *  mesma coisa quebram o filtro. */
  existentes: TagComContagem[];
  aoSalvar: (tags: string[]) => void;
  aoCancelar: () => void;
}

const MAX_TAGS = 6;

export function DialogoDeTags({ task, existentes, aoSalvar, aoCancelar }: Props) {
  const [tags, setTags] = useState<string[]>(task.tags ?? []);
  const [texto, setTexto] = useState('');

  const tem = (tag: string) => tags.some((t) => t.toLowerCase() === tag.toLowerCase());

  function adicionar(bruta: string) {
    const tag = bruta.trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!tag || tem(tag) || tags.length >= MAX_TAGS) return;
    setTags([...tags, tag]);
    setTexto('');
  }

  function alternar(tag: string) {
    if (tem(tag)) setTags(tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()));
    else adicionar(tag);
  }

  const sugestoes = existentes.filter((e) => !tem(e.tag));

  return (
    <div className="fundo-modal" onClick={aoCancelar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-tags"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-tags">Etiquetas</h2>
        <p className="explicacao">{task.summary}</p>

        <div className="campo">
          <span className="rotulo">Nesta task</span>
          {tags.length === 0 ? (
            <p className="dica">nenhuma ainda</p>
          ) : (
            <div className="opcoes">
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="escolhida"
                  title="Clique para tirar"
                  onClick={() => alternar(tag)}
                >
                  {tag} ✕
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="campo">
          <span className="rotulo">Nova etiqueta</span>
          <input
            type="text"
            value={texto}
            autoFocus
            maxLength={24}
            placeholder="financeiro, mobile, urgente…"
            disabled={tags.length >= MAX_TAGS}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                adicionar(texto);
              }
            }}
          />
          <span className="dica">
            Enter adiciona. Até {MAX_TAGS} por task — etiqueta que serve para tudo não separa nada.
          </span>
        </label>

        {sugestoes.length > 0 && (
          <div className="campo">
            <span className="rotulo">Já usadas neste mural</span>
            <div className="opcoes">
              {sugestoes.map((e) => (
                <button key={e.tag} type="button" onClick={() => alternar(e.tag)}>
                  {e.tag} <span className="quantas">{e.quantas}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="acoes-modal">
          <button onClick={aoCancelar}>Cancelar</button>
          <button className="primario" onClick={() => aoSalvar(tags)}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
