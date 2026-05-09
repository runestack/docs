---
title: Pull from GitHub Container Registry (GHCR)
description: Authenticate Rune to ghcr.io so it can pull private images, using a GitHub personal access token or an existing docker login.
---

GHCR (`ghcr.io`) is a container registry hosted by GitHub. Public images
work with no setup — Rune pulls them like any other registry. **Private**
images need credentials: a GitHub token with `read:packages`, registered
with `runed` so the Docker runner can use it on every pull.

This guide covers the two supported flows:

1. **Direct (recommended)** — paste a GitHub PAT into a registry entry.
2. **From an existing `docker login`** — reuse `~/.docker/config.json`.

Both flows result in `ghcr.io` images pulling without `ImagePullBackOff`
on `rune cast`.

## 1. Mint a GitHub token

Generate a Personal Access Token at
<https://github.com/settings/tokens> with the `read:packages` scope:

- **Classic PAT:** check `read:packages`. (`repo` is **not** required for
  pulling.)
- **Fine-grained PAT:** under **Permissions → Account permissions** set
  *Packages* to **Read-only**.

For organization-owned packages, also make sure the token's user has
**read access** to the package on the **Packages → Package settings →
Manage Actions access** page. A token can have the right scope but still
get `denied: permission_denied` if the package itself doesn't grant the
user access.

Test the token from a shell:

```bash
echo "$GHCR_PAT" | docker login ghcr.io -u <github-username> --password-stdin
docker pull ghcr.io/<org>/<image>:<tag>
```

If `docker pull` works, Rune will work — the same daemon performs both
pulls.

## 2a. Direct: register the token with `runed`

There are two equivalent ways to add a registry entry: at runtime via
`rune admin registry add`, or statically in the runefile.

### Runtime (no restart)

Run from the same host as `runed` (admin commands are localhost-only by
default):

```bash
rune admin registry add \
  --name ghcr \
  --registry ghcr.io \
  --type basic \
  --username "$GITHUB_USER" \
  --password "$GHCR_PAT"
```

Verify:

```bash
rune admin registry list
rune admin registry test ghcr
```

`test` performs a real auth handshake and returns `ok` or the registry
error message verbatim.

### Static (in the runefile)

```yaml
docker:
  registries:
    - name: ghcr
      registry: ghcr.io
      auth:
        type: basic
        username: ${GHCR_USER}     # env-expanded at runed start
        password: ${GHCR_PAT}
```

`runed` reads its config at startup, so changes here require a restart.
Prefer the `rune admin registry` route once the cluster is running.

:::caution[No `password-file` field]
The runefile schema does **not** support `password-file:` — `password`
must be inline (use `${ENV}` expansion to keep the literal token out of
the file), or sourced from a Rune Secret via `auth.fromSecret: <name>`.
:::

## 2b. Reuse an existing `docker login`

If the host already has working `docker login ghcr.io`, you can hand the
contents of `~/.docker/config.json` to Rune verbatim instead of
re-typing the credentials:

```bash
rune admin registry add \
  --name ghcr-from-docker \
  --registry ghcr.io \
  --type dockerconfigjson \
  --data dockerconfigjson="$(cat ~/.docker/config.json)"
```

This is useful when:

- You manage GHCR auth via a CI step that runs `docker login` for you
  (e.g. `docker/login-action` on a self-hosted runner).
- You want to ship one credential blob that covers multiple registries
  in a single file.

## 3. Cast a private image

Once the registry is registered, no service-spec change is needed —
`image:` references just work:

```yaml
service:
  name: api
  namespace: default
  image: ghcr.io/myorg/api:1.4.0
  scale: 1
```

```bash
rune cast api.yaml
```

If credentials are missing or wrong you will see the dev.27 inline
failure block:

```
✗ ImagePullBackOff
  pull access denied for ghcr.io/myorg/api, repository does not exist
  or may require 'docker login'

  image:   ghcr.io/myorg/api:1.4.0
  service: default/api

  rune logs api -n default --tail=50
```

That error text is the registry's response, surfaced directly.

## 4. Rotate or revoke

Rotate by issuing a new PAT, then:

```bash
rune admin registry update \
  --name ghcr \
  --registry ghcr.io \
  --type basic \
  --username "$GITHUB_USER" \
  --password "$NEW_PAT"
```

Revoke at <https://github.com/settings/tokens>. Existing pulls in flight
keep their credentials for the lifetime of that pull; new pulls fail
immediately.

To remove a registry entirely:

```bash
rune admin registry remove ghcr
```

## Per-service overrides

A service can pin to a specific named registry or supply inline
credentials, overriding the host-level match:

```yaml
service:
  name: api
  image: ghcr.io/myorg/api:1.4.0
  registryAuth:
    name: ghcr            # use this named registry instead of host-matching
```

Inline auth is also supported but discouraged outside of one-off
debugging — secrets land in the service spec instead of `runed`'s
config.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ImagePullBackOff` with `pull access denied` | Token missing `read:packages` or package doesn't grant the user access. | Regenerate PAT with the right scope; check **Packages → Manage Actions access**. |
| `unauthorized: authentication required` | No registry entry matches `ghcr.io`. | `rune admin registry list` — add one if missing. |
| `manifest unknown` | Image exists but tag doesn't, or org/name is wrong. | `docker pull` from the same host to confirm. |
| Works locally, fails on the server | Runed wasn't restarted after a static config change, or the env var (`$GHCR_PAT`) isn't visible to runed. | Use `rune admin registry add` instead of editing the runefile, or restart runed with the env exported. |

## See also

- [`rune admin registry`](/cli/admin/) — full subcommand reference.
- [Configuration reference](/operations/configuration/) — full runefile
  schema, including the `docker.registries[]` section.
- [Errors: ImagePullBackOff](/reference/errors/) — what the reason slug
  means.
