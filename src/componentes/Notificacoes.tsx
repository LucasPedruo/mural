import { useEffect, useRef, useState, type ReactNode } from 'react';

import { tempoRelativo } from '../rotulos';
import type { Notificacao } from '../tipos';
import { IconeApagar, IconeEditar, IconeFechar, IconeSino } from './icones';
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
  aoAnotar: (id: string, nota: string) => void;
  aoRemover: (id: string) => void;
  aoLimpar: () => void;
}

/** Um item da lista, com a sua nota.
 *
 *  O rascunho é estado local: enquanto você digita, ninguém mais precisa saber.
 *  Guardar cada tecla no localStorage seria escrever no disco por causa de uma
 *  vírgula. */
function Item({
  n,
  aoAnotar,
  aoRemover,
}: {
  n: Notificacao;
  aoAnotar: (id: string, nota: string) => void;
  aoRemover: (id: string) => void;
}) {
  const [anotando, setAnotando] = useState(false);
  const [rascunho, setRascunho] = useState(n.nota ?? '');

  function salvar() {
    setAnotando(false);
    if (rascunho.trim() !== (n.nota ?? '')) aoAnotar(n.id, rascunho);
  }

  return (
    <div className={`notificacao ${n.tom}${n.nota ? ' anotada' : ''}`}>
      <div className="corpo">
        {n.texto}
        {n.nota && !anotando && <p className="nota">{n.nota}</p>}

        {anotando && (
          <textarea
            className="campo-nota"
            rows={2}
            value={rascunho}
            autoFocus
            maxLength={500}
            placeholder="Ex.: esse custo foi a releitura do canal inteiro depois do feriado"
            onChange={(e) => setRascunho(e.target.value)}
            onBlur={salvar}
            onKeyDown={(e) => {
              // Enter salva porque a nota é uma linha ou duas; Shift+Enter fica
              // para quem quiser quebrar. Escape desiste sem gravar — e para
              // aqui, senão fecharia o painel inteiro junto.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                salvar();
              }
              if (e.key === 'Escape') {
                e.stopPropagation();
                setRascunho(n.nota ?? '');
                setAnotando(false);
              }
            }}
          />
        )}

        <span className="rodape-notificacao">
          <span className="quando">{tempoRelativo(n.em)}</span>
          {!anotando && (
            <button
              className="acao-nota"
              type="button"
              onClick={() => {
                setRascunho(n.nota ?? '');
                setAnotando(true);
              }}
              title={n.nota ? 'Editar a sua nota' : 'Escrever uma nota sobre esta leitura'}
            >
              <IconeEditar tamanho={12} />
              {n.nota ? 'editar nota' : 'anotar'}
            </button>
          )}
        </span>
      </div>

      <button
        className="dispensar"
        type="button"
        onClick={() => aoRemover(n.id)}
        title="Tirar do histórico"
        aria-label="Tirar do histórico"
      >
        <IconeApagar tamanho={13} />
      </button>
    </div>
  );
}

/** O sino do cabeçalho.
 *
 *  Antes estas mensagens moravam no próprio quadro: o resumo da leitura era
 *  espremido na linha de "última leitura", e o aviso de fora de alcance era uma
 *  faixa que empurrava as colunas para baixo da dobra. As duas somem sozinhas —
 *  a faixa quando você a fecha, o resumo quando a próxima ação o substitui — e o
 *  que some sozinho não dá para reler depois de "espera, quanto custou mesmo?".
 *
 *  Aqui elas viram histórico, e histórico aceita anotação: o texto do item conta
 *  o que aconteceu, a sua nota conta o que aquilo significou. */
export function Notificacoes({
  itens,
  naoLidas,
  fixado,
  aoAbrir,
  aoAnotar,
  aoRemover,
  aoLimpar,
}: Props) {
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
  const limpaveis = itens.filter((n) => !n.nota).length;

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
            {/* Limpa só o que você NÃO anotou, e o número diz quantas são. Nota
                é trabalho seu; um botão chamado "limpar" não pode descartar
                trabalho por tabela. O que tem nota sai uma a uma, no ícone. */}
            {limpaveis > 0 && (
              <button
                className="limpar"
                type="button"
                onClick={aoLimpar}
                title="Tira as que você não anotou — as anotadas ficam"
              >
                Limpar {limpaveis}
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
            <Item n={n} aoAnotar={aoAnotar} aoRemover={aoRemover} key={n.id} />
          ))}

          {!fixado && itens.length === 0 && (
            <p className="vazio">
              Nada por aqui. O resumo de cada leitura do Teams — o que mudou e quanto custou —
              aparece nesta lista, e cada um aceita uma nota sua.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
