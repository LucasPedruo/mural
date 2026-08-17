Leia as mensagens de uma conversa do Teams e grave um snapshot cru em JSON.

## Passo 1 — listar

`read_resource` nesta URI (devolve as ~20 mensagens mais recentes):

{{URI_MENSAGENS}}

## Passo 2 — ler cada mensagem

Para CADA id retornado, `read_resource` na mesma URI + `/{id}`.
Isso é obrigatório: a listagem NÃO traz o campo `reactions`, só a leitura individual traz.
Dispare em paralelo, em lotes de 8 (várias tool calls na mesma resposta).
Se alguma retornar NOT_FOUND, ignore essa mensagem (foi apagada).

## Passo 3 — gravar

Escreva o arquivo `{{ARQUIVO_SNAPSHOT}}` com EXATAMENTE este formato — um array JSON,
sem markdown, sem cercas de código, sem comentários:

[
  {
    "id": "1786980568612",
    "author": "Bernardo Veras",
    "createdDateTime": "2026-08-17T15:29:28.612Z",
    "summary": "Mencionar usuários no modo nota com @nome",
    "kind": "bug",
    "reactions": ["⏱️"],
    "webUrl": "https://teams.microsoft.com/l/message/..."
  }
]

Regras dos campos:

- `summary`: UMA linha, no máximo ~100 caracteres, no idioma da mensagem original,
  descrevendo o pedido. Extraia do `body`. Ignore tags `<img>` (são prints).
  Se a mensagem for só imagem sem texto útil, use exatamente: "(só print — abrir para ver)"
  Se a mensagem tiver várias sugestões numeradas, resuma como
  "N sugestões: <primeira>, <segunda>, ..." e mantenha em uma linha.
- `kind`: "bug" se relata algo quebrado/erro/não funciona; "sugestao" se pede algo novo
  ou uma melhoria. Na dúvida, "sugestao".
- `reactions`: array com os emojis do campo `reactions[].reactionType`, na ordem recebida.
  Array vazio se não houver nenhuma. NÃO interprete o status — só copie os emojis.
- `webUrl`: copie verbatim o campo `webUrl` da mensagem. Em chats esse campo vem `null`;
  nesse caso monte o link com este molde, trocando {id} pelo id da mensagem:
  {{WEBURL_MOLDE}}
- `createdDateTime`: copie verbatim.

NÃO classifique status, NÃO ordene, NÃO agrupe, NÃO remova duplicatas.
Sua única saída é o arquivo. Depois de gravá-lo, responda apenas: OK <quantidade>
