---
title: Instances
description: Instances are running copies of a service. They're the unit you logs, exec, and probe against.
---

An **instance** is a single running copy of a service. If you have `scale: 3`, you have 3 instances. They're created and destroyed by the reconciler — you never create one directly.

## Identity

Each instance has:

- A stable **ID** like `api-instance-7c2e8a3b`.
- A reference back to its **service** and **generation**.
- A **runner type** (`docker` or `process`).
- A **state** (`Pending`, `Starting`, `Running`, `Unhealthy`, `Stopping`, `Stopped`, `Failed`).
- The **node** it's running on (single-node today; multi-node tomorrow).

```sh
rune get instances
rune get instance api-instance-7c2e8a3b -o yaml
```

## Lifecycle

```
Pending → Starting → Running ──┬──▶ Unhealthy → Stopping → Stopped
                               │
                               └──▶ Stopping → Stopped
                                                   │
                                                   └─▶ (replaced if scale unchanged)
```

The reconciler will replace failing instances automatically. Permanent failures (e.g., image pull errors that don't resolve) bubble up to the service status.

## Operations on instances

| Action  | Command                                       |
| ------- | --------------------------------------------- |
| Logs    | `rune logs <instance-id>`                     |
| Exec    | `rune exec <instance-id> bash`                |
| Health  | `rune health instance <instance-id> --checks` |
| Inspect | `rune get instance <instance-id> -o yaml`     |
| Kill    | `rune delete instance <instance-id>`          |

Killing an instance returns it to the reconciler, which replaces it. Don't use that as "scale up" — use `rune scale`.

## Instance vs. service in commands

Most commands accept either a service name or an instance ID. Some, like `exec`, attach to a specific instance — if you pass a service name, Rune picks one for you.

```sh
rune exec api bash             # picks any healthy instance of 'api'
rune exec api-instance-7c2e bash   # specific instance
```

## Per-instance state

Each instance carries:

- `Conditions[]` — point-in-time check results (Ready, Healthy, ImagePulled, etc.).
- `Restarts` — how many times the runner has restarted it.
- `LastFailureMessage` — last error from the runner.
- `StartedAt` / `FinishedAt`.

Use `rune get instance <id> -o yaml` to read all of it. The most useful field for debugging is `LastFailureMessage`.
