@AGENTS.md

# Fluks
- Dansk UI-tekst overalt. Beløb gemmes i øre (heltal), datoer som 'YYYY-MM-DD'.
- Forretningslogik i `src/server/services`, eksterne systemer som adaptere i `src/integrations` (altid med sandbox).
- Kør `npm run lint && npm run typecheck && npm test` før commit; `npm run build && npm run test:e2e` for fuld verifikation.
