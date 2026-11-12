# Shelfie pitch deck (backup)

The live pitch uses the story page `/story`, not this deck ([../director-script.md](../director-script.md)). Keep `shelfie.pdf` as the offline backup if the page or the network fails.

Beamer (metropolis theme), 16:9, ~3 min live pitch, 14 frames.

## Build
```
cd pitch/slides
latexmk -xelatex shelfie.tex     # produces shelfie.pdf
latexmk -c                       # remove aux files (keeps the PDF)
```
Needs `xelatex` (or `lualatex`), `metropolis`, `qrcode`, `tikz`. Fonts: Fira Sans if installed, otherwise Noto Sans.
Without xelatex: `pdflatex shelfie.tex` (run twice) builds the same deck in TeX Gyre Heros; no extra packages beyond a standard TeX Live.
If `xelatex.fmt` is missing, add `xelatex xetex language.def -translate-file=cp227.tcx *xelatex.ini` to `~/.texlive/texmf-config/web2c/fmtutil.cnf` and run `fmtutil-user --byfmt xelatex`.

## Edit
- **Facts** (names, numbers, tx hashes, explorer URLs, team, closing line): `facts.tex`. Placeholders render as red-on-orange `[...]` boxes via `\ph{...}`; replace the macro body with the real value.
- **Slides**: one file each in `sections/NN-name.tex`, included from `shelfie.tex`. Reorder or drop by editing the `\input` list. The live deck is title, hook, flow, demo, market, beyond, close; the slides after `\appendix` are backups for Q&A.
- **Hook photo**: put one real shelf photo (brands blurred, no people) at `img/real-shelf.jpg`. The folder is git-ignored; without the file the slide shows a placeholder.
- **Market figures** stay in `\ph{...}` until each one is checked at its source (`../pitch-plan.md` section 4).
- **Present** with `pdfpc shelfie.pdf` (presenter view and timer); fallback `evince -s shelfie.pdf`.
- **Colours**: palette defined at the top of `shelfie.tex` (`cardano`, `warm`, ...).
- QR codes on the proof slide are generated from the `\Url...` macros.
- No dates anywhere (`\date{}` empty).
