---
title: Deploy from GitHub Actions
description: Use the runestack/rune-cast-action GitHub Action to deploy services from your CI pipeline with a scoped service-account token.
---

This guide wires Rune into a GitHub Actions workflow so every push to `main` (or every successful CI run, or whatever your trigger is) deploys via `rune cast`. The two pieces:

1. A **service-account token** minted with [`rune admin service create`](/cli/admin/#rune-admin-service) — scoped, revocable, and not a human user's credential.
2. The [`runestack/rune-cast-action`](https://github.com/runestack/rune-cast-action) composite Action — installs the CLI, authenticates over stdin, runs `rune cast`, masks the token in logs.

## 1. Mint a service-account token

On a workstation that already has admin/root credentials loaded:

```sh
rune admin service create ci-stg \
  --namespace stg \
  --permissions cast \
  --ttl 90d \
  --description "GitHub Actions deploys to stg" \
  --out-file ci-stg.token
```

What this does:

- Creates a service-type subject `ci-stg`.
- Derives a per-service policy `ci-stg-cast` — a copy of the built-in `cast` policy with every rule pinned to `namespace: stg`. The service account cannot reach into other namespaces.
- Issues a bearer token (looks like `rune_<uuid>.<uuid>`) valid for 90 days.
- Writes the secret to `ci-stg.token` (mode `0600`). This is the **only** time the secret is shown.

**Cluster-wide token (no namespace pin):** omit `--namespace` and the service account gets the cluster-wide built-in policy unchanged. Use this for tokens that need to deploy into many namespaces (e.g. a monorepo CI that cuts releases across `stg` and `prod`):

```sh
rune admin service create ci-all \
  --permissions cast \
  --ttl 90d \
  --out-file ci-all.token
```

Trade-off: a cluster-wide token is more powerful, so prefer one scoped token per namespace when your CI structure allows it.

## 2. Stash the token as a GitHub secret

Per-environment secrets (recommended) so the `stg` job physically cannot see the `prod` token:

```sh
gh secret set RUNE_TOKEN --body "$(cat ci-stg.token)" --env staging
gh secret set RUNE_TOKEN --body "$(cat ci-prod.token)" --env production

# Then shred the local copies.
shred -u ci-stg.token ci-prod.token   # or `rm -P` on macOS
```

Set the runed address as a (non-secret) repo or environment variable:

```sh
gh variable set RUNED_HOST --body "runed.example.com:443" --env staging
```

## 3. Wire the Action into your workflow

`.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  stg:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4

      - uses: runestack/rune-cast-action@v1
        with:
          server:    ${{ vars.RUNED_HOST }}
          token:     ${{ secrets.RUNE_TOKEN }}
          source:    infra/runeset/casts/external-service.yaml
          values:    infra/runeset/values/stg.yaml
          namespace: stg
```

That's it. The Action:

1. Installs the matching Rune CLI (caches by version under `$RUNNER_TOOL_CACHE`).
2. Calls `::add-mask::` on the token so any echo is `***`.
3. Pipes the token over stdin: `printf '%s' "$token" | rune login ... --token-stdin`. The token never appears on argv.
4. Runs `rune cast <source>` with every other input mapped 1:1 to the matching CLI flag.

## Common patterns

### Multiple values files / `--set` overrides

Multi-line inputs split on newline and become repeated flags:

```yaml
- uses: runestack/rune-cast-action@v1
  with:
    server: ${{ vars.RUNED_HOST }}
    token:  ${{ secrets.RUNE_TOKEN }}
    source: infra/runeset/
    recursive: true
    values: |
      infra/runeset/values/base.yaml
      infra/runeset/values/prod.yaml
    set: |
      app.tag=${{ github.sha }}
      app.replicas=3
    namespace:        prod
    create-namespace: true
```

### Dry-run on PRs, real deploy on merge

```yaml
- uses: runestack/rune-cast-action@v1
  with:
    server:    ${{ vars.RUNED_HOST }}
    token:     ${{ secrets.RUNE_TOKEN }}
    source:    infra/runeset/casts/external-service.yaml
    values:    infra/runeset/values/stg.yaml
    namespace: stg
    dry-run:   ${{ github.event_name == 'pull_request' }}
```

### Pin the Rune CLI version

By default the Action installs the latest release. Pin per workflow if you want lockstep with a known-good cluster version:

```yaml
- uses: runestack/rune-cast-action@v1
  with:
    version: v0.0.1-dev.26   # or "latest"
    # ...
```

## Install only (no deploy)

Sometimes you just want `rune get`, `rune logs`, etc. in CI without a full cast. Use the [`runestack/rune-setup-action`](https://github.com/runestack/rune-setup-action) primitive directly:

```yaml
- uses: runestack/rune-setup-action@v1
  with:
    version: latest

- run: rune get services -n stg
  env:
    RUNE_SERVER: ${{ vars.RUNED_HOST }}
    RUNE_TOKEN:  ${{ secrets.RUNE_TOKEN }}
```

## Rotation and revocation

```sh
# Inspect what's out there.
rune admin token list

# Revoke immediately if a token leaks.
rune admin token revoke <token-id>

# Re-mint (idempotent — same name upserts the subject).
rune admin service create ci-stg \
  --namespace stg --permissions cast --ttl 90d \
  --out-file ci-stg.token
gh secret set RUNE_TOKEN --body "$(cat ci-stg.token)" --env staging
shred -u ci-stg.token
```

Set a calendar reminder a week before `--ttl` expiry, or run service tokens with `--ttl 0` (no expiry) and rotate on incident only — your call.

## See also

- [`rune admin service`](/cli/admin/#rune-admin-service) — full flag reference.
- [`rune login --token-stdin`](/cli/login-config/#--token-stdin-for-ci) — the auth primitive the Action uses.
- [Identity & RBAC](/concepts/identity-rbac/) — how policies, subjects, and tokens fit together.
- [`runestack/rune-cast-action`](https://github.com/runestack/rune-cast-action) — every input documented in the README.
