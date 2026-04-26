---
title: Package a runeset
description: Bundle multiple services + secrets + configmaps into a single, templated, versioned package.
---

A runeset is to Rune what a chart is to Helm — but smaller, opinionated, and built into the CLI. Reach for one when "deploy my app" means more than one resource.

## When to use a runeset

| Situation                                         | Use a runeset? |
| ------------------------------------------------- | -------------- |
| One service, one YAML.                            | No.            |
| One service + one configmap + one secret.         | Probably no.   |
| API + worker + scheduler + secrets + configs.     | Yes.           |
| Multi-environment (dev / staging / prod values).  | Yes.           |
| You want a shareable artifact with a version.     | Yes.           |

## Layout

```
my-app/
├── runeset.yaml
├── values.yaml
├── templates/
│   ├── api.yaml.tmpl
│   ├── worker.yaml.tmpl
│   ├── secrets.yaml.tmpl
│   └── configs.yaml.tmpl
└── README.md
```

### `runeset.yaml`

```yaml
name: my-app
version: 1.2.0
description: API + worker + redis
maintainers:
  - alice@example.com
values:
  - name: image.tag
    type: string
    default: "1.2.0"
  - name: api.replicas
    type: int
    default: 2
  - name: worker.replicas
    type: int
    default: 4
  - name: redis.password
    type: string
    sensitive: true
```

### `values.yaml`

```yaml
image:
  tag: "1.2.0"
api:
  replicas: 2
worker:
  replicas: 4
redis:
  password: ""    # required at install time
```

### A template

`templates/api.yaml.tmpl`:

```yaml
service:
  name: api
  namespace: {{ .Release.Namespace }}
  image: ghcr.io/example/api:{{ .Values.image.tag }}
  scale: {{ .Values.api.replicas }}
  ports:
    - { name: http, port: 8080 }
  envFrom:
    - secretRef: {{ .Release.Name }}-secrets
  health:
    liveness:
      type: http
      path: /healthz
      port: 8080
```

Available template values:

| Name                  | What it is                                  |
| --------------------- | ------------------------------------------- |
| `.Values.*`           | Merged values (defaults + files + `--set`). |
| `.Release.Name`       | Set via `--release` at install time.        |
| `.Release.Namespace`  | Target namespace (default: `default`).      |
| `.Runeset.Name`       | The runeset's name from `runeset.yaml`.     |
| `.Runeset.Version`    | The runeset's version.                      |

## Render — see what you'll deploy

```sh
rune cast ./my-app --render
```

```sh
rune cast ./my-app --render \
  --set=image.tag=1.3.0 \
  --set=api.replicas=5 \
  --values=production.values.yaml
```

`--render` prints the final YAML and exits without applying — your "diff before deploy" loop.

## Install

```sh
rune cast ./my-app \
  --release=my-app-prod \
  --namespace=prod \
  --create-namespace \
  --values=production.values.yaml
```

`--release` is the install identity. Re-running with the same release upgrades in place. Different release names give you parallel installs (e.g., `my-app-prod` and `my-app-staging`).

## Package and distribute

```sh
rune pack ./my-app -o my-app-1.2.0.runeset.tgz --sha256
```

Outputs:

- `my-app-1.2.0.runeset.tgz`
- `my-app-1.2.0.runeset.tgz.sha256`

Install from any location Rune can fetch:

```sh
# HTTPS
rune cast https://example.com/my-app-1.2.0.runeset.tgz \
  --release=my-app-prod

# Local archive
rune cast ./my-app-1.2.0.runeset.tgz --release=my-app-prod

# Git
rune cast github.com/example/my-app@v1.2.0 --release=my-app-prod
```

## Values precedence

Highest wins:

1. `--set key=value` — CLI flags.
2. `--values file.yaml` — extra files (later files override earlier).
3. `values.yaml` — bundled defaults.

## Patterns

### Secrets in templates

```yaml
# templates/secrets.yaml.tmpl
secrets:
  - name: {{ .Release.Name }}-secrets
    namespace: {{ .Release.Namespace }}
    data:
      - { key: redis_password, value: {{ .Values.redis.password | quote }} }
```

Pass the password at install time:

```sh
rune cast ./my-app \
  --release=my-app-prod \
  --set=redis.password=$REDIS_PASSWORD
```

Or keep a separate untracked file:

```sh
rune cast ./my-app --values=secrets.local.yaml --release=my-app-prod
```

### Per-environment values files

```
my-app/
├── runeset.yaml
├── values.yaml             # defaults
└── envs/
    ├── dev.yaml
    ├── staging.yaml
    └── prod.yaml
```

```sh
rune cast ./my-app --values=envs/prod.yaml --release=my-app-prod
```

## Anti-patterns

- **Templating everything.** If a value never changes, hardcode it. Less surface area.
- **Cross-runeset references.** A runeset shouldn't reach into another runeset's resources by name. Use stable namespace conventions and standalone resources for shared state.
- **Big monolithic runesets.** If your runeset has 30 services across 5 teams, split it.
