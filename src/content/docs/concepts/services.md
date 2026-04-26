---
title: Services
description: A service is the unit of deployment in Rune — a versioned, reconciled, scaled workload.
---

A **service** is the central abstraction in Rune. It's a declaration of what you want running: which image (or process), how many copies, with what config, behind what health checks.

## The shape of a service

```yaml
service:
  name: api
  namespace: default
  image: ghcr.io/example/api:1.4.0
  scale: 3
  ports:
    - name: http
      port: 8080
  env:
    LOG_LEVEL: info
  resources:
    cpu:    { request: 100m, limit: 500m }
    memory: { request: 128Mi, limit: 512Mi }
  health:
    liveness: { type: http, path: /healthz, port: 8080, intervalSeconds: 10 }
```

You apply it with [`rune cast`](/cli/cast/), and `runed` keeps it running.

## Lifecycle

```
   [user: rune cast]                [orchestrator]
        │                                │
        ▼                                │
   ┌──────────┐  desired         ┌──────────────┐  reconcile  ┌──────────────┐
   │  Service │ ───────────────▶ │  Reconciler  │ ──────────▶ │  Instances   │
   └──────────┘                  └──────────────┘             └──────┬───────┘
        ▲                                │                            │
        │ status                         │ probes                     ▼
        └────────────────────────────────┴───────────────────── [Runner: Docker/Process]
```

A service has a **generation** — every accepted spec change increments it. The orchestrator's job is to make actual instance state match the latest generation.

## Container vs. process

Rune supports two runner types per service. They share the same outer schema:

```yaml
# Container service
service:
  name: api
  image: nginx:alpine

# Process service
service:
  name: agent
  process:
    command: /usr/local/bin/agent
    args: ["--config", "/etc/agent.toml"]
    workdir: /var/lib/agent
```

The Docker runner pulls the image and manages container lifecycle. The process runner forks/execs and tracks the PID. Most commands (`logs`, `exec`, `scale`, `restart`) work uniformly across both.

## Scale

`scale: N` means "I want N instances running and healthy." Set it via the spec, or imperatively:

```sh
rune scale api 5
rune scale api 0     # stop without deleting
rune restart api      # scale to 0 then back
```

Gradual scale-up is supported:

```sh
rune scale api 10 --mode=gradual --step=2 --interval=30s
```

Read [Scale & restart](/guides/scale-restart/) for the full mode matrix.

## Health checks

Services declare probes. The health controller runs them on a schedule and feeds results into the reconciler — failing instances get killed and replaced.

```yaml
health:
  liveness:
    type: http
    path: /healthz
    port: 8080
    initialDelaySeconds: 5
    intervalSeconds: 10
    timeoutSeconds: 2
    failureThreshold: 3
```

Supported types: `http`, `tcp`. Read [Health checks](/guides/health/) for examples.

## Dependencies

A service can declare other services it depends on. The reconciler waits until each dependency is ready before rolling out:

```yaml
service:
  name: api
  dependencies:
    - name: postgres
      readyWhen: healthy
    - name: redis
      readyWhen: running
```

Inspect with [`rune deps`](/cli/deps/).

## External exposure (`expose`)

For single-node setups, `expose` makes a service reachable on the host:

```yaml
expose:
  port: http       # references ports[].name
  host: api.local  # optional virtual host
```

Multi-node ingress is roadmap (RUNE-063).

## Secrets and configmaps

Services mount secrets and configmaps as files (or environment variables). See [Secrets & ConfigMaps](/concepts/secrets-configmaps/).

```yaml
secretMounts:
  - name: db-secret
    secretName: db-credentials
    mountPath: /etc/secrets/db

configMounts:
  - name: app-config
    configName: app-settings
    mountPath: /etc/config
```

## Service status

```sh
rune get services
```

```
NAME  TYPE       STATUS   INSTANCES  EXTERNAL  GENERATION  AGE
api   container  Running  3/3        api.local 4           2d
```

Status values you'll see:

| Status      | Meaning                                                  |
| ----------- | -------------------------------------------------------- |
| `Pending`   | Spec accepted, instances not yet created.                |
| `Running`   | At least one instance ready, matches desired scale.      |
| `Degraded`  | Fewer ready instances than desired.                      |
| `Failed`    | All instances are failing or runner errors are blocking. |
| `Stopped`   | `scale: 0`.                                              |
| `Deleting`  | Deletion in progress.                                    |

## Full reference

[Service spec](/reference/service-spec/) documents every field.
