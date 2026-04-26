---
title: Service spec
description: The complete YAML schema for a Rune service, with every field documented and examples.
---

A service spec is a YAML document with a top-level `service:` key. Multiple services (and secrets, configmaps, namespaces) can share a single file via `---` separators or by repeating the top-level keys.

## Minimal example

```yaml
service:
  name: echo
  image: busybox
  scale: 1
  command: "/bin/sh"
  args: ["-c", "echo hello && sleep 60"]
```

## Full example

```yaml
service:
  name: api
  namespace: default
  image: ghcr.io/example/api:1.4.0
  scale: 3
  labels:
    app: api
    tier: backend

  ports:
    - name: http
      port: 8080
      protocol: tcp

  env:
    LOG_LEVEL: info
    NODE_ENV: production

  envFrom:
    - secretRef: db-credentials
    - configRef: app-settings

  resources:
    cpu:
      request: 100m
      limit: 500m
    memory:
      request: 128Mi
      limit: 512Mi

  health:
    liveness:
      type: http
      path: /healthz
      port: 8080
      initialDelaySeconds: 5
      intervalSeconds: 10
      timeoutSeconds: 2
      failureThreshold: 3

  dependencies:
    - service: postgres
      readyWhen: healthy
    - service: redis
      readyWhen: running

  secretMounts:
    - name: db-secret
      secretName: db-credentials
      mountPath: /etc/secrets/db

  configMounts:
    - name: app-config
      configName: app-settings
      mountPath: /etc/config

  expose:
    port: http
    host: api.example.com

  discovery:
    mode: load-balanced
```

## Field reference

### Top level

| Field          | Type    | Required | Notes                                      |
| -------------- | ------- | -------- | ------------------------------------------ |
| `name`         | string  | yes      | DNS-1123. Unique within the namespace.     |
| `namespace`    | string  | no       | Default `default`.                         |
| `image`        | string  | conditional | Required for container services.        |
| `process`      | object  | conditional | Required for process services. See below.|
| `scale`        | int     | yes      | Desired replicas. `0` to stop.             |
| `labels`       | map     | no       | Free-form key/value labels.                |
| `command`      | string  | no       | Override container/process entrypoint.     |
| `args`         | []string | no      | Args to the command.                       |
| `ports`        | []object | no      | See below.                                 |
| `env`          | map     | no       | Plain environment variables.               |
| `envFrom`      | []object | no      | Pull env from a secret/config.             |
| `resources`    | object  | no       | CPU and memory requests/limits.            |
| `health`       | object  | no       | Liveness probes.                           |
| `dependencies` | []object | no      | Service dependencies.                      |
| `secretMounts` | []object | no       | File-mount secrets.                        |
| `configMounts` | []object | no       | File-mount configmaps.                     |
| `expose`       | object  | no       | Single-node host exposure.                 |
| `discovery`    | object  | no       | Internal service discovery.                |
| `affinity`     | object  | no       | Placement hints (multi-node, roadmap).     |
| `autoscale`    | object  | no       | Autoscaling (roadmap).                     |
| `networkPolicy`| object  | no       | Ingress/egress rules.                      |
| `securityContext` | object | no     | Container/process security.                |
| `skip`         | bool    | no       | Skip applying this doc (useful in batch).  |

### `process`

```yaml
process:
  command: /usr/local/bin/agent
  args: ["--config", "/etc/agent.toml"]
  workdir: /var/lib/agent
  securityContext:
    user: rune-agent
    group: rune-agent
    readOnlyFS: true
    capabilities: [NET_BIND_SERVICE]
```

| Field             | Type    | Notes                                         |
| ----------------- | ------- | --------------------------------------------- |
| `command`         | string  | Required. Absolute path on host.              |
| `args`            | []string| Optional.                                     |
| `workdir`         | string  | Working dir. Defaults to `/`.                 |
| `securityContext` | object  | See [Process runner](/guides/process-runner/). |

### `ports[]`

```yaml
ports:
  - name: http
    port: 8080
    protocol: tcp     # tcp (default) or udp
```

### `resources`

```yaml
resources:
  cpu:    { request: 100m,  limit: 500m }
  memory: { request: 128Mi, limit: 512Mi }
```

CPU is in milli-cores (`100m` = 0.1 core). Memory in Ki/Mi/Gi.

### `health.liveness`

```yaml
health:
  liveness:
    type: http              # or tcp
    path: /healthz          # http only
    port: 8080
    scheme: http            # http (default) or https; http only
    headers:                # http only
      X-Health-Check: rune
    initialDelaySeconds: 5
    intervalSeconds: 10
    timeoutSeconds: 2
    failureThreshold: 3
    successThreshold: 1
```

See [Health checks](/guides/health/).

### `dependencies[]`

```yaml
dependencies:
  - service: postgres
    namespace: default
    readyWhen: healthy        # running | healthy | started
    timeoutSeconds: 60
    optional: false
```

### `secretMounts[]` / `configMounts[]`

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

Each key in the secret/config becomes a file at `<mountPath>/<key>`.

### `envFrom[]`

```yaml
envFrom:
  - secretRef: db-credentials
  - configRef: app-settings
```

Each key becomes an env var. Keys conflicting with explicit `env:` lose.

### `expose`

```yaml
expose:
  port: http               # references ports[].name
  host: api.example.com    # optional virtual host
```

Single-node only today. Multi-node ingress is roadmap (RUNE-063).

### `discovery`

```yaml
discovery:
  mode: load-balanced       # round-robin | load-balanced | none
```

Affects how dependent services resolve this service.

### `networkPolicy`

```yaml
networkPolicy:
  ingress:
    - from:
        - namespace: default
          service: api
      ports: [http]
  egress:
    - to:
        - cidr: 0.0.0.0/0
      ports: [http]
```

Schema accepted; runtime enforcement is roadmap (RUNE-080).

### `affinity` / `autoscale`

Schemas exist; runtime support is roadmap. Don't rely on them in single-node deployments today.

## Validation

Run `rune lint` before applying — it catches schema errors, undefined references, and dependency cycles.

```sh
rune lint api.yaml
```

## See also

- [Services concept](/concepts/services/)
- [`rune cast`](/cli/cast/)
- [`rune lint`](/cli/lint/)
