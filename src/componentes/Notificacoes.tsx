import { useEffect, useRef, useState, type ReactNode } from 'react';

import { tempoRelativo } from '../rotulos';
import type { Notificacao } from '../tipos';
import { IconeFechar, IconeSino } from './icones';
import './notificacoes.css';

interface Props {
  /** Eventos, do mais recente para o mais antigo. */
  itens: Notificacao[];
  /** Quantos entraram depois da última vez que você abriu o painel. */
  naoLidas: number;
  /** O aviso que é **condição**, não evento: vale enquanto for verdade, e por
   *  isso fica fixado no topo em vez de entrar na lista. Dispensar não o apaga
   *  — só reconhece o número de agora, e ele volta quando o número cresce. */
  fixado?: { texto: ReactNode; aoDispensar: () => void } | null;
  aoAbrir: () => void;
  aoLimpar: () => void;
}

/** O sino do cabeçalho.
 *
 *  Antes estas mensagens moravam no próprio quadro: o resumo da leitura era
 *  espremido na linha de "última leitura", e o aviso de fora de alcance era uma
 *  faixa que empurrava as colunas para baixo da dobra. As duas somem sozinhas —
 *  a faixa quando você a fecha, o resumo quando a próxima ação o substitui — e o
 *  que some sozinho não dá para reler depois de "espera, quanto custou mesmo?".
 *
 *  Aqui elas viram histórico. O resumo de cada leitura fica guardado, o custo
 *  junto, e o cabeçalho volta a ter uma ação só. */
export function Notificacoes({ itens, naoLidas, fixado, aoAbrir, aoLimpar }: Props) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fechar no clique fora e no Escape — a mesma regra do menu do card, pelo
  // mesmo motivo: painel que fica aberto atrás de outra coisa vira sujeira.
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

  // O contador soma o aviso fixado: ele é uma coisa a saber como qualquer
  // outra, e um sino que ignora o único recado da tela não serve para nada.
  const total = naoLidas + (fixado ? 1 : 0);

  function alternar() {
    const proximo = !aberto;
    setAberto(proximo);
    if (proximo) aoAbrir();
  }

  return (
    <div className="notificacoes" ref={caixa}>
      <button
        className={'gatilho-sino' + (aberto ? ' aberto' : '')}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-label={
          total ? `Notificações — ${total} não ${total === 1 ? 'lida' : 'lidas'}` : 'Notificações'
        }
        title={total ? `${total} não ${total === 1 ? 'lida' : 'lidas'}` : 'Notificações'}
        onClick={alternar}
      >
        <IconeSino tamanho={16} />
        {total > 0 && <span className="contador">{total > 9 ? '9+' : total}</span>}
      </button>

      {aberto && (
        <div className="painel-notificacoes" role="dialog" aria-label="Notificações">
          <header>
            <strong>Notificações</strong>
            {itens.length > 0 && (
              <button className="limpar" type="button" onClick={aoLimpar}>
                Limpar
              </button>
            )}
          </header>

          {fixado && (
            <div className="notificacao fixada">
              <div className="corpo">{fixado.texto}</div>
              <button
                className="dispensar"
                type="button"
                onClick={fixado.aoDispensar}
                title="Dispensar — volta a aparecer se outra task sair da janela"
                aria-label="Dispensar o aviso"
              >
                <IconeFechar tamanho={13} />
              </button>
            </div>
          )}

          {itens.map((n) => (
            <div className={`notificacao ${n.tom}`} key={n.id}>
              <div className="corpo">
                {n.texto}
                <span className="quando">{tempoRelativo(n.em)}</span>
              </div>
            </div>
          ))}

          {!fixado && itens.length === 0 && (
            <p className="vazio">
              Nada por aqui. O resumo de cada leitura do Teams — o que mudou e quanto custou —
              aparece nesta lista.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
