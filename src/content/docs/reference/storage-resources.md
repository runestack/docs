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

### Secret references in `parameters`

Any value in a StorageClass or Volume `parameters` map may be a
`secret:` reference instead of a literal. The controller resolves
the reference against the secrets store before the driver sees it,
so drivers always receive plaintext.

```yaml
storageClass:
  name: do-nyc3
  driver: do-volume
  parameters:
    region: nyc3
    # FQDN: pinned to a specific namespace — recommended for
    # cluster-scoped StorageClasses since one shared secret serves
    # every namespace's volumes.
    apiToken: secret:do-api-token.shared.rune/token
```

Form: `secret:<name>[.<namespace>.rune]/<key>`. Values without the
`secret:` prefix pass through verbatim. A missing secret or key fails
the operation with `InvalidParameters`.

#### Shorthand vs FQDN — important for StorageClass

The shorthand form `secret:<name>/<key>` (no namespace) is resolved
against the **consuming Volume's namespace**, not the StorageClass's.
Since StorageClass is cluster-scoped, a single class with a shorthand
ref will look up the secret in whichever namespace happens to be
using the class at that moment — so every namespace would need its
own copy of the secret. For shared infrastructure tokens (DO API
token, S3 credentials, etc.) use the **FQDN form** to pin the
lookup to one namespace regardless of which Volume triggered the
operation. Shorthand is fine on `Volume.parameters` overrides (the
Volume already has its own namespace).

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
| `size`             | quantity  | yes         | E.g. `10Gi`, `500Mi`, `1G`. Kubernetes Quantity syntax: binary suffixes (`Ki`/`Mi`/`Gi`/...) are powers of two, SI suffixes (`K`/`M`/`G`/...) are decimal. **Unitless integers are bytes**, not gigabytes — write `10Gi`, not `10`. Driver may treat as informational (e.g. hostPath). |
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
| `region`             | Required. DigitalOcean region (e.g. `nyc3`). Block-storage volumes are region-pinned — see [Region pinning](#region-pinning) below. |
| `fsType`             | `ext4` (default), `xfs`.                                               |
| `apiToken`           | DO API token. Accepts a literal value or a [secret reference](#secret-references-in-parameters) like `secret:do-api-token/token`. |
| `apiTokenSecretRef`  | **Legacy.** `<namespace>/<secret-name>` form, kept for runefile back-compat. Prefer the generic `secret:` reference on `apiToken` above. |

##### Required DigitalOcean token scopes

A **Full Access** token works, but the driver only needs the
following custom scopes. These mirror exactly the eight HTTP endpoints
the driver calls (`pkg/storage/driver/dovolume/client.go`); anything
else is over-privileged.

| Resource                 | Operations             | DO endpoint(s) the driver hits          | What fails without it                                                                 |
| ------------------------ | ---------------------- | --------------------------------------- | ------------------------------------------------------------------------------------- |
| `block_storage`          | `create`, `read`, `delete` | `POST/GET/DELETE /v2/volumes[/{id}]`    | Provision (`create`), reconcile/observe (`read`), reclaim (`delete`).                  |
| `block_storage_action`   | `create`               | `POST /v2/volumes/{id}/actions`          | Attach, detach, and online-resize. **This is the one most operators miss** — provisioning succeeds and then attach silently 401s, leaving the volume stuck `Available` with the instance pending. |
| `actions`                | `read`                 | `GET /v2/actions/{id}`                   | Polling the async action to completion. Without it, attach/detach return an action ID the driver can't observe and times out as `Stalled`. |
| `droplet`                | `read`                 | `GET /v2/droplets?name=<node>`            | Translating the Rune node ID into a DO droplet ID for the attach call.                |
| `block_storage_snapshot` | `create`, `read`, `delete` | `POST /v2/volumes/{id}/snapshots`, `DELETE /v2/snapshots/{id}` | Only required if you use `rune snapshot create / restore` against volumes on this class. Omit if you don't use snapshots. |

The driver does **not** call `/v2/regions`, `/v2/sizes`, or update
the volume metadata, so `regions:read`, `sizes:read`, and
`block_storage:update` are not needed despite what the DO console's
default scope hints sometimes suggest.

##### Region pinning

DO block-storage volumes belong to a single region. The driver
provisions in the region named on the StorageClass, and DO refuses
to attach a volume to a droplet in a different region. For a
multi-region cluster, create one StorageClass per region:

```yaml
storageClass:
  name: do-volumes-nyc3
  driver: do-volume
  parameters: { region: nyc3, fsType: ext4, apiTokenSecretRef: shared/do-api-token }
---
storageClass:
  name: do-volumes-fra1
  driver: do-volume
  parameters: { region: fra1, fsType: ext4, apiTokenSecretRef: shared/do-api-token }
```

Use `allowedTopologies` (RUNE-072) or the namespace scoping of your
StorageClass references to keep claims targeted at the right region.

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
| `driverParameters` | Controller-captured snapshot of the merged StorageClass + Volume `parameters` (post-secret-resolution-source) at successful Provision time. Used by reclaim Delete / Detach / Unmount when the class has been deleted before its volumes, so orphan cleanup still has the parameters the driver needs. Read-only. |

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
