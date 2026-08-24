import { PESSOAS_DO_TIME, type PessoaDoTime } from '../tipos';
import './confirmar.css';
import './dialogo.css';

interface Props {
  atual: PessoaDoTime | null;
  aoEscolher: (pessoa: PessoaDoTime) => void;
  aoCancelar?: () => void;
}

export function DialogoDePessoa({ atual, aoEscolher, aoCancelar }: Props) {
  return (
    <div className="fundo-modal" onClick={aoCancelar} role="presentation">
      <div
        className="modal modal-pessoa"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-pessoa"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-pessoa">Quem esta usando este quadro?</h2>
        <p className="explicacao">
          Esta escolha fica neste navegador e define suas colunas de In progress e Done.
        </p>

        <div className="grade-pessoas">
          {PESSOAS_DO_TIME.map((pessoa) => (
            <button
              key={pessoa}
              className={pessoa === atual ? 'selecionada' : ''}
              onClick={() => aoEscolher(pessoa)}
            >
              {pessoa}
            </button>
          ))}
        </div>

        {aoCancelar && (
          <div className="acoes-modal">
            <button onClick={aoCancelar}>Cancelar</button>
          </div>
        )}
      </div>
    </div>
  );
}
