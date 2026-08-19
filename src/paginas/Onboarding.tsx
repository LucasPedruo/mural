import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../api';
import { mmss } from '../rotulos';
import type { ChatDisponivel, FonteEscolhida } from '../tipos';
import './onboarding.css';

type EstadoPasso = 'espera' | 'carregando' | 'ok' | 'erro';

/** Passos que chamam o Claude levam de 20s a 3min. Sem cronômetro a tela parece
 *  travada e a pessoa recarrega no meio. */
function useCronometro(ativo: boolean) {
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (!ativo) return;
    setSegundos(0);
    const id = window.setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [ativo]);
  return segundos;
}

function hojeLocal(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** O link copiado pela UI do Teams carrega tudo que precisamos, inclusive os
 *  nomes legíveis do time e do canal — que a API não devolve em lugar nenhum. */
function lerLinkDoTeams(bruto: string): FonteEscolhida | null {
  let u: URL;
  try {
    u = new URL(bruto.trim());
  } catch {
    return null;
  }
  if (!/teams\.microsoft\.com$/i.test(u.hostname)) return null;

  const m = u.pathname.match(/\/l\/message\/([^/]+)\//);
  if (!m) return null;

  const channelId = decodeURIComponent(m[1]);
  const teamId = u.searchParams.get('groupId');
  if (!teamId) return null; // link de chat não traz groupId
  if (!/^19:/.test(channelId)) return null;

  const nomeCanal = u.searchParams.get('channelName');
  const nomeTime = u.searchParams.get('teamName');
  const nome = [nomeTime, nomeCanal].filter(Boolean).join(' › ') || 'Canal do Teams';

  return { tipo: 'canal', subtipo: 'canal', teamId, channelId, nome };
}

export function Onboarding() {
  const navegar = useNavigate();

  const [passo1, setPasso1] = useState<EstadoPasso>('carregando');
  const [detalhe1, setDetalhe1] = useState('verificando…');

  const [passo2, setPasso2] = useState<EstadoPasso>('espera');
  const [detalhe2, setDetalhe2] = useState('aguardando o passo 1');
  const contaCarregando = passo2 === 'carregando';
  const cronoConta = useCronometro(contaCarregando);

  const [passo3, setPasso3] = useState<EstadoPasso>('espera');
  const [aba, setAba] = useState<'canal' | 'chat'>('canal');
  const [link, setLink] = useState('');
  const [chats, setChats] = useState<ChatDisponivel[] | null>(null);
  const [carregandoChats, setCarregandoChats] = useState(false);
  const cronoChats = useCronometro(carregandoChats);
  const [escolha, setEscolha] = useState<FonteEscolhida | null>(null);
  const [erro3, setErro3] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // A sprint nasce com o mural. Ela não precisa existir no seu time: é o ciclo
  // que você fecha, e é o que permite zerar "Concluído" de vez em quando em vez
  // de olhar seis meses de check acumulado.
  const [nomeSprint, setNomeSprint] = useState('Sprint 1');
  const [inicioSprint, setInicioSprint] = useState(hojeLocal());
  const [diasSprint, setDiasSprint] = useState(14);

  const jaVerificou = useRef(false);

  useEffect(() => {
    document.title = 'Configuração · Mural';
    if (jaVerificou.current) return; // StrictMode monta duas vezes em dev
    jaVerificou.current = true;

    void (async () => {
      const d = await api.verificarClaude();
      if (!d.ok) {
        setPasso1('erro');
        setDetalhe1(d.erro ?? 'não encontrado');
        return;
      }
      setPasso1('ok');
      setDetalhe1(d.versao ?? '');
      setPasso2('espera');
      setDetalhe2('pronto para verificar');
    })();
  }, []);

  async function verificarConta() {
    setPasso2('carregando');
    try {
      const d = await api.verificarConta();
      if (!d.ok || !d.conta) {
        setPasso2('erro');
        setDetalhe2(d.erro ?? 'não consegui verificar');
        return;
      }
      setPasso2('ok');
      setDetalhe2(`${d.conta.displayName} · ${d.conta.mail}`);
      setPasso3('espera');
    } catch (e) {
      setPasso2('erro');
      setDetalhe2((e as Error).message);
    }
  }

  async function carregarChats() {
    setCarregandoChats(true);
    setErro3(null);
    try {
      const d = await api.listarChats();
      if (!d.ok || !d.chats) throw new Error(d.erro ?? 'não consegui listar');
      setChats(d.chats);
    } catch (e) {
      setErro3((e as Error).message);
    } finally {
      setCarregandoChats(false);
    }
  }

  async function criar() {
    if (!escolha) return;
    setSalvando(true);
    setErro3(null);
    try {
      // Mapear a mesma conversa de novo reabre o mural existente, com o
      // histórico dela intacto, em vez de criar um quadro duplicado e vazio.
      const d = await api.criarMural(escolha);
      // Mural que já existia tem sprint própria em curso; sobrescrever com o
      // formulário desta tela apagaria o ciclo que está rodando lá.
      if (!d.jaExistia) {
        await api.definirSprint(d.id, {
          nome: nomeSprint.trim() || 'Sprint 1',
          inicio: inicioSprint,
          dias: diasSprint,
        });
      }
      navegar(`/m/${d.id}`);
    } catch (e) {
      setErro3((e as Error).message);
      setSalvando(false);
    }
  }

  const previaCanal = link.trim() ? lerLinkDoTeams(link) : null;

  return (
    <div className="pagina-onboarding">
      <div className="topo">
        <span className="ponto-marca" />
        <h1>Mural</h1>
      </div>
      <p className="sub">
        Um kanban montado a partir das reações de uma conversa do Teams. Quatro passos e o quadro
        está de pé.
      </p>

      {/* 1 */}
      <section className="passo" data-estado={passo1}>
        <div className="passo-topo">
          <span className="num">{passo1 === 'ok' ? '✓' : '1'}</span>
          <h2>Claude Code instalado</h2>
        </div>
        <p className={'detalhe ' + (passo1 === 'ok' ? 'bom' : passo1 === 'erro' ? 'ruim' : '')}>
          {detalhe1}
        </p>
        {passo1 === 'erro' && (
          <div className="corpo">
            <p className="aviso erro">
              O Mural usa o Claude Code para ler o Teams — ele é obrigatório. Instale em{' '}
              <code>claude.com/claude-code</code>, feche e abra este servidor de novo.
            </p>
          </div>
        )}
      </section>

      {/* 2 */}
      <section className="passo" data-estado={passo1 === 'ok' ? passo2 : 'espera'}>
        <div className="passo-topo">
          <span className="num">{passo2 === 'ok' ? '✓' : '2'}</span>
          <h2>Conta Microsoft conectada</h2>
        </div>
        <p className={'detalhe ' + (passo2 === 'ok' ? 'bom' : passo2 === 'erro' ? 'ruim' : '')}>
          {contaCarregando ? `perguntando ao Claude Code… ${mmss(cronoConta)}` : detalhe2}
        </p>
        {passo1 === 'ok' && passo2 !== 'ok' && (
          <div className="corpo">
            <button className="primario" onClick={verificarConta} disabled={contaCarregando}>
              {passo2 === 'erro' ? 'Tentar de novo' : 'Verificar conexão'}
            </button>
            <p className="dica">
              O Mural não pede nem guarda sua senha. Quem autentica é o conector Microsoft 365 do
              Claude Code — aqui só perguntamos quem já está logado. Leva cerca de 20 segundos.
            </p>
          </div>
        )}
      </section>

      {/* 3 */}
      <section className="passo" data-estado={passo2 === 'ok' ? passo3 : 'espera'}>
        <div className="passo-topo">
          <span className="num">3</span>
          <h2>Escolher a conversa</h2>
        </div>
        <p className="detalhe">
          {passo2 === 'ok' ? 'escolha o canal ou o chat que vira o quadro' : 'aguardando o passo 2'}
        </p>

        {passo2 === 'ok' && (
          <div className="corpo">
            <div className="abas" role="tablist">
              <button
                className="aba"
                role="tab"
                aria-selected={aba === 'canal'}
                onClick={() => {
                  setAba('canal');
                  setEscolha(null);
                }}
              >
                Canal de time
              </button>
              <button
                className="aba"
                role="tab"
                aria-selected={aba === 'chat'}
                onClick={() => {
                  setAba('chat');
                  setEscolha(null);
                }}
              >
                Chat ou grupo
              </button>
            </div>

            {aba === 'canal' ? (
              <div>
                <label className="rotulo" htmlFor="link">
                  No Teams, abra o canal → “…” em qualquer mensagem → <strong>Copiar link</strong>{' '}
                  → cole aqui:
                </label>
                <input
                  id="link"
                  type="text"
                  autoComplete="off"
                  placeholder="https://teams.microsoft.com/l/message/19%3A…"
                  value={link}
                  onChange={(e) => {
                    setLink(e.target.value);
                    setEscolha(lerLinkDoTeams(e.target.value));
                  }}
                />
                {link.trim() &&
                  (previaCanal ? (
                    <p className="aviso ok">Encontrei: {previaCanal.nome}</p>
                  ) : (
                    <p className="aviso erro">
                      Não reconheci esse link. Ele precisa ser o “Copiar link” de uma mensagem de
                      canal (o de chat não serve aqui — use a aba Chat ou grupo).
                    </p>
                  ))}
                <p className="dica">
                  Canais não podem ser listados: a API da Microsoft não oferece essa rota para
                  conectores. O link resolve porque carrega o time, o canal e os nomes de ambos.
                </p>
              </div>
            ) : (
              <div>
                {!chats && (
                  <>
                    <button onClick={carregarChats} disabled={carregandoChats}>
                      {carregandoChats ? 'Carregando…' : 'Carregar meus chats'}
                    </button>
                    <p className="dica">
                      {carregandoChats
                        ? `Lendo seus chats no Teams… ${mmss(cronoChats)}`
                        : 'Lista chats 1:1, grupos e reuniões. Costuma levar de 2 a 3 minutos — o Teams entrega os chats em páginas e cada uma é uma ida à API.'}
                    </p>
                  </>
                )}

                {chats && (
                  <>
                    <div className="lista-chats">
                      {chats.map((c) => (
                        <button
                          key={c.id}
                          className="item-chat"
                          aria-selected={escolha?.chatId === c.id}
                          onClick={() =>
                            // subtipo define o rótulo da 1ª coluna: "ninguém
                            // pegou" não faz sentido numa conversa de 2 pessoas.
                            setEscolha({
                              tipo: 'chat',
                              subtipo: c.tipo,
                              chatId: c.id,
                              nome: c.nome,
                            })
                          }
                        >
                          <span className="nome">{c.nome}</span>
                          <span className="meta">
                            {c.tipo === 'oneOnOne'
                              ? '1:1'
                              : c.tipo === 'meeting'
                                ? 'reunião'
                                : `grupo · ${c.membros}`}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="dica">{chats.length} conversas. Clique em uma.</p>
                  </>
                )}
              </div>
            )}

            {erro3 && <p className="aviso erro">{erro3}</p>}
          </div>
        )}
      </section>

      {/* 4 */}
      <section className="passo" data-estado={escolha ? 'espera' : 'espera'}>
        <div className="passo-topo">
          <span className="num">4</span>
          <h2>A sprint</h2>
        </div>
        <p className="detalhe">
          {escolha ? 'o ciclo que você fecha de vez em quando' : 'aguardando o passo 3'}
        </p>

        {escolha && (
          <div className="corpo">
            <p className="dica">
              Não precisa existir sprint no seu time. Isto é só um período com começo e fim: quando
              você encerra, o que está em <strong>Concluído</strong> e em{' '}
              <strong>Feito por mim</strong> sai do quadro e vai para o arquivo da sprint — de onde
              os painéis leem. Sem isso, "concluído" acumula para sempre e a coluna deixa de dizer
              alguma coisa.
            </p>

            <div className="campos-sprint">
              <label className="rotulo" htmlFor="nome-sprint">
                Nome
                <input
                  id="nome-sprint"
                  type="text"
                  maxLength={60}
                  value={nomeSprint}
                  onChange={(e) => setNomeSprint(e.target.value)}
                />
              </label>

              <label className="rotulo" htmlFor="inicio-sprint">
                Começou em
                <input
                  id="inicio-sprint"
                  type="date"
                  value={inicioSprint}
                  onChange={(e) => setInicioSprint(e.target.value)}
                />
              </label>

              <label className="rotulo" htmlFor="dias-sprint">
                Duração
                <select
                  id="dias-sprint"
                  value={diasSprint}
                  onChange={(e) => setDiasSprint(Number(e.target.value))}
                >
                  <option value={7}>7 dias</option>
                  <option value={14}>14 dias</option>
                  <option value={21}>21 dias</option>
                  <option value={28}>28 dias</option>
                </select>
              </label>
            </div>

            <p className="dica">
              Dá para mudar tudo isso depois, no cabeçalho do quadro. Encerrar continua sendo um
              gesto seu: a data só serve para o painel contar o que chegou dentro do período.
            </p>

            {erro3 && <p className="aviso erro">{erro3}</p>}

            <div className="acao-final">
              <button className="primario" onClick={criar} disabled={!escolha || salvando}>
                {salvando ? 'Criando…' : 'Criar o mural'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
