import { mmss } from '../rotulos';
import type { Progresso } from '../tipos';
import './barra.css';

interface Props {
  progresso: Progresso | null;
}

/** Uma atualizacao leva 1 a 2 minutos. Sem este retorno a tela parece travada —
 *  foi o primeiro defeito real que apareceu no uso. */
export function BarraDeSync({ progresso }: Props) {
  if (!progresso) return null;

  // So mostra proporcao depois que a leitura de mensagens comeca de fato; antes
  // disso nao ha nada honesto para medir, e a barra desliza para dizer "vivo".
  const temContagem = progresso.lidas > 0;
  const largura = temContagem
    ? Math.min(98, (progresso.lidas / progresso.total) * 100)
    : undefined;

  return (
    <div className="barra-sync">
      <div className="trilho">
        <div
          className={'pulso' + (temContagem ? '' : ' indefinido')}
          style={temContagem ? { width: `${largura}%` } : undefined}
        />
      </div>
      <span>
        {progresso.etapa}
        {temContagem && ` — ${progresso.lidas} de ~${progresso.total}`}
        {'  ·  '}
        {mmss(progresso.segundos)}
      </span>
    </div>
  );
}
