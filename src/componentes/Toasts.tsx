import { useEffect } from 'react';

import type { Notificacao } from '../tipos';
import { IconeFechar } from './icones';
import './notificacoes.css';

/** Quanto tempo um aviso comum fica na tela. Curto o bastante para não virar
 *  mobília, longo o bastante para uma frase de duas linhas ser lida sem pressa.
 *  A falha NÃO usa isto: ela fica até você fechar. */
const SEGUNDOS_NA_TELA = 8;

function Toast({ item, aoFechar }: { item: Notificacao; aoFechar: (id: string) => void }) {
  const permanente = item.tom === 'erro';

  useEffect(() => {
    if (permanente) return;
    const t = window.setTimeout(() => aoFechar(item.id), SEGUNDOS_NA_TELA * 1000);
    return () => window.clearTimeout(t);
  }, [item.id, permanente, aoFechar]);

  return (
    <div className={`toast ${item.tom}`} role={permanente ? 'alert' : 'status'}>
      <span className="corpo">{item.texto}</span>
      <button
        className="dispensar"
        type="button"
        onClick={() => aoFechar(item.id)}
        title="Fechar"
        aria-label="Fechar o aviso"
      >
        <IconeFechar tamanho={13} />
      </button>
    </div>
  );
}

/** Os avisos que aparecem sozinhos no canto, sem você pedir.
 *
 *  O sino guarda; o toast conta na hora. Os dois são precisos: guardar sem
 *  contar faz você descobrir o resultado de uma leitura de dois minutos só se
 *  lembrar de conferir, e contar sem guardar é o problema que o sino veio
 *  resolver.
 *
 *  Nada aqui é destino final — fechar um toast não apaga nada, o item continua
 *  no sino. Por isso ele pode sumir sozinho sem custo nenhum. */
export function Toasts({
  itens,
  aoFechar,
}: {
  itens: Notificacao[];
  aoFechar: (id: string) => void;
}) {
  if (!itens.length) return null;

  return (
    // `polite` e não `assertive`: nem a falha de uma leitura justifica cortar o
    // que o leitor de tela está falando.
    <div className="toasts" aria-live="polite">
      {itens.map((item) => (
        <Toast item={item} aoFechar={aoFechar} key={item.id} />
      ))}
    </div>
  );
}
