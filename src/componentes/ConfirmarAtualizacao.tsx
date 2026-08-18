import { useState } from 'react';

import type { Estimativa, TotaisDeConsumo } from '../tipos';
import './confirmar.css';

interface Props {
  estimativa: Estimativa | null;
  totais: TotaisDeConsumo;
  usuario: string;
  aoConfirmar: (naoPerguntarDeNovo: boolean) => void;
  aoCancelar: () => void;
}

export function formatarTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.', ',') + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'k';
  return String(n);
}

export function formatarUsd(v: number | null): string {
  if (v === null) return '—';
  // Abaixo de um centavo, arredondar para "0,00" esconderia o custo real.
  return v < 0.01 ? `US$ ${v.toFixed(4)}` : `US$ ${v.toFixed(2)}`;
}

export function ConfirmarAtualizacao({
  estimativa,
  totais,
  usuario,
  aoConfirmar,
  aoCancelar,
}: Props) {
  const [naoPerguntar, setNaoPerguntar] = useState(false);

  return (
    <div className="fundo-modal" onClick={aoCancelar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-confirmar"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-confirmar">Atualizar este mural?</h2>
        <p className="explicacao">
          Cada atualização roda o Claude Code de verdade para ler as mensagens no Teams — isso
          consome tokens da sua conta e é cobrado.
        </p>

        {estimativa ? (
          <>
            <div className="numeros-estimativa">
              <div className="destaque">
                <span className="valor">{formatarUsd(estimativa.custoUsd)}</span>
                <span className="rotulo">custo estimado</span>
              </div>
              <div className="destaque">
                <span className="valor">{formatarTokens(estimativa.tokensTotal)}</span>
                <span className="rotulo">tokens</span>
              </div>
              <div className="destaque">
                <span className="valor">~{Math.round(estimativa.duracaoMs / 1000)}s</span>
                <span className="rotulo">duração</span>
              </div>
            </div>

            <dl className="detalhamento">
              <div>
                <dt>entrada</dt>
                <dd>{formatarTokens(estimativa.tokensEntrada)}</dd>
              </div>
              <div>
                <dt>saída</dt>
                <dd>{formatarTokens(estimativa.tokensSaida)}</dd>
              </div>
              <div>
                <dt>cache lido</dt>
                <dd>{formatarTokens(estimativa.tokensCacheLido)}</dd>
              </div>
            </dl>

            <p className="fonte-estimativa">
              Média das últimas {estimativa.baseadoEm}{' '}
              {estimativa.baseadoEm === 1 ? 'atualização' : 'atualizações'}
              {estimativa.doProprioMural
                ? ' deste mural'
                : ' de outros murais — este ainda não tem histórico próprio'}
              . O valor real varia com o tamanho das mensagens e com o que já está em cache.
            </p>
          </>
        ) : (
          <p className="aviso info">
            Esta é a primeira atualização registrada, então ainda não há como estimar o custo.
            Depois desta, o Mural passa a mostrar a média das anteriores. Para referência: o
            trabalho é ler ~20 mensagens e resumir cada uma.
          </p>
        )}

        {/* O acumulado conta TODA leitura cobrada, não só as atualizações: o
            onboarding também roda o Claude Code. Somar sem dizer isso faria o
            número parecer alto demais para a quantidade de syncs listada. */}
        <p className="acumulado">
          <strong>{usuario}</strong> já gastou {formatarUsd(totais.custoUsd)} em{' '}
          {totais.execucoes} {totais.execucoes === 1 ? 'leitura' : 'leituras'} do Claude Code (
          {formatarTokens(totais.tokensTotal)} tokens) — {totais.porOperacao.sync.execucoes}{' '}
          {totais.porOperacao.sync.execucoes === 1 ? 'atualização' : 'atualizações'} de quadro,{' '}
          {formatarUsd(totais.porOperacao.sync.custoUsd)}; o resto é configuração.
        </p>

        <label className="nao-perguntar">
          <input
            type="checkbox"
            checked={naoPerguntar}
            onChange={(e) => setNaoPerguntar(e.target.checked)}
          />
          Não perguntar de novo neste computador
        </label>

        <div className="acoes-modal">
          <button onClick={aoCancelar}>Cancelar</button>
          <button className="primario" onClick={() => aoConfirmar(naoPerguntar)}>
            Atualizar agora
          </button>
        </div>
      </div>
    </div>
  );
}
