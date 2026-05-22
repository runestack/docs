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

A namespace summary — what's running, what's degraded, what's in flight.

```sh
rune status
rune status -n prod
```

```
Services in default:
NAME     STATUS     SCALE
api      Running    3/3
worker   Running    5/5
echo     Failed     1/0
```

The `SCALE` column reads `desired/ready`, so transitions are visible at
a glance:

| State                       | Status      | Scale | Meaning                                            |
| --------------------------- | ----------- | ----- | -------------------------------------------------- |
| Steady                      | `Running`   | `1/1` | Converged.                                         |
| Drain in flight (`stop`)    | `Stopping`  | `0/1` | Asked to scale to 0; old instance still draining.  |
| Drain done                  | `Pending`   | `0/0` | No instances; service spec still present.          |
| Start / restart in flight   | `Deploying` | `1/0` | New instance booting; not yet ready.               |
| Healthy after start         | `Running`   | `1/1` |                                                    |
| Probe / image / OOM failure | `Failed`    | `1/0` | See `rune get service <name>` for `statusReason`.  |

`Stopping` is set whenever the desired scale is below the current instance count — both during `rune stop` and the drain phase of `rune restart`. Useful as a health check from a dashboard or shell prompt.

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
