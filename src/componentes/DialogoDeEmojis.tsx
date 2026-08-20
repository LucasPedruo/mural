import { useState } from 'react';

import { EscolherEmoji } from './EscolherEmoji';
import './confirmar.css';
import './dialogo.css';

interface Props {
  emojiFazendo: string;
  emojiMeu: string;
  checks: string[];
  /** Salva no servidor e devolve o erro se ele recusar — as duas reações não
   *  podem ser iguais nem ser o check, e quem decide isso é lá. */
  aoSalvar: (quais: { emojiFazendo?: string; emojiMeu?: string }) => Promise<string | null>;
  aoFechar: () => void;
}

/** As reações que o quadro entende, num lugar só.
 *
 *  As duas se abriam por um `window.prompt` cada, no cabeçalho da coluna: sem
 *  sugestão, sem ver a outra, e com a regra de que não podem ser iguais só
 *  aparecendo depois, como erro. Aqui elas ficam lado a lado, que é como a
 *  escolha realmente se faz — e o check aparece junto para a terceira pergunta
 *  não ficar sem resposta na tela. */
export function DialogoDeEmojis({ emojiFazendo, emojiMeu, checks, aoSalvar, aoFechar }: Props) {
  const [erro, setErro] = useState<string | null>(null);

  async function mudar(quais: { emojiFazendo?: string; emojiMeu?: string }) {
    setErro(await aoSalvar(quais));
  }

  return (
    <div className="fundo-modal" onClick={aoFechar} role="presentation">
      <div
        className="modal largo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-emojis"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-emojis">As reações</h2>
        <p className="explicacao">
          O quadro inteiro sai daqui: o Mural lê as reações das mensagens, e é isso que decide a
          coluna de cada card. Duas você escolhe; a terceira já está decidida.
        </p>

        <EscolherEmoji
          id="emoji-fazendo-quadro"
          titulo="peguei esta"
          dono="time"
          explicacao={
            'Enche a coluna Em andamento. Vale para QUALQUER pessoa que reagir: é o jeito de ' +
            'alguém anunciar que já está mexendo, para dois não pegarem a mesma demanda.'
          }
          valor={emojiFazendo}
          sugestoes={['⚪', '⏱️', '👀', '🔨', '🚧']}
          rotuloDeDesligar="não usamos isso — desligar a coluna"
          aoMudar={(e) => void mudar({ emojiFazendo: e })}
        />

        <EscolherEmoji
          id="emoji-meu-quadro"
          titulo="fui eu que fiz"
          dono="você"
          explicacao={
            'Manda o card para Concluído por mim, com a anotação da daily. Precisa ser um emoji ' +
            'que SÓ VOCÊ usa nesse canal: o Teams não conta quem reagiu, então esta é a única ' +
            'forma de o quadro saber que o trabalho foi seu.'
          }
          valor={emojiMeu}
          sugestoes={['🟢', '💚', '🙌', '🦄', '🎯']}
          rotuloDeDesligar="prefiro marcar à mão no card"
          aoMudar={(e) => void mudar({ emojiMeu: e })}
        />

        {checks.length > 0 && (
          <div className="check-fixo">
            <span className="emojis">{checks.slice(0, 3).join(' ')}</span>
            <p>
              <strong>Concluído</strong> não se configura: o check já quer dizer "feito" para o
              canal inteiro. Por isso ele também não pode ser nenhuma das duas de cima.
            </p>
          </div>
        )}

        {erro && <p className="aviso erro">{erro}</p>}

        <div className="acoes-modal">
          <button className="primario" onClick={aoFechar}>
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
}
