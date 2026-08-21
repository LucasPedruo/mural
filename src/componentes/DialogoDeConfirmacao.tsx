import { useEffect, useRef, type ReactNode } from 'react';

import './confirmar.css';
import './dialogo.css';

/** O que se pergunta antes de fazer algo que não tem volta.
 *
 *  É um objeto e não uma string porque o corpo é JSX: os cinco gestos deste
 *  quadro que precisam confirmar têm números no meio da frase — quantos cards
 *  serão apagados, quantos vão para o arquivo da sprint — e o número é
 *  justamente o que faz a pergunta ser respondível. */
export interface PedidoDeConfirmacao {
  titulo: string;
  corpo: ReactNode;
  /** O texto do botão que faz a coisa. Um verbo, não "OK": lido sozinho, ele
   *  tem de dizer o que vai acontecer. */
  rotulo: string;
  /** Irreversível. Pinta o botão de vermelho e o mantém à direita. */
  perigo?: boolean;
  aoConfirmar: () => void;
}

interface Props {
  pedido: PedidoDeConfirmacao | null;
  aoCancelar: () => void;
}

/** Substitui o `window.confirm`.
 *
 *  O nativo tem três problemas que importam aqui: trava a aba inteira enquanto
 *  está aberto, ignora o tema (janela branca de sistema sobre um quadro escuro)
 *  e só aceita texto corrido — nada de negrito no número que é a informação
 *  principal da frase. Além disso o navegador pode escondê-lo depois do
 *  segundo, oferecendo "impedir que esta página crie diálogos": um botão do
 *  navegador que desliga em silêncio a confirmação de um gesto irreversível.
 *
 *  Cancelar é o padrão: Escape fecha, o clique fora fecha, e o foco começa em
 *  "Cancelar", não no botão que faz a coisa. */
export function DialogoDeConfirmacao({ pedido, aoCancelar }: Props) {
  const cancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pedido) return;
    cancelar.current?.focus();
    const noEscape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') aoCancelar();
    };
    document.addEventListener('keydown', noEscape);
    return () => document.removeEventListener('keydown', noEscape);
  }, [pedido, aoCancelar]);

  if (!pedido) return null;

  return (
    <div className="fundo-modal" onClick={aoCancelar} role="presentation">
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="titulo-confirmacao"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-confirmacao">{pedido.titulo}</h2>
        <div className="corpo-confirmacao">{pedido.corpo}</div>

        <div className="acoes-modal">
          <button ref={cancelar} onClick={aoCancelar}>
            Cancelar
          </button>
          <button
            className={pedido.perigo ? 'perigoso' : 'primario'}
            onClick={() => {
              aoCancelar();
              pedido.aoConfirmar();
            }}
          >
            {pedido.rotulo}
          </button>
        </div>
      </div>
    </div>
  );
}
