import './graficos.css';

/** Os gráficos do dashboard, em SVG escrito à mão.
 *
 *  Sem biblioteca de propósito: o `server.js` roda sem uma única dependência de
 *  runtime, e a interface tem quatro. Trazer 200 kB de Recharts para desenhar
 *  três formas seria o maior pacote do projeto existir por causa da tela que se
 *  abre menos. O que se ganha em troca — tooltip, animação, eixo automático —
 *  não é o que falta aqui.
 *
 *  As cores saem das variáveis do tema, então os gráficos seguem claro e escuro
 *  sem nenhum código a mais. */

/** Um gráfico vazio não pode parecer um gráfico quebrado: ele diz o que falta
 *  acontecer para ter o que desenhar. */
function Vazio({ children }: { children: string }) {
  return <p className="grafico-vazio">{children}</p>;
}

// ------------------------------------------------------------------- ritmo

export interface PontoDoRitmo {
  dia: string;
  chegaram: number;
  concluidas: number;
}

function diaCurto(dia: string): string {
  const [, mes, d] = dia.split('-');
  return `${d}/${mes}`;
}

/** Quanto chega e quanto sai, dia a dia. É a pergunta que o quadro não responde:
 *  lá dá para ver o acúmulo, não se ele está crescendo ou diminuindo.
 *
 *  Os dias sem nada vêm no meio, e é de propósito — um gráfico que pula o fim de
 *  semana faz o time parecer mais constante do que é. */
export function GraficoDeRitmo({ pontos }: { pontos: PontoDoRitmo[] }) {
  const total = pontos.reduce((s, p) => s + p.chegaram + p.concluidas, 0);
  if (!pontos.length || total === 0) {
    return <Vazio>Nada chegou nem foi concluído nos últimos 30 dias.</Vazio>;
  }

  const L = 720;
  const A = 220;
  const esq = 32;
  const dir = 10;
  const topo = 12;
  const base = A - 26;

  const teto = Math.max(1, ...pontos.map((p) => Math.max(p.chegaram, p.concluidas)));
  const x = (i: number) => esq + (i * (L - esq - dir)) / Math.max(1, pontos.length - 1);
  const y = (v: number) => base - (v / teto) * (base - topo);

  const linha = (campo: 'chegaram' | 'concluidas') =>
    pontos.map((p, i) => `${x(i).toFixed(1)},${y(p[campo]).toFixed(1)}`).join(' ');

  // A área fecha na base para o volume ficar legível de longe; a linha de
  // concluídas fica só como traço, senão uma esconderia a outra.
  const area = `${esq},${base} ${linha('chegaram')} ${x(pontos.length - 1).toFixed(1)},${base}`;

  // Três marcas no eixo: mais que isso vira grade, e grade densa esconde a
  // forma, que é a única coisa que este gráfico tem para dizer.
  const marcas = [0, Math.round(teto / 2), teto].filter((v, i, a) => a.indexOf(v) === i);
  const rotulosX = [0, Math.floor((pontos.length - 1) / 2), pontos.length - 1].filter(
    (v, i, a) => a.indexOf(v) === i,
  );

  return (
    <figure className="grafico">
      <svg
        viewBox={`0 0 ${L} ${A}`}
        className="svg-grafico"
        role="img"
        aria-label={`Chegadas e conclusões por dia nos últimos ${pontos.length} dias`}
      >
        {marcas.map((v) => (
          <g key={v}>
            <line x1={esq} x2={L - dir} y1={y(v)} y2={y(v)} className="grade" />
            <text x={esq - 6} y={y(v) + 4} className="rotulo-eixo fim">
              {v}
            </text>
          </g>
        ))}

        <polygon points={area} className="area-chegaram" />
        <polyline points={linha('chegaram')} className="linha-chegaram" />
        <polyline points={linha('concluidas')} className="linha-concluidas" />

        {rotulosX.map((i) => (
          <text key={i} x={x(i)} y={A - 6} className="rotulo-eixo meio">
            {diaCurto(pontos[i].dia)}
          </text>
        ))}
      </svg>
      <figcaption className="legenda">
        <span className="item">
          <span className="amostra chegaram" /> chegaram
        </span>
        <span className="item">
          <span className="amostra concluidas" /> concluídas
        </span>
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------------- rosca

export interface Fatia {
  rotulo: string;
  valor: number;
  cor: string;
}

/** Onde o mural está parado, agora. A rosca responde proporção — "metade do
 *  quadro é coisa que ninguém pegou" — que uma lista de seis números não
 *  responde sem fazer contas de cabeça. */
export function GraficoDeRosca({ fatias }: { fatias: Fatia[] }) {
  const presentes = fatias.filter((f) => f.valor > 0);
  const total = presentes.reduce((s, f) => s + f.valor, 0);
  if (!total) return <Vazio>Nenhuma task neste mural ainda.</Vazio>;

  const R = 70;
  const CIRC = 2 * Math.PI * R;
  let percorrido = 0;

  return (
    <figure className="grafico rosca">
      <svg viewBox="0 0 200 200" className="svg-rosca" role="img" aria-label="Tasks por coluna">
        <g transform="rotate(-90 100 100)">
          {presentes.map((f) => {
            const fracao = f.valor / total;
            const traco = (
              <circle
                key={f.rotulo}
                cx="100"
                cy="100"
                r={R}
                fill="none"
                stroke={f.cor}
                strokeWidth="26"
                strokeDasharray={`${(fracao * CIRC).toFixed(2)} ${CIRC.toFixed(2)}`}
                strokeDashoffset={(-percorrido * CIRC).toFixed(2)}
              />
            );
            percorrido += fracao;
            return traco;
          })}
        </g>
        <text x="100" y="97" className="rosca-numero">
          {total}
        </text>
        <text x="100" y="117" className="rosca-texto">
          {total === 1 ? 'task' : 'tasks'}
        </text>
      </svg>
      <figcaption className="legenda coluna">
        {presentes.map((f) => (
          <span className="item" key={f.rotulo}>
            <span className="amostra" style={{ background: f.cor }} />
            {f.rotulo}
            <span className="valor">
              {f.valor} · {Math.round((f.valor / total) * 100)}%
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

// ----------------------------------------------------------------- sprints

export interface BarraDeSprint {
  nome: string;
  chegaram: number;
  concluidas: number;
  atual: boolean;
}

/** Chegou contra concluiu, sprint a sprint. As duas barras lado a lado porque a
 *  pergunta é a distância entre elas: uma sprint que recebe 20 e fecha 6 tem um
 *  problema que a soma de nenhuma das duas mostra sozinha. */
export function GraficoDeSprints({ linhas }: { linhas: BarraDeSprint[] }) {
  if (!linhas.length) return <Vazio>Nenhuma sprint definida — defina uma na sua listagem.</Vazio>;

  // Da mais antiga para a mais nova: o servidor manda a atual primeiro, que é a
  // ordem certa para uma lista e a errada para uma linha do tempo.
  const dados = [...linhas].reverse().slice(-8);
  const L = 720;
  const A = 220;
  const esq = 32;
  const base = A - 30;
  const topo = 12;
  const teto = Math.max(1, ...dados.map((d) => Math.max(d.chegaram, d.concluidas)));

  const larguraGrupo = (L - esq - 10) / dados.length;
  const larguraBarra = Math.min(26, (larguraGrupo - 12) / 2);
  const y = (v: number) => base - (v / teto) * (base - topo);

  return (
    <figure className="grafico">
      <svg
        viewBox={`0 0 ${L} ${A}`}
        className="svg-grafico"
        role="img"
        aria-label="Tasks que chegaram e que foram concluídas em cada sprint"
      >
        <line x1={esq} x2={L - 10} y1={base} y2={base} className="grade" />
        {dados.map((d, i) => {
          const centro = esq + larguraGrupo * i + larguraGrupo / 2;
          return (
            <g key={`${d.nome}-${i}`}>
              <rect
                x={centro - larguraBarra - 2}
                y={y(d.chegaram)}
                width={larguraBarra}
                height={Math.max(1, base - y(d.chegaram))}
                className="barra-chegaram"
                rx="3"
              />
              <rect
                x={centro + 2}
                y={y(d.concluidas)}
                width={larguraBarra}
                height={Math.max(1, base - y(d.concluidas))}
                className="barra-concluidas"
                rx="3"
              />
              <text x={centro} y={A - 8} className="rotulo-eixo meio">
                {d.nome}
                {d.atual ? ' •' : ''}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="legenda">
        <span className="item">
          <span className="amostra chegaram" /> chegaram
        </span>
        <span className="item">
          <span className="amostra concluidas" /> concluídas
        </span>
        <span className="item nota">• sprint corrente</span>
      </figcaption>
    </figure>
  );
}

// ------------------------------------------------------------- ranqueadas

export interface LinhaRanqueada {
  rotulo: string;
  total: number;
  /** A parte já concluída do total. Desenhada mais escura dentro da mesma
   *  barra: duas barras separadas fariam parecer duas medidas independentes. */
  concluidas?: number;
  destaque?: boolean;
}

/** Listas ordenadas — tags, quem resolveu, quem pede. Barra em CSS e não em SVG
 *  porque aqui o rótulo é texto de tamanho imprevisível: nome de pessoa quebra
 *  linha, e texto dentro de SVG não quebra sozinho. */
export function BarrasRanqueadas({
  linhas,
  vazio,
  limite = 8,
}: {
  linhas: LinhaRanqueada[];
  vazio: string;
  limite?: number;
}) {
  if (!linhas.length) return <Vazio>{vazio}</Vazio>;
  const maior = Math.max(1, ...linhas.map((l) => l.total));
  const mostradas = linhas.slice(0, limite);

  return (
    <div className="ranqueadas">
      {mostradas.map((l) => (
        <div className={`linha${l.destaque ? ' destaque' : ''}`} key={l.rotulo}>
          <span className="rotulo" title={l.rotulo}>
            {l.rotulo}
          </span>
          <span className="trilho">
            <span className="barra" style={{ width: `${(l.total / maior) * 100}%` }}>
              {l.concluidas !== undefined && l.concluidas > 0 && (
                <span
                  className="parte-concluida"
                  style={{ width: `${(l.concluidas / l.total) * 100}%` }}
                />
              )}
            </span>
          </span>
          <span className="valor">
            {l.total}
            {l.concluidas !== undefined && (
              <span className="secundario"> · {l.concluidas} feitas</span>
            )}
          </span>
        </div>
      ))}
      {/* Cortar sem avisar faria a lista parecer completa. */}
      {linhas.length > limite && (
        <p className="grafico-vazio">
          +{linhas.length - limite} fora desta lista, com menos que {mostradas[limite - 1].total}.
        </p>
      )}
    </div>
  );
}
