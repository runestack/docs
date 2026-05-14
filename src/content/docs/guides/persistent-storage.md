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

## Using `do-volume` for DigitalOcean Block Storage

The `do-volume` driver provisions, attaches, snapshots and reclaims
DO Block Storage volumes via the DigitalOcean API. End-to-end first-time
setup is three steps.

### Step 1 — Mint a scoped DO API token

In the DigitalOcean console: **API → Tokens → Generate New Token**.
Choose **Custom Scopes** (not Full Access) and grant exactly the
permissions the driver uses:

| Resource                 | Operations                  |
| ------------------------ | --------------------------- |
| `block_storage`          | `create`, `read`, `delete`  |
| `block_storage_action`   | `create`                    |
| `actions`                | `read`                      |
| `droplet`                | `read`                      |
| `block_storage_snapshot` | `create`, `read`, `delete`  *(omit if you don't use `rune snapshot`)* |

See the [service-spec reference's scope table](/reference/storage-resources/#required-digitalocean-token-scopes)
for the per-endpoint breakdown of what each scope unlocks. The one
that's easy to miss is `block_storage_action:create` — without it
provisioning *appears* to work and attach silently 401s, leaving the
volume stuck `Available` with the consuming instance pending.

### Step 2 — Create a Rune Secret holding the token

The driver reads the token from a Rune Secret rather than the
runefile so it can rotate without restarting `runed`. The secret's
data field must be named `token`:

```sh
rune create secret do-api-token \
  --from-literal=token=dop_v1_<your_token_here> \
  -n shared
```

### Step 3 — Create the StorageClass

Reference the secret on `apiToken` using the FQDN secret-reference
form `secret:<name>.<namespace>.rune/<key>`. Since StorageClass is
cluster-scoped, the FQDN form pins the lookup to one namespace so a
single shared secret serves every namespace's volumes — see the
[shorthand vs FQDN note](/reference/storage-resources/#shorthand-vs-fqdn--important-for-storageclass)
for why the shorthand `secret:<name>/<key>` is the wrong choice here.

DO volumes are region-pinned, so the StorageClass also names the
region; for a multi-region cluster create one StorageClass per
region.

```yaml
storageClass:
  name: do-volumes-nyc3
  driver: do-volume
  parameters:
    region: nyc3
    fsType: ext4
    apiToken: secret:do-api-token.shared.rune/token
```

```sh
rune storageclass create -f do-volumes-nyc3.yaml
rune get storageclasses
# NAME              DRIVER      DEFAULT
# do-volumes-nyc3   do-volume   false
```

### Verify

Provision a one-off volume to confirm the token and scopes are
correct before pointing real workloads at the class:

```sh
cat <<'EOF' | rune cast -
volume:
  name: do-smoke-test
  namespace: default
  storageClassName: do-volumes-nyc3
  size: "10Gi"
  accessMode: ReadWriteOnce
EOF

rune get volume do-smoke-test -n default
# STATUS: Available     HANDLE: <do-volume-id>

# Quick attach test using a throw-away service. If this stalls in
# Pending with `dovolume: action ... errored`, the token is missing
# block_storage_action:create or actions:read.
cat <<'EOF' | rune cast -
service:
  name: do-smoke
  image: alpine:3.19
  command: ["sleep", "infinity"]
  volumes:
    - name: data
      mountPath: /data
      claim:
        name: do-smoke-test
EOF
rune get service do-smoke
# STATUS: Running

rune delete service do-smoke
rune delete volume do-smoke-test -n default
```

If any step in the verify fails, the [storage-resources reference](/reference/storage-resources/#do-volume)
maps each DO API endpoint to the scope it requires and the failure
mode you'll see without it.

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
