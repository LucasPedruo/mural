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

As colunas:

| Coluna | O que cai nela |
| --- | --- |
| **Backlog** | mensagem sem reação nenhuma |
| **Em andamento** | mensagem com ⚪ — a reação de "peguei esta" (configurável) |
| **Em atendimento** | mensagem com qualquer outra reação que não seja check |
| **Concluído** | mensagem com check (✅ ☑️ ✔️) que não é sua — ou creditada por você a alguém |
| **Concluído por mim** | o que *você* fez — agrupada por dia, com a anotação da daily |
| **Fora do escopo** | o que você decidiu que não é pra você — nasce colapsada |

O que **você** fez sai de *Concluído* para *Concluído por mim*: o que resta na
primeira é o trabalho do resto do time. Nenhum dos seis nomes pressupõe time —
um quadro de duas pessoas lê igual a um de dez.

Clicar em qualquer lugar do card abre a mensagem original no Teams. Clicar em
**Atualizar** relê a conversa.

**A ordem das colunas é sua**: arraste uma coluna pelo cabeçalho e ela troca de
lugar. Fica guardada por mural, no navegador, e é validada na leitura — uma versão
nova do Mural pode ter coluna que a ordem salva não conhece, e uma lista velha no
navegador não pode fazer coluna desaparecer do quadro.

As colunas ficam numa **fila única que rola no horizontal**, sem quebrar linha: é
o que o arraste entende como lista, e é o que faz um quadro parecer um quadro em
vez de duas fileiras de colunas. Quem tem tela pequena colapsa o que não está
usando — foi para isso que o colapsar existe.

**Você pode criar colunas suas**, no "+ nova coluna" no fim da fila. Elas são de
outra natureza que as seis de cima: as seis são **regras** — `statusDe()` calcula
a coluna a partir da reação no Teams, e nenhum card é *posto* nelas. Por isso não
se criam nem se apagam: apagar *Backlog* seria apagar a pergunta "o que ninguém
pegou".

Uma coluna sua é o contrário: **não tem regra**. É um lugar, e o único jeito de um
card entrar é você arrastar. Serve para o passo do *seu* processo que o canal não
conhece — "aguardando cliente", "em homologação".

Ela é o único destino que aceita **qualquer** card, inclusive o que o Teams ainda
acompanha — nas seis colunas o arraste é recusado, porque a reação de lá manda e a
próxima leitura desfaria o movimento. Prender um card ali é dizer "este saiu do
fluxo do canal por enquanto", e o card passa a mostrar o selo **fora do fluxo**. O
`status` continua sendo atualizado por baixo a cada leitura, intocado: é o que faz
*Devolver ao Teams*, no menu ⋯, recolocá-lo na hora na coluna que a reação manda,
sem precisar de nova sincronização.

**Excluir uma coluna sua apaga os cards que estão nela**, de vez — eles saem do
histórico e as mensagens entram na lista de arquivados, então nenhuma atualização
as traz de volta. O diálogo avisa com o número na frente. É o mesmo mecanismo do
*Apagar de vez* de um card, e o segundo gesto irreversível do Mural.

Encerrar a sprint **não** leva card preso numa coluna sua: ele está num passo do
seu processo, não terminado — nem que o time já tenha dado o check no Teams.

**Qualquer coluna colapsa** — o botão de recolher no cabeçalho dela vira uma faixa
fina com o rótulo de pé e a contagem. **Cada card também**, sem exceção: recolhido,
ele mostra uma linha do texto e o rodapé, sem os prints, sem a continuação da
rajada e sem a anotação da daily. Quem trabalha por sprint não olha *Em atendimento* toda hora, e o
espaço vai para as colunas que são trabalho agora. A coluna fechada **continua
recebendo cards arrastados**: é o gesto de guardar sem abrir. As duas escolhas são
por mural e ficam no navegador.

**O sino, ao lado de Atualizar**, guarda o que o quadro tem a contar: o resumo de
cada leitura — o que mudou, quanto custou — e o aviso de quantos cards saíram do
alcance do Teams. Antes essas duas mensagens moravam na própria tela: o resumo
espremido na linha de "última leitura", o aviso numa faixa que empurrava as
colunas para baixo da dobra. As duas sumiam sozinhas, e o que some sozinho não dá
para reler depois de *"espera, quanto custou mesmo?"*.

A distinção que o sino faz: o resumo de uma leitura é **evento** — aconteceu num
instante e vira histórico, com as trinta últimas guardadas. Já "25 cards estão
fora de alcance" é **condição**: vale enquanto for verdade, então fica fixada no
topo do painel em vez de entrar na lista. Empilhar a mesma frase a cada leitura
transformaria o sino num carimbo de repetição.

Uma leitura que **falha** também vira notificação, e só isso: o toast aparece e
fica, e o contador acende ao lado do botão que você acabou de clicar. Os demais
erros continuam em faixa no topo do quadro — "não dá para mover este card" existe
para explicar o gesto que acabou de voltar atrás, e explicação atrasada por um
clique no sino não explica nada.

Cada aviso novo também aparece como **toast** no canto de baixo. O sino guarda, o
toast conta na hora: guardar sem contar faria você descobrir o resultado de uma
leitura de dois minutos só se lembrasse de abrir o painel. Os comuns somem em 8
segundos; a falha fica até você fechar. Fechar um toast não apaga nada — o item
continua no sino, e é por isso que ele pode sumir sozinho sem custo nenhum.

**Cada item aceita uma nota sua.** O texto do aviso conta o que aconteceu; a nota
conta o que aquilo *significou* — "esse custo foi a releitura do canal inteiro",
"falhou porque o token venceu". Sem ela o histórico responde o quê e nunca o
porquê. Nota é trabalho seu, então **Limpar** leva só as que você não anotou, e o
botão diz quantas são; as anotadas saem uma a uma, pelo ícone do item.

O histórico é do navegador, por mural. É relato da sua sessão, não dado do
quadro — o servidor não teria o que fazer com ele.

**Nenhuma pergunta do Mural usa a caixa do navegador.** As cinco confirmações —
apagar um card, excluir uma coluna, remover um mural, encerrar a sprint, refazer
a configuração — são diálogos da própria interface. O `window.confirm` trava a
aba enquanto está aberto, ignora o tema, só aceita texto corrido (nada de
negrito no número que é a informação principal da frase) e, a partir do
segundo, o navegador oferece "impedir que esta página crie diálogos" — um botão
que desliga em silêncio a confirmação de um gesto irreversível.

Cancelar é sempre o padrão: Escape fecha, o clique fora fecha, e o foco começa
em *Cancelar*. O botão que faz a coisa diz o que ela é ("Excluir e apagar 3"),
nunca "OK", e fica vermelho quando não tem volta.

**Tudo o que se faz num card mora no menu ⋯** dele. Eram sete botões disputando o
canto do rodapé, todos escondidos atrás de hover e sem nome; agora cada ação tem
ícone e rótulo, e o gatilho está sempre visível. Custa um clique a mais e para de
exigir que você decore o que cada símbolo faz.

**Os filtros** ficam no **funil**, ao lado do sino: por **quem pediu** e por
**etiqueta**, com a contagem em cada opção. Antes eram dois selects numa barra
acima das colunas, e a barra custava uma faixa de altura o tempo todo por uma
escolha que se faz de vez em quando. O que não some no repouso é o *fato* de
haver filtro ligado: o funil fica aceso e o `title` diz por quê — filtro
escondido que corta o quadro em silêncio faria a contagem das colunas parecer
errada.

Eles cortam o quadro inteiro — enquanto um filtro está ligado, as contagens das
colunas são as dele, não as do quadro todo.

O Mural **só lê** o Teams: quem move as tasks é a reação lá. O arraste entre
colunas existe só para os cards que o Teams não acompanha mais.

**O título do card é o texto da mensagem, verbatim** — o Mural não resume mais o
que a pessoa escreveu. Um card que diz outra coisa faz o time discutir uma demanda
que ninguém pediu. Texto de gente não tem limite de tamanho, então o card corta em
seis linhas e o clique abre a mensagem inteira no Teams.

Um card não é uma mensagem: é uma **demanda**. Quando alguém manda dois prints e
três linhas de texto em seguida, aquilo vira um card só — veja
[Rajadas](#rajadas-quando-a-demanda-chega-em-pedaços).

## Começando

Você precisa de:

- **Node.js 18+**
- Um **agente de IA** de linha de comando, instalado e autenticado — Claude Code,
  Codex CLI, Gemini CLI ou outro que você configure
- Nesse agente, **acesso ao Microsoft Graph por MCP**. No Claude Code isso é o
  conector Microsoft 365 (`/mcp` para conferir); nos outros, um MCP server de
  Graph que você configura no arquivo de config deles

```bash
git clone https://github.com/<voce>/mural.git
cd mural
npm install
npm run build
node server.js
```

Abra <http://localhost:4317>. Na primeira vez você cai numa tela de configuração
com cinco passos: qual agente de IA lê o Teams, com qual conta Microsoft você está
logado, a conversa que vira o quadro, **as reações** — qual emoji significa o quê
no seu canal — e a sprint, o ciclo que você fecha de vez em quando, que existe
mesmo que seu time não use a palavra.

No Windows, `start.cmd` faz tudo isso: instala, compila se preciso, sobe o
servidor e abre o navegador. Para trocar a porta:
`MURAL_PORT=5000 node server.js`.

Não existe login próprio. A autenticação com a Microsoft é a do agente e do MCP
dele — **este servidor nunca vê nem guarda credencial nenhuma**. Quando o token
expira, o Mural para de atualizar até você reautorizar no agente (no Claude Code,
`/mcp`).

## Qual agente lê o Teams

O Mural não fala com o Teams. Ele monta um prompt, entrega a um **agente de IA já
autenticado** e espera que o agente grave um snapshot em disco. Isso é escolha
sua, e é o **primeiro passo** da configuração — antes ali só havia um veredito
("Claude Code instalado"), o que não é escolha nenhuma.

| Agente | Estado |
| --- | --- |
| **Claude Code** | verificado, é o caminho testado |
| **Codex CLI** | flags conferidas contra o `codex exec --help` desta máquina |
| **Gemini CLI** | escrito a partir da documentação, sem stream de eventos |
| **Outro agente** | você preenche binário, argumentos e nomes de tool |

A tela marca **não verificado** o que não foi testado aqui, em vez de fingir que
os quatro são iguais.

<details>
<summary><b>O que exatamente é trocável, e o que não é</b></summary>

Cinco coisas amarravam o Mural ao Claude Code. Quatro viraram configuração, em
`agentes.js`:

- **binário** e **molde de argumentos**, com `{{FERRAMENTAS}}` e `{{PROMPT}}`;
- **por onde o prompt entra**: stdin ou argumento;
- **como ler o stdout**: `stream-json` do Claude, JSONL do Codex, ou nada — e
  "nada" custa a barra de progresso detalhada, não a leitura;
- **os nomes das tools** do Teams e o **molde das URIs** das mensagens.

A quinta não é trocável, e vale ser dito com clareza: **quem lê o Teams é o MCP,
não o CLI**. As tools `mcp__claude_ai_Microsoft_365__*` e os endereços `teams:///`
são vocabulário do conector hospedado da claude.ai. Outro agente precisa do
próprio MCP de Microsoft Graph, com os nomes e os endereços que *aquele* MCP usa —
e é por isso que esses campos são editáveis na tela em vez de estarem cravados no
código. Escolher Codex sem um MCP de Graph configurado nele faz o passo 2 falhar,
e é lá que a falha aparece com o motivo certo.

**Custo só aparece onde existe dado.** O preço em dólar sai do evento `result` do
Claude Code. Em agente que não informa gasto, o total e o diálogo de confirmação
somem da tela — o registro continua guardando tokens e duração, que existem
sempre — e o cabeçalho passa a dizer apenas quem está lendo. Mostrar "US$ 0,00"
seria mentir para menos.
</details>

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
Teams não acompanha mais — os "fora de alcance".

Nem para eles vale arrastar até *Em atendimento*: não existe emoji que signifique
"interagido", é o que sobra quando alguém reage com outra coisa.

**Fiz esta**, no menu ⋯ de qualquer card, joga ele para *Concluído por mim*. Ou reaja
no Teams com seu emoji de assinatura (🟢 por padrão) e o card cai lá sozinho na
próxima atualização.

**Juntar e separar** (⧉ e ⑃ no rodapé) consertam o agrupamento quando ele erra:
⧉ marca cards para virarem um, ⑃ desmancha um card em suas mensagens.

**Feito por outra pessoa**, no mesmo menu ⋯, é o espelho do *Fiz esta*: você
escreve quem resolveu e o card vai para *Concluído* com o nome no
rodapé. Existe porque o Graph conta que **alguém** reagiu com o check, nunca
quem — `reactions[].users` vem vazio. Sem essa anotação, o quadro sabe que a
task acabou e não sabe por obra de quem, que é justamente a pergunta da
retrospectiva. Como o *Fiz esta*, não escreve nada no Teams: mora em campo
próprio, e nenhuma leitura o apaga.

O ciclo e as leituras do histórico não moram aqui: **definir e encerrar a
sprint**, o **Dashboard** e os **Painéis** ficam na listagem de murais. Nenhum
dos três é coisa que se faz no meio de mexer nos cards, e no cabeçalho do quadro
eles só disputavam espaço com *Atualizar*. No quadro a sprint continua visível,
como selo, para você saber até quando vale o que está na tela.

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
corrigir tudo depois, na linha de cada mural na **listagem**.

**Encerrar sprint**, também na listagem, faz três coisas: tira do quadro os cards de *Concluído* e de
*Concluído por mim*, guarda todos no arquivo daquela sprint, e abre a sprint seguinte
começando hoje ("Sprint 7" vira "Sprint 8" sozinha).

Nada é apagado. Os cards arquivados continuam em `sprints.json` com as anotações
da daily inteiras, e é de lá que o dashboard e os painéis leem. O que muda é que o merge
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

## Dashboard

Os painéis leem a sprint **item a item**, para falar em voz alta na daily. O
dashboard responde outra pergunta: *como está este mural* — está melhorando ou
piorando, e quem carrega o quê. Abre pela listagem, ao lado de *Painéis*.

Seis leituras, em gráficos desenhados em SVG à mão — sem biblioteca, porque
trazer 200 kB para desenhar três formas faria o maior pacote do projeto existir
por causa da tela que se abre menos:

- **Onde o mural está** — a proporção entre as colunas, contando o arquivo das
  sprints encerradas.
- **Ritmo (30 dias)** — quanto chega contra quanto sai. É o que o quadro não
  mostra: lá dá para ver o acúmulo, não se ele está crescendo. Os dias vazios
  aparecem, de propósito: um gráfico que pula o fim de semana faz o time parecer
  mais constante do que é.
- **Por sprint** — chegou contra concluiu, ciclo a ciclo. A distância entre as
  duas barras é a pergunta.
- **Quem resolveu** — só quem foi creditado à mão, por *Fiz esta* ou *Feito por
  outra pessoa*. O que sobra aparece como **concluídas sem dono conhecido**, e
  esse número fica à vista: escondê-lo faria o gráfico parecer mais completo do
  que é.
- **Quem pede** e **por etiqueta** — de onde vem a demanda, e quanto de cada
  assunto já fechou.

Em cima, seis números que o quadro não dá de relance — entre eles a **mediana**
de dias entre o pedido e a conclusão (mediana, não média: uma task esquecida há
seis meses puxaria a média para um número que não descreve nenhuma semana real)
e há quantos dias está parada a mais velha em aberto.

## Ignorar, apagar e etiquetar

Três marcas suas, e nenhuma delas é status do Teams. Como o *feito por mim*, elas
moram em campos próprios justamente para nenhuma leitura as apagar.

**Ignorar** ("Não é pra mim", no menu ⋯ do card) é para o que não é pra você: chegou no canal, alguém vai
cuidar, e não precisa ocupar espaço no seu quadro. O card sai das colunas de
trabalho e vai para *Fora do escopo* — que nasce **colapsada**, porque uma coluna de
descartes não pode roubar largura das que são trabalho. Ao ignorar o primeiro card
ela abre uma vez, para você ver onde ele foi. Nada é escrito no Teams: ignorar
em público seria outra coisa, e não é essa.

**Apagar de vez** existe dentro de *Fora do escopo*, e é o **único gesto irreversível
do Mural**: o card sai do histórico e a mensagem entra na lista de arquivados,
para nenhuma atualização trazê-la de volta — mesmo que ela continue no Teams. É a
mesma máquina que o encerramento de sprint usa.

**Etiquetas** (no menu ⋯ do card) são suas: o Teams não tem esse campo. Até seis por task,
normalizadas na entrada — "Financeiro", "financeiro" e "financeiro " são a mesma
etiqueta, senão o filtro se quebraria sozinho em três. A barra acima das colunas
lista as que existem com a contagem de cada uma; clicar filtra o quadro inteiro, e
o painel soma por etiqueta atravessando as sprints.

Ao encerrar a sprint, as ignoradas são arquivadas junto com o que terminou: elas
já foram decididas, e arrastar a mesma lista de descartes de sprint em sprint não
serve a nada.

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

Há **duas exceções**, e as duas são emojis que o time combina de propósito:

- o **check** (✅ ☑️ ✔️), que significa concluído em qualquer canal;
- o **⚪ de "peguei esta"**, que enche a coluna *Em andamento* — configurável no
  cabeçalho dela, e vale para **qualquer pessoa** que reagir, não só para você.

Esses dois não aparecem como badge: a coluna já diz o que eles significam.
Quando as duas reações estão na mesma mensagem, o check ganha — quem terminou
terminou, e não faz sentido obrigar alguém a tirar a bolinha para o quadro ficar
certo.

O ⚪ de *Em andamento* é diferente do 🟢 de *Concluído por mim*: aquele é uma convenção do
time, este é sua. O Mural recusa configurar os dois com o mesmo emoji, senão um
card cairia em duas colunas e a contagem passaria a mentir.

As duas se escolhem **no passo 4 do onboarding**, com sugestões e a explicação do
que cada uma faz, e depois no mesmo diálogo — aberto por qualquer um dos dois
cabeçalhos de coluna. Ficam lado a lado de propósito: escolher uma sem ver a
outra é o que fazia a regra de "não podem ser iguais" chegar como erro em vez de
contexto. Vale qualquer coisa que o Teams aceite como reação, inclusive as
personalizadas do seu tenant.

O check não entra nessa escolha, e o diálogo diz por quê: ele já significa
"concluído" para o canal inteiro, sem ninguém combinar nada.
</details>

<details>
<summary><b>Tasks fora de alcance (as de borda tracejada)</b></summary>

A API devolve só as ~20 mensagens mais recentes. Quando uma task sai dessa
janela, o Teams para de contar qualquer coisa sobre ela: se alguém reagir com
check naquela mensagem antiga, o Mural nunca fica sabendo, e o card ficaria
"em aberto" para sempre.

Esses cards têm aparência própria e são os **únicos que você pode arrastar**
entre as colunas do Teams. A distinção é de **relevo, não de cor**: eles perdem a
superfície e a sombra, então afundam na coluna em vez de flutuar sobre ela — que
é exatamente o que são, cards que ninguém alimenta mais. Somam a borda
tracejada, a alça de arraste no canto e o selo *sem sinal do Teams*, e voltam à
superfície no hover, onde a mão manda.

O contorno é **âmbar**, e é a mesma cor do aviso no sino e do selo *sem sinal do
Teams* — os três falam da mesma coisa, e reconhecê-los juntos é o que faz parar
de reaprender o que cada um significa. Um **fundo** colorido continua fora de
questão: era ele que competia com a faixa lateral, onde cor significa status. O
contorno não compete, porque fala de outra coisa — não do estado da demanda, mas
da ausência de fonte.

O quadro avisa quantas são no **sino** do cabeçalho, e o aviso **dispensa**. O
que fica guardado não é "dispensei", é **quantas havia quando você dispensou**: as
mesmas 23 não voltam a incomodar, e a 24ª traz o aviso de volta — que é a única
hora em que ele tem algo novo a dizer. Nos demais o
arraste nem começa: a próxima atualização desfaria a mudança, e um quadro que
mente por dois minutos é pior que um quadro que não deixa você fazer o gesto. O
servidor recusa esse caso mesmo que a interface deixasse passar.

Se uma task movida à mão voltar a aparecer na janela, a reação real volta a
mandar e o resumo da atualização avisa que o status foi corrigido.
</details>

<details>
<summary><b>Por que não existe "nova task"</b></summary>

Existiu: dava para escrever uma task aqui dentro, com id próprio, que nenhuma
atualização alcançava. Foi removida.

O Mural é um espelho da conversa, e task que só existe aqui não é espelho de
nada: ela não tem mensagem para abrir, não tem reação para mudar de coluna e não
tem autor além de você. O que ela cobria — o combinado no corredor, o bug que
você mesmo achou — cabe melhor numa mensagem no canal, que é onde o time já olha.

Task que veio do Teams nunca pôde ser editada nem apagada aqui, e continua
assim: mudar o texto criaria um quadro que discorda da conversa, e a próxima
leitura desfaria.

Se o seu histórico tem tasks criadas na versão antiga, elas continuam no quadro,
com o selo **à mão** e móveis entre colunas — apagar dado de alguém por causa de
uma funcionalidade removida seria pior que manter duas linhas de código.
</details>

<details>
<summary><b>Concluído por mim: as regras da coluna da daily</b></summary>

A coluna é **agrupada pelo dia** — Hoje, Ontem, e a data nos anteriores. A
anotação de como você resolveu fica visível no próprio card, não escondida atrás
de um clique: durante a reunião ninguém abre um por um.

Um card chega ali de dois jeitos.

**Pela sua reação.** Você escolhe um emoji de assinatura — 🟢 por padrão, no
cabeçalho da coluna — e reage com ele na mensagem do Teams. Na próxima
atualização o card cai em Concluído por mim sozinho, e a anotação você escreve
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

**Pelo menu.** Todo card tem **Fiz esta** no menu ⋯, para o que você esqueceu de
reagir no Teams.

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
  de um emoji de assinatura em vez da identidade real. Para o crédito de quem
  não é você, a saída é escrever o nome à mão — é o que faz o "Feito por outra
  pessoa" do menu ⋯ existir.
- **Ignorar é só seu.** O time não vê que você ignorou algo — não há reação nem
  mensagem para isso. Se a demanda era sua e você ignorou, ela continua em aberto
  para todo mundo no Teams.
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
  não é um campo do Teams. Autor, data, link, reações **e o texto do card**, esses
  são literais.
- **Cards lidos por uma versão anterior mostram um resumo, não o texto.** Até
  agosto de 2026 o modelo escrevia uma linha de ~100 caracteres descrevendo o
  pedido; hoje ele copia o corpo da mensagem verbatim. Card que ainda esteja na
  janela das ~20 se conserta sozinho na próxima leitura — os que já saíram dela
  ficam com o resumo antigo para sempre, porque o Teams não os devolve mais.
- **O agrupamento de rajada também é palpite**, e vai errar de vez em quando. Ele
  erra para o lado seguro (divide na dúvida), e ⧉ e ⑃ existem justamente porque
  card errado que não dá para consertar é pior que card errado.
- **Encerrar uma sprint é definitivo para aquelas mensagens.** O card sai do
  quadro e o merge passa a ignorá-lo: se alguém reagir depois naquela mensagem,
  o Mural não fica sabendo. Vale para o que estava em *Concluído por mim* mesmo que o
  Teams ainda mostrasse a demanda como aberta — a marca é sua, e encerrar a
  sprint respeita ela. Para desfazer, só editando `sprints.json` e
  `tasks.json` na mão.

## Stack

Interface em **React + TypeScript**, compilada pelo Vite, com
[@hello-pangea/dnd](https://github.com/hello-pangea/dnd) para o arraste entre
colunas. O servidor é **Node puro** — sem framework — e faz três coisas: fala
com o agente de IA escolhido (`agentes.js`), guarda o histórico e serve o build.

## Onde ficam seus dados

Tudo em `data/`, que está no `.gitignore`:

| arquivo | o que é |
| --- | --- |
| `murais.json` | índice dos murais e suas conversas |
| `murais/<id>/tasks.json` | o histórico daquele mural, com as anotações da daily — o insubstituível |
| `murais/<id>/tasks.json.bak` | cópia da atualização anterior |
| `murais/<id>/sprints.json` | as sprints e os cards arquivados em cada uma — o dashboard e os painéis vivem daqui |
| `murais/<id>/colunas.json` | as colunas que você criou: nome e cor |
| `murais/<id>/snapshot.json` | última leitura crua; descartável |
| `agentes.json` | qual agente de IA lê o Teams, e os ajustes dele |
| `conta.json`, `chats.json` | cache do onboarding |
| `consumo.json` | tokens e custo por conta e por operação, usado para estimar |
| `preferencias.json` | se pede confirmação antes de atualizar e o seu emoji de assinatura |

Nada sai da sua máquina além das chamadas que o Claude Code já faz ao Graph.
O servidor escuta apenas em `127.0.0.1`.

## Créditos

Fonte [DM Sans](https://fonts.google.com/specimen/DM+Sans) sob SIL Open Font
License 1.1, embutida em `assets/`.

**Todos** os ícones vêm do [lucide](https://lucide.dev), sob licença ISC, copiados
como SVG inline em `src/componentes/icones.tsx` — meia dúzia de traçados não
justifica uma dependência, e glifo de texto (⧉, ⊘, ✎) muda de forma a cada
sistema operacional.

MIT.
