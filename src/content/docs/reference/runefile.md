---
title: Runefile (server config)
description: The schema for runed's server configuration file.
---

`runed` is configured via a YAML or TOML file (often called a "runefile"). The default location is `/etc/rune/runefile.{yaml,toml}` — `runed` auto-discovers either format. Override with `runed --config <path>`.

The two formats are equivalent; pick whichever your tooling prefers. TOML is recommended for new deployments because it's stricter about typos and easier to comment.

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

docker:
    registries:
      - name: ghcr-private
        registry: ghcr.io
        auth:
          type: basic
          username: ${GHCR_USER}
          password: ${GHCR_PAT}
      - name: ecr
        registry: "*.dkr.ecr.us-east-1.amazonaws.com"
        auth:
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

### `storage` (volumes)

Controls the persistent-storage subsystem. See the [storage
concept](/concepts/storage/) and [storage resources
reference](/reference/storage-resources/).

| Field                 | Default                  | Notes                                                                          |
| --------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `defaultStorageClass` | `local`                  | Cluster default class. Empty string disables the default — `claimTemplate` without `storageClassName` becomes a cast-time error. |
| `localVolumeRoot`     | `/var/lib/rune/volumes`  | Root for the `local` driver's managed directory tree.                          |
| `hostPathAllowlist`   | `[]`                     | Allowed prefixes for `local-host` `hostPath`. Empty list denies all hostPath usage. `runed --dev-mode` overlays `["~/.rune/volumes"]`. |
| `allowCreateMissing`  | `false`                  | When `true`, honour `local-host` `parameters.createIfMissing: "true"`. `runed --dev-mode` overlays `true`. |
| `preserveOnDelete`    | `false`                  | (`local` driver only.) When `true`, converts `reclaimPolicy: delete` to `retain` — directories survive cascade.  |

```toml
[storage]
defaultStorageClass = "local"
localVolumeRoot = "/var/lib/rune/volumes"
hostPathAllowlist = ["/mnt/rune", "/var/lib/rune-volumes"]
allowCreateMissing = false

[storage.local]
preserveOnDelete = false
```

#### `storage.drivers`

Per-driver configuration is keyed by registered driver name. Reserved
for non-credential, non-per-class driver knobs only — credentials and
per-class settings live on `StorageClass.parameters` so they can be
rotated and varied per class. The `do-volume` driver currently takes
no runefile knobs (its API token is sourced from
`StorageClass.parameters.apiToken`, see
[Storage resources](/reference/storage-resources/#do-volume)).

```toml
# Example placeholder — no driver currently requires any of these.
# [storage.drivers.<driver-name>]
# someKnob = "value"
```

### `runner`

| Section      | Field      | Notes                                       |
| ------------ | ---------- | ------------------------------------------- |
| `docker`     | `enabled`  | Set `false` to disable container support.   |
| `docker`     | `socket`   | Docker daemon socket. Default OS-specific.  |
| `process`    | `enabled`  | Set `false` to disable process runner.      |

### `docker.registries[]`

```yaml
docker:
  registries:
    - name: ghcr-private
      registry: ghcr.io
      auth:
        type: basic
        username: ${GHCR_USER}     # env-expanded at runed start
        password: ${GHCR_PAT}

    - name: ecr
      registry: "*.dkr.ecr.us-east-1.amazonaws.com"
      auth:
        type: ecr
        region: us-east-1
        # AWS credentials inferred from environment / IAM role.
```

| Auth `type`        | Required fields                          | Notes                                              |
| ------------------ | ---------------------------------------- | -------------------------------------------------- |
| `basic`            | `username`, `password`                   | Use for GHCR (PAT as password), Docker Hub, etc.   |
| `token`            | `token`                                  | Bearer token in the `Authorization` header.        |
| `ecr`              | `region`                                 | Pulls a fresh ECR token via the AWS SDK.           |
| `dockerconfigjson` | `dockerconfigjson` (raw JSON)            | Reuse the contents of `~/.docker/config.json`.     |

#### Credentials from a Rune Secret (`fromSecret`)

Instead of inlining credentials, an entry can resolve them from an encrypted Rune Secret at runtime — the recommended pattern for production:

```yaml
docker:
  registries:
    - name: ghcr-private
      registry: ghcr.io
      auth:
        fromSecret: ghcr-credentials   # Secret name; runed infers auth type from its keys
```

`runed` infers the auth type from the secret's keys: `username`+`password` → `basic`, `token` → bearer, `.dockerconfigjson` → docker config JSON, `awsAccessKeyId`+`awsSecretAccessKey` (+ optional `awsRegion`) → `ecr`. When `fromSecret` is set, do **not** also set `type` or inline `username`/`password`/`token` — they are ignored.

For first-boot bootstrapping (e.g. from the [Terraform module](https://github.com/runestack/terraform-digitalocean-rune)), the entry can also seed the secret on startup:

| Field        | Notes                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `fromSecret` | Name of the Rune Secret to read credentials from at pull time.                                   |
| `bootstrap`  | If `true`, runed creates/updates the secret from `data` on first start (`manage` controls re-apply). |
| `manage`     | `create` (default) or `update`. `update` overwrites the secret on every start; `create` is one-shot. |
| `immutable`  | If `true`, the seeded secret rejects subsequent writes via the API.                              |
| `data`       | Bootstrap seed map (env-expanded against runed's process env). **Ignored at runtime resolution** — only consumed when `bootstrap = true`. |

Manage credentials at runtime with [`rune admin registry`](/cli/admin/) — no restart required.
See the [GHCR guide](/guides/ghcr-auth/) for a private-image walkthrough.

### `networking`

The cluster networking layer. See [Concepts: Networking](/concepts/networking/) for what these knobs do.

| Field           | Default          | Notes                                                                                  |
| --------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `cluster_cidr`  | `10.96.0.0/16`   | Service VIP pool. **Set once at first start** — bootstrapped into the store.            |
| `dev_mode`      | `false`          | Use a userland proxy instead of nftables. Required on macOS / Docker Desktop. **Implies `node.role: edge`** unless you explicitly set a different role. |

### `telemetry`

| Field           | Default          | Notes                                                                                  |
| --------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `metrics_addr`  | `127.0.0.1:9100` | Prometheus `/metrics` endpoint. Exposes metrics from **all subsystems** (orchestrator, runners, networking, agent, DNS). Set to `""` to disable. |

### `node`

| Field   | Default   | Notes                                                                  |
| ------- | --------- | ---------------------------------------------------------------------- |
| `role`  | `worker`  | `worker` or `edge`. `edge` enables the ingress + ACME subsystems.      |

### `ingress`

Only consulted on edge nodes (`node.role: edge`).

| Field         | Default  | Notes                                  |
| ------------- | -------- | -------------------------------------- |
| `http_addr`   | `:80`    | HTTP listener (also serves ACME challenges). |
| `https_addr`  | `:443`   | HTTPS listener.                        |

### `acme`

Only consulted on edge nodes.

| Field        | Default                                       | Notes                                                                                |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| `directory`  | `https://acme-v02.api.letsencrypt.org/directory` | ACME endpoint. Override for staging or Pebble in CI.                              |
| `email`      | —                                             | Account contact. Required by Let's Encrypt — issuance fails without it.              |

Issued certificates are persisted in the encrypted state store (one Secret per host under the `system` namespace), so `runed` restarts reuse them rather than re-issuing — important because Let's Encrypt rate-limits to 5 issuances per identifier set per 168 h.

### TOML equivalent

```toml
data_dir = "/var/lib/rune"

[server]
grpc_address = ":7863"
http_address = ":7861"

[networking]
cluster_cidr = "10.96.0.0/16"

[telemetry]
metrics_addr = "127.0.0.1:9100"

[node]
role = "edge"

[ingress]
http_addr  = ":80"
https_addr = ":443"

[acme]
email = "ops@example.com"
```

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
| `--cluster-cidr` | `networking.cluster_cidr`         |
| `--dev-mode`     | `networking.dev_mode`             |
| `--metrics-addr` | `telemetry.metrics_addr`          |
| `--node-role`    | `node.role`                       |
| `--ingress-http-addr`  | `ingress.http_addr`         |
| `--ingress-https-addr` | `ingress.https_addr`        |
| `--acme-directory`     | `acme.directory`            |
| `--acme-email`         | `acme.email`                |

Every key also has a corresponding `RUNE_*` environment variable (e.g. `RUNE_NETWORKING_CLUSTER_CIDR`, `RUNE_TELEMETRY_METRICS_ADDR`, `RUNE_ACME_EMAIL`). Precedence, highest to lowest: **flag > env var > config file > built-in default**.

## Reload behavior

Most fields require a `runed` restart to take effect. Registry credentials managed via `rune admin registry` are hot.

## See also

- [Running runed](/operations/runed/)
- [Configuration ops guide](/operations/configuration/)
- [Security hardening](/operations/security/)
