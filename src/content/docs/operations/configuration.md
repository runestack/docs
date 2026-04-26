---
title: Configuration
description: Tuning runed for real workloads — addresses, storage limits, runners, registries.
---

This page is the operational counterpart to the [runefile reference](/reference/runefile/). Same fields, more "why."

## Addresses and exposure

Default config binds to all interfaces:

```yaml
server:
  grpc-addr: ":7863"
  http-addr: ":7861"
```

For a single-host setup with no remote API consumers, lock to localhost and let the CLI tunnel via SSH:

```yaml
server:
  grpc-addr: "127.0.0.1:7863"
  http-addr: "127.0.0.1:7861"
```

Then:

```sh
ssh -L 7863:localhost:7863 host
rune login local --server localhost:7863 --token-file ./tok
```

For remote API consumers, **enable TLS**:

```yaml
auth:
  tls:
    enabled: true
    cert-file: /etc/rune/tls/server.crt
    key-file:  /etc/rune/tls/server.key
```

Without TLS, every bearer token crosses the wire in plaintext.

## Auth posture

```yaml
auth:
  enabled: true
  allow_remote_admin: false
```

- Set `enabled: false` only on a single-developer laptop. It disables every bearer-token check.
- `allow_remote_admin: true` removes the localhost gate on `admin/*` RPCs. Don't enable on a public network without TLS plus an aggressive firewall.

## Storage limits

```yaml
storage:
  secret-limits:
    max-keys-per-secret: 64
    max-value-size: 65536    # bytes
```

These cap pathological secret writes — useful when handing tokens to less-trusted CI bots. Tune up only if you actually need bigger payloads (e.g., larger TLS certs).

## KEK source

```yaml
crypto:
  kek:
    source: file              # file | env | generated
    file-path: /var/lib/rune/kek
    env-var: RUNE_MASTER_KEY
    generate-if-missing: true
```

In order of operational preference:

1. **`source: env`** with `env-var: RUNE_MASTER_KEY` — load from a secret manager (Vault, AWS Secrets Manager, systemd credential) at boot.
2. **`source: file`** — KEK on disk with mode `0600`. Easiest. Back it up.
3. **`source: generated`** — only for ephemeral test setups. Dies with the process.

Always back up the KEK separately from the database. Lose the KEK, lose all secrets — there's no recovery.

## Runners

```yaml
runner:
  docker:
    enabled: true
    socket: /var/run/docker.sock
  process:
    enabled: true
```

Disable the process runner if you're running in a hardened environment where native processes shouldn't be allowed. Disable Docker if you're running on a host without it.

## Registries

Two ways to manage:

```yaml
# Static — in the runefile
registries:
  - name: ghcr-private
    server: ghcr.io
    username: bot
    password-file: /etc/rune/ghcr.token
```

Or dynamic at runtime:

```sh
rune admin registries add --name ghcr-private \
  --server ghcr.io --username bot --password-file ./ghcr.token
```

Runtime registries don't require a `runed` restart. Static ones do.

## Logging

```yaml
server:
  log-level: info        # debug | info | warn | error
  log-format: json       # text | json
```

For production, use `json` and ship to your log collector. For local debugging, `text` is easier on the eyes.

## Common tuning recipes

### "I'm seeing slow `rune cast`."

Probably docker pull latency. Pre-pull images on the host or check registry network reachability. The server itself is rarely the bottleneck for single-node workloads.

### "Secrets feel risky."

- Move `crypto.kek.source` from `file` to `env` and load via systemd `LoadCredential`.
- Tighten `storage.secret-limits` so accidental large writes are caught.
- Restrict the `secret` resource in policies — only on-call gets `get` for `*` namespace.

### "I want minimal blast radius for the gRPC port."

- Bind to localhost.
- Run a reverse proxy (Caddy, nginx) with mTLS on a public port.
- Set `auth.allow_remote_admin: false` (default).

## See also

- [Runefile reference](/reference/runefile/) — exhaustive field list.
- [Running runed](/operations/runed/) — process management.
- [Security hardening](/operations/security/) — TLS, KEK rotation, RBAC.
