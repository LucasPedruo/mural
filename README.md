# Mural

Seu canal do Teams vira um kanban. O emoji é o status.

## Por que existe

Este é um projeto pessoal, feito para me ajudar nos trabalhos da empresa.

As demandas chegam por um canal do Teams e o time se organiza por reação:
alguém reage com um relógio para dizer "eu pego", com um check para dizer
"feito". Funciona — até o canal encher e ninguém mais conseguir ver o que está
solto. E na daily eu preciso lembrar o que fiz, coisa que o Teams não guarda em
lugar nenhum.

O Mural resolve os dois: lê o canal, mostra o que está em aberto e mantém uma
coluna com o que eu fiz, agrupada por dia, com a anotação de como resolvi.

## Em 30 segundos

Quatro colunas:

| Coluna | O que cai nela |
| --- | --- |
| **Ninguém pegou** | mensagem sem reação nenhuma |
| **Interagido** | mensagem com qualquer reação que não seja check |
| **Concluído** | mensagem com check (✅ ☑️ ✔️) |
| **Feito por mim** | o que *você* fez — agrupada por dia, com a anotação da daily |

Clicar em qualquer lugar do card abre a mensagem original no Teams. Clicar em
**Atualizar** relê a conversa.

Um card não é uma mensagem: é uma **demanda**. Quando alguém manda dois prints e
três linhas de texto em seguida, aquilo vira um card só — veja
[Rajadas](#rajadas-quando-a-demanda-chega-em-pedaços).

## Começando

Você precisa de:

- **Node.js 18+**
- **[Claude Code](https://claude.com/claude-code)** instalado e autenticado
- O **conector Microsoft 365** ativo no Claude Code (`/mcp` para conferir)

```bash
git clone https://github.com/<voce>/mural.git
cd mural
npm install
npm run build
node server.js
```

Abra <http://localhost:4317>. Na primeira vez você cai numa tela de configuração
que verifica o Claude Code, mostra com qual conta Microsoft você está logado,
pede a conversa que vira o quadro e a sprint — o ciclo que você fecha de vez em
quando, que existe mesmo que seu time não use a palavra.

No Windows, `start.cmd` faz tudo isso: instala, compila se preciso, sobe o
servidor e abre o navegador. Para trocar a porta:
`MURAL_PORT=5000 node server.js`.

Não existe login próprio. A autenticação com a Microsoft é a do Claude Code e do
conector — este servidor nunca vê nem guarda credencial nenhuma. Quando o token
do conector expira, o Mural para de atualizar até você reautorizar com `/mcp`.

### Escolhendo a conversa

**Chats e grupos** aparecem numa lista para você clicar.

**Canais de time** precisam de link: no Teams, abra o canal, clique nos "…" de
qualquer mensagem, "Copiar link", e cole. Isso não é preguiça — a API do Graph
não expõe rota para listar times ou canais a um conector. O link resolve porque
carrega o time, o canal e os nomes legíveis de ambos.

### Desenvolvimento

```bash
node server.js   # API na 4317
npm run dev      # interface na 5317, com /api indo para a 4317
```

## O dia a dia

**Atualizar** relê a conversa e redesenha o quadro. Leva 1 a 2 minutos e tem
custo — veja [Quanto custa atualizar](#quanto-custa-atualizar).

**Mover uma task** se faz no Teams: reaja na mensagem lá e atualize. A fonte da
verdade é sempre a conversa. O arraste entre colunas só funciona nos cards que o
Teams não acompanha mais (os "fora de alcance") e nas tasks que você mesmo criou.

**Nova task** abre um formulário — texto, tipo e coluna — para o que não passou
pelo canal: o que combinaram no corredor, o bug que você mesmo achou. Essas são
livres: arraste, edite, apague. Um selo **minha** no rodapé diz de onde veio.

**fiz**, no rodapé de qualquer card, joga ele para *Feito por mim*. Ou reaja no
Teams com seu emoji de assinatura (🟢 por padrão) e o card cai lá sozinho na
próxima atualização.

**Juntar e separar** (⧉ e ⑃ no rodapé) consertam o agrupamento quando ele erra:
⧉ marca cards para virarem um, ⑃ desmancha um card em suas mensagens.

**Encerrar sprint**, no cabeçalho, arquiva o que já terminou e zera as duas
colunas de trabalho concluído. **Painéis** mostra o que chegou em cada sprint e
tudo que você fez, dia a dia.

## Rajadas: quando a demanda chega em pedaços

Ninguém escreve uma task bem formada num canal do Teams. Chegam dois prints,
depois uma linha explicando, depois "e também isso" — cinco mensagens que são
uma demanda. Tratar cada mensagem como um card enchia o quadro de cartões
dizendo apenas "só print".

O Mural junta a **rajada**: mensagens do mesmo autor, consecutivas, com menos de
três minutos entre uma e a seguinte, que o modelo confirmou serem o mesmo
assunto. O card fica com o texto que dá nome à demanda — não necessariamente o
da primeira mensagem, porque a rajada costuma começar pelos prints — e mostra os
prints como faixas e as outras linhas como continuação. O rodapé diz quantas
mensagens ele representa.

<details>
<summary><b>Quem decide o agrupamento, e por que não é o modelo</b></summary>

O JS acha as rajadas **candidatas**: mesmo autor, consecutivas, dentro da janela
de três minutos. O modelo só pode **dividir** uma candidata, respondendo
`mesmaDemandaQueAnterior: false` — o padrão do prompt. Ele não consegue juntar
autores diferentes nem horários distantes, porque isso nem chega a ele como
candidata.

A assimetria é de propósito. Errar dividindo deixa um card solto no quadro, que
você junta com um clique. Errar juntando **esconde uma tarefa dentro de outra**,
e ninguém percebe. Então na dúvida o prompt divide.

O **id do card é o da primeira mensagem da rajada**. Isso tem duas
consequências boas: o card existente continua sendo o mesmo quando o autor
manda a quarta mensagem meia hora depois, e o `tasks.json` de antes desta
mudança continua valendo sem migração nenhuma — quem não tem `mensagens` é lido
como uma rajada de um item.

**Um card nunca é absorvido por outro.** Ele só cresce, ganhando mensagens que
apareceram depois. Se duas leituras separadas transformaram a mesma rajada em
dois cards, fundir os dois é decisão sua, no ⧉ — e o que você decide ali nenhuma
atualização desfaz, do mesmo jeito que o arraste à mão.

A **reação pode estar em qualquer mensagem** da rajada: as pessoas reagem na que
estão vendo, não na que o Mural elegeu como principal. Por isso o status do card
sai da união das reações do grupo — um check em qualquer uma conclui o card.
</details>

## Sprint

Uma sprint aqui é só um **ciclo com começo e fim**, e o seu time não precisa usar
a palavra. Ela existe para responder a uma pergunta que o quadro sozinho não
responde: *concluído desde quando?* Sem ciclo, a coluna Concluído acumula meses
e deixa de dizer alguma coisa.

Você define a sprint no onboarding — nome, data de início e duração — e pode
corrigir tudo depois, na pílula do cabeçalho do quadro.

**Encerrar sprint** faz três coisas: tira do quadro os cards de *Concluído* e de
*Feito por mim*, guarda todos no arquivo daquela sprint, e abre a sprint seguinte
começando hoje ("Sprint 7" vira "Sprint 8" sozinha).

Nada é apagado. Os cards arquivados continuam em `sprints.json` com as anotações
da daily inteiras, e é de lá que os dois painéis leem. O que muda é que o merge
passa a **ignorar aquelas mensagens para sempre** — sem isso, a mensagem que
ainda está na janela das ~20 voltaria como task nova na leitura seguinte, e a
coluna que você acabou de zerar se encheria de novo.

## Painéis

**Por sprint** conta quantas demandas chegaram em cada ciclo, quantas eram bug,
quantas fecharam e quantas ficaram. A conta é pela data da mensagem no Teams, não
pela data do arquivamento: encerrar uma sprint não muda o que ela recebeu. Ao lado
do total aparece quantas *mensagens* aqueles cards somam — a distância entre os
dois números é o tamanho do ruído que o agrupamento de rajadas absorveu.

**Minha daily** é tudo que você marcou como seu, agrupado pelo dia da marcação,
com a anotação de como resolveu — incluindo o que já saiu do quadro em sprints
encerradas. O botão **copiar** de cada dia devolve a lista em texto, para colar
no chat de quem faltou na reunião.

## Como funciona

```
você clica em Atualizar
   └─> o servidor local roda o Claude Code em modo headless
        └─> que lê as mensagens do Teams pelo conector Microsoft 365
        └─> e grava um snapshot cru em data/snapshot.json
   └─> o servidor mescla o snapshot com o histórico acumulado
   └─> o quadro se redesenha
```

Duas decisões que valem explicar:

**O LLM nunca toca no histórico.** Ele só lê as mensagens e resume cada uma em
uma linha. Quem compara com o que já existia, decide o que é novo e o que mudou
de status é código JS determinístico. Se o modelo cuidasse do acumulado, um dia
ele inventaria ou perderia uma task — e um quadro em que você não confia é pior
que nenhum quadro.

**O histórico acumula.** O Teams devolve no máximo as ~20 mensagens mais recentes
por leitura. O Mural guarda tudo que já passou, então uma task de semanas atrás
continua no quadro mesmo tendo saído da janela do Teams.

<details>
<summary><b>Por que qualquer emoji serve como status</b></summary>

Não há lista de emojis para manter. Times reais não usam um emoji fixo para
"peguei" — cada pessoa reage com o que quiser, e um emoji inédito amanhã já cai
no lugar certo sozinho. O emoji usado aparece como badge no card, porque sem
convenção fixa é a única forma de saber o que aconteceu ali.

Numa conversa de duas pessoas a primeira coluna se chama **Sem reação** —
"ninguém pegou" pressupõe um time dividindo trabalho.
</details>

<details>
<summary><b>Tasks fora de alcance (as de borda âmbar)</b></summary>

A API devolve só as ~20 mensagens mais recentes. Quando uma task sai dessa
janela, o Teams para de contar qualquer coisa sobre ela: se alguém reagir com
check naquela mensagem antiga, o Mural nunca fica sabendo, e o card ficaria
"em aberto" para sempre.

Esses cards têm aparência própria — borda âmbar tracejada, uma hachura de fundo,
alça de arraste no canto e o selo *sem sinal do Teams* — porque, junto com as
tasks que você mesmo criou, são os **únicos que você pode arrastar** entre as
colunas do Teams. Tracejado sozinho não segurava esse recado: o card só se
explicava quando a pessoa tentava arrastar os outros e nada acontecia. Nos demais o
arraste nem começa: a próxima atualização desfaria a mudança, e um quadro que
mente por dois minutos é pior que um quadro que não deixa você fazer o gesto. O
servidor recusa esse caso mesmo que a interface deixasse passar.

Se uma task movida à mão voltar a aparecer na janela, a reação real volta a
mandar e o resumo da atualização avisa que o status foi corrigido.
</details>

<details>
<summary><b>Tasks suas: por que nenhuma atualização as alcança</b></summary>

A task que você cria tem id próprio, então nenhuma atualização a alcança: o
merge só mexe em ids que vieram do snapshot do Teams. Por isso ela é livre —
arraste entre colunas, edite o texto, apague. Clicar no texto abre a edição em
vez do Teams, que não tem mensagem para abrir.

A recíproca também vale: task que veio do Teams não pode ser editada nem apagada
aqui. Mudar o texto criaria um quadro que discorda da conversa, e a próxima
leitura desfaria.
</details>

<details>
<summary><b>Feito por mim: as regras da coluna da daily</b></summary>

A coluna é **agrupada pelo dia** — Hoje, Ontem, e a data nos anteriores. A
anotação de como você resolveu fica visível no próprio card, não escondida atrás
de um clique: durante a reunião ninguém abre um por um.

Um card chega ali de dois jeitos.

**Pela sua reação.** Você escolhe um emoji de assinatura — 🟢 por padrão, no
cabeçalho da coluna — e reage com ele na mensagem do Teams. Na próxima
atualização o card cai em Feito por mim sozinho, e a anotação você escreve
quando quiser.

Isso é uma **convenção sua, não um dado da API**. O Graph devolve a reação com
`users: [{ displayName: null, id: null, email: null }]` — dá para saber quantos
reagiram, nunca quem. Então "foi você quem colocou o check" é uma pergunta que
não tem resposta, e o que resta é um emoji que só você usa naquele canal. O
check não serve: ele já significa "concluído" para o time inteiro, e o Mural
recusa escolhê-lo. Emoji em branco desliga a detecção.

O dia que agrupa o card é o da **leitura que viu a reação**, não o da reação —
o Teams não diz quando ela foi feita. Reagir na sexta e atualizar na segunda
joga o card para segunda.

Tirar a reação no Teams tira o card da coluna na atualização seguinte. A exceção
é quando você já escreveu a anotação: aí a marca fica, porque texto que você
escreveu não pode sumir por causa de um clique numa reação.

**Pelo botão.** Todo card tem um **fiz** no rodapé, para o que você esqueceu de
reagir e para as tasks suas, que nunca tiveram mensagem no Teams.

Marcar como seu **não muda o status no Teams**. É uma marca pessoal, guardada
num campo separado justamente para o sync não a apagar — o status real continua
lá embaixo e aparece como badge no card ("no Teams: interagido"). O card sai da
coluna do Teams porque estar em duas ao mesmo tempo confundiria a contagem, mas
o dado não é reescrito. Por isso essa marca vale para **qualquer** card,
inclusive os que o Teams ainda acompanha: não há o que a próxima leitura possa
desfazer.

O **↩** tira a marca e devolve o card para a coluna que a reação manda — mas só
aparece nos cards que você marcou à mão. Se foi a sua reação que trouxe o card,
desmarcar aqui duraria até o próximo sync repor; a saída é tirar a reação lá, e
o card diz isso no selo **pela reação**. Fora de alcance a mão volta a mandar,
como no resto do quadro.

Editar a anotação depois não muda o dia do agrupamento — corrigir uma vírgula
não pode jogar o que você fez ontem para o grupo de hoje.
</details>

## Quanto custa atualizar

Cada atualização roda o Claude Code de verdade, e isso é cobrado da sua conta.
O custo não é trivial: só o system prompt da ferramenta consome dezenas de
milhares de tokens de cache antes de ler a primeira mensagem.

Por isso o Mural **pergunta antes de gastar**. O diálogo mostra o custo estimado
em dólares, os tokens e a duração, além do total que sua conta já consumiu. Quem
não quer ser perguntado marca "não perguntar de novo" — a preferência é por conta
Microsoft, em `data/preferencias.json`.

<details>
<summary><b>Como a estimativa é calculada</b></summary>

A estimativa é a média das **cinco últimas atualizações do mesmo mural**; sem
histórico próprio, cai para a média dos outros murais; sem nenhum histórico, o
diálogo diz que não há como estimar em vez de inventar um número. Depois de cada
atualização o custo real aparece no resumo — é o que torna a estimativa seguinte
confiável.

**Toda** ida ao Claude Code entra na conta, não só a atualização do quadro: o
onboarding também roda o modelo para verificar sua conta Microsoft e para listar
os chats — essa última leva 2 a 3 minutos de API e custa de acordo. Cada execução
fica registrada com a operação que a motivou (`sync`, `conta`, `chats`), e o
total no topo do quadro soma as três; passar o mouse mostra a quebra. Uma leitura
que falhou no meio também é registrada: os tokens foram cobrados do mesmo jeito,
e um acumulado que só conta os sucessos mente para menos.

Só as execuções de `sync` entram na estimativa da próxima atualização. Misturar
as leituras do onboarding na média faria o diálogo prometer um preço que nunca
acontece.

Os números vêm do evento `result` do Claude Code (`total_cost_usd` e `usage`),
ou seja, é o custo cobrado, não uma conta nossa. O acumulado por conta fica em
`data/consumo.json`, limitado às últimas 200 execuções.
</details>

## Vários murais

Cada conversa vira um mural com histórico próprio, e a home lista todos com as
contagens de cada coluna. Mapear a mesma conversa duas vezes reabre o mural
existente em vez de duplicar — o id vem da própria conversa.

O **✕** de cada linha remove aquele mural e o histórico dele. **Refazer
configuração**, no topo, limpa só o cache do onboarding — a conta verificada, a
lista de chats e a preferência de confirmação — e volta para a tela de
configuração. Murais, histórico de tasks e registro de gastos ficam intactos:
um botão de configuração não pode apagar trabalho acumulado por tabela.

## Limites conhecidos

Vale saber antes de adotar:

- **Não dá para saber quem reagiu.** O Graph devolve os usuários da reação com
  displayName, id e email nulos — dá para contar quantos foram, não quem. O
  quadro diz "alguém interagiu", nunca "fulano pegou", e "feito por mim" precisa
  de um emoji de assinatura em vez da identidade real.
- **Não dá para ler respostas de thread.** Um "pego essa" escrito como resposta
  é invisível aqui — só a reação na mensagem principal conta.
- **20 mensagens por leitura.** É o teto da API. O histórico acumulado no disco
  compensa isso ao longo do tempo, mas na primeira execução você só verá as 20
  mais recentes — e o que sai dessa janela vira "fora de alcance".
- **Um sync leva 1 a 2 minutos.** São ~21 chamadas ao Graph mais o resumo de
  cada mensagem. A barra de progresso mostra a etapa real.
- **Listar chats no onboarding leva 2 a 3 minutos**, porque o Teams entrega os
  chats em páginas de 25 e cada página é uma ida à API. Só acontece uma vez.
- **A etiqueta `bug` é um palpite do modelo**, inferido do texto da mensagem —
  não é um campo do Teams. Autor, data, link e reações, esses são literais.
- **O agrupamento de rajada também é palpite**, e vai errar de vez em quando. Ele
  erra para o lado seguro (divide na dúvida), e ⧉ e ⑃ existem justamente porque
  card errado que não dá para consertar é pior que card errado.
- **Encerrar uma sprint é definitivo para aquelas mensagens.** O card sai do
  quadro e o merge passa a ignorá-lo: se alguém reagir depois naquela mensagem,
  o Mural não fica sabendo. Vale para o que estava em *Feito por mim* mesmo que o
  Teams ainda mostrasse a demanda como aberta — a marca é sua, e encerrar a
  sprint respeita ela. Para desfazer, só editando `sprints.json` e
  `tasks.json` na mão.

## Stack

Interface em **React + TypeScript**, compilada pelo Vite, com
[@hello-pangea/dnd](https://github.com/hello-pangea/dnd) para o arraste entre
colunas. O servidor é **Node puro** — sem framework — e faz três coisas: fala
com o Claude Code, guarda o histórico e serve o build.

## Onde ficam seus dados

Tudo em `data/`, que está no `.gitignore`:

| arquivo | o que é |
| --- | --- |
| `murais.json` | índice dos murais e suas conversas |
| `murais/<id>/tasks.json` | o histórico daquele mural, com as tasks suas e as anotações da daily — o insubstituível |
| `murais/<id>/tasks.json.bak` | cópia da atualização anterior |
| `murais/<id>/sprints.json` | as sprints e os cards arquivados em cada uma — os painéis vivem daqui |
| `murais/<id>/snapshot.json` | última leitura crua; descartável |
| `conta.json`, `chats.json` | cache do onboarding |
| `consumo.json` | tokens e custo por conta e por operação, usado para estimar |
| `preferencias.json` | se pede confirmação antes de atualizar e o seu emoji de assinatura |

Nada sai da sua máquina além das chamadas que o Claude Code já faz ao Graph.
O servidor escuta apenas em `127.0.0.1`.

## Créditos

Fonte [DM Sans](https://fonts.google.com/specimen/DM+Sans) sob SIL Open Font
License 1.1, embutida em `assets/`.

MIT.
