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
    "soPrint": false,
    "mesmaDemandaQueAnterior": false,
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
- `soPrint`: `true` quando o corpo não tem texto útil além de imagens anexadas —
  é a mesma condição do summary "(só print — abrir para ver)". `false` caso contrário.
- `mesmaDemandaQueAnterior`: veja a seção abaixo. Na dúvida, `false`.
- `reactions`: array com os emojis do campo `reactions[].reactionType`, na ordem recebida.
  Array vazio se não houver nenhuma. NÃO interprete o status — só copie os emojis.
- `webUrl`: copie verbatim o campo `webUrl` da mensagem. Em chats esse campo vem `null`;
  nesse caso monte o link com este molde, trocando {id} pelo id da mensagem:
  {{WEBURL_MOLDE}}
- `createdDateTime`: copie verbatim.

## O campo `mesmaDemandaQueAnterior`

Uma demanda raramente chega como uma mensagem só. O padrão é a rajada: a pessoa
manda dois prints e depois três linhas de texto, em segundos, e aquilo é UMA
tarefa. Sem esse campo o quadro mostraria cinco cards, quatro deles dizendo
apenas "só print".

Ordene as mensagens por `createdDateTime` crescente. Para cada mensagem,
`mesmaDemandaQueAnterior` é `true` quando ela **continua o assunto da mensagem
imediatamente anterior nessa ordem** — o print do erro que o texto seguinte
descreve, a frase que completa a de cima, o "e também isso" sobre o mesmo item.

É `false` — e este é o padrão — quando:

- a mensagem anterior é de outro autor;
- a mensagem abre um assunto novo, mesmo que o autor seja o mesmo;
- você está em dúvida.

Errar dividindo deixa um card solto no quadro, que a pessoa junta com um clique.
Errar juntando **esconde uma tarefa dentro de outra**, e ninguém percebe. Então
na dúvida, divida: responda `false`.

Você não precisa se preocupar com o intervalo de tempo nem com a ordem — quem
cuida disso é o código que lê este arquivo. Ele só pode juntar mensagens
consecutivas do mesmo autor com poucos minutos entre elas, e nunca junta o que
você marcou como `false`.

NÃO classifique status, NÃO ordene, NÃO agrupe, NÃO remova duplicatas.
Sua única saída é o arquivo. Depois de gravá-lo, responda apenas: OK <quantidade>
