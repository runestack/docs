---
title: rune restart / stop
description: Bounce a service or stop it without deleting the spec.
---

## `rune restart`

Scales the service to 0, waits, then scales back to its previous scale.

```sh
rune restart api
rune restart api --no-wait
rune restart api --timeout=15m
```

| Flag              | Default     | Notes                                  |
| ----------------- | ----------- | -------------------------------------- |
| `-n, --namespace` | from context | Service namespace.                     |
| `--wait`          | `true`      | Block until restart completes.         |
| `--no-wait`       | false       | Detach.                                |
| `--timeout`       | `10m`       | Wait timeout.                          |

Use after rotating a secret, updating a configmap, or anything else that requires a fresh process. Mounted secrets/configs do not hot-reload.

## `rune stop`

Scales to 0 but keeps the spec. Restore later with `rune scale <name> N` or `rune cast`.

```sh
rune stop api
rune stop api --no-wait
```

| Flag              | Default     | Notes                              |
| ----------------- | ----------- | ---------------------------------- |
| `-n, --namespace` | from context | Service namespace.                 |
| `--wait`          | `true`      | Block until fully stopped.         |
| `--no-wait`       | false       | Detach.                            |
| `--timeout`       | `5m`        | Wait timeout.                      |

To remove the spec entirely, use [`rune delete`](/cli/delete/).

## See also

- [Scale & restart](/guides/scale-restart/)
- [`rune scale`](/cli/scale/)
