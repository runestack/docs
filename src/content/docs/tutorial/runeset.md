---
title: "Part 3 — Author your runeset"
description: Write the multi-service runeset that deploys your app — one reusable cast template, per-environment values, plus configmaps and secrets.
---

A runeset bundles every service, configmap, and secret your app needs into one directory that `rune cast` applies as a unit. We'll build the structure from [part 1](/tutorial/layout/):

```
infra/runeset/
├── runeset.yaml
├── casts/
│   └── web.yaml
├── values/
│   ├── dev.yaml
│   └── prod.yaml
├── configs.example.yaml
└── secrets.example.yaml
```

For the deep-dive on runesets see [Concepts → Runesets](/concepts/runesets/) and [Package a runeset](/guides/runesets/). This page is the practical recipe.

## 1. Top-level metadata — `runeset.yaml`

```yaml
name: myapp
version: "0.1.0"
description: "Myapp — public web + API"
namespace: "{{ values:namespace:myapp }}"
```

`namespace` is templated so dev/prod can land in different namespaces from the same files.

## 2. A reusable service cast — `casts/web.yaml`

One cast that any HTTP service in your project can reuse. Every knob comes from values:

```yaml
service:
  name: "{{ values:component.name }}"
  image: "{{ values:registry }}/{{ values:component.name }}:{{ values:app.tag }}"
  imagePull: always
  scale: {{ values:component.scale }}

  ports:
    - name: http
      port: {{ values:component.port }}

  expose:
    host: "{{ values:component.host }}"
    port: http
    tls: {{ values:component.tls }}

  env: {{ values:component.env }}
  envFrom: {{ values:component.envFrom }}
  dependencies: {{ values:component.dependencies }}

  health:
    liveness:
      type: http
      path: "{{ values:component.healthPath }}"
      port: {{ values:component.port }}
      intervalSeconds: 10
      timeoutSeconds: 3

  resources:
    cpu:
      request: "{{ values:component.cpuRequest }}"
      limit:   "{{ values:component.cpuLimit }}"
    memory:
      request: "{{ values:component.memRequest }}"
      limit:   "{{ values:component.memLimit }}"
```

The pattern — one generic cast plus per-component blocks in values — scales to ten components without ten copies of YAML. CI lifts `values.<component>.component` into the top-level `component:` namespace before rendering (we'll see this in [part 4](/tutorial/ci-cd/)).

## 3. Per-environment values

### `values/dev.yaml`

```yaml
app:
  env: dev
  tag: dev

registry: ghcr.io/your-org/myapp

web:
  component:
    name: web
    host: dev.example.com
    scale: 1
    port: 3000
    healthPath: /healthz
    tls: { mode: auto }
    env: { NODE_ENV: production }
    envFrom: []
    dependencies: []
    cpuRequest: "50m"
    cpuLimit:   "500m"
    memRequest: "64Mi"
    memLimit:   "256Mi"
```

### `values/prod.yaml`

Same shape, real domain and bigger limits:

```yaml
app:
  env: prod
  tag: ""        # set per release by CI (sha-<short> or v0.1.0)

registry: ghcr.io/your-org/myapp

web:
  component:
    name: web
    host: example.com
    scale: 2
    port: 3000
    healthPath: /healthz
    tls: { mode: auto }
    env: { NODE_ENV: production }
    envFrom:
      - secretRef:    web-env
      - configRef:    web-config
    dependencies: []
    cpuRequest: "100m"
    cpuLimit:   "1000m"
    memRequest: "128Mi"
    memLimit:   "512Mi"
```

`envFrom` references the configmap + secret we create next.

## 4. Configmaps — `configs.example.yaml`

Non-secret configuration that lives in git as documentation. Apply your real version once per env.

```yaml
configmaps:
  - name: web-config
    namespace: myapp
    data:
      - { key: NODE_ENV,   value: production }
      - { key: LOG_LEVEL,  value: info }
      - { key: API_URL,    value: "https://api.example.com" }
```

Apply:

```sh
rune cast infra/runeset/configs.example.yaml
```

## 5. Secrets — `secrets.example.yaml`

This file documents the **schema only**. Real values land in your secret store and never in git.

```yaml
secrets:
  - name: web-env
    namespace: myapp
    data:
      - { key: DATABASE_URL,   value: "<postgres-uri>" }
      - { key: SESSION_SECRET, value: "<random-32-byte-base64>" }
      - { key: SENTRY_DSN,     value: "<sentry-dsn>" }
```

Materialise real values via the CLI (preferred — never touches disk):

```sh
rune create secret web-env \
  --from-literal=DATABASE_URL="postgres://..." \
  --from-literal=SESSION_SECRET="$(openssl rand -base64 32)" \
  --from-literal=SENTRY_DSN="https://..."
```

Once created, secrets are encrypted at rest in `runed`'s BadgerDB. There is no read-API — the only way to consume them is via `envFrom: [{ secretRef: web-env }]` in your cast. Updating a secret requires a service restart:

```sh
rune create secret web-env --from-literal=DATABASE_URL='...' --replace
rune restart web
```

See [Secrets & ConfigMaps](/guides/secrets-configmaps/) for the full model.

## 6. First cast, from your laptop

You can deploy now — even before CI is wired up — to prove the runeset works end-to-end.

```sh
# One-time per env: configs + secrets
rune cast infra/runeset/configs.example.yaml -n dev --create-namespace
rune create secret web-env --from-literal=DATABASE_URL=... -n dev

# Service rollout
rune cast infra/runeset/casts/web.yaml \
  --values infra/runeset/values/dev.yaml \
  -n dev
```

Verify:

```sh
rune get services -n dev
rune logs web -n dev --tail 50
rune health web -n dev --checks
```

If `tls.mode: auto` and DNS points at the Reserved IP from [part 2](/tutorial/terraform/), your service should be reachable at `https://dev.example.com` within a few minutes of the cert being issued. Walk through [Expose a service](/guides/expose-service/) if anything looks stuck.

## What the runeset gives you

| File | Lives in git? | Purpose |
|------|---------------|---------|
| `runeset.yaml` | Yes | Bundle metadata. |
| `casts/web.yaml` | Yes | Service template. One file per component shape. |
| `values/dev.yaml`, `values/prod.yaml` | Yes | Per-env knobs. No secrets. |
| `configs.example.yaml` | Yes | Documents non-secret config keys. |
| `secrets.example.yaml` | Yes | Documents secret keys (no values). |
| Real `web-env` secret | **No** | Created via `rune create secret`. |

---

**Next:** [Part 4 — Wire up CI/CD →](/tutorial/ci-cd/) · **Back:** [Part 2 — Terraform](/tutorial/terraform/)
