---
title: Secrets & ConfigMaps
description: How Rune stores configuration data — encrypted secrets and plaintext configmaps — and how services consume them.
---

Both **secrets** and **configmaps** are namespaced key-value resources you mount into services. They differ in one important way: **secrets are encrypted at rest**.

## Secrets

A secret holds sensitive material — API keys, tokens, certificates, passwords.

```yaml
secrets:
  - name: db-credentials
    namespace: default
    data:
      - key: username
        value: admin
      - key: password
        value: hunter2
```

Apply with `rune cast`. Or imperatively:

```sh
rune create secret db-credentials \
  --from-literal=username=admin \
  --from-literal=password=hunter2

rune create secret tls-cert \
  --from-file=tls.crt=./certs/server.crt \
  --from-file=tls.key=./certs/server.key
```

### How secrets are encrypted

Rune uses **envelope encryption**:

```
plaintext  ──▶  AES-256-GCM (DEK)  ──▶  ciphertext  ─┐
                                                     │  stored together
DEK        ──▶  AES-256-GCM (KEK)  ──▶  wrapped DEK ─┘
```

- A 32-byte **KEK** (Key Encryption Key) is loaded once on server start from a file, env var, or generated and persisted with mode `0600`.
- A fresh **DEK** (Data Encryption Key) is generated for every secret version.
- Associated data binds the ciphertext to `(namespace, name, version)` — moving bytes around the database breaks decryption.

Consequence: lose the KEK, lose every secret. **Back it up.**

See [Security hardening](/operations/security/) for KEK rotation guidance.

## ConfigMaps

ConfigMaps are the same shape as secrets — namespaced key-value pairs — but stored in plaintext. Use them for non-sensitive config (log levels, feature flags, service URLs).

```yaml
configmaps:
  - name: app-settings
    namespace: default
    data:
      - key: log-level
        value: info
      - key: feature-x
        value: enabled
```

```sh
rune create config app-settings \
  --from-literal=log-level=info \
  --from-file=app.toml=./config/app.toml
```

## Consuming from a service

### Mount as files

```yaml
service:
  name: api
  image: ghcr.io/example/api:1.0.0
  secretMounts:
    - name: db-secret
      secretName: db-credentials
      mountPath: /etc/secrets/db
  configMounts:
    - name: app-config
      configName: app-settings
      mountPath: /etc/config
```

Each key becomes a file: `/etc/secrets/db/username`, `/etc/config/log-level`, etc.

### Mount as environment variables

```yaml
service:
  name: api
  image: ghcr.io/example/api:1.0.0
  envFrom:
    - secretRef: db-credentials
    - configRef: app-settings
  env:
    LOG_FORMAT: json   # plain env vars still work alongside
```

Each key becomes an env var. Conflicts: explicit `env:` wins over `envFrom:`.

## Updating values

Re-apply with `rune cast`. The secret/configmap version increments. Services that mount it pick up the new value on the **next instance restart** — Rune does not hot-reload mounted files.

To roll services after a config change:

```sh
rune restart api
```

## Listing and inspecting

```sh
rune get secrets
rune get secret db-credentials -o yaml   # values are NOT printed
rune get configs
rune get config app-settings -o yaml
```

For secrets, only metadata comes back. There's no API to read plaintext — the only way out is to mount it into a service.

## Naming and limits

- Names must match DNS-1123 (`[a-z0-9]([-a-z0-9]*[a-z0-9])?`).
- Per-secret data limits are enforced server-side (configurable in the runefile).
- Total number of versions kept per secret is also configurable — older versions are garbage-collected.
