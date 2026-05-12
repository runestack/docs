---
title: Storage resources
description: Full YAML field reference for StorageClass, Volume, Snapshot, and the service-spec volumes[] block.
---

This page is the schema reference for Rune's storage resources. For the
big-picture model and the lifecycle, see the [storage
concept](/concepts/storage/).

## `StorageClass`

Cluster-scoped. Names a driver and default parameters.

```yaml
storageClass:
  name: do-nyc3
  driver: do-volume
  parameters:
    region: nyc3
    fsType: ext4
    apiTokenSecretRef: do/api-token
  reclaimPolicy: retain
  default: false
  allowedTopologies:
    - matchLabels:
        rune.io/region: nyc3
    - matchExpressions:
        - key: rune.io/zone
          operator: In
          values: [nyc3a, nyc3b]
  labels:
    tier: cloud
```

| Field               | Type           | Required | Notes                                                                 |
| ------------------- | -------------- | -------- | --------------------------------------------------------------------- |
| `name`              | string         | yes      | DNS-1123. Cluster-unique.                                             |
| `driver`            | string         | yes      | Registered driver name (e.g. `local`, `local-host`, `do-volume`).     |
| `parameters`        | map[string]string | no    | Driver-specific. See driver tables below.                             |
| `reclaimPolicy`     | enum           | no       | `retain` (default) or `delete`. Per-volume override allowed.          |
| `default`           | bool           | no       | At most one class may be `true`. API server enforces uniqueness.      |
| `allowedTopologies` | []TopologySelector | no   | Optional placement constraints; matched against node labels.          |
| `labels`            | map[string]string | no    | Free-form labels.                                                     |

`TopologySelector` is a list of `matchLabels` and/or `matchExpressions`
(operators: `In`, `NotIn`, `Exists`, `DoesNotExist`).

## `Volume`

Namespaced. A unit of durable storage.

```yaml
volume:
  name: pgdata-postgres-0
  namespace: prod
  storageClassName: local
  size: 10Gi
  accessMode: ReadWriteOnce
  reclaimPolicy: retain
  parameters: {}
  labels:
    app: postgres
```

| Field              | Type      | Required    | Notes                                                                    |
| ------------------ | --------- | ----------- | ------------------------------------------------------------------------ |
| `name`             | string    | yes         | DNS-1123. Unique within the namespace.                                   |
| `namespace`        | string    | no          | Default `default`.                                                       |
| `storageClassName` | string    | conditional | Required unless a default class is set. Falls back to `runefile.[storage].defaultStorageClass`. |
| `size`             | quantity  | yes         | E.g. `10Gi`, `500Mi`. Driver may treat as informational (e.g. hostPath). |
| `accessMode`       | enum      | yes         | `ReadWriteOnce`, `ReadOnlyMany`, `ReadWriteMany`. Driver-gated.          |
| `reclaimPolicy`    | enum      | no          | `retain` or `delete`. Defaults to the class's policy.                    |
| `parameters`       | map[string]string | no  | Per-volume overrides merged on top of class parameters.                  |
| `labels`           | map[string]string | no  | Free-form.                                                               |

### Driver-specific `parameters`

#### `local`

| Key | Notes |
| --- | ----- |
| _(none required)_ | Rune manages the directory under `runefile.[storage].localVolumeRoot`. |

#### `local-host`

| Key                | Notes                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------- |
| `hostPath`         | **Required.** Absolute path; must sit under `runefile.[storage].hostPathAllowlist`.    |
| `createIfMissing`  | `"true"` to create the directory if missing. Honoured only when `[storage] allowCreateMissing = true`. |

#### `do-volume`

| Key                  | Notes                                                                  |
| -------------------- | ---------------------------------------------------------------------- |
| `region`             | Required. DigitalOcean region (e.g. `nyc3`).                           |
| `fsType`             | `ext4` (default), `xfs`.                                               |
| `apiToken`           | Inline DO API token. Prefer `apiTokenSecretRef`.                       |
| `apiTokenSecretRef`  | `<namespace>/<secret-name>` for the DO API token.                      |

### Status fields (read-only)

| Field          | Notes                                                              |
| -------------- | ------------------------------------------------------------------ |
| `status`       | `Pending`, `Provisioning`, `Available`, `Bound`, `Released`, `Failed`, `Stalled`. |
| `handle`       | Driver-specific identifier (path, volume ID, …).                   |
| `boundClaim`   | The instance/claim currently bound to this volume.                 |
| `boundNode`    | Node where the volume is currently attached.                       |
| `ownerService` | Set when the volume was created from a service `claimTemplate`.    |
| `failureMessage` | Last driver/controller error if `Failed`/`Stalled`.              |
| `attempts`     | Provision retry count.                                             |

## `Snapshot`

Namespaced. Point-in-time copy of one volume.

```yaml
snapshot:
  name: pgdata-2025-11-15
  namespace: prod
  source:
    volume: pgdata-postgres-0
  labels:
    app: postgres
```

| Field           | Type   | Required | Notes                                          |
| --------------- | ------ | -------- | ---------------------------------------------- |
| `name`          | string | yes      | DNS-1123. Unique within the namespace.         |
| `namespace`     | string | no       | Default `default`.                             |
| `source.volume` | string | yes      | Source volume name in the same namespace.      |
| `labels`        | map    | no       | Free-form.                                     |

The source volume's driver must advertise `Capabilities.Snapshots = true` —
the API server rejects writes against drivers that don't (e.g. `local-host`).

### Status fields (read-only)

| Field            | Notes                                                                |
| ---------------- | -------------------------------------------------------------------- |
| `status`         | `Pending`, `Creating`, `Ready`, `Deleting`, `Failed`.                |
| `handle`         | Driver-specific snapshot identifier.                                 |
| `failureMessage` | Last driver/controller error if `Failed`.                            |

## Service `volumes[]`

Top-level field on the service spec. See also the
[service spec reference](/reference/service-spec/).

```yaml
service:
  name: postgres
  scale: 3
  volumes:
    - name: pgdata
      mountPath: /var/lib/postgresql/data
      readOnly: false
      subPath: ""
      claimTemplate:
        storageClassName: local
        size: 10Gi
        accessMode: ReadWriteOnce
```

| Field           | Type     | Required    | Notes                                                                 |
| --------------- | -------- | ----------- | --------------------------------------------------------------------- |
| `name`          | string   | yes         | Mount identifier. Unique within the service.                          |
| `mountPath`     | string   | yes         | Absolute path inside the container/process. Blocklist: `/`, `/etc`, `/proc`, `/sys`, `/var/run/docker.sock`. |
| `readOnly`      | bool     | no          | Mount read-only. Default `false`.                                     |
| `subPath`       | string   | no          | Mount a sub-directory of the volume.                                  |
| `claim`         | object   | conditional | Exactly one of `claim` or `claimTemplate`.                            |
| `claimTemplate` | object   | conditional | Exactly one of `claim` or `claimTemplate`.                            |

### `claim`

```yaml
claim:
  name: web-data            # bare name → same namespace as the service
  # name: shared.common.rune  # FQDN form → cross-namespace
```

Cast-time error: an RWO `claim` mount on a service with `scale > 1`. Use
`claimTemplate` for stateful sets.

### `claimTemplate`

```yaml
claimTemplate:
  storageClassName: local           # optional; defaults to the cluster default
  size: 10Gi                        # required
  accessMode: ReadWriteOnce         # required
  parameters: {}                    # optional driver-specific overrides
  reclaimPolicy: retain             # optional override
```

Per-replica volumes are auto-provisioned with stable names of the form
`<volume-name>-<service-name>-<ordinal>`, e.g. `pgdata-postgres-0`.

## Validation

All of the following are checked at cast time and on every API write:

- Exactly one of `claim` / `claimTemplate` per mount entry.
- `mountPath` is absolute, unique within the service, doesn't overlap any
  `secretMounts`/`configMounts` path, and isn't in the blocklist.
- For RWO `claim` mounts: `service.scale == 1`.
- `claimTemplate.accessMode` is in the chosen driver's
  `Capabilities.AccessModes`.
- `Snapshot` writes against drivers without `Capabilities.Snapshots` are
  rejected.
- `local-host` `hostPath` is absolute, has no `..`, sits under
  `runefile.[storage].hostPathAllowlist`.
- Process-runtime services may use `local-host` only; block-device drivers
  (`do-volume`) are rejected at cast time.
- A `Volume` whose `reclaimPolicy: delete` targets the `local-host` driver is
  rejected.

## See also

- [Storage concept](/concepts/storage/)
- [Persistent storage guide](/guides/persistent-storage/)
- [`rune volume`](/cli/volume/) · [`rune snapshot`](/cli/snapshot/) · [`rune storageclass`](/cli/storageclass/)
