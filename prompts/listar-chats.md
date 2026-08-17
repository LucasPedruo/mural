Liste os chats do Teams desta conta.

Chame `mcp__claude_ai_Microsoft_365__teams_list_chats` com limit 25. Se a resposta
trouxer `nextCursor`, chame de novo passando esse valor em `cursor`, até no máximo
4 páginas no total.

Grave o arquivo `{{ARQUIVO_SAIDA}}` com um array JSON (sem markdown, sem cercas):

[
  { "id": "19:...@thread.v2", "nome": "(Des)envolvedores", "tipo": "group", "membros": 8 }
]

Regras:

- `nome`: use o `topic` do chat. Quando `topic` for nulo (chats 1:1 e alguns de grupo),
  monte o nome com os `displayName` dos membros, EXCLUINDO a pessoa logada
  ({{USUARIO_ATUAL}}). Um nome só para 1:1; para grupo, os três primeiros seguidos de
  "+N" — por exemplo: "Ana, Bruno, Carla +5".
- `tipo`: copie o `chatType` (`oneOnOne`, `group` ou `meeting`).
- `membros`: copie o `memberCount`.
- Mantenha a ordem em que vieram (mais recentes primeiro). Não invente chats.

Se a tool não existir ou falhar, grave: { "erro": "<motivo em uma linha>" }

Depois de gravar, responda apenas: OK <quantidade>
