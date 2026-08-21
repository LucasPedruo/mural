import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api';
import { IconeVoltar } from '../componentes/icones';
import { dataDoDiaISO, rotuloDoDiaISO } from '../rotulos';
import type { DiaDaDaily, Mural, RespostaPainel } from '../tipos';
import './painel.css';

type Aba = 'sprints' | 'daily';

/** Texto de uma linha da daily, do jeito que se fala na reunião: o que era e
 *  como foi resolvido. Serve para copiar e colar no chat de quem faltou. */
function linhaFalada(item: DiaDaDaily['itens'][number]): string {
  return item.solucao ? `${item.summary} — ${item.solucao}` : item.summary;
}

export function Painel() {
  const { muralId = '' } = useParams();
  const [dados, setDados] = useState<RespostaPainel | null>(null);
  const [mural, setMural] = useState<Mural | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('sprints');
  const [copiado, setCopiado] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [painel, info] = await Promise.all([api.painel(muralId), api.lerMural(muralId)]);
      setDados(painel);
      setMural(info.mural);
      document.title = `Painéis · ${info.mural.nome}`;
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [muralId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function copiarDia(dia: DiaDaDaily) {
    const texto = dia.itens.map((i) => `• ${linhaFalada(i)}`).join('\n');
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(dia.dia);
      window.setTimeout(() => setCopiado(null), 2000);
    } catch {
      setErro('O navegador não deixou copiar. Selecione o texto na tela.');
    }
  }

  const sprints = dados?.sprints ?? [];
  const maior = Math.max(1, ...sprints.map((s) => s.chegaram));
  const maiorTag = Math.max(1, ...(dados?.tags ?? []).map((t) => t.total));
  const daily = dados?.daily;
  const mediaPorDia = daily && daily.diasAtivos ? daily.total / daily.diasAtivos : 0;

  return (
    <div className="pagina-painel">
      <header className="topo-painel">
        <Link
          className="icone"
          to={`/m/${muralId}`}
          title="Voltar para o quadro"
          aria-label="Voltar para o quadro"
        >
          <IconeVoltar />
        </Link>
        <span className="marca">
          <span className="ponto-marca" />
          <h1>{mural?.nome ?? 'Painéis'}</h1>
        </span>
        <div className="abas" role="tablist">
          <button
            className="aba"
            role="tab"
            aria-selected={aba === 'sprints'}
            onClick={() => setAba('sprints')}
          >
            Por sprint
          </button>
          <button
            className="aba"
            role="tab"
            aria-selected={aba === 'daily'}
            onClick={() => setAba('daily')}
          >
            Minha daily
          </button>
        </div>
      </header>

      {erro && <p className="aviso erro faixa">{erro}</p>}

      {!dados && !erro && <p className="carregando">lendo o histórico…</p>}

      {dados && aba === 'sprints' && (
        <main className="conteudo">
          <p className="explicacao">
            Quantas demandas chegaram em cada ciclo. A conta é pela data da mensagem no Teams, não
            pela data em que o card foi arquivado — fechar uma sprint não muda o que ela recebeu.
          </p>

          {sprints.length === 0 ? (
            <p className="vazio">Nenhuma sprint definida.</p>
          ) : (
            <div className="tabela" role="table">
              <div className="linha cabecalho" role="row">
                <span role="columnheader">Sprint</span>
                <span role="columnheader">Período</span>
                <span role="columnheader" className="num">
                  Chegaram
                </span>
                <span role="columnheader" className="num">
                  Bugs
                </span>
                <span role="columnheader" className="num">
                  Concluídas
                </span>
                <span role="columnheader" className="num">
                  Em aberto
                </span>
                <span role="columnheader" className="num">
                  Por mim
                </span>
                <span role="columnheader" className="num">
                  Out of scope
                </span>
              </div>

              {/* A chave sai do indice, nao do nome: nada impede duas sprints
                  de terem o mesmo nome — renomear a atual e encerrar duas vezes
                  ja produz isso, e o React nao pode piscar por causa disso. */}
              {sprints.map((s, i) => (
                <div className={'linha' + (s.atual ? ' atual' : '')} role="row" key={s.nome + i}>
                  <span role="cell" className="nome">
                    {s.nome}
                    {s.atual && <span className="badge marca">em curso</span>}
                    {s.arquivadas > 0 && (
                      <span
                        className="badge neutral"
                        title="Cards que saíram do quadro quando esta sprint foi encerrada"
                      >
                        {s.arquivadas} arquivadas
                      </span>
                    )}
                  </span>
                  <span role="cell" className="periodo">
                    {dataDoDiaISO(s.inicio)} – {dataDoDiaISO(s.fim)}
                  </span>
                  <span role="cell" className="num barra-celula">
                    {/* A barra existe para comparar sprints de relance: a
                        diferença entre 9 e 24 é mais rápida de ver que de ler. */}
                    <span className="barra" aria-hidden="true">
                      <span
                        className="preenchida"
                        style={{ width: `${Math.round((s.chegaram / maior) * 100)}%` }}
                      />
                    </span>
                    <b>{s.chegaram}</b>
                    {s.mensagens > s.chegaram && (
                      <span
                        className="sub"
                        title="Mensagens do Teams que esses cards somam"
                      >
                        {s.mensagens} msgs
                      </span>
                    )}
                  </span>
                  <span role="cell" className="num">
                    {s.bugs}
                  </span>
                  <span role="cell" className="num">
                    {s.concluidas}
                  </span>
                  <span role="cell" className="num">
                    {s.emAberto}
                  </span>
                  <span role="cell" className="num">
                    {s.minhas}
                  </span>
                  <span role="cell" className="num">
                    {s.ignoradas}
                  </span>
                </div>
              ))}

              {dados.foraDeSprint && (
                <div className="linha fora" role="row">
                  <span role="cell" className="nome">
                    fora de qualquer sprint
                    <span className="sub">chegou antes de existir ciclo neste mural</span>
                  </span>
                  <span role="cell" className="periodo">
                    —
                  </span>
                  <span role="cell" className="num barra-celula">
                    <b>{dados.foraDeSprint.chegaram}</b>
                  </span>
                  <span role="cell" className="num">
                    {dados.foraDeSprint.bugs}
                  </span>
                  <span role="cell" className="num">
                    {dados.foraDeSprint.concluidas}
                  </span>
                  <span role="cell" className="num">
                    —
                  </span>
                  <span role="cell" className="num">
                    —
                  </span>
                  <span role="cell" className="num">
                    —
                  </span>
                </div>
              )}
            </div>
          )}
          {dados.tags.length > 0 && (
            <section className="bloco-tags">
              <h2>Por etiqueta</h2>
              <p className="explicacao">
                As etiquetas atravessam sprint: são suas, escritas no card, e não existem no Teams.
                Aqui elas somam todo o histórico do mural, inclusive o que já foi arquivado.
              </p>
              <div className="tabela">
                <div className="linha cabecalho tags" role="row">
                  <span role="columnheader">Etiqueta</span>
                  <span role="columnheader" className="num">
                    Total
                  </span>
                  <span role="columnheader" className="num">
                    Concluídas
                  </span>
                  <span role="columnheader" className="num">
                    Em aberto
                  </span>
                </div>
                {dados.tags.map((t) => (
                  <div className="linha tags" role="row" key={t.tag}>
                    <span role="cell" className="nome">
                      <span className="badge etiqueta">{t.tag}</span>
                    </span>
                    <span role="cell" className="num barra-celula">
                      <span className="barra" aria-hidden="true">
                        <span
                          className="preenchida"
                          style={{ width: `${Math.round((t.total / maiorTag) * 100)}%` }}
                        />
                      </span>
                      <b>{t.total}</b>
                    </span>
                    <span role="cell" className="num">
                      {t.concluidas}
                    </span>
                    <span role="cell" className="num">
                      {t.abertas}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      {dados && daily && aba === 'daily' && (
        <main className="conteudo">
          <div className="numeros">
            <span className="numero">
              <b>{daily.total}</b> feitas por você
            </span>
            <span className="numero">
              <b>{daily.diasAtivos}</b> dias com entrega
            </span>
            <span className="numero">
              <b>{mediaPorDia.toFixed(1)}</b> por dia ativo
            </span>
            <span className="numero">
              <b>{daily.bugs}</b> eram bug
            </span>
          </div>

          <p className="explicacao">
            Tudo que você marcou como seu, agrupado pelo dia da marcação — inclusive o que já foi
            arquivado por sprints encerradas. É a memória que o Teams não guarda.
          </p>

          {daily.porDia.length === 0 ? (
            <p className="vazio">Nada marcado ainda.</p>
          ) : (
            daily.porDia.map((dia) => (
              <section className="dia-daily" key={dia.dia}>
                <div className="cabeca-dia">
                  <h2>{rotuloDoDiaISO(dia.dia)}</h2>
                  <span className="quantos">{dia.itens.length}</span>
                  <span className="risco" />
                  <button
                    className="copiar"
                    onClick={() => void copiarDia(dia)}
                    title="Copiar como lista, para colar no chat"
                  >
                    {copiado === dia.dia ? 'copiado' : 'copiar'}
                  </button>
                </div>

                <ul className="itens">
                  {dia.itens.map((item) => (
                    <li key={item.id} className={item.kind === 'bug' ? 'bug' : ''}>
                      <p className="titulo">{item.summary}</p>
                      {item.solucao ? (
                        <p className="solucao">{item.solucao}</p>
                      ) : (
                        <p className="solucao sem-nota">sem anotação</p>
                      )}
                      <p className="meta">
                        {item.kind === 'bug' && <span className="badge danger">bug</span>}
                        {item.origem === 'manual' && <span className="badge marca">minha</span>}
                        {item.via === 'emoji' && (
                          <span className="badge neutral">pela reação</span>
                        )}
                        {item.arquivada && (
                          <span className="badge neutral" title="Já saiu do quadro">
                            arquivada
                          </span>
                        )}
                        {item.sprint && <span className="sprint">{item.sprint}</span>}
                        {item.mensagens > 1 && (
                          <span className="sub">{item.mensagens} mensagens</span>
                        )}
                        {item.autor && <span className="sub">pedido por {item.autor}</span>}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </main>
      )}
    </div>
  );
}
