Descubra com qual conta Microsoft 365 esta sessão está conectada.

Chame a tool `mcp__claude_ai_Microsoft_365__get_me` e grave o arquivo
`{{ARQUIVO_SAIDA}}` com exatamente este JSON (sem markdown, sem cercas de código):

{ "displayName": "...", "mail": "..." }

Use `userPrincipalName` no lugar de `mail` se `mail` vier nulo.
Se a tool não existir ou falhar, grave: { "erro": "<motivo em uma linha>" }

Depois de gravar, responda apenas: OK
