---
paths:
  - "codigo/docs/evidence/**"
---
# Evidence

- Evidence proves milestones M1-M6 (`diseno/repo-layout.md` section 5). Every real transaction gets a line in `codigo/docs/evidence/tx-hashes.md`: milestone, what, hash, preprod explorer link, who captured it, UTC time, screenshot filename.
- Hashes are copied from the tool output or explorer, never typed from memory or generated. If a hash was not seen, write `unverified`.
- Preprod only. Evidence from fakes, stubs or override runs is labelled as such and is never used as milestone evidence.
- Screenshots go in `codigo/docs/evidence/screenshots/` with names `M<n>-<what>-<hhmm>.png`. Keep each under 1 MB; crop out secrets, tokens and addresses that are not public. Large images are git-ignored; keep the originals locally.
- Receipt JSON: remove private fields before saving.
- Append only. Corrections are new lines that reference the old one.
- Keep `codigo/docs/evidence/README.md` as the index.
