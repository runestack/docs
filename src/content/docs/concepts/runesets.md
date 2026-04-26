---
title: Runesets
description: Runesets package multi-service applications with templating and values, like a small, opinionated Helm.
---

A **runeset** is a directory (or `.runeset.tgz` archive) that bundles several Rune resources behind a single template + values surface. Use them when one application is actually 3–10 services, secrets, and configmaps that ship together.

## Anatomy

```
my-app/
├── runeset.yaml          # metadata + value schema
├── values.yaml           # default values
├── templates/
│   ├── api.yaml.tmpl
│   ├── worker.yaml.tmpl
│   └── secrets.yaml.tmpl
└── README.md
```

`runeset.yaml`:

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
```

A template (`templates/api.yaml.tmpl`):

```yaml
service:
  name: api
  namespace: {{ .Release.Namespace }}
  image: ghcr.io/example/api:{{ .Values.image.tag }}
  scale: {{ .Values.api.replicas }}
```

## Render before applying

Inspect what will be created:

```sh
rune cast ./my-app --render
rune cast ./my-app --render --set=image.tag=1.3.0
rune cast ./my-app --render --values=production.values.yaml
```

## Install

```sh
rune cast ./my-app --release=my-app-prod --values=production.values.yaml
```

`--release` becomes the runeset's identity in the cluster. Re-running `cast` with the same release upgrades in place.

## Package and distribute

```sh
rune pack ./my-app -o my-app-1.2.0.runeset.tgz --sha256
```

Produces:

- `my-app-1.2.0.runeset.tgz` — the bundle.
- `my-app-1.2.0.runeset.tgz.sha256` — checksum for verification.

Install from a URL or local archive:

```sh
rune cast https://example.com/my-app-1.2.0.runeset.tgz --release=my-app-prod
rune cast ./my-app-1.2.0.runeset.tgz --release=my-app-prod
```

Also supports git refs:

```sh
rune cast github.com/example/my-app@v1.2.0 --release=my-app-prod
```

## Values precedence

Highest wins:

1. `--set key=value` (CLI flags)
2. `--values file.yaml` (extra files, last one wins)
3. `values.yaml` inside the runeset (defaults)

## Worked example

[`examples/runesets`](https://github.com/runestack/rune/tree/master/examples/runesets) in the source tree has a working multi-service runeset you can study.

For a step-by-step walkthrough see [Package a runeset](/guides/runesets/).
