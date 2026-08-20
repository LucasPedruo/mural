import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api';
import {
  BarrasRanqueadas,
  GraficoDeRitmo,
  GraficoDeRosca,
  GraficoDeSprints,
} from '../componentes/graficos';
import { IconeVoltar } from '../componentes/icones';
import { COLUNAS, CORES_DE_STATUS, rotuloDaColuna } from '../rotulos';
import type { Mural, RespostaDashboard } from '../tipos';
import './dashboard.css';

/** Um número grande com o nome embaixo. Só entra aqui o que o quadro não
 *  responde de relance — contar cards na tela é fácil; saber que a mediana é de
 *  onze dias, não. */
function Indicador({
  valor,
  rotulo,
  detalhe,
}: {
  valor: string;
  rotulo: string;
  detalhe?: string;
}) {
  return (
    <div className="indicador" title={detalhe}>
      <span className="numero">{valor}</span>
      <span className="rotulo">{rotulo}</span>
    </div>
  );
}

function Cartao({
  titulo,
  explicacao,
  children,
  largo,
}: {
  titulo: string;
  explicacao: string;
  children: ReactNode;
  largo?: boolean;
}) {
  return (
    <section className={`cartao-grafico${largo ? ' largo' : ''}`}>
      <h2>{titulo}</h2>
      <p className="explicacao">{explicacao}</p>
      {children}
    </section>
  );
}

/** A leitura de longe do mural. O quadro mostra os cards; o painel lê a sprint
 *  item a item, para falar na daily. Aqui a pergunta é outra: está melhorando ou
 *  piorando, e quem está carregando o quê.
 *
 *  Mora fora do quadro de propósito — nada nesta tela se responde no meio de
 *  arrastar card, e no cabeçalho do quadro ela só disputava espaço. */
export function Dashboard() {
  const { muralId = '' } = useParams();
  const [dados, setDados] = useState<RespostaDashboard | null>(null);
  const [mural, setMural] = useState<Mural | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [painel, info] = await Promise.all([api.dashboard(muralId), api.lerMural(muralId)]);
      setDados(painel);
      setMural(info.mural);
      document.title = `Dashboard · ${info.mural.nome}`;
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [muralId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const t = dados?.totais;

  return (
    <div className="pagina-dashboard">
      <header className="topo-dashboard">
        <Link
          className="icone"
          to="/"
          title="Voltar para meus murais"
          aria-label="Voltar para meus murais"
        >
          <IconeVoltar />
        </Link>
        <span className="marca">
          <span className="ponto-marca" />
          <h1>{mural?.nome ?? 'Dashboard'}</h1>
        </span>
        <span className="espaco" />
        <Link className="acao-topo" to={`/m/${muralId}/painel`}>
          Painéis
        </Link>
        <Link className="acao-topo" to={`/m/${muralId}`}>
          Abrir o quadro
        </Link>
      </header>

      {erro && <p className="aviso erro">{erro}</p>}

      {!dados && !erro && <p className="carregando">Carregando…</p>}

      {dados && t && (
        <>
          <div className="indicadores">
            <Indicador
              valor={String(t.tasks)}
              rotulo={t.tasks === 1 ? 'task' : 'tasks'}
              detalhe="O que está no quadro agora, mais o arquivo das sprints encerradas."
            />
            <Indicador
              valor={String(t.emAberto)}
              rotulo="em aberto"
              detalhe="Nem concluídas, nem fora do escopo."
            />
            <Indicador
              valor={String(t.concluidas)}
              rotulo="concluídas"
              detalhe="Check no Teams, 'Fiz esta' ou crédito a outra pessoa."
            />
            <Indicador
              valor={t.medianaDeDias === null ? '—' : `${t.medianaDeDias}d`}
              rotulo="do pedido até pronto"
              detalhe="Mediana, não média — uma task esquecida distorceria a média."
            />
            <Indicador
              valor={t.maisAntigaEmAbertoDias === null ? '—' : `${t.maisAntigaEmAbertoDias}d`}
              rotulo="parada há mais tempo"
              detalhe="Há quantos dias está a task em aberto mais antiga."
            />
            <Indicador
              valor={String(t.bugs)}
              rotulo={t.bugs === 1 ? 'bug' : 'bugs'}
              detalhe={`${t.sugestoes} são sugestões, não defeitos.`}
            />
          </div>

          <div className="grade-graficos">
            <Cartao
              titulo="Onde o mural está"
              explicacao="A proporção entre as colunas, contando o arquivo das sprints."
            >
              <GraficoDeRosca
                fatias={COLUNAS.map((c) => ({
                  rotulo: rotuloDaColuna(c),
                  valor: dados.porColuna[c] ?? 0,
                  cor: CORES_DE_STATUS[c],
                }))}
              />
            </Cartao>

            <Cartao
              titulo="Ritmo · últimos 30 dias"
              explicacao="Quanto chega contra quanto sai."
              largo
            >
              <GraficoDeRitmo pontos={dados.porDia} />
            </Cartao>

            <Cartao
              titulo="Por sprint"
              explicacao="Chegou contra concluiu, ciclo a ciclo."
              largo
            >
              <GraficoDeSprints
                linhas={dados.sprints.map((s) => ({
                  nome: s.nome,
                  chegaram: s.chegaram,
                  concluidas: s.concluidas,
                  atual: s.atual,
                }))}
              />
            </Cartao>

            <Cartao
              titulo="Quem resolveu"
              explicacao="Só quem foi creditado à mão — o Teams não conta quem deu o check."
            >
              <BarrasRanqueadas
                linhas={dados.porPessoa.map((p) => ({
                  rotulo: p.pessoa,
                  total: p.total,
                  destaque: p.ehVoce,
                }))}
                vazio="Ninguém creditado ainda."
              />
              {t.semCredito > 0 && (
                <p className="grafico-vazio">
                  {t.semCredito} concluída{t.semCredito === 1 ? '' : 's'} sem dono conhecido.
                </p>
              )}
            </Cartao>

            <Cartao
              titulo="Quem pede"
              explicacao="De onde vem a demanda. A parte escura já foi concluída."
            >
              <BarrasRanqueadas
                linhas={dados.porAutor.map((a) => ({
                  rotulo: a.autor,
                  total: a.total,
                  concluidas: a.concluidas,
                }))}
                vazio="Nenhuma mensagem lida ainda."
              />
            </Cartao>

            <Cartao
              titulo="Por etiqueta"
              explicacao="As etiquetas atravessam sprint."
            >
              <BarrasRanqueadas
                linhas={dados.tags.map((tag) => ({
                  rotulo: tag.tag,
                  total: tag.total,
                  concluidas: tag.concluidas,
                }))}
                vazio="Nenhuma etiqueta ainda."
              />
            </Cartao>
          </div>
        </>
      )}
    </div>
  );
}
