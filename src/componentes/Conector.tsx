import type { RespostaMcp } from '../tipos';
import './conector.css';

interface Props {
  mcp: RespostaMcp | null;
  ocupado: 'lendo' | 'conectando' | null;
  /** O CLI sabe autenticar pela linha de comando. Sem isso, só dá para mostrar
   *  o estado — conectar continua sendo trabalho de quem abre o terminal. */
  podeConectar: boolean;
  aoVer: () => void;
  aoConectar: (nome: string) => void;
}

/** O conector do Teams, resolvido sem sair da página.
 *
 *  "Abra um terminal e rode `/mcp`" não tinha como virar botão: `/mcp` é um
 *  comando da TUI do agente, e um programa não digita dentro da janela de outro.
 *  Mas o mesmo CLI responde a `mcp list` e `mcp login` FORA da TUI — então o
 *  botão que faltava não abre terminal nenhum. Ele pergunta, e ele conecta.
 *
 *  Quem autoriza continua sendo a pessoa, na tela da Microsoft: este servidor
 *  nunca vê credencial, e isso segue verdadeiro depois deste botão. */
export function Conector({ mcp, ocupado, podeConectar, aoVer, aoConectar }: Props) {
  const alvo = mcp?.doTeams ?? null;

  return (
    <div className="conector">
      <div className="acoes-conector">
        <button onClick={aoVer} disabled={!!ocupado}>
          {ocupado === 'lendo' ? 'Consultando…' : 'Ver conectores do agente'}
        </button>
        {alvo && !alvo.conectado && podeConectar && (
          <button className="primario" onClick={() => aoConectar(alvo.nome)} disabled={!!ocupado}>
            {ocupado === 'conectando' ? 'Autorize no navegador…' : 'Conectar ' + alvo.nome}
          </button>
        )}
      </div>

      {mcp && !mcp.ok && <p className="aviso erro">{mcp.erro}</p>}

      {mcp?.ok && (
        <>
          {alvo ? (
            <p className={'aviso ' + (alvo.conectado ? 'ok' : 'atencao')}>
              <strong>{alvo.nome}</strong> — {alvo.estado}
            </p>
          ) : (
            <p className="aviso atencao">
              Nenhum conector com cara de Microsoft ou Teams na lista do agente. Ele precisa de um
              MCP de Microsoft Graph para ler a conversa.
            </p>
          )}

          {/* A lista inteira, e não só o que interessa: quando o nome do
              conector não é o esperado, é aqui que se descobre qual é. */}
          {(mcp.servidores?.length ?? 0) > 0 && (
            <ul className="lista-mcp">
              {mcp.servidores!.map((sv) => (
                <li key={sv.nome} className={sv.conectado ? 'ligado' : ''}>
                  <span className="nome-mcp">{sv.nome}</span>
                  <span className="estado-mcp">{sv.estado}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
