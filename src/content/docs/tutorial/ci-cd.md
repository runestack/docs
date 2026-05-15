---
title: "Part 4 — Wire up CI/CD"
description: GitHub Actions workflow that detects which components changed, builds Docker images to GHCR, and casts to Rune — all with a scoped service token.
---

We'll add a GitHub Actions workflow that, on every push to `main`:

1. Detects which components changed (from `.github/deploy-config.yml`).
2. Builds and pushes Docker images to GHCR.
3. Templates the cast with the per-environment values.
4. Calls `rune cast` via the [`runestack/rune-cast-action`](https://github.com/runestack/rune-cast-action).

If you want the bare-bones workflow without auto-detection, the [Deploy from GitHub Actions](/guides/ci-deployments/) guide is shorter.

## 1. Mint a scoped service token

From your laptop (still logged in as admin from [part 2](/tutorial/terraform/)):

```sh
rune admin service create ci-myapp \
  --namespace dev \
  --permissions cast \
  --ttl 90d \
  --description "GitHub Actions deploys to dev" \
  --out-file ci-myapp.token
```

This creates a service-type subject whose policy is pinned to `namespace: dev`. The token (looks like `rune_<uuid>.<uuid>`) is shown only once. Repeat with `--namespace prod` if you have a prod environment.

## 2. Push the token + host to GitHub

```sh
gh secret set RUNE_TOKEN  --body "$(cat ci-myapp.token)"
gh variable set RUNED_HOST --body "$(terraform -chdir=infra/terraform/do output -raw grpc_endpoint)"

shred -u ci-myapp.token   # or `rm -P` on macOS
```

For a prod environment, use [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments) so the `prod` job physically can't see the `dev` token:

```sh
gh secret set RUNE_TOKEN --body "$(cat ci-prod.token)" --env production
```

## 3. Declare what's deployable — `.github/deploy-config.yml`

This file is the single place that lists components, their Dockerfiles, and the paths that trigger a rebuild:

```yaml
global:
  registry: ghcr.io
  repo: your-org/myapp

# Branch → environment mapping
environments:
  main: dev

components:
  web:
    dockerfile: apps/web/Dockerfile
    context: .
    cast: infra/runeset/casts/web.yaml
    paths:
      - apps/web/**
      - infra/runeset/casts/web.yaml
      - infra/runeset/values/**
```

Add an entry per component. The workflow rebuilds + redeploys only the components whose `paths` matched the diff.

## 4. The workflow — `.github/workflows/deploy.yml`

```yaml
name: Deploy

on:
  push:
    branches: [main]
    paths:
      - 'apps/**'
      - 'infra/runeset/**'
      - '.github/deploy-config.yml'
      - '.github/workflows/deploy.yml'

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false

jobs:
  # ── Detect what changed ─────────────────────────────────────────
  detect:
    runs-on: ubuntu-latest
    outputs:
      components:  ${{ steps.detect.outputs.components }}
      environment: ${{ steps.detect.outputs.environment }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }

      - id: detect
        env: { BRANCH: ${{ github.ref_name }} }
        shell: python
        run: |
          import yaml, os, fnmatch, subprocess, json
          cfg = yaml.safe_load(open('.github/deploy-config.yml'))
          env = cfg.get('environments', {}).get(os.environ['BRANCH'], os.environ['BRANCH'])
          try:
              base = subprocess.check_output(
                  ['git','merge-base','HEAD',f'origin/{os.environ["BRANCH"]}'], text=True).strip()
          except Exception:
              base = 'HEAD^'
          changed = subprocess.check_output(['git','diff','--name-only',base,'HEAD'], text=True).splitlines()
          detected = []
          for name, comp in sorted(cfg.get('components', {}).items()):
              for cf in changed:
                  if any(fnmatch.fnmatch(cf, p) for p in comp.get('paths', [])):
                      detected.append(name); break
          with open(os.environ['GITHUB_OUTPUT'], 'a') as out:
              out.write(f'environment={env}\n')
              out.write(f'components={json.dumps(detected)}\n')

  # ── Build + push each changed component ─────────────────────────
  build:
    runs-on: ubuntu-latest
    needs: detect
    if: needs.detect.outputs.components != '[]' && needs.detect.outputs.components != ''
    strategy:
      fail-fast: false
      matrix:
        component: ${{ fromJson(needs.detect.outputs.components) }}
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - id: cfg
        shell: python
        run: |
          import yaml, os
          c = yaml.safe_load(open('.github/deploy-config.yml'))
          g = c['global']; comp = c['components']['${{ matrix.component }}']
          with open(os.environ['GITHUB_OUTPUT'], 'a') as o:
              o.write(f"registry={g['registry']}\n")
              o.write(f"repo={g['repo']}\n")
              o.write(f"context={comp['context']}\n")
              o.write(f"dockerfile={comp['dockerfile']}\n")

      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ${{ steps.cfg.outputs.registry }}/${{ steps.cfg.outputs.repo }}/${{ matrix.component }}
          tags: |
            type=sha,format=short
            type=raw,value=${{ needs.detect.outputs.environment }}

      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/build-push-action@v6
        with:
          context: ${{ steps.cfg.outputs.context }}
          file:    ${{ steps.cfg.outputs.dockerfile }}
          push: true
          tags:   ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to:   type=gha,mode=max

  # ── Cast each changed component to Rune ─────────────────────────
  cast:
    runs-on: ubuntu-latest
    needs: [detect, build]
    if: needs.detect.outputs.components != '[]' && needs.detect.outputs.components != ''
    strategy:
      fail-fast: false
      matrix:
        component: ${{ fromJson(needs.detect.outputs.components) }}
    steps:
      - uses: actions/checkout@v4

      # Lift values.<component>.component → top-level component:
      # so the shared cast template renders.
      - id: resolve
        shell: python
        run: |
          import yaml, os, re
          cfg = yaml.safe_load(open('.github/deploy-config.yml'))
          env = '${{ needs.detect.outputs.environment }}'
          comp = '${{ matrix.component }}'
          values = yaml.safe_load(open(f'infra/runeset/values/{env}.yaml'))

          def flatten(d, p=''):
              out = {}
              for k,v in d.items():
                  key = f'{p}.{k}' if p else k
                  if isinstance(v, dict): out.update(flatten(v, key))
                  else: out[key] = '' if v is None else str(v)
              return out
          flat = flatten(values)

          # Promote component.* keys
          inner = values.get(comp, {}).get('component', {})
          for k,v in inner.items():
              flat[f'component.{k}'] = '' if v is None else str(v)
          # Tag default
          if not flat.get('app.tag'):
              flat['app.tag'] = env

          content = open(cfg['components'][comp]['cast']).read()
          content = re.sub(r'\{\{\s*values:([\w.]+)\s*\}\}',
                           lambda m: flat.get(m.group(1).strip(), f'__UNSET:{m.group(1)}__'),
                           content)
          open('/tmp/cast.yaml','w').write(content)
          print(content)

      - uses: runestack/rune-cast-action@v1
        with:
          server:           ${{ vars.RUNED_HOST }}
          token:            ${{ secrets.RUNE_TOKEN }}
          source:           /tmp/cast.yaml
          namespace:        ${{ needs.detect.outputs.environment }}
          create-namespace: true
```

## 5. What the workflow does

1. `detect` looks at `git diff` since the merge-base, matches changed paths against `components.*.paths` in `deploy-config.yml`, and emits a JSON list.
2. `build` runs once per changed component — same Docker matrix you'd write by hand, tagged `sha-<short>` and `<env>`.
3. `cast` renders the shared `casts/web.yaml` template against `values/<env>.yaml` with `values.<component>.component` promoted to top-level `component:`, then calls `rune cast` via the action.

The `rune-cast-action`:

- Installs the matching `rune` CLI (cached per version).
- Calls `::add-mask::` on the token so any echo is `***`.
- Pipes the token over stdin (`--token-stdin`) so it never appears in argv.

## 6. Push and watch it run

```sh
git add infra/ apps/ .github/
git commit -m "infra: terraform + runeset + ci"
git push origin main
```

Open the workflow in GitHub Actions. The first run typically:

| Step | ~time |
|------|-------|
| `detect` | <10s |
| `build` (cold cache) | 1-3 min per component |
| `cast` | 10-30s including image pull on the droplet |

## 7. Token rotation

Calendar a rotation a week before TTL:

```sh
rune admin token list
rune admin service create ci-myapp \
  --namespace dev --permissions cast --ttl 90d \
  --out-file ci-myapp.token
gh secret set RUNE_TOKEN --body "$(cat ci-myapp.token)"
shred -u ci-myapp.token
# revoke the old one
rune admin token revoke <old-token-id>
```

---

**Next:** [Part 5 — Deploy & verify →](/tutorial/deploy/) · **Back:** [Part 3 — Runeset](/tutorial/runeset/)
