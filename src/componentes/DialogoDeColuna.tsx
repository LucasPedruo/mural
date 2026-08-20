import { useState } from 'react';

import { CORES_DE_COLUNA, type ColunaPersonalizada, type CorDeColuna } from '../tipos';
import './confirmar.css';
import './dialogo.css';

interface Props {
  /** Nula = criando. Preenchida = corrigindo o nome ou a cor de uma existente. */
  coluna: ColunaPersonalizada | null;
  aoSalvar: (dados: { nome: string; cor: CorDeColuna }) => void;
  aoCancelar: () => void;
}

/** Uma coluna sua.
 *
 *  O diálogo é curto porque a coluna é curta: ela não tem regra nenhuma. As seis
 *  do quadro são regras — "sem reação", "com check" — e por isso não se criam.
 *  Esta é um lugar, e o único jeito de um card entrar é você arrastar. */
export function DialogoDeColuna({ coluna, aoSalvar, aoCancelar }: Props) {
  const [nome, setNome] = useState(coluna?.nome ?? '');
  const [cor, setCor] = useState<CorDeColuna>(coluna?.cor ?? CORES_DE_COLUNA[0]);

  const valido = !!nome.trim();
  const salvar = () => {
    if (valido) aoSalvar({ nome: nome.trim(), cor });
  };

  return (
    <div className="fundo-modal" onClick={aoCancelar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-coluna"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-coluna">{coluna ? 'Renomear a coluna' : 'Nova coluna'}</h2>
        {!coluna && (
          <p className="explicacao">Recebe só o que você arrastar para dentro.</p>
        )}

        <label className="campo">
          <span className="rotulo">Nome</span>
          <input
            type="text"
            value={nome}
            autoFocus
            maxLength={24}
            placeholder="Ex.: Aguardando cliente"
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') salvar();
            }}
          />
          <span className="dica">Curto — cabe a largura de um card.</span>
        </label>

        <div className="campo">
          <span className="rotulo">Cor</span>
          <div className="cores-de-coluna">
            {CORES_DE_COLUNA.map((c) => (
              <button
                key={c}
                type="button"
                className={'amostra-cor' + (cor === c ? ' escolhida' : '')}
                style={{ ['--cor' as string]: `var(--coluna-${c})` }}
                onClick={() => setCor(c)}
                title={c}
                aria-label={c}
                aria-pressed={cor === c}
              />
            ))}
          </div>

        </div>

        <div className="acoes-modal">
          <button onClick={aoCancelar}>Cancelar</button>
          <button className="primario" disabled={!valido} onClick={salvar}>
            {coluna ? 'Salvar' : 'Criar coluna'}
          </button>
        </div>
      </div>
    </div>
  );
}
