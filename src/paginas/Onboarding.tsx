import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../api';
import { Conector } from '../componentes/Conector';
import { EscolherEmoji } from '../componentes/EscolherEmoji';
import { IconeFeito, IconeVoltar } from '../componentes/icones';
import { mmss } from '../rotulos';
import type {
  RespostaMcp,
  AgenteDisponivel,
  AjustesDoAgente,
  ChatDisponivel,
  FonteEscolhida,
} from '../tipos';
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

/** O que fazer quando a conexão com o Teams falha.
 *
 *  Antes esta tela respondia com uma frase — "o conector precisa estar ativo" —
 *  e, logo abaixo, o painel de ajustes avançados: binário, molde de argumentos,
 *  `{{FERRAMENTAS}}`, molde de URI. Nada daquilo resolve um conector não
 *  autorizado, e quem chegou ali por não conseguir conectar não tem como saber
 *  disso. A tela dizia o que está errado e escondia o que fazer.
 *
 *  São passos numerados porque a ação acontece FORA daqui: em outro programa,
 *  em outra janela. Uma frase corrida obriga a pessoa a montar a sequência
 *  sozinha enquanto alterna entre as duas telas. */
function ComoConectar({ nome }: { nome: string }) {
  return (
    <div className="como-conectar">
      <strong>Como resolver</strong>
      <ol>
        <li>
          Abra o <strong>{nome}</strong> num terminal.
        </li>
        <li>
          Configure nele um <strong>MCP de Microsoft Graph</strong> — o conector da claude.ai não
          vale fora do Claude Code.
        </li>
        <li>
          Nos ajustes avançados abaixo, troque os nomes das tools e o molde das URIs pelos que esse
          MCP usa.
        </li>
        <li>Volte aqui e clique em Tentar de novo.</li>
      </ol>
    </div>
  );
}

export function Onboarding() {
  const navegar = useNavigate();

  const [passo1, setPasso1] = useState<EstadoPasso>('carregando');
  const [detalhe1, setDetalhe1] = useState('procurando agentes instalados…');

  // O agente é a primeira pergunta do onboarding, e é uma escolha: quem lê o
  // Teams pode ser o Claude Code, o Codex, o Gemini CLI ou qualquer CLI que você
  // configure. Antes este passo só testava se o Claude existia — o que não é
  // pergunta nenhuma, é um veredito.
  const [agentes, setAgentes] = useState<AgenteDisponivel[] | null>(null);
  const [agenteId, setAgenteId] = useState<string>('claude');
  const [ajustes, setAjustes] = useState<AjustesDoAgente>({});
  const [mostrarAjustes, setMostrarAjustes] = useState(false);
  const [salvandoAgente, setSalvandoAgente] = useState(false);
  const [erro1, setErro1] = useState<string | null>(null);

  const agente = agentes?.find((a) => a.id === agenteId) ?? null;

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

  // As reações que o quadro entende. Só duas se escolhem — a terceira é o check,
  // que já significa "concluído" para o canal inteiro. Elas são preferência do
  // USUÁRIO, não do mural: valem para todos os quadros e por isso são salvas na
  // hora, sem esperar o "Criar o mural".
  const [emojiFazendo, setEmojiFazendo] = useState('');
  const [emojiMeu, setEmojiMeu] = useState('');
  const [checks, setChecks] = useState<string[]>([]);
  const [erroEmoji, setErroEmoji] = useState<string | null>(null);

  // Se já existe mural, esta tela é opcional e precisa de saída. Se não existe,
  // ela é a única coisa a fazer no app.
  const [temMurais, setTemMurais] = useState(false);

  // Os dois primeiros passos são DIAGNÓSTICOS, não requisitos: nem detectar o
  // binário nem descobrir a conta logada é necessário para criar um mural. Mas
  // eles estavam travando a tela — agente que não responde `--version` (um
  // wrapper, um alias, um PATH estranho) deixava a pessoa parada num passo com um
  // botão de "tentar de novo" que ia falhar igual para sempre.
  //
  // Daí a saída explícita. O que ela custa está escrito ao lado dela: a falha
  // reaparece na primeira leitura, e lá com o motivo em contexto.
  // O conector, respondido aqui em vez de num terminal. `claude mcp list` e
  // `claude mcp login` existem fora da TUI, então a pergunta do passo 2 se
  // responde na própria página — e o botão que faltava é este, não um que abre
  // terminal para a pessoa digitar /mcp (comando que só existe lá dentro).
  const [mcp, setMcp] = useState<RespostaMcp | null>(null);
  const [mcpOcupado, setMcpOcupado] = useState<'lendo' | 'conectando' | null>(null);

  const [passo1Forcado, setPasso1Forcado] = useState(false);
  const [contaPulada, setContaPulada] = useState(false);
  const passo1Liberado = passo1 === 'ok' || passo1Forcado;
  const podeEscolherConversa = passo2 === 'ok' || contaPulada;

  const jaVerificou = useRef(false);

  useEffect(() => {
    document.title = 'Configuração · Mural';
    if (jaVerificou.current) return; // StrictMode monta duas vezes em dev
    jaVerificou.current = true;

    void carregarAgentes();
    void api
      .listarMurais()
      .then((r) => setTemMurais(r.murais.length > 0))
      .catch(() => {
        /* sem a lista a tela segue: o botão de voltar só não aparece */
      });
    void api
      .preferencias()
      .then((r) => {
        setEmojiFazendo(r.preferencias.emojiFazendo);
        setEmojiMeu(r.preferencias.emojiMeu);
        setChecks(r.checks);
      })
      .catch(() => {
        /* sem preferências a tela ainda funciona: os campos nascem vazios */
      });
  }, []);

  /** Salva na hora, e é o servidor que valida: as duas reações não podem ser
   *  iguais nem ser o check, e essa regra mora lá porque é ela que decide a
   *  coluna de cada card. Recusado, o campo volta ao valor anterior — deixá-lo
   *  mostrando algo que não foi gravado seria pior que o erro. */
  async function salvarEmoji(quais: { emojiFazendo?: string; emojiMeu?: string }) {
    const antes = { emojiFazendo, emojiMeu };
    if (quais.emojiFazendo !== undefined) setEmojiFazendo(quais.emojiFazendo);
    if (quais.emojiMeu !== undefined) setEmojiMeu(quais.emojiMeu);
    setErroEmoji(null);
    try {
      const r = await api.salvarPreferencias(quais);
      setEmojiFazendo(r.preferencias.emojiFazendo);
      setEmojiMeu(r.preferencias.emojiMeu);
    } catch (e) {
      setEmojiFazendo(antes.emojiFazendo);
      setEmojiMeu(antes.emojiMeu);
      setErroEmoji((e as Error).message);
    }
  }

  async function verMcp() {
    setMcpOcupado('lendo');
    try {
      setMcp(await api.listarMcp());
    } catch (e) {
      setMcp({ ok: false, erro: (e as Error).message });
    } finally {
      setMcpOcupado(null);
    }
  }

  /** Abre o navegador para você autorizar. Demora o quanto você demorar — e é
   *  por isso que o botão diz o que está esperando, em vez de só girar. */
  async function conectarMcp(nome: string) {
    setMcpOcupado('conectando');
    try {
      const r = await api.conectarMcp(nome);
      // A lista depois é a única fonte de verdade: sair com código zero não
      // prova que o conector ficou de pé.
      setMcp(r.lista ?? { ok: false, erro: r.erro ?? r.saida ?? 'sem resposta do agente' });
      if (r.lista?.doTeams?.conectado) void verificarConta();
    } catch (e) {
      setMcp({ ok: false, erro: (e as Error).message });
    } finally {
      setMcpOcupado(null);
    }
  }

  async function carregarAgentes() {
    setPasso1('carregando');
    setErro1(null);
    try {
      const d = await api.agentes();
      if (!d.ok || !d.agentes) throw new Error(d.erro ?? 'não consegui listar os agentes');
      setAgentes(d.agentes);
      setAgenteId(d.escolhido);
      const atual = d.agentes.find((a) => a.id === d.escolhido);
      liberarPasso2(atual);
    } catch (e) {
      setPasso1('erro');
      setDetalhe1((e as Error).message);
    }
  }

  /** Um agente que responde `--version` libera o passo 2. Isso não prova que o
   *  MCP do Teams está configurado nele — quem descobre isso é o próprio passo 2,
   *  e é lá que a falha aparece com o motivo certo. */
  function liberarPasso2(a?: AgenteDisponivel | null) {
    if (!a) {
      setPasso1('erro');
      setDetalhe1('nenhum agente escolhido');
      return;
    }
    if (a.instalado) {
      setPasso1('ok');
      setDetalhe1(`${a.nome}${a.versao ? ' · ' + a.versao : ''}`);
      setPasso2('espera');
      setDetalhe2('pronto para verificar');
    } else {
      setPasso1('erro');
      setDetalhe1(a.erro || `${a.nome} não respondeu`);
      setPasso2('espera');
      setDetalhe2('aguardando o passo 1');
    }
  }

  async function usarAgente() {
    setSalvandoAgente(true);
    setErro1(null);
    try {
      const d = await api.escolherAgente(agenteId, ajustes);
      setAgentes((lista) =>
        (lista ?? []).map((a) => (a.id === d.agente.id ? d.agente : a)),
      );
      setAjustes({});
      liberarPasso2(d.agente);
    } catch (e) {
      setErro1((e as Error).message);
    } finally {
      setSalvandoAgente(false);
    }
  }

  /** Um campo de ajuste. Vazio = fica o padrão do adaptador, para que limpar uma
   *  flag por engano não deixe o agente sem como rodar. */
  function campoDoAgente(
    rotulo: string,
    valor: string,
    aoMudar: (v: string) => void,
    dica?: string,
  ) {
    return (
      <label className="rotulo" key={rotulo}>
        {rotulo}
        <input type="text" value={valor} spellCheck={false} onChange={(e) => aoMudar(e.target.value)} />
        {dica && <span className="dica-campo">{dica}</span>}
      </label>
    );
  }

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
        {/* Só aparece quando existe mural para voltar PARA. Sem nenhum, a
            listagem manda direto para cá, e um botão de voltar que devolve a
            pessoa ao lugar que a expulsou é um beco. */}
        {temMurais && (
          <button
            className="icone"
            onClick={() => navegar('/')}
            title="Voltar para meus murais"
            aria-label="Voltar para meus murais"
          >
            <IconeVoltar />
          </button>
        )}
        <span className="ponto-marca" />
        <h1>Mural</h1>
      </div>
      <p className="sub">Cinco passos e o quadro está de pé.</p>

      {/* 1 */}
      <section className="passo" data-estado={passo1}>
        <div className="passo-topo">
          <span className="num">{passo1 === 'ok' ? <IconeFeito tamanho={13} /> : '1'}</span>
          <h2>Agente de IA</h2>
        </div>
        <p className={'detalhe ' + (passo1 === 'ok' ? 'bom' : passo1 === 'erro' ? 'ruim' : '')}>
          {detalhe1}
        </p>

        {agentes && (
          <div className="corpo">
            <p className="dica">
              Quem lê o Teams é um agente de IA já autenticado. Escolha o seu.
            </p>

            <div className="lista-agentes">
              {agentes.map((a) => (
                <button
                  key={a.id}
                  className="item-agente"
                  aria-selected={agenteId === a.id}
                  onClick={() => {
                    setAgenteId(a.id);
                    setAjustes({});
                    setMostrarAjustes(a.id === 'personalizado');
                  }}
                >
                  <span className="nome">
                    {a.nome}
                    {!a.verificado && !a.ajustado && (
                      <span className="badge warning" title="Escrito a partir da documentação, não testado aqui">
                        não verificado
                      </span>
                    )}
                    {a.id === agentes.find((x) => x.id === agenteId)?.id && a.ajustado && (
                      <span className="badge marca">ajustado</span>
                    )}
                  </span>
                  <span className="meta">
                    {a.instalado === null
                      ? 'não detectado'
                      : a.instalado
                        ? a.versao || 'instalado'
                        : a.id === 'personalizado'
                          ? 'preencha o binário'
                          : 'não encontrado no PATH'}
                  </span>
                </button>
              ))}
            </div>

            {agente && (
              <>
                <p className={'aviso ' + (agente.instalado ? 'info' : 'erro')}>
                  {agente.requisitos}
                </p>

                {/* O binário não respondeu, e isso não prova que ele não
                    funciona: wrapper, alias e PATH de shell fazem `--version`
                    falhar em CLI que roda. */}
                {passo1 === 'erro' && !passo1Forcado && (
                  <div className="saida-do-passo">
                    <button onClick={() => setPasso1Forcado(true)}>Usar assim mesmo</button>
                    <p className="dica">
                      Não conseguimos rodar <code>{ajustes.binario ?? agente.binario}</code> aqui.
                      Se você sabe que ele funciona — é um alias, um wrapper, ou está num PATH que
                      só o seu shell conhece — siga. Se estiver errado, a primeira leitura falha
                      dizendo o que aconteceu.
                    </p>
                  </div>
                )}
                {passo1Forcado && (
                  <p className="aviso atencao">
                    Seguindo sem detectar o agente. Se a leitura falhar, é aqui que se volta.
                  </p>
                )}

                <button className="alternar" onClick={() => setMostrarAjustes((v) => !v)}>
                  {mostrarAjustes ? 'esconder ajustes' : 'ajustes avançados'}
                </button>

                {mostrarAjustes && (
                  <div className="ajustes-agente">
                    <p className="dica">
                      <strong>Você provavelmente não precisa mexer aqui.</strong> Isto é para
                      quando o binário está noutro lugar, ou quando o seu MCP chama as tools do
                      Teams por outros nomes. Em branco, fica o padrão.
                    </p>

                    <div className="campos-agente">
                      {campoDoAgente('binário', ajustes.binario ?? agente.binario, (v) =>
                        setAjustes((a) => ({ ...a, binario: v })),
                      )}
                      {campoDoAgente(
                        'argumentos',
                        ajustes.argumentos ?? agente.argumentos,
                        (v) => setAjustes((a) => ({ ...a, argumentos: v })),
                      )}

                      <label className="rotulo">
                        prompt entra por
                        <select
                          value={ajustes.entrada ?? agente.entrada}
                          onChange={(e) =>
                            setAjustes((a) => ({ ...a, entrada: e.target.value as 'stdin' | 'arg' }))
                          }
                        >
                          <option value="stdin">stdin</option>
                          <option value="arg">argumento</option>
                        </select>
                      </label>

                      <label className="rotulo">
                        formato do stdout
                        <select
                          value={ajustes.eventos ?? agente.eventos}
                          onChange={(e) =>
                            setAjustes((a) => ({
                              ...a,
                              eventos: e.target.value as 'claude' | 'codex' | 'nenhum',
                            }))
                          }
                        >
                          <option value="claude">stream-json do Claude</option>
                          <option value="codex">JSONL do Codex</option>
                          <option value="nenhum">texto (sem progresso)</option>
                        </select>
                      </label>
                    </div>

                    <p className="dica">
                      As tools que leem o Teams. Elas vêm do MCP instalado no agente — o conector da
                      claude.ai usa estes nomes; outro MCP usa os dele.
                    </p>

                    <div className="campos-agente">
                      {(
                        [
                          ['tool da conta', 'conta'],
                          ['tool dos chats', 'chats'],
                          ['tool de leitura', 'leitura'],
                          ['tool de escrita', 'escrita'],
                          ['molde de URI · canal', 'uriCanal'],
                          ['molde de URI · chat', 'uriChat'],
                        ] as const
                      ).map(([rotulo, chave]) =>
                        campoDoAgente(
                          rotulo,
                          ajustes.ferramentas?.[chave] ?? agente.ferramentas[chave],
                          (v) =>
                            setAjustes((a) => ({
                              ...a,
                              ferramentas: { ...a.ferramentas, [chave]: v },
                            })),
                        ),
                      )}
                    </div>
                  </div>
                )}

                {erro1 && <p className="aviso erro">{erro1}</p>}

                <div className="acao-agente">
                  <button className="primario" onClick={usarAgente} disabled={salvandoAgente}>
                    {salvandoAgente ? 'Salvando…' : 'Usar este agente'}
                  </button>
                  <button onClick={() => void carregarAgentes()} disabled={salvandoAgente}>
                    Procurar de novo
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* 2 */}
      <section className="passo" data-estado={passo1Liberado ? passo2 : 'espera'}>
        <div className="passo-topo">
          <span className="num">{passo2 === 'ok' ? <IconeFeito tamanho={13} /> : '2'}</span>
          <h2>Conta Microsoft conectada</h2>
        </div>
        <p className={'detalhe ' + (passo2 === 'ok' ? 'bom' : passo2 === 'erro' ? 'ruim' : '')}>
          {contaCarregando ? `perguntando ao Claude Code… ${mmss(cronoConta)}` : detalhe2}
        </p>
        {passo1Liberado && passo2 !== 'ok' && (
          <div className="corpo">
            <button className="primario" onClick={verificarConta} disabled={contaCarregando}>
              {passo2 === 'erro' ? 'Tentar de novo' : 'Verificar conexão'}
            </button>
            <p className="dica">
              Nenhuma senha é pedida aqui — só perguntamos quem já está logado no agente.
            </p>

            {/* Descobrir a conta é diagnóstico, não requisito: o mural se cria
                sem isso. A falha quase sempre é o MCP do Teams não estar
                configurado no agente — e isso não se resolve nesta tela. */}
            {passo2 === 'erro' && agente?.sabeListarMcp && (
              <Conector
                mcp={mcp}
                ocupado={mcpOcupado}
                podeConectar={!!agente.sabeConectarMcp}
                aoVer={() => void verMcp()}
                aoConectar={(nome) => void conectarMcp(nome)}
              />
            )}

            {/* Agente que não sabe fazer isso pela linha de comando cai nos
                passos escritos: é o que sobra, e é melhor que nada. */}
            {passo2 === 'erro' && agente && !agente.sabeListarMcp && (
              <ComoConectar nome={agente.nome} />
            )}

            {passo2 === 'erro' && !contaPulada && (
              <div className="saida-do-passo">
                <button onClick={() => setContaPulada(true)}>Continuar sem verificar</button>
                <p className="dica">
                  Dá para criar o mural agora e resolver isso depois — quem falha então é o botão
                  Atualizar, com o erro do agente na tela.
                </p>
              </div>
            )}
            {contaPulada && (
              <p className="aviso atencao">
                Seguindo sem saber qual conta está logada. A leitura do Teams pode falhar até você
                configurar o MCP no agente.
              </p>
            )}
          </div>
        )}
      </section>

      {/* 3 */}
      <section className="passo" data-estado={podeEscolherConversa ? passo3 : 'espera'}>
        <div className="passo-topo">
          <span className="num">3</span>
          <h2>Escolher a conversa</h2>
        </div>
        <p className="detalhe">
          {podeEscolherConversa
            ? 'escolha o canal ou o chat que vira o quadro'
            : 'aguardando o passo 2'}
        </p>

        {podeEscolherConversa && (
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
      <section className="passo" data-estado="espera">
        <div className="passo-topo">
          <span className="num">4</span>
          <h2>As reações</h2>
        </div>
        <p className="detalhe">qual emoji significa o quê</p>

        <div className="corpo">
          <p className="dica">A reação no Teams é o que decide a coluna de cada card.</p>

          <EscolherEmoji
            id="emoji-fazendo"
            titulo="peguei esta"
            dono="time"
            explicacao="Enche a coluna In progress. Vale para qualquer pessoa que reagir."
            valor={emojiFazendo}
            sugestoes={['⚪', '⏱️', '👀', '🔨', '🚧']}
            rotuloDeDesligar="desligar a coluna"
            aoMudar={(e) => void salvarEmoji({ emojiFazendo: e })}
          />

          <EscolherEmoji
            id="emoji-meu"
            titulo="fui eu que fiz"
            dono="você"
            explicacao="Manda o card para Done by me. Escolha um emoji que só você usa."
            valor={emojiMeu}
            sugestoes={['🟢', '💚', '🙌', '🦄', '🎯']}
            rotuloDeDesligar="marcar à mão no card"
            aoMudar={(e) => void salvarEmoji({ emojiMeu: e })}
          />

          {checks.length > 0 && (
            <div className="check-fixo">
              <span className="emojis">{checks.slice(0, 3).join(' ')}</span>
              <p>
                <strong>Done</strong> não se configura — o check já quer dizer "feito" para o
                canal inteiro.
              </p>
            </div>
          )}

          {erroEmoji && <p className="aviso erro">{erroEmoji}</p>}

          <p className="dica">Dá para mudar depois, no cabeçalho das colunas.</p>
        </div>
      </section>

      {/* 5 */}
      <section className="passo" data-estado="espera">
        <div className="passo-topo">
          <span className="num">5</span>
          <h2>A sprint</h2>
        </div>
        <p className="detalhe">
          {escolha ? 'o ciclo que você fecha de vez em quando' : 'aguardando o passo 3'}
        </p>

        {escolha && (
          <div className="corpo">
            <p className="dica">
              Um período com começo e fim. Ao encerrar, o que está concluído sai do quadro e vai
              para o arquivo.
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

            <p className="dica">Dá para mudar depois. Encerrar continua sendo um gesto seu.</p>

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
