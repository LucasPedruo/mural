Leia UMA mensagem do Microsoft Teams e grave um snapshot cru em JSON.

## Passo 1 — ler

`{{FERRAMENTA_LEITURA}}` nesta URI:

{{URI_MENSAGEM}}

Se ela devolver NOT_FOUND, grave um array vazio `[]` e responda `OK 0`.
Isso acontece quando a mensagem foi apagada, ou quando a conta autenticada não
tem acesso à conversa — em nenhum dos dois casos você deve inventar conteúdo.

## Passo 2 — gravar

Com `{{FERRAMENTA_ESCRITA}}`, escreva o arquivo `{{ARQUIVO_SNAPSHOT}}` com
EXATAMENTE este formato — um array JSON com UM item, sem markdown, sem cercas de
código, sem comentários:

[
  {
    "id": "1786980568612",
    "author": "Bernardo Veras",
    "createdDateTime": "2026-08-17T15:29:28.612Z",
    "texto": "Mencionar usuários no modo nota com @nome",
    "kind": "bug",
    "soPrint": false,
    "reactions": ["⏱️"],
    "webUrl": "https://teams.microsoft.com/l/message/..."
  }
]

Regras dos campos — as mesmas de `sincronizar.md`:

- `texto`: **o texto da mensagem, verbatim**. Não resuma, não reescreva, não
  traduza, não corte, não conserte a ortografia. Tire as tags HTML e devolva o
  texto que sobra: `<br>`, `</p>` e `</div>` viram quebra de linha; `&nbsp;`
  `&amp;` `&lt;` `&gt;` `&quot;` viram o caractere que representam; `<img>` some.
  Corte só o espaço em branco das pontas. Se não sobrar texto nenhum, use
  exatamente: "(só print — abrir para ver)"
- `kind`: "bug" se relata algo quebrado/erro/não funciona; "sugestao" se pede
  algo novo ou uma melhoria. Na dúvida, "sugestao".
- `soPrint`: `true` quando o corpo não tem texto útil além de imagens anexadas.
- `reactions`: array com os emojis do campo `reactions[].reactionType`, na ordem
  recebida. Array vazio se não houver nenhuma. NÃO interprete o status.
- `webUrl`: copie verbatim o campo `webUrl` da mensagem. Se vier `null`, use
  exatamente o link que foi pedido:
  {{LINK_ORIGINAL}}
- `createdDateTime`: copie verbatim.
- `id`: o id da mensagem, como string.

Uma mensagem só. Não leia a conversa em volta, não procure a mensagem anterior,
não agrupe nada: quem cuida disso é o código que lê este arquivo.

Sua única saída é o arquivo. Depois de gravá-lo, responda apenas: OK 1
