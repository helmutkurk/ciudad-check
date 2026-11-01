---
paths:
  - "**/*.md"
  - "docs/**"
  - "diseno/**"
---
# Documentation

- English, concise, imperative, no emojis. Short sections and tables over prose.
- `diseno/` is canonical. If code and design disagree, fix one of them in the same commit and say which in the commit message.
- Mark unknowns as unverified and move the answer to `codigo/docs/verified.md` when known. Never guess a fact about Masumi, x402, Sokosumi or Cardano.
- Mark planned or stubbed parts as such. Docs must not describe more than the code does.
- Decisions go to an ADR (`docs/adr/`, skill `adr`). Do not bury a decision in a commit comment or chat.
- Relative links only. Keep one source per fact; link instead of copying.
- Do not edit `investigacion/` sources or `pitch/slides/facts.tex` values without the owner; facts for the deck change in `facts.tex` only.
