# Mural

Seu canal do Teams vira um kanban. O emoji é o status.

Muitos times recebem demandas por um canal do Teams e se organizam por reação:
alguém reage com um relógio para dizer "eu pego", com um check para dizer "feito".
Funciona — até o canal encher e ninguém mais conseguir ver o que está solto.

O Mural lê esse canal e mostra três colunas: **ninguém pegou**, **interagido**,
**concluído**. Clicar num card abre a mensagem original no Teams.

![três colunas: ninguém pegou, interagido, concluído](#)

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

## Regra de status

| Reação na mensagem | Coluna |
| --- | --- |
| nenhuma | Ninguém pegou |
| **check** (✅ ☑️ ✔️) | Concluído |
| **qualquer outra** | Interagido |

Não há lista de emojis para manter. Times reais não usam um emoji fixo para
"peguei" — cada pessoa reage com o que quiser, e um emoji inédito amanhã já cai
no lugar certo sozinho. O emoji usado aparece como badge no card, porque sem
convenção fixa é a única forma de saber o que aconteceu ali.

A fonte da verdade é sempre o Teams. Os cards não se arrastam de propósito:
para mover uma task, reaja na mensagem lá e clique em Atualizar.

## Requisitos

- **Node.js 18+** — sem dependências, nenhum `npm install`
- **[Claude Code](https://claude.com/claude-code)** instalado e autenticado
- O **conector Microsoft 365** ativo no Claude Code (`/mcp` para conferir)

Não existe login próprio. A autenticação com a Microsoft é a do Claude Code e
do conector — este servidor nunca vê nem guarda credencial nenhuma.

## Instalação

```bash
git clone https://github.com/<voce>/mural.git
cd mural
node server.js
```

Abra <http://localhost:4317>. Na primeira vez você cai numa tela de configuração
que verifica o Claude Code, mostra com qual conta Microsoft você está logado e
pede a conversa que vira o quadro.

No Windows dá para usar `start.cmd`, que sobe o servidor e abre o navegador.

Para trocar a porta: `MURAL_PORT=5000 node server.js`.

## Escolhendo a conversa

**Chats e grupos** aparecem numa lista para você clicar.

**Canais de time** precisam de link: no Teams, abra o canal, clique nos "…" de
qualquer mensagem, "Copiar link", e cole. Isso não é preguiça — a API do Graph
não expõe rota para listar times ou canais a um conector. O link resolve porque
carrega o time, o canal e os nomes legíveis de ambos.

## Limites conhecidos

Vale saber antes de adotar:

- **Não dá para saber quem reagiu.** O Graph devolve a lista de usuários da
  reação vazia. O quadro diz "alguém interagiu", nunca "fulano pegou".
- **Não dá para ler respostas de thread.** Um "pego essa" escrito como resposta
  é invisível aqui — só a reação na mensagem principal conta.
- **20 mensagens por leitura.** É o teto da API. O histórico acumulado no disco
  compensa isso ao longo do tempo, mas na primeira execução você só verá as 20
  mais recentes.
- **Um sync leva 1 a 2 minutos.** São ~21 chamadas ao Graph mais o resumo de
  cada mensagem. A barra de progresso mostra a etapa real.
- **Listar chats no onboarding leva 2 a 3 minutos**, porque o Teams entrega os
  chats em páginas de 25 e cada página é uma ida à API. Só acontece uma vez.
- **A etiqueta `bug` é um palpite do modelo**, inferido do texto da mensagem —
  não é um campo do Teams. Autor, data, link e reações, esses são literais.

## Onde ficam seus dados

Tudo em `data/`, que está no `.gitignore`:

| arquivo | o que é |
| --- | --- |
| `config.json` | a conversa escolhida |
| `tasks.json` | o histórico acumulado — o único arquivo insubstituível |
| `tasks.json.bak` | cópia do sync anterior |
| `snapshot.json` | última leitura crua; descartável |
| `conta.json`, `chats.json` | cache do onboarding |

Nada sai da sua máquina além das chamadas que o Claude Code já faz ao Graph.
O servidor escuta apenas em `127.0.0.1`.

## Créditos

Fonte [DM Sans](https://fonts.google.com/specimen/DM+Sans) sob SIL Open Font
License 1.1, embutida em `assets/`.

MIT.
