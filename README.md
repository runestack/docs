# Rune docs

The Rune documentation site, built with [Markline](https://markline.dev) on its
`help-center` template (`#9e8cfc` purple accent, Spectral headings · Hanken
Grotesk UI · JetBrains Mono code).

## Run it

```sh
npm install
npm run dev        # dev server on http://localhost:3000
```

The home page (`docs/index.mdx`) is an ordinary docs page at `/`.

## Build & ship

```sh
npm run build      # production server bundle  (markline build)
npm run start      # serve the built bundle
npm run export     # static HTML  ->  out/   (markline export)
```

In the **static export** (`out/`), every doc page is a static `.html`. We deploy `out/`
to GitHub Pages (see `.github/workflows/deploy.yml`); it serves from any static host / CDN.

## Layout

```
markline.json        # nav, theme tokens, branding (single source of truth)
docs/                # all content as .mdx (start, concepts, guides, deploy,
                     #   tutorial, operations, cli, reference)
public/
  rune.css           # chips for the home page, loaded through theme.font.url
  CNAME              # docs.runestack.io
  logo-rune-{light,dark}.svg  # serif "rune." topbar wordmark
  favicon.svg        # serif "r" + purple square dot
```

## Theming

All branding lives in `markline.json` → `theme`:

- `colors.primaryDark: "#9e8cfc"` — the Rune purple accent.
- `font.sans: "Hanken Grotesk"`, `font.mono: "JetBrains Mono"`.
- `cssVariables.dark` — the warm-ink surface/text/border palette.

- `font.heading: "Spectral"` and `topbar.banner` set the headings and the banner.
- `template: "help-center"` supplies the sidebar, breadcrumbs and page layout.

## Content notes

Content was authored as Markdown and ported to MDX. MDX is stricter than
Markdown about `<`, `>`, `{`, `}` in prose — these are HTML-escaped outside code
spans during authoring. Keep raw angle-bracket placeholders (e.g. `<name>`)
inside backticks or fenced code.
