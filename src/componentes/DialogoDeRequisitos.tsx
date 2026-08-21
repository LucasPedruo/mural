import { useState } from 'react';

import { IconeFeito } from './icones';
import './confirmar.css';
import './dialogo.css';
import './requisitos.css';

interface Props {
  aoComecar: (naoMostrarDeNovo: boolean) => void;
}

/** O que o Mural precisa para funcionar, antes de pedir qualquer coisa.
 *
 *  A configuração tem cinco passos e três deles falham por motivos que não estão
 *  na tela: Node antigo, CLI de IA que nunca foi instalado, MCP do Graph que
 *  ninguém ligou. Descobrir isso passo a passo é descobrir na ordem errada — a
 *  pessoa preenche o que consegue e trava no meio, sem saber que faltava algo
 *  desde o começo.
 *
 *  Então a lista vem primeiro, com o que fazer em cada linha. Ninguém lê a
 *  documentação antes de clicar, mas todo mundo lê a caixa que abre na frente. */
export function DialogoDeRequisitos({ aoComecar }: Props) {
  const [naoMostrar, setNaoMostrar] = useState(false);

  return (
    <div className="fundo-modal" role="presentation">
      <div
        className="modal largo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-requisitos"
      >
        <h2 id="titulo-requisitos">Antes de começar</h2>
        <p className="explicacao">
          O Mural não fala com o Teams por conta própria: ele pede a um agente de IA já autenticado
          que leia a conversa. São três coisas, e a terceira é a que costuma faltar.
        </p>

        <ol className="requisitos">
          <li>
            <strong>Node.js 18 ou mais novo</strong>
            <p>
              É o que roda o servidor. Confira com <code>node -v</code> num terminal. Se o comando
              não existir ou a versão for menor, instale em <em>nodejs.org</em>.
            </p>
          </li>

          <li>
            <strong>Um agente de IA de linha de comando</strong>
            <p>
              Claude Code, Codex CLI, Gemini CLI ou outro que você configure. Ele precisa estar
              instalado <em>e já autenticado</em> — o Mural nunca pede sua senha, ele usa a sessão
              que o agente já tem. O caminho testado é o Claude Code; confira com{' '}
              <code>claude --version</code>.
            </p>
          </li>

          <li>
            <strong>Acesso ao Microsoft Graph, dentro desse agente</strong>
            <p>
              É por aqui que a conversa do Teams é lida, e é o que mais falha. No Claude Code é o
              conector <em>Microsoft 365</em>: rode <code>/mcp</code>, conecte e autorize no
              navegador. Nos outros agentes, é um MCP server de Graph no arquivo de configuração
              deles.
            </p>
            <p className="detalhe-requisito">
              Se o passo 2 da configuração falhar, é quase sempre isto — e lá tem um botão que
              consulta e conecta sem você sair da página.
            </p>
          </li>
        </ol>

        <p className="nota-requisitos">
          <IconeFeito tamanho={13} /> Você também vai precisar do <strong>link de uma mensagem</strong>{' '}
          do canal que vira o quadro. No Teams: <strong>…</strong> numa mensagem ›{' '}
          <strong>Copiar link</strong>. Para conversas e grupos, não precisa — eles aparecem numa
          lista.
        </p>

        <div className="acoes-modal">
          <label className="nao-mostrar">
            <input
              type="checkbox"
              checked={naoMostrar}
              onChange={(e) => setNaoMostrar(e.target.checked)}
            />
            Não mostrar de novo
          </label>
          <span className="separador" />
          <button className="primario" onClick={() => aoComecar(naoMostrar)}>
            Tenho tudo, começar
          </button>
        </div>
      </div>
    </div>
  );
}
