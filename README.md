# Rune docs

The official documentation site for [Rune](https://github.com/runestack/rune) — a lightweight, single-binary orchestration platform inspired by Kubernetes and Nomad.

Built with [Astro Starlight](https://starlight.astro.build), styled to feel close to [scalar.com](https://scalar.com), and deployed to GitHub Pages.

> **This folder has its own git history.** It's intentionally separate from the parent project's tree so the docs can be released, versioned, and contributed to independently of the engine.

---

## 🚀 Quick start

```sh
# Requires Node 22+
nvm use 22 || nvm install 22

npm install
npm run dev          # http://localhost:4321
npm run build        # static build to dist/
npm run preview      # preview the production build
```

That's it. There's no separate watcher, no API stub server — Astro hot-reloads markdown, MDX, CSS, and config.

## 📁 Layout

```
docs/
├── astro.config.mjs            # site/base/sidebar config
├── package.json
├── public/
│   └── favicon.svg
├── src/
│   ├── assets/
│   │   └── logo.svg            # gradient logo, also used in the hero
│   ├── content/
│   │   └── docs/
│   │       ├── index.mdx       # landing page (splash template)
│   │       ├── start/          # what-is, quick-start, install, bootstrap
│   │       ├── concepts/       # architecture, services, instances, …
│   │       ├── guides/         # task-oriented walkthroughs
│   │       ├── cli/            # one page per `rune` subcommand
│   │       ├── reference/      # service spec, runefile, API, errors
│   │       └── operations/     # runed, configuration, security, upgrades
│   ├── content.config.ts       # Starlight collection schema (don't edit)
│   └── styles/
│       └── custom.css          # Scalar-flavored theming (gradients, glass nav, etc.)
└── .github/workflows/
    └── deploy.yml              # builds + deploys to GitHub Pages on push to main
```

## ✏️ Editing content

- **Add a page**: create a markdown/MDX file under `src/content/docs/<group>/`, then add a sidebar entry in `astro.config.mjs`. Frontmatter must include `title` and `description`.
- **Change navigation**: edit the `sidebar` array in `astro.config.mjs`.
- **Restyle**: `src/styles/custom.css`. Variables at the top control accent gradient, fonts, and dark/light tokens.
- **Update the landing page**: `src/content/docs/index.mdx`. Uses Starlight's `splash` template + `<Card>` / `<CardGrid>` / `<LinkCard>` components.

Starlight conventions:
- File path → URL path (`start/quick-start.md` → `/start/quick-start/`).
- Use `:::tip`, `:::note`, `:::caution`, `:::danger` for callouts.
- Use code fences with language tags — Starlight uses Expressive Code with copy buttons, line highlights, and titles.
- Cross-link with absolute paths: `[text](/concepts/services/)`.

## 🌐 Deploy to GitHub Pages

The workflow at `.github/workflows/deploy.yml` builds and publishes on every push to `main`. To wire it up:

1. **Push this folder to its own GitHub repo** (e.g. `runestack/rune-docs`).
2. In **Settings → Pages**, set the source to **GitHub Actions**.
3. (Optional) In **Settings → Secrets and variables → Actions → Variables**, set:
   - `SITE_URL` — e.g. `https://docs.runestack.io`
   - `SITE_BASE` — e.g. `/` (root) or `/rune` (default for project pages).

   If you don't set them, the workflow defaults to `https://<owner>.github.io/<repo>/`.

4. Push to `main`. The first run takes ~2 minutes; subsequent runs are faster.

### Custom domain

Add a `public/CNAME` file containing your domain (e.g. `docs.runestack.io`) and configure the DNS CNAME record. Set `SITE_URL` to the full domain and `SITE_BASE` to `/`.

## 🔧 Where things live in the source

When the engine changes, these are the most likely doc updates:

| Engine change                          | Docs to update                                                  |
| -------------------------------------- | --------------------------------------------------------------- |
| New CLI command or flag                 | `src/content/docs/cli/<command>.md` + sidebar in config         |
| New field in service spec               | `src/content/docs/reference/service-spec.md`                    |
| New runefile field                      | `src/content/docs/reference/runefile.md`                        |
| New built-in policy or RBAC behavior    | `src/content/docs/concepts/identity-rbac.md`                    |
| New runner / new lifecycle hook         | `src/content/docs/concepts/services.md` + relevant guide        |
| Security-relevant change                | `src/content/docs/operations/security.md`                       |
| New release / breaking change           | Release notes (TBD) + `src/content/docs/operations/upgrades.md` |

## 🤝 Contributing

PRs welcome. Style notes:

- **Tone**: terse, technical, second person. Match what's already there.
- **No emoji in body content** unless it's communicating something semantic (✓ / ✗ in tables is fine).
- **Code blocks must work** — every command should be copy-pasteable. Test against a real `runed` if possible.
- **Don't oversell.** If a feature is roadmap, say so with the ticket ID. There's a culture of accuracy here.
- **Cross-link generously.** Concept pages, guide pages, and CLI pages should link into each other.

## 🤖 For the next agent picking this up

If you're an AI agent inheriting this folder:

1. **Read this whole README.** It tells you the layout and conventions.
2. **Build before editing**: `npm install && npm run build` to confirm the toolchain works on your environment.
3. **Use the Starlight docs**: <https://starlight.astro.build>. Don't reinvent components — `<Card>`, `<CardGrid>`, `<LinkCard>`, `<Tabs>`, `<TabItem>`, `<Steps>`, `<Aside>` are all available.
4. **Don't edit `src/content.config.ts`** unless you intentionally want to change the collection schema.
5. **The sidebar is hand-curated** in `astro.config.mjs`. Adding a file to disk does not auto-add a sidebar entry (except inside groups using `autogenerate`, which we don't use today).
6. **Custom CSS** is the one place visual changes happen — `src/styles/custom.css`. Don't fork Starlight components unless you really have to.
7. **The site lives behind a `base` path** (default `/rune`). Always link with absolute paths starting with `/` — Astro's router will prepend the base.
8. **Check parity with the engine**: the [`rune` repo](https://github.com/runestack/rune) is the source of truth. If `rune -h` says something different from the docs, the docs are wrong.

If you change the doc site visually or structurally, run `npm run build` and confirm:
- Build completes (currently 45 pages).
- Pagefind search index regenerates.
- Sitemap is written.

## 🧪 Useful commands

```sh
npm run dev          # dev server with HMR
npm run build        # production build → ./dist/
npm run preview      # serve the build locally
npm run astro check  # type-check content
```
