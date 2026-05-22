---
title: rune scale
description: Change the desired replica count of a service.
---

```sh
rune scale <service-name> <replicas> [flags]
```

## Examples

```sh
rune scale my-service 3
rune scale my-service 5 --namespace=production
rune scale my-service 10 --mode=gradual --step=2 --interval=1m
rune scale my-service 0 -d         # detach (fire-and-forget)
```

## Flags

| Flag                  | Default      | Notes                                                                |
| --------------------- | ------------ | -------------------------------------------------------------------- |
| `-n, --namespace`     | from context | Service namespace.                                                   |
| `--mode`              | `immediate`  | `immediate` or `gradual`.                                            |
| `--step`              | `1`          | Gradual mode — instances per step.                                   |
| `--interval`          | `30s`        | Gradual mode — time between steps.                                   |
| `--rollback-on-fail`  | `true`       | Revert to prior scale if health checks fail.                         |
| `-d, --detach`        | `false`      | Don't wait for rollout — fire-and-forget (CI-friendly).              |
| `--timeout`           | `5m`         | Rollout timeout (ignored with `-d`).                                 |
| `--api-server`        | from context | One-off API server override.                                         |

## Behavior

- Setting `<replicas>` to `0` stops the service without deleting it. Same as `rune stop`.
- Gradual scale aborts on health failure and rolls back (unless you disabled rollback).
- The scale operation is idempotent — re-running with the same target is a no-op.

## See also

- [Scale & restart](/guides/scale-restart/)
- [`rune restart`](/cli/restart-stop/)
- [`rune stop`](/cli/restart-stop/)
