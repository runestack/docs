---
title: Storage
description: How Rune models persistent storage — StorageClass, Volume, Snapshot — and how services consume volumes via claims and claim templates.
---

Rune ships a small, pluggable storage subsystem so a service can outlive the
container it runs in. The model is intentionally close to Kubernetes
(`StorageClass` / `PersistentVolumeClaim` / `VolumeSnapshot`) but flattened to
fit a single-binary control plane.

## The three resources

| Resource       | Scope         | Purpose                                                     |
| -------------- | ------------- | ----------------------------------------------------------- |
| `StorageClass` | cluster       | Names a driver + a set of parameters. Operator-defined.     |
| `Volume`       | namespaced    | A unit of durable storage. Provisioned by a driver.         |
| `Snapshot`     | namespaced    | A point-in-time copy of a volume; can be restored anywhere. |

A `Volume` always references a `StorageClass`, which in turn names a **driver**
(`local`, `local-host`, `do-volume`, …). The driver is the only piece that
talks to the underlying storage — adding a new backend means writing a driver,
not patching the controller.

## Built-in storage classes

Two storage classes are seeded automatically on first boot:

| Name         | Driver       | Default | Snapshots | Access modes | Notes                                                  |
| ------------ | ------------ | ------- | --------- | ------------ | ------------------------------------------------------ |
| `local`      | `local`      | yes     | yes       | RWO          | Rune-managed directory tree under `localVolumeRoot`.   |
| `local-host` | `local-host` | no      | no        | RWO, ROX     | Operator-pinned host paths; allowlisted in runefile.   |

`local` is the default — a `Volume` (or `claimTemplate`) that omits
`storageClassName` resolves to `local`. Override the boot default with
`[storage] defaultStorageClass = "..."` in the runefile.

The cloud-backed drivers — `do-volume` (DigitalOcean Volumes),
`hcloud-volume` (Hetzner Cloud), `aws-ebs` (Amazon EBS) and `gce-pd`
(Google Persistent Disks) — are shipped in-tree but do **not** seed a
class. Operators define one explicitly with their region/zone and, where
the provider needs it, an API-token secret reference (`aws-ebs` and
`gce-pd` instead read credentials from the node's instance role / service
account).

## Volume lifecycle

```text
Pending  ──▶  Provisioning  ──▶  Available  ──▶  Bound
                  │                 │              │
                  ▼                 ▼              ▼
               Failed            Released        Released
                  │                                │
                  ▼                                ▼
               Stalled                       Retain | Delete
```

- **Pending** — row exists, controller hasn't picked it up yet.
- **Provisioning** — driver `Provision` in flight.
- **Available** — provisioned, no instance attached.
- **Bound** — attached to an instance (`BoundClaim`/`BoundNode` set).
- **Released** — instance went away, volume awaits its reclaim policy.
- **Failed** then **Stalled** — `Provision` failed; the controller retries
  with backoff, then freezes the row in `Stalled` so a human can intervene
  with `rune volume retry-provision`.

## Claims vs claim templates

A service mounts a volume with one of two shapes — they differ in **who owns
the volume row**.

### `claim` — service points at an existing `Volume`

```yaml
service:
  name: web
  scale: 1
  volumes:
    - name: data
      mountPath: /var/lib/web
      claim:
        name: web-data        # an existing Volume in the same namespace
```

- One volume, one mount, shared across replicas.
- For RWO drivers, this requires `scale: 1`. Cast-time error otherwise.
- Cross-namespace claims use the FQDN form: `name: shared.common.rune`.

### `claimTemplate` — Rune auto-provisions one volume per replica

```yaml
service:
  name: postgres
  scale: 3
  volumes:
    - name: pgdata
      mountPath: /var/lib/postgresql/data
      claimTemplate:
        storageClassName: local     # optional; falls back to default class
        size: 10Gi
        accessMode: ReadWriteOnce
```

- Rune creates `pgdata-postgres-0`, `pgdata-postgres-1`,
  `pgdata-postgres-2` on first reconcile.
- Names are stable across reconciles — replica-N always re-binds to its
  own volume.
- The volume row carries an `OwnerService` reference, so when the service is
  deleted (with `--cascade`) the volumes are cleaned up by the
  `VolumeCleanupFinalizer`. Otherwise instance death never reclaims a volume.

## Access modes

| Mode             | Abbreviation | Meaning                                              |
| ---------------- | ------------ | ---------------------------------------------------- |
| `ReadWriteOnce`  | RWO          | One writer at a time. The default for block storage. |
| `ReadOnlyMany`   | ROX          | Many concurrent read-only mounters.                  |
| `ReadWriteMany`  | RWX          | Many concurrent read-write mounters (NFS-class).     |

Drivers advertise the modes they support via `Capabilities.AccessModes`. The
API server rejects writes that demand a mode the chosen driver doesn't
advertise — there is no "I'll try" path.

## Reclaim policy

Each `Volume` has a `reclaimPolicy`, inherited from its `StorageClass` but
overridable per-volume:

- **`retain`** (default) — when the `Volume` row is deleted, the underlying
  storage is left intact.
- **`delete`** — the driver's `Delete` runs. For `local`, that's
  `rm -rf` of the managed directory.

`local-host` rejects `delete` outright — the operator owns the path.
`runefile.[storage].preserveOnDelete = true` is a belt-and-braces switch that
turns `delete` into `retain` for the `local` driver only.

## Snapshots

A `Snapshot` is a point-in-time copy of one volume:

```yaml
snapshot:
  name: pgdata-2025-11-15
  namespace: prod
  source:
    volume: pgdata-postgres-0
```

Snapshots have their own state machine: `Pending → Creating → Ready` (or
`Failed`). Deletion is two-phase (`Deleting` → row removed) so the driver
can clean up the underlying snapshot first.

Restore creates a **new** volume populated from the snapshot:

```sh
rune volume restore web-data-restored \
  --from-snapshot pgdata-2025-11-15 \
  --storage-class local
```

The `local` driver implements snapshots as filesystem copies (`cp -a`).
`local-host` does not support snapshots; the API rejects the write up-front.
`do-volume` uses DigitalOcean's snapshot API, `aws-ebs` uses the EBS
snapshot API, and `gce-pd` uses GCE disk snapshots. `hcloud-volume` does
not support snapshots (Hetzner Cloud has no volume-snapshot API).

## Drivers in v1

| Driver       | Type         | Snapshots | Access modes | Notes                                  |
| ------------ | ------------ | --------- | ------------ | -------------------------------------- |
| `local`      | filesystem   | yes       | RWO          | Default; managed directory per volume. |
| `local-host` | bind-mount   | no        | RWO, ROX     | Pre-existing host paths only.          |
| `do-volume`  | block (cloud)| yes       | RWO          | DigitalOcean Volumes; auth via secret. |
| `hcloud-volume` | block (cloud) | no     | RWO          | Hetzner Cloud volumes; offline expand only, no snapshots. |
| `aws-ebs`    | block (cloud)| yes       | RWO          | Amazon EBS; AZ-pinned, online expand, auth via instance role. |
| `gce-pd`     | block (cloud)| yes       | RWO          | Google Persistent Disks; zone-pinned, online expand, auth via service account. |

Adding a backend (Azure Disk, …) is a single Go package
implementing the `driver.Driver` interface — no controller, scheduler, runner,
API or CLI changes required. The interface contract and the shared
conformance suite live in
[`pkg/storage/driver`](https://github.com/runestack/rune/tree/master/pkg/storage/driver)
in the Rune repo.

## Topology

Driver `Provision` requests carry topology labels for placement-aware backends:

| Label                    | Used by      | Meaning                                                |
| ------------------------ | ------------ | ------------------------------------------------------ |
| `rune.io/region`         | `do-volume`, `hcloud-volume` | Cloud region / location (e.g. `nyc3`, `nbg1`).         |
| `rune.io/zone`           | `aws-ebs`, `gce-pd` | Availability zone (e.g. `eu-west-2a`, `europe-west2-a`). EBS volumes / GCE PDs are zone-pinned. |
| `rune.io/host-path-root` | `local-host` | Pins a `local-host` volume to a node's allowlist root. |

`StorageClass.allowedTopologies` constrains placement at the class level.

## Security defaults

- **Bind-mount blocklist** — `mountPath` cannot be `/`, `/etc`, `/proc`,
  `/sys`, or `/var/run/docker.sock`. Cast-time lint.
- **Host path allowlist** — `local-host` rejects any `hostPath` not under a
  prefix in `runefile.[storage].hostPathAllowlist`.
- **`createIfMissing` is opt-in** — `local-host` will not create a missing
  host directory unless `runefile.[storage].allowCreateMissing = true`.
  `runed --dev-mode` overlays both knobs to a developer-friendly default
  (`~/.rune/volumes` allowlist, `allowCreateMissing = true`).
- **Default-class invariant** — exactly one `StorageClass` may carry
  `default: true`. The API server demotes the previous default on write.
- **RBAC** — promoting a `StorageClass` to default and `--cascade` deletes
  are admin-only.
- **Driver capability lint at write** — the API server cross-checks every
  `Volume` / `Snapshot` write against the named driver's capabilities and
  rejects requests for modes/snapshots the driver doesn't support.

## See also

- [Persistent storage guide](/guides/persistent-storage/) — end-to-end walkthrough.
- [Storage resources reference](/reference/storage-resources/) — full YAML.
- [`rune volume`](/cli/volume/), [`rune snapshot`](/cli/snapshot/), [`rune storageclass`](/cli/storageclass/).
