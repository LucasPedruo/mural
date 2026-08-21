import { useState } from 'react';

import { formatarUsd } from './ConfirmarAtualizacao';
import type { Estimativa } from '../tipos';
import './confirmar.css';
import './dialogo.css';

interface Props {
  /** A média das leituras passadas. Uma mensagem custa uma fração disso — uma
   *  chamada em vez de vinte e uma — mas não é grátis, e o número que existe é
   *  este. Nulo quando o agente não informa custo. */
  estimativa: Estimativa | null;
  reportaCusto: boolean;
  ocupado: boolean;
  aoIncluir: (link: string) => void;
  aoCancelar: () => void;
}

/** Trazer uma mensagem do Teams para o quadro pelo link dela.
 *
 *  Serve para a mensagem que já saiu das ~20 que a API devolve, e para a que
 *  está em outra conversa — a que alguém te mandou por fora e que virou trabalho
 *  seu. O agente lê aquela mensagem só, então o card entra com autor, data,
 *  texto e reações de verdade, em vez de com o que você lembrar de digitar. */
export function DialogoDeLink({
  estimativa,
  reportaCusto,
  ocupado,
  aoIncluir,
  aoCancelar,
}: Props) {
  const [link, setLink] = useState('');
  const valido = /teams\.microsoft\.com/i.test(link) && /\/l\/message\//.test(link);

  return (
    <div className="fundo-modal" onClick={ocupado ? () => {} : aoCancelar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-link"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-link">Incluir por link</h2>
        <p className="explicacao">
          No Teams: <strong>…</strong> da mensagem › <strong>Copiar link</strong>.
        </p>

        <label className="campo">
          <span className="rotulo">Link da mensagem</span>
          <input
            type="text"
            value={link}
            autoFocus
            disabled={ocupado}
            placeholder="https://teams.microsoft.com/l/message/…"
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valido && !ocupado) aoIncluir(link);
            }}
          />
          <span className="dica">
            {reportaCusto && estimativa
              ? `O agente lê essa mensagem — uma, não as vinte e uma de uma atualização. Uma leitura completa custa ${formatarUsd(estimativa.custoUsd)} em média.`
              : 'O agente lê essa mensagem para trazer autor, data, texto e reações.'}
          </span>
        </label>

        <p className="dica">
          De outra conversa também vale. O card entra marcado, porque as leituras
          seguintes não vão alcançá-lo: elas leem a conversa deste mural.
        </p>

        <div className="acoes-modal">
          <button onClick={aoCancelar} disabled={ocupado}>
            Cancelar
          </button>
          <button className="primario" disabled={!valido || ocupado} onClick={() => aoIncluir(link)}>
            {ocupado ? 'Lendo…' : 'Ler e incluir'}
          </button>
        </div>
      </div>
    </div>
  );
}
