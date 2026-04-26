---
title: Scale & restart
description: Change replica counts, do gradual rollouts, restart safely, and roll back on failure.
---

Three commands cover most lifecycle work: `scale`, `restart`, `stop`. They wrap the same underlying reconciler, so they're safe to chain.

## Immediate scale

```sh
rune scale api 5
```

The reconciler creates or destroys instances until 5 are running and healthy. The CLI blocks until rollout completes (or the timeout — `--timeout=5m` by default).

Don't wait:

```sh
rune scale api 5 --no-wait
```

## Gradual scale

When ramping a stateful or memory-hungry service, step up:

```sh
rune scale api 10 --mode=gradual --step=2 --interval=30s
```

This adds 2 instances every 30 seconds until you hit 10. If any step fails health checks, the operation aborts.

| Flag                | Default     | Notes                                       |
| ------------------- | ----------- | ------------------------------------------- |
| `--mode`            | `immediate` | `immediate` or `gradual`.                   |
| `--step`            | `1`         | Instances added/removed per step.           |
| `--interval`        | `30s`       | Time between steps.                         |
| `--rollback-on-fail`| `true`      | Revert to previous scale on health failure. |

## Restart

`restart` scales to 0 then back to the previous scale:

```sh
rune restart api
```

Use it after editing a configmap or rotating a secret — mounted files don't hot-reload, but a restart picks them up.

For zero-downtime rolling restarts, use a runeset upgrade with rolling update settings (Release 2 — not yet available; for now, restart is a stop-the-world operation per service).

## Stop

```sh
rune stop api
```

Stops without deleting — desired scale becomes 0, the spec stays. Bring it back with `rune scale api N` or another `cast`.

## Failure handling

By default, scale operations roll back on health failure. To pin the new scale even if some instances fail to come up:

```sh
rune scale api 10 --rollback-on-fail=false
```

Use this only when you know the service is fine and you'd rather see partial progress than revert.

## Inspecting a scale operation

```sh
rune get service api -o yaml | grep -A5 status
```

Status fields you'll see during a scale:

- `desiredReplicas` — what you asked for.
- `readyReplicas` — instances passing readiness.
- `currentReplicas` — instances that exist (may not be ready).
- `lastScaleAt`, `lastScaleReason`.

## Common patterns

```sh
# Drain a service for maintenance
rune stop api

# Bring it back to 3
rune scale api 3

# Restart after rotating a secret
rune restart api

# Slow ramp of a worker pool
rune scale workers 50 --mode=gradual --step=5 --interval=1m
```

## Anti-patterns

- **Scaling instead of restarting.** `rune scale api 0 && rune scale api 3` works but is awkward — use `rune restart api`.
- **Forgetting `--no-wait` in CI scripts** when you don't actually want to block.
- **Setting `--rollback-on-fail=false` by default** to "make scaling faster." If health is flapping, you want the rollback. Fix the probes.
