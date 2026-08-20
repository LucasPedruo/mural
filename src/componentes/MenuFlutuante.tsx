import { useEffect, useRef, useState, type ReactNode } from 'react';

import { IconeMais } from './icones';
import './menu.css';

export interface ItemDeMenu {
  rotulo: string;
  icone: ReactNode;
  aoEscolher: () => void;
  /** Ação que não tem volta: recebe tratamento visual próprio. */
  perigo?: boolean;
  dica?: string;
}

interface Props {
  itens: ItemDeMenu[];
  /** O que este menu controla, para leitor de tela — "ações do card", etc. */
  rotulo: string;
}

/** Um menu de "…". Existe porque o rodapé do card virou uma barra de
 *  ferramentas: sete ações competindo pelo mesmo canto, todas escondidas atrás
 *  de hover, nenhuma com nome.
 *
 *  Aqui cada ação tem ícone E rótulo, e o gatilho é sempre visível — o custo é
 *  um clique a mais, e o ganho é parar de decorar o que cada símbolo faz. */
export function MenuFlutuante({ itens, rotulo }: Props) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fechar no clique fora e no Escape. Sem isso o menu fica aberto atrás de
  // outro que você abriu, e o quadro acumula menus.
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

  return (
    // O card inteiro abre o Teams no clique: tudo aqui dentro precisa parar a
    // propagação, senão abrir o menu abriria a conversa também.
    <div
      className="menu-flutuante"
      ref={caixa}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        className={'gatilho' + (aberto ? ' aberto' : '')}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={rotulo}
        title={rotulo}
        onClick={() => setAberto((v) => !v)}
      >
        <IconeMais />
      </button>

      {aberto && (
        <div className="menu" role="menu">
          {itens.map((item) => (
            <button
              key={item.rotulo}
              className={'item' + (item.perigo ? ' perigo' : '')}
              type="button"
              role="menuitem"
              title={item.dica}
              onClick={() => {
                setAberto(false);
                item.aoEscolher();
              }}
            >
              <span className="icone">{item.icone}</span>
              {item.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
