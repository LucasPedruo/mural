import './emoji.css';

interface Props {
  id: string;
  titulo: string;
  /** O que essa reação quer dizer no canal, em uma frase. */
  explicacao: string;
  /** De quem é a convenção: do time, ou só sua. Muda o que a escolha significa
   *  — e é a diferença que faz uma delas não poder ser o check. */
  dono: 'time' | 'você';
  valor: string;
  sugestoes: string[];
  /** Texto do botão que desliga a reação, quando desligar faz sentido. */
  rotuloDeDesligar?: string;
  aoMudar: (emoji: string) => void;
}

/** Escolher o emoji que significa uma coisa.
 *
 *  Um campo de texto e não um seletor de emoji: o teclado do sistema já tem um
 *  (Win+. no Windows), e embutir uma grade de 3.000 figuras para escolher entre
 *  duas seria a maior tela do projeto pela decisão mais rara dele. As sugestões
 *  cobrem o caso comum com um clique; o campo cobre o resto.
 *
 *  Vale para qualquer coisa que o Teams aceite como reação — inclusive as
 *  personalizadas do seu tenant, que só existem no seu canal. */
export function EscolherEmoji({
  id,
  titulo,
  explicacao,
  dono,
  valor,
  sugestoes,
  rotuloDeDesligar,
  aoMudar,
}: Props) {
  return (
    <div className="escolher-emoji">
      <div className="cabecalho-emoji">
        <label htmlFor={id}>{titulo}</label>
        <span className={`dono ${dono === 'time' ? 'do-time' : 'seu'}`}>
          convenção {dono === 'time' ? 'do time' : 'sua'}
        </span>
      </div>
      <p className="explicacao-emoji">{explicacao}</p>

      <div className="linha-emoji">
        <input
          id={id}
          type="text"
          className="campo-emoji"
          value={valor}
          maxLength={8}
          placeholder="—"
          aria-label={titulo}
          onChange={(e) => aoMudar(e.target.value.trim())}
        />
        <div className="sugestoes-emoji">
          {sugestoes.map((s) => (
            <button
              key={s}
              type="button"
              className={valor === s ? 'escolhida' : ''}
              onClick={() => aoMudar(s)}
              aria-label={`usar ${s}`}
              aria-pressed={valor === s}
            >
              {s}
            </button>
          ))}
        </div>
        {rotuloDeDesligar && valor && (
          <button type="button" className="desligar-emoji" onClick={() => aoMudar('')}>
            {rotuloDeDesligar}
          </button>
        )}
      </div>
    </div>
  );
}
