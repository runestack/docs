---
title: Runefile (server config)
description: The schema for runed's server configuration file.
---

`runed` is configured via a YAML file (often called a "runefile"). The default location is `/etc/rune/runefile.yaml`. Override with `runed --config <path>`.

## Minimal example

```yaml
server:
  grpc-addr: ":7863"
  http-addr: ":7861"
  data-dir: /var/lib/rune

auth:
  enabled: true
```

## Full example

```yaml
server:
  grpc-addr: ":7863"
  http-addr: ":7861"
  data-dir: /var/lib/rune
  log-level: info
  log-format: json

auth:
  enabled: true
  allow_remote_admin: false
  tls:
    enabled: true
    cert-file: /etc/rune/tls/server.crt
    key-file:  /etc/rune/tls/server.key

crypto:
  kek:
    source: file              # file | env | generated
    file-path: /var/lib/rune/kek
    env-var: RUNE_MASTER_KEY
    generate-if-missing: true

storage:
  secret-limits:
    max-keys-per-secret: 64
    max-value-size: 65536

runner:
  docker:
    enabled: true
    socket: /var/run/docker.sock
  process:
    enabled: true

registries:
  - name: ghcr-private
    server: ghcr.io
    username: bot
    password-file: /etc/rune/ghcr.token
  - name: ecr
    type: ecr
    region: us-east-1
```

## Sections

### `server`

| Field        | Default          | Notes                                       |
| ------------ | ---------------- | ------------------------------------------- |
| `grpc-addr`  | `:7863`          | gRPC listen address.                        |
| `http-addr`  | `:7861`          | REST gateway listen address.                |
| `data-dir`   | OS-specific      | BadgerDB + state. Persist across restarts.  |
| `log-level`  | `info`           | `debug`, `info`, `warn`, `error`.           |
| `log-format` | `text`           | `text` or `json`.                           |

### `auth`

| Field                | Default | Notes                                                   |
| -------------------- | ------- | ------------------------------------------------------- |
| `enabled`            | `true`  | Set to `false` only for local dev.                      |
| `allow_remote_admin` | `false` | If true, `admin/*` works from non-localhost clients.    |
| `tls.enabled`        | `false` | **Recommend `true` in production.**                     |
| `tls.cert-file`      | —       | Server cert.                                            |
| `tls.key-file`       | —       | Server key.                                             |

### `crypto.kek`

How `runed` loads the Key Encryption Key for secrets.

| Field                 | Notes                                                          |
| --------------------- | -------------------------------------------------------------- |
| `source`              | `file`, `env`, or `generated`.                                 |
| `file-path`           | Used when `source: file`.                                      |
| `env-var`             | Used when `source: env` (e.g. `RUNE_MASTER_KEY`).              |
| `generate-if-missing` | If true, create a new KEK and persist (mode `0600`).           |

The KEK is 32 bytes, base64-encoded when stored on disk or passed via env.

### `storage.secret-limits`

| Field                  | Default    | Notes                                  |
| ---------------------- | ---------- | -------------------------------------- |
| `max-keys-per-secret`  | `64`       | Per-secret key count cap.              |
| `max-value-size`       | `65536`    | Per-value size cap (bytes).            |

### `runner`

| Section      | Field      | Notes                                       |
| ------------ | ---------- | ------------------------------------------- |
| `docker`     | `enabled`  | Set `false` to disable container support.   |
| `docker`     | `socket`   | Docker daemon socket. Default OS-specific.  |
| `process`    | `enabled`  | Set `false` to disable process runner.      |

### `registries[]`

```yaml
registries:
  - name: ghcr-private
    server: ghcr.io
    username: bot
    password-file: /etc/rune/ghcr.token

  - name: ecr
    type: ecr
    region: us-east-1
    # AWS credentials inferred from environment / IAM role.
```

You can also manage these at runtime with [`rune admin registries`](/cli/admin/) without restarting `runed`.

## CLI flag overrides

Anything in the runefile can be overridden via `runed` flags:

| Flag             | Overrides                |
| ---------------- | ------------------------ |
| `--config`       | path to this file        |
| `--data-dir`     | `server.data-dir`        |
| `--grpc-addr`    | `server.grpc-addr`       |
| `--http-addr`    | `server.http-addr`       |
| `--log-level`    | `server.log-level`       |
| `--log-format`   | `server.log-format`      |
| `--debug`        | shorthand for `--log-level=debug` |
| `--pretty`       | shorthand for `--log-format=text` |

## Reload behavior

Most fields require a `runed` restart to take effect. Registry credentials managed via `rune admin registries` are hot.

## See also

- [Running runed](/operations/runed/)
- [Configuration ops guide](/operations/configuration/)
- [Security hardening](/operations/security/)
