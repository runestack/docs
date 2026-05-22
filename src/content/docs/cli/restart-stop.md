---
title: rune restart / stop
description: Bounce a service or stop it without deleting the spec.
---

## `rune restart`

Scales the service to 0, waits for the drain to complete, then scales back to its previous scale. By default, prints a TTY-aware progress view with two phases (Draining → Starting) and a final cumulative duration. In non-TTY contexts (CI, redirected output), one line is printed per state transition with no duplicates.

```sh
rune restart api
rune restart api -d            # detach — exit after the request is sent
rune restart api --timeout=15m
```

| Flag              | Default      | Notes                                                       |
| ----------------- | ------------ | ----------------------------------------------------------- |
| `-n, --namespace` | from context | Service namespace.                                          |
| `-d, --detach`    | `false`      | Don't wait for the restart to complete (fire-and-forget).   |
| `--timeout`       | `10m`        | Wait timeout per phase (ignored with `-d`).                 |

Use after rotating a secret, updating a configmap, or anything else that requires a fresh process. Mounted secrets/configs do not hot-reload.

## `rune stop`

Scales to 0 but keeps the spec. Restore later with `rune scale <name> N` or `rune cast`.

```sh
rune stop api
rune stop api -d   # detach
```

| Flag              | Default      | Notes                                                |
| ----------------- | ------------ | ---------------------------------------------------- |
| `-n, --namespace` | from context | Service namespace.                                   |
| `-d, --detach`    | `false`      | Don't wait for the service to fully stop.            |
| `--timeout`       | `5m`         | Wait timeout (ignored with `-d`).                    |

To remove the spec entirely, use [`rune delete`](/cli/delete/).

## See also

- [Scale & restart](/guides/scale-restart/)
- [`rune scale`](/cli/scale/)
