---
title: Use secrets & configmaps
description: Mount sensitive credentials and non-sensitive config into a service, two different ways.
---

You usually need both. Database passwords go in a secret. Log levels and feature flags go in a configmap. Both mount into the same service.

## 1. Create the data

```sh
rune create secret db-credentials \
  --from-literal=username=appuser \
  --from-literal=password=s3cret

rune create config app-settings \
  --from-literal=log-level=info \
  --from-literal=feature-x=enabled
```

Or via YAML:

```yaml
secrets:
  - name: db-credentials
    namespace: default
    data:
      - { key: username, value: appuser }
      - { key: password, value: s3cret }

configmaps:
  - name: app-settings
    namespace: default
    data:
      - { key: log-level, value: info }
      - { key: feature-x, value: enabled }
```

```sh
rune cast data.yaml
```

## 2. Mount as files

```yaml
service:
  name: api
  image: ghcr.io/example/api:1.0.0
  scale: 1

  secretMounts:
    - name: db-secret
      secretName: db-credentials
      mountPath: /etc/secrets/db

  configMounts:
    - name: app-config
      configName: app-settings
      mountPath: /etc/config
```

Inside the container:

```
/etc/secrets/db/username   → appuser
/etc/secrets/db/password   → s3cret
/etc/config/log-level      → info
/etc/config/feature-x      → enabled
```

## 3. Or mount as environment variables

```yaml
service:
  name: api
  image: ghcr.io/example/api:1.0.0
  scale: 1

  envFrom:
    - secretRef: db-credentials
    - configRef: app-settings

  env:
    LOG_FORMAT: json   # explicit env still works alongside
```

The container sees:

```
USERNAME=appuser
PASSWORD=s3cret
LOG_LEVEL=info
FEATURE_X=enabled
LOG_FORMAT=json
```

## 4. Update a value

```sh
rune create config app-settings \
  --from-literal=log-level=debug \
  --from-literal=feature-x=enabled \
  --replace
```

The configmap version increments. **Mounted values do not hot-reload** — restart the service to pick up the new value:

```sh
rune restart api
```

## 5. Inspect — but secrets stay opaque

```sh
rune get configs
rune get config app-settings -o yaml          # values visible

rune get secrets
rune get secret db-credentials -o yaml        # values NOT printed
```

There's no API to read secret plaintext from outside. The only path is to mount it into a service and read it from inside the container.

## 6. Delete

```sh
rune delete config app-settings
rune delete secret db-credentials
```

If a service still references the resource, deletion will refuse unless you pass `--force`.

## Common mistakes

- **Forgetting to restart** after updating a mounted secret/config. Files don't hot-reload.
- **Putting credentials in a configmap.** Configmaps are plaintext. Use a secret.
- **Cross-namespace mounts.** Not supported — the service and the secret must share a namespace.
- **DNS-1123 names.** Names must be lowercase alphanumeric + dashes, starting and ending with alphanumeric.

## See also

- [Secrets & ConfigMaps concept](/concepts/secrets-configmaps/) — encryption details.
- [Security hardening](/operations/security/) — KEK rotation.
