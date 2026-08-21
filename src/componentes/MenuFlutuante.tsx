import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

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
  // Para cima quando não cabe para baixo. No último card da coluna o menu abria
  // por fora da janela e ficava com metade dos itens inalcançável — e é
  // justamente ali que estão "Apagar de vez" e as outras ações do fim da lista.
  const [paraCima, setParaCima] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

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

  // A decisão é tomada depois de o menu existir, com a altura real dele: chutar
  // a altura erra quando a lista de ações muda de tamanho de card para card.
  // `useLayoutEffect` para virar antes de pintar, senão o menu aparece embaixo e
  // salta para cima na frente de quem clicou.
  useLayoutEffect(() => {
    if (!aberto || !menu.current || !caixa.current) return;
    const gatilho = caixa.current.getBoundingClientRect();
    const altura = menu.current.offsetHeight;
    const MARGEM = 12;
    const cabeAbaixo = gatilho.bottom + 5 + altura + MARGEM <= window.innerHeight;
    const cabeAcima = gatilho.top - 5 - altura - MARGEM >= 0;
    // Não cabe em lado nenhum: fica embaixo, que é onde a rolagem ajuda.
    setParaCima(!cabeAbaixo && cabeAcima);
  }, [aberto, itens.length]);

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
        <div className={'menu' + (paraCima ? ' para-cima' : '')} role="menu" ref={menu}>
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
