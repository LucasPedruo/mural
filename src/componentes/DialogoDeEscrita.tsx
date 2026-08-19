import { useEffect, useState } from 'react';

import { api } from '../api';
import type { RespostaEscrita } from '../tipos';
import './confirmar.css';
import './dialogo.css';

interface Props {
  estado: RespostaEscrita;
  aoMudar: (estado: RespostaEscrita) => void;
  aoFechar: () => void;
}

/** Ligar a escrita no Teams. É o único momento em que o Mural pede uma
 *  credencial, e a tela diz isso em vez de esconder.
 *
 *  O fluxo é device code: o servidor pede um código, você digita no site da
 *  Microsoft, e o que fica em disco é um refresh token — nenhum segredo de
 *  aplicação, nada que sirva sem a sua conta. */
export function DialogoDeEscrita({ estado, aoMudar, aoFechar }: Props) {
  const [clientId, setClientId] = useState(estado.clientId);
  const [tenant, setTenant] = useState(estado.tenant || 'organizations');
  const [erro, setErro] = useState<string | null>(null);
  const [pedindo, setPedindo] = useState(false);

  const aguardando = estado.aguardando;

  // Enquanto o código está na tela, ninguém sabe quando a pessoa vai digitá-lo:
  // é o servidor que pergunta ao Azure, e a tela só acompanha.
  useEffect(() => {
    if (!aguardando || estado.ligada) return;
    const id = window.setInterval(async () => {
      try {
        const novo = await api.escrita();
        aoMudar(novo);
        if (novo.erro) setErro(novo.erro);
      } catch {
        /* servidor fora: o erro da ação principal já aparece na tela */
      }
    }, 3000);
    return () => clearInterval(id);
  }, [aguardando, estado.ligada, aoMudar]);

  async function conectar() {
    setPedindo(true);
    setErro(null);
    try {
      aoMudar(await api.ligarEscrita(clientId.trim(), tenant.trim()));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setPedindo(false);
    }
  }

  async function desconectar() {
    setErro(null);
    try {
      aoMudar(await api.desligarEscrita());
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <div className="fundo-modal" onClick={aoFechar} role="presentation">
      <div
        className="modal largo"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-escrita"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="titulo-escrita">Escrever no Teams</h2>

        {estado.ligada ? (
          <>
            <p className="explicacao">
              Ligada. Arrastar um card escreve a reação na mensagem — ⚪ em <em>Fazendo</em>, ✅ em{' '}
              <em>Concluído</em> — e o time vê. A reação sai como sendo <strong>você</strong>.
            </p>
            <p className="dica">
              app <code>{estado.clientId}</code>
              {estado.conectadoEm &&
                ` · autorizado em ${new Date(estado.conectadoEm).toLocaleString('pt-BR')}`}
            </p>
            <p className="dica">
              Para revogar de fora do Mural:{' '}
              <code>myaccount.microsoft.com</code> → Aplicativos e serviços.
            </p>
            {erro && <p className="aviso erro">{erro}</p>}
            <div className="acoes-modal">
              <button onClick={aoFechar}>Fechar</button>
              <button onClick={() => void desconectar()}>Desligar a escrita</button>
            </div>
          </>
        ) : aguardando ? (
          <>
            <p className="explicacao">
              Abra <strong>{aguardando.endereco}</strong> e digite este código:
            </p>
            <p className="codigo-device">{aguardando.codigo}</p>
            <p className="dica">
              Esperando você autorizar… O código vale até{' '}
              {new Date(aguardando.expiraEm).toLocaleTimeString('pt-BR')}. Esta janela se atualiza
              sozinha quando a autorização chegar.
            </p>
            {erro && <p className="aviso erro">{erro}</p>}
            <div className="acoes-modal">
              <button onClick={aoFechar}>Fechar</button>
              <button onClick={() => void conectar()} disabled={pedindo}>
                Pedir outro código
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="explicacao">
              Até aqui o Mural só <strong>lê</strong> o Teams. Ligando a escrita, arrastar um card
              passa a pôr a reação na mensagem — e o quadro deixa de ser só o seu espelho do canal.
            </p>

            <p className="aviso info">
              Isto muda uma promessa do projeto: o servidor passa a guardar um token de escrita em{' '}
              <code>data/graph.json</code>. Sem segredo de aplicação, só na sua máquina, e você
              revoga quando quiser.
            </p>

            <p className="dica">
              Precisa de um app registrado no Azure (<em>App registrations</em> → New registration →
              Public client, com <em>Allow public client flows</em> ligado) e das permissões
              delegadas <code>ChannelMessage.Send</code> e <code>ChatMessage.Send</code>. Nenhuma
              delas pede consentimento de admin.
            </p>

            <label className="campo">
              <span className="rotulo">Application (client) ID</span>
              <input
                type="text"
                value={clientId}
                autoFocus
                spellCheck={false}
                placeholder="00000000-0000-0000-0000-000000000000"
                onChange={(e) => setClientId(e.target.value)}
              />
            </label>

            <label className="campo">
              <span className="rotulo">Directory (tenant) ID</span>
              <input
                type="text"
                value={tenant}
                spellCheck={false}
                onChange={(e) => setTenant(e.target.value)}
              />
              <span className="dica">
                <code>organizations</code> serve para contas de trabalho; use o id do diretório se o
                app for de um tenant só.
              </span>
            </label>

            {erro && <p className="aviso erro">{erro}</p>}

            <div className="acoes-modal">
              <button onClick={aoFechar}>Cancelar</button>
              <button
                className="primario"
                onClick={() => void conectar()}
                disabled={pedindo || !clientId.trim()}
              >
                {pedindo ? 'Pedindo o código…' : 'Pedir o código'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
