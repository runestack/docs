# Rune docs

The Rune documentation site, built with [Markline](https://markline.dev) and
themed from the **Rune Landing** design (warm near-black canvas, `#9e8cfc`
purple accent, Spectral display · Hanken Grotesk UI · JetBrains Mono data).

## Run it

```sh
npm install
npm run dev        # dev server on http://localhost:3000
```

In `dev`, the docs live under their routes (`/start/what-is-rune`,
`/concepts/architecture`, …). Next reserves `/` for the app router, so the
static landing only takes over `/` in a production build — to preview the
landing locally, run `npm run export` and serve `out/` (see below).

## Build & ship

```sh
npm run build      # production server bundle  (markline build)
npm run start      # serve the built bundle
npm run export     # static HTML  ->  out/   (markline export)
```

In the **static export** (`out/`), the landing is the site root — `out/index.html`
is the full Rune Landing — and every doc page is a static `.html`. Deploy `out/`
to any CDN / Netlify / GitHub Pages.

## Layout

```
markline.json        # nav, theme tokens, branding (single source of truth)
docs/                # all content as .mdx (start, concepts, guides, deploy,
                     #   tutorial, operations, cli, reference)
public/
  index.html         # the Rune Landing — homepage at / (interactive:
                     #   typing terminal, CLI tabs, ⌘K palette, copy buttons)
  landing.css        # landing styles (design tokens)
  landing.js         # landing interactions
  logo-rune-{light,dark}.svg  # serif "rune." topbar wordmark
  favicon.svg        # serif "r" + purple square dot
```

## Theming

All branding lives in `markline.json` → `theme`:

- `colors.primaryDark: "#9e8cfc"` — the Rune purple accent.
- `font.sans: "Hanken Grotesk"`, `font.mono: "JetBrains Mono"`.
- `cssVariables.dark` — the warm-ink surface/text/border palette.

The landing (`public/`) is a self-contained recreation of the design file and
carries its own copy of the same tokens in `landing.css`.

## Content notes

Content was authored as Markdown and ported to MDX. MDX is stricter than
Markdown about `<`, `>`, `{`, `}` in prose — these are HTML-escaped outside code
spans during authoring. Keep raw angle-bracket placeholders (e.g. `<name>`)
inside backticks or fenced code.
