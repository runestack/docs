---
title: Persistent storage
description: Walk through declaring a Volume, mounting it in a service, scaling a stateful set with claimTemplate, and snapshotting/restoring.
---

This guide walks through Rune's storage subsystem end-to-end: declaring a
volume, mounting it, growing a 3-replica stateful set with a claim template,
and finally snapshotting and restoring.

If you want the model first, read the [storage concept](/concepts/storage/).

## 1. Pick a storage class

Rune seeds two classes on first boot:

```sh
$ rune storageclass list
NAME         DRIVER       DEFAULT   RECLAIM   AGE
local        local        true      retain    2m
local-host   local-host   false     retain    2m
```

`local` is the default. Volumes that omit `storageClassName` resolve to it.

## 2. Mount an existing Volume in a service

Declare both resources in the same castfile and apply with one `rune cast`.

```yaml
# web.yaml
---
volume:
  name: web-data
  namespace: default
  storageClassName: local
  size: 5Gi
  accessMode: ReadWriteOnce
  reclaimPolicy: retain
---
service:
  name: web
  namespace: default
  image: ghcr.io/example/web:1.0.0
  scale: 1                  # RWO + claim → scale must be 1
  ports:
    - { name: http, port: 8080 }
  volumes:
    - name: data
      mountPath: /var/lib/web
      claim:
        name: web-data
```

```sh
rune cast web.yaml
rune volume get web-data
# STATUS: Bound
```

Restart the service — the data survives:

```sh
rune restart web
ls /var/lib/rune/volumes/default/web-data    # files still there
```

## 3. Run a 3-replica stateful set with `claimTemplate`

`claim` shares one volume across the whole service. For per-replica state
(databases, queues), use `claimTemplate` — Rune auto-provisions one volume per
replica with stable per-ordinal names.

```yaml
service:
  name: postgres
  namespace: prod
  image: postgres:16
  scale: 3
  env:
    POSTGRES_PASSWORD: changeme
  ports:
    - { name: pg, port: 5432 }
  volumes:
    - name: pgdata
      mountPath: /var/lib/postgresql/data
      claimTemplate:
        size: 10Gi
        accessMode: ReadWriteOnce
        # storageClassName omitted → resolves to the default class (local)
```

```sh
rune cast postgres.yaml
rune volume list -n prod
# pgdata-postgres-0   local   Bound   10Gi   ReadWriteOnce
# pgdata-postgres-1   local   Bound   10Gi   ReadWriteOnce
# pgdata-postgres-2   local   Bound   10Gi   ReadWriteOnce
```

The names `pgdata-postgres-{0,1,2}` are stable: replica 1 always rebinds to
`pgdata-postgres-1`. Scaling **down** does **not** reclaim the per-ordinal
volumes — they stay `Available` so a future scale-up reattaches the same
data. Only an explicit `rune service delete --cascade` runs the
`VolumeCleanupFinalizer` and removes the per-replica volumes.

## 4. Snapshot a volume

```sh
rune snapshot create pgdata-postgres-0 \
  --name pgdata-2025-11-15 \
  -n prod

rune snapshot get pgdata-2025-11-15 -n prod
# STATUS: Ready
```

Snapshot drivers vary:

- `local` — filesystem copy (`cp -a`). Synchronous.
- `do-volume` — DigitalOcean snapshot API.
- `local-host` — **not supported**; the API rejects the write.

## 5. Restore into a new volume

```sh
rune volume restore pgdata-restore \
  --from-snapshot pgdata-2025-11-15 \
  --snapshot-namespace prod \
  --storage-class local \
  -n prod
```

A new `Volume` row is created and provisioned from the snapshot. Mount it on a
sidecar or one-shot job to verify:

```yaml
service:
  name: pg-verify
  namespace: prod
  image: postgres:16
  scale: 1
  command: ["sleep", "infinity"]
  volumes:
    - name: data
      mountPath: /var/lib/postgresql/data
      claim:
        name: pgdata-restore
```

```sh
rune exec pg-verify -- ls /var/lib/postgresql/data
```

## Using `local-host` for pre-existing host paths

`local-host` binds an arbitrary pre-existing host directory. The operator
must allow-list the root in the runefile:

```toml
# /etc/rune/runefile.toml
[storage]
hostPathAllowlist = ["/mnt/rune"]
allowCreateMissing = false
```

Then declare the volume with the host path on `parameters`:

```yaml
volume:
  name: shared-cache
  namespace: default
  storageClassName: local-host
  size: 0
  accessMode: ReadWriteOnce
  parameters:
    hostPath: /mnt/rune/shared-cache
```

`createIfMissing: "true"` on `parameters` is honoured **only** when
`allowCreateMissing = true` in the runefile (which is the default in
`runed --dev-mode`).

## Cleaning up

```sh
rune snapshot delete pgdata-2025-11-15 -n prod
rune volume delete pgdata-restore -n prod
rune service delete postgres -n prod --cascade   # also removes per-replica volumes
```

Without `--cascade`, the per-replica volumes survive the service deletion —
that's the safe default for stateful workloads.

## When provisioning fails

A driver failure marks the volume `Failed`; the controller retries with
backoff and, after exhausting retries, freezes it in `Stalled`. Fix the
underlying problem (allowlist, API token, capacity, …) then drive the
controller again:

```sh
rune volume retry-provision pgdata-postgres-1 -n prod
```

If an instance died but the volume is still flagged `Bound`, break the bind:

```sh
rune volume detach pgdata-postgres-1 -n prod
```

## See also

- [Storage concept](/concepts/storage/)
- [Storage resources reference](/reference/storage-resources/)
- [`rune volume`](/cli/volume/) · [`rune snapshot`](/cli/snapshot/) · [`rune storageclass`](/cli/storageclass/)
