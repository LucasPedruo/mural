import { useEffect, useRef, useState } from 'react';

import type { TagComContagem } from '../tipos';
import { IconeEtiqueta, IconeFiltro, IconePessoa } from './icones';
import './filtro.css';

export interface AutorComContagem {
  autor: string;
  quantas: number;
}

interface Props {
  autores: AutorComContagem[];
  tags: TagComContagem[];
  autorFiltro: string | null;
  tagFiltro: string | null;
  aoFiltrarAutor: (autor: string | null) => void;
  aoFiltrarTag: (tag: string | null) => void;
}

/** Os filtros do quadro, atrás de um funil no cabeçalho.
 *
 *  Antes eram dois selects numa barra acima das colunas. A barra custava uma
 *  faixa de altura o tempo todo para uma escolha que se faz de vez em quando, e
 *  empurrava a primeira linha de cards para baixo. Aqui o custo em repouso é um
 *  ícone; o gasto de um clique só aparece para quem vai filtrar.
 *
 *  O que NÃO some no repouso é o fato de haver filtro ligado: o gatilho fica
 *  aceso e diz por quê. Filtro escondido que corta o quadro em silêncio faria a
 *  contagem das colunas parecer errada. */
export function FiltroDoQuadro({
  autores,
  tags,
  autorFiltro,
  tagFiltro,
  aoFiltrarAutor,
  aoFiltrarTag,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const foraDaCaixa = (e: Event) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const noEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', foraDaCaixa);
    document.addEventListener('keydown', noEscape);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      document.removeEventListener('keydown', noEscape);
    };
  }, [aberto]);

  const ligados = (autorFiltro ? 1 : 0) + (tagFiltro ? 1 : 0);
  const resumo = [
    autorFiltro ? `de ${autorFiltro}` : '',
    tagFiltro ? `com a etiqueta ${tagFiltro}` : '',
  ]
    .filter(Boolean)
    .join(', ');

  function limpar() {
    aoFiltrarAutor(null);
    aoFiltrarTag(null);
  }

  return (
    <div className="filtro-do-quadro" ref={caixa}>
      <button
        className={'gatilho-filtro' + (aberto ? ' aberto' : '') + (ligados ? ' ligado' : '')}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={ligados ? `Filtros — mostrando só ${resumo}` : 'Filtros'}
        title={ligados ? `Mostrando só ${resumo}` : 'Filtrar'}
        onClick={() => setAberto((v) => !v)}
      >
        <IconeFiltro tamanho={16} />
        {ligados > 0 && <span className="ponto-ligado" />}
      </button>

      {aberto && (
        <div className="painel-filtro" role="dialog" aria-label="Filtros do quadro">
          <header>
            <strong>Filtrar</strong>
            {ligados > 0 && (
              <button className="limpar" type="button" onClick={limpar}>
                Mostrar tudo
              </button>
            )}
          </header>

          <div className="grupo">
            <span className="titulo-do-grupo">
              <IconePessoa tamanho={13} /> quem pediu
            </span>
            {autores.length === 0 ? (
              <p className="vazio-filtro">Ninguém ainda</p>
            ) : (
              <div className="opcoes-de-filtro">
                <button
                  type="button"
                  className={!autorFiltro ? 'escolhida' : ''}
                  onClick={() => aoFiltrarAutor(null)}
                >
                  todos
                </button>
                {autores.map((a) => (
                  <button
                    key={a.autor}
                    type="button"
                    className={autorFiltro === a.autor ? 'escolhida' : ''}
                    onClick={() => aoFiltrarAutor(autorFiltro === a.autor ? null : a.autor)}
                    title={a.autor}
                  >
                    <span className="nome">{a.autor}</span>
                    <span className="quantas">{a.quantas}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grupo">
            <span className="titulo-do-grupo">
              <IconeEtiqueta tamanho={13} /> etiqueta
            </span>
            {tags.length === 0 ? (
              <p className="vazio-filtro">Nenhuma etiqueta ainda</p>
            ) : (
              <div className="opcoes-de-filtro">
                <button
                  type="button"
                  className={!tagFiltro ? 'escolhida' : ''}
                  onClick={() => aoFiltrarTag(null)}
                >
                  todas
                </button>
                {tags.map((t) => {
                  const chave = t.tag.toLowerCase();
                  return (
                    <button
                      key={t.tag}
                      type="button"
                      className={tagFiltro === chave ? 'escolhida' : ''}
                      onClick={() => aoFiltrarTag(tagFiltro === chave ? null : chave)}
                    >
                      <span className="nome">{t.tag}</span>
                      <span className="quantas">{t.quantas}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {ligados > 0 && (
            <p className="aviso-do-filtro">As contagens são do filtro, não do quadro.</p>
          )}
        </div>
      )}
    </div>
  );
}
