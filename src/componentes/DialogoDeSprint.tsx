import { useState } from 'react';

import { dataDoDiaISO } from '../rotulos';
import type { Sprint } from '../tipos';
import './confirmar.css';
import './dialogo.css';

interface Props {
  sprint: Sprint | null;
  /** Onde o diálogo apareceu. No onboarding ele explica o que é uma sprint;
   *  no quadro a pessoa já sabe e só quer corrigir a data. */
  primeiraVez?: boolean;
  aoSalvar: (dados: { nome: string; inicio: string; dias: number }) => void;
  aoCancelar: () => void;
}

const DURACOES = [7, 14, 21, 28];

function hojeLocal(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function somarDias(dia: string, dias: number): string {
  const [ano, mes, d] = dia.split('-').map(Number);
  const data = new Date(ano, mes - 1, d + dias);
  const m = String(data.getMonth() + 1).padStart(2, '0');
  const dd = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${m}-${dd}`;
}

/** A sprint do mural. Aqui ela é só um ciclo com começo e fim — o time nem
 *  precisa usar a palavra. Ela existe para que "concluído" possa ser zerado de
 *  vez em quando: um quadro que acumula seis meses de check não serve para
 *  olhar, e a daily precisa de um "nesta sprint" para caber numa frase. */
export function DialogoDeSprint({ sprint, primeiraVez, aoSalvar, aoCancelar }: Props) {
  const [nome, setNome] = useState(sprint?.nome ?? 'Sprint 1');
  const [inicio, setInicio] = useState(sprint?.inicio ?? hojeLocal());
  const [dias, setDias] = useState(sprint?.dias ?? 14);

  const fim = /^\d{4}-\d{2}-\d{2}$/.test(inicio) ? somarDias(inicio, dias - 1) : '';

  return (
    <div className="fundo-modal" onClick={aoCancelar} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-sprint"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-sprint">{sprint ? 'Sprint do mural' : 'Definir a sprint'}</h2>
        {primeiraVez && (
          <p className="explicacao">
            Não precisa existir sprint no seu time: isto é só o ciclo que você fecha de vez em
            quando. Ao encerrar, o que está em <strong>Concluído</strong> e em{' '}
            <strong>Feito por mim</strong> sai do quadro e vai para o arquivo da sprint — que é de
            onde os painéis leem.
          </p>
        )}

        <label className="campo">
          <span className="rotulo">Nome</span>
          <input
            type="text"
            value={nome}
            autoFocus
            maxLength={60}
            onChange={(e) => setNome(e.target.value)}
          />
          <span className="dica">
            Ao encerrar, a próxima nasce com o número seguinte — "Sprint 7" vira "Sprint 8".
          </span>
        </label>

        <label className="campo">
          <span className="rotulo">Começou em</span>
          <input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </label>

        <div className="campo">
          <span className="rotulo">Duração</span>
          <div className="opcoes">
            {DURACOES.map((d) => (
              <button
                key={d}
                type="button"
                className={dias === d ? 'escolhida' : ''}
                onClick={() => setDias(d)}
              >
                {d} dias
              </button>
            ))}
          </div>
          <span className="dica">
            {fim
              ? `Vai até ${dataDoDiaISO(fim)}. A data serve para o painel contar o que chegou dentro do período — encerrar continua sendo um gesto seu, não um relógio.`
              : 'Escolha a data de início.'}
          </span>
        </div>

        <div className="acoes-modal">
          <button onClick={aoCancelar}>Cancelar</button>
          <button
            className="primario"
            disabled={!nome.trim() || !fim}
            onClick={() => aoSalvar({ nome: nome.trim(), inicio, dias })}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
