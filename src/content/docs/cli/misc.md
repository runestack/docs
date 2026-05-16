---
title: rune whoami / status / version
description: Three small utilities — identity, namespace summary, and version info.
---

## `rune whoami`

```sh
rune whoami
rune whoami -o json
```

Shows the active context, the server, the configured namespace, the (masked) token, whether the connection works, the server's version, and — if authenticated — the subject ID and attached policies.

```
Current Context: prod
Server: runed.example.com:7863
Server Version: v0.0.1-dev.40 (51e7782b)
Default Namespace: prod
Token: 29b******364
Status: Authenticated
Subject ID: fba66da0-98de-48b8-b5d3-ae5111900388
Name: alice
Policies: [readwrite]
```

If `Status: Not connected to server`, run `rune login` again or check that the server is reachable. The `Server Version` line is omitted on older servers that don't expose `HealthService.GetServerVersion` (added in v0.0.1-dev.38).

## `rune status`

A health roll-up for a namespace (or the whole cluster with `-A`). Surfaces
the same `statusReason` / `statusMessage` you'd otherwise dig out with
`rune get service <name>`, so failed services explain themselves on the
first line.

```sh
rune status                         # default namespace
rune status -n prod                 # specific namespace
rune status -A                      # all namespaces, one summary line each
rune status -A --detail             # all namespaces + per-service table
rune status -w                      # re-render every 2s (Ctrl+C to exit)
rune status -o json                 # structured output for scripts/dashboards
```

### Default output

```
Namespace: prod   ·   12 services   ·   28 instances

  ✓ Running      10
  ⊙ Deploying     1
  ⏸ Stopping      0
  ⚠ Failed        1
  · Pending       0

NAME       STATUS     SCALE   AGE   REASON / MESSAGE
echo       Failed     1/0     3h    ImageUnreachable — auth failed pulling ghcr.io/echo:1.4
landing    Deploying  1/0     1m
api        Running    3/3     14d
worker     Running    5/5     14d
ingress    Running    2/2     21d
```

Rows are ordered so what needs attention floats up: `Failed → Stopping →
Deploying → Pending → Running`. The `SCALE` column reads `desired/ready`,
so transitions are obvious:

| State                       | Status      | Scale | Meaning                                            |
| --------------------------- | ----------- | ----- | -------------------------------------------------- |
| Steady                      | `Running`   | `1/1` | Converged.                                         |
| Drain in flight (`stop`)    | `Stopping`  | `0/1` | Asked to scale to 0; old instance still draining.  |
| Drain done                  | `Pending`   | `0/0` | No instances; service spec still present.          |
| Start / restart in flight   | `Deploying` | `1/0` | New instance booting; not yet ready.               |
| Healthy after start         | `Running`   | `1/1` |                                                    |
| Probe / image / OOM failure | `Failed`    | `1/0` | Reason + message shown inline; no second command.  |

### All namespaces (`-A`)

```
3 namespaces · 24 services · 56 instances

NAMESPACE  SERVICES  RUNNING  DEPLOYING  STOPPING  FAILED  PENDING
dev        8         7        1          0         0       0
prod       12        10       1          0         1       0
staging    4         4        0          0         0       0
```

Add `--detail` to also emit the per-service table beneath each namespace.

### Structured output

`-o json` and `-o yaml` emit a stable shape — safe to bake into dashboards:

```json
{
  "namespaces": [
    {
      "namespace": "prod",
      "summary": {
        "total": 12, "running": 10, "deploying": 1,
        "stopping": 0, "pending": 0, "failed": 1,
        "instances": 28
      },
      "services": [
        {
          "name": "echo",
          "status": "Failed",
          "desiredScale": 1,
          "readyInstances": 0,
          "age": "3h",
          "statusReason": "ImageUnreachable",
          "statusMessage": "auth failed pulling ghcr.io/echo:1.4",
          "updatedAt": "2026-05-13T11:21:34Z"
        }
      ]
    }
  ]
}
```

### Flags

| Flag                       | Default        | Notes                                                                  |
| -------------------------- | -------------- | ---------------------------------------------------------------------- |
| `-n, --namespace`          | from context   | Namespace to summarize. Ignored with `-A`.                             |
| `-A, --all-namespaces`     | `false`        | Summarize every namespace.                                             |
| `-w, --watch`              | `false`        | Re-render every `--watch-interval` seconds, like `top`. Ctrl+C exits.  |
| `--watch-interval`         | `2s`           | Refresh cadence for `-w`.                                              |
| `-o, --output`             | `""` (text)    | `''` (text), `json`, or `yaml`.                                        |
| `--detail`                 | `false`        | With `-A`, expand each namespace into the per-service table.           |
| `--no-roll-up`             | `false`        | Hide the bucket header (useful when piping text).                      |
| `--api-server`             | from context   | One-off API server override.                                           |

### Notes

- Glyphs (`✓ ⊙ ⏸ ⚠ ·`) auto-degrade to ASCII tokens (`OK DEPL STOP FAIL PEND`) when colors are off (`NO_COLOR=1`, non-TTY stdout, Windows without ConEmu/WT).
- One `ListServices` + one `ListInstances` per namespace — no N+1 even with `-A`.
- `Stopping` is set server-side whenever the desired scale is below the current instance count; works the same for `rune stop` and the drain phase of `rune restart`.

## `rune version`

```sh
rune version              # client + server
rune version --client     # client only (skips the server probe)
rune version -o json      # structured output: text | json | yaml
runed --version           # the server's own version subcommand
```

```
Client:
  Version:    v0.0.1-dev.40
  Commit:     51e7782b
  BuildTime:  2026-05-13T03:23:51Z
  GoVersion:  go1.22.5
  Platform:   darwin/arm64
Server:
  Version:    v0.0.1-dev.40
  Commit:     51e7782b
  BuildTime:  2026-05-13T03:25:18Z
  GoVersion:  go1.22.5
  Platform:   linux/amd64
```

The build is tagged with the git commit and build timestamp. If you see `-dirty` in the version, the binary was built from uncommitted changes.

The server probe uses the unauthenticated `HealthService.GetServerVersion` RPC (added in v0.0.1-dev.38) so it works before `rune login`. Against older servers, or without a configured context, you'll see a one-line note instead of the `Server:` block; use `--client` to skip the probe entirely.

## Combining

A tiny on-call dashboard:

```sh
watch -n 5 'rune whoami && echo && rune status'
```
