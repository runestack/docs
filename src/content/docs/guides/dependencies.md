---
title: Service dependencies
description: Declare that one service needs another. The reconciler waits for dependencies to be ready before rolling out.
---

Services rarely run alone. An API needs a database. A worker needs a queue. Rune lets you express that as data, not bash.

## Declare a dependency

```yaml
service:
  name: api
  image: ghcr.io/example/api:1.0.0
  scale: 2

  dependencies:
    - service: postgres
      readyWhen: healthy
    - service: redis
      readyWhen: running
    - service: auth
      namespace: shared
      readyWhen: healthy
      timeoutSeconds: 60
```

| Field             | Notes                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| `service`         | The name of the dependency.                                             |
| `namespace`       | Optional. Defaults to the dependent's namespace.                        |
| `readyWhen`       | `running`, `healthy` (probes pass), or `started` (process up).          |
| `timeoutSeconds`  | How long to wait before declaring the dependency unsatisfied.           |
| `optional`        | If true, the dependent rolls out even if the dependency isn't ready.    |

## What it does

On rollout (cast or scale), the reconciler:

1. Resolves the dependency graph.
2. Waits for each dependency to reach `readyWhen` (with the configured timeout).
3. Starts the dependent service only after all required dependencies are satisfied.

If a dependency cycle exists, `rune cast` rejects the spec.

## Inspecting

```sh
rune deps graph api
```

Renders the dependency graph for `api`, including transitive deps.

```sh
rune deps check api
```

Reports current readiness status of each dependency.

```sh
rune deps validate api
```

Validates the dependency definitions in the spec without applying.

```sh
rune deps dependents postgres
```

Lists services that depend on `postgres`. Useful before deleting a database.

## Updates

When a dependency restarts, dependents are not automatically restarted. Most services tolerate transient dependency blips and reconnect on their own. If yours doesn't, you have two options:

1. **Fix the service** to reconnect (preferred).
2. **Cascade restart manually**: `rune restart api` after a `rune restart postgres`.

## Optional dependencies

```yaml
dependencies:
  - service: optional-cache
    readyWhen: running
    optional: true
```

The dependent rolls out even if `optional-cache` is missing or failing. Useful for graceful degradation.

## Anti-patterns

- **Deep dependency chains.** A → B → C → D → E means a single slow service stalls the whole stack. Try to keep depth ≤ 2.
- **Circular dependencies.** Rejected by the linter. If you think you need one, you don't — invert the dependency or split a service.
- **Using deps for ordering only.** If service B doesn't actually need A to be healthy, leave the dependency off. Rune will start them in parallel — usually faster.
