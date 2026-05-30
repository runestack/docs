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

### `fsUser` / `fsGroup` / `fsMode`

A fresh ext4 mount is owned by `root:root` with mode `0700`. Containers
that run as a non-root uid (most modern images) hit `EACCES` on the
first write. Tell Rune to chown / chmod the mount root for you:

```yaml
volumes:
  - name: data
    mountPath: /var/lib/web
    fsUser: 1000        # uid that owns the mount root
    fsGroup: 1000       # gid that owns the mount root
    fsMode: "0775"      # optional; octal string so leading zero is kept
    claim:
      name: web-data
```

Applied to the **mount root only** (subPath ownership is yours to
manage), idempotently — Rune skips the chown when ownership already
matches, so subsequent reconciles don't stomp on in-place changes.
Works for any driver where Rune owns the mount path (`local`,
`do-volume`, `hcloud-volume`, `aws-ebs`, `gce-pd`, …); skipped
automatically when the operator omits the field, so `local-host` paths
you manage by hand are left alone.

This replaces the older `initSteps: chown` recipe for the common
case — keep `initSteps` for anything more elaborate than chown.

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
- `aws-ebs` — EBS snapshot API (`CreateSnapshot` / `DeleteSnapshot`).
- `gce-pd` — GCE disk snapshots (`disks.createSnapshot` / `snapshots.delete`).
- `hcloud-volume` — **not supported**; Hetzner Cloud has no volume-snapshot API.
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
rune exec pg-verify ls /var/lib/postgresql/data
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

:::caution[Hostname must match the droplet name]
Each node's OS hostname (`hostname` / `os.Hostname()`) must equal its
DigitalOcean droplet name. The driver resolves Rune nodes to DO
droplets via `/v2/droplets?name=<hostname>`; a mismatch surfaces as
`no DO droplet matches hostname "<host>"` on the first Attach. New
droplets get this for free; only break it by explicitly running
`hostnamectl set-hostname` to something the DO console doesn't know.
:::

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

### Two `do-volume` gotchas

**Sizing is `ceil(bytes / 1e9)`, not `ceil(GiB)`.** DigitalOcean
Volumes are sized in decimal GB (10⁹ bytes), Rune's `size: <quantity>`
field accepts Kubernetes-style binary suffixes (Gi = 2³⁰ bytes). The
driver rounds up to the next whole DO GB, so `size: 1Gi`
(1,073,741,824 bytes) provisions a **2 GB** DO Volume — and DO bills
per-GB-month. Write sizes in plain GB (`size: 1G`) if you want a 1:1
mapping. Sizes ≥ 10 Gi land within a few percent of the requested
amount, so this only bites on tiny volumes.

**`reclaimPolicy: retain` does not reclaim the underlying DO Volume.**
When the Rune Volume row is deleted, the DO Volume keeps existing
(and being billed) until you delete it manually:

```sh
doctl compute volume list   # find the volume ID
doctl compute volume delete <id>
```

Use `reclaimPolicy: delete` on the StorageClass if you want Rune to
reap the DO Volume when the Rune Volume row goes away. `retain` is
the safer default for irreplaceable data — make sure it matches your
intent before you delete the row.

:::note[Use `retain` for production do-volume today]
`reclaimPolicy: delete` is supported but the unbind→detach→delete
ordering is best-effort: Rune fires the agent-side Detach when the
Volume row is deleted, but the DO `DELETE /v2/volumes/<id>` call
races with the Detach action's completion. A 409 "volume in use"
response leaves the underlying DO Volume orphaned. Use `retain` and
delete the DO Volume manually (`doctl compute volume delete <id>`)
until the cleanup ordering is hardened.
:::

### Surviving a droplet rebuild

DO Volumes outlive the droplet they're attached to — the durability
story `do-volume` exists for. The supported recovery path when
`terraform apply` destroys + recreates the droplet:

1. Fresh droplet boots; the reserved IP reattaches automatically.
2. New `runed` comes up with the same `node-role` + the same node
   hostname (the latter is what the driver matches against
   `/v2/droplets?name=…` — see the [hostname caveat](#step-3--create-the-storageclass)
   earlier on this page).
3. Agent's volumes Subsystem walks every Volume row whose
   `BoundNode` matches this node. For each, it calls `Driver.Attach`
   against the existing DO Volume ID (the `handle` on the row).
4. `EnsureFormatted` is a no-op — `lsblk` reports the existing
   `ext4`, mkfs is skipped.
5. The mount target is recreated under
   `/var/lib/rune/mounts/<volume-id>/` and services come up against
   the existing data.

Caveats:
- The Volume row's `namespace` and `name` must persist across the
  rebuild (they're what BoundNode lookups key on). If you're seeding
  the cluster from a fresh state store on the new droplet, also
  restore the Volume rows (`rune cast` the same YAML against the new
  cluster).
- The droplet's region must still match the StorageClass region —
  DO refuses cross-region attaches. If you're moving regions, you're
  doing a snapshot-restore, not a rebuild.
- Hostname collisions inside one DO account will surface as "no DO
  droplet matches hostname …" on the first Attach attempt — make
  sure the new droplet's hostname is unique.

## Using `hcloud-volume` for Hetzner Cloud Block Storage

The `hcloud-volume` driver provisions, attaches and reclaims
Hetzner Cloud volumes via the Hetzner Cloud API. The shape mirrors
`do-volume`: per-class API token, location-pinned volumes,
offline-only expand.

:::caution[Hostname must match the Hetzner server name]
Each node's OS hostname (`hostname` / `os.Hostname()`) must equal
its Hetzner server name. The driver resolves Rune nodes to Hetzner
servers via `GET /v1/servers?name=<hostname>`; a mismatch surfaces
as `no Hetzner server matches hostname "<host>"` on the first
Attach. The
[`terraform-hetzner-rune`](https://github.com/runestack/terraform-hetzner-rune)
module sets the server name to `rune-<environment>` and cloud-init
brings the hostname up to match; only break this by running
`hostnamectl set-hostname` to something the Hetzner Cloud Console
doesn't know.
:::

:::note[No snapshots, offline expand only]
Hetzner Cloud has **no volume-snapshot API** — the driver
advertises `Capabilities.Snapshots = false`, so
`rune snapshot create / restore` against an `hcloud-volume`
class is rejected at cast time. `rune volume resize` works but
requires the volume to be detached first (Rune surfaces this as
`ErrOnlineExpandUnsupported`).
:::

### Step 1 — Mint a Hetzner Cloud API token

In the Hetzner Cloud Console: **Project → Security → API Tokens →
Generate API Token**. Hetzner tokens are project-scoped with a
single permission level (Read & Write) — pick a token name that
ties it back to the cluster so future rotations are obvious.

### Step 2 — Create a Rune Secret holding the token

The driver reads the token from a Rune Secret rather than the
runefile so it can rotate without restarting `runed`. The secret's
data field must be named `token`:

```sh
rune create secret hcloud-api-token \
  --from-literal=token=<your_hcloud_token_here> \
  -n shared
```

### Step 3 — Create the StorageClass

Reference the secret on `apiToken` using the FQDN secret-reference
form `secret:<name>.<namespace>.rune/<key>`. Hetzner volumes are
location-pinned, so the StorageClass names the location; for a
multi-location cluster create one StorageClass per location.

```yaml
storageClass:
  name: hcloud-volumes-nbg1
  driver: hcloud-volume
  parameters:
    location: nbg1
    fsType: ext4
    apiToken: secret:hcloud-api-token.shared.rune/token
```

```sh
rune storageclass create -f hcloud-volumes-nbg1.yaml
rune get storageclasses
# NAME                  DRIVER          DEFAULT
# hcloud-volumes-nbg1   hcloud-volume   false
```

### Verify

Provision a one-off volume to confirm the token and location are
correct before pointing real workloads at the class:

```sh
cat <<'EOF' | rune cast -
volume:
  name: hcloud-smoke-test
  namespace: default
  storageClassName: hcloud-volumes-nbg1
  size: "10Gi"
  accessMode: ReadWriteOnce
EOF

rune get volume hcloud-smoke-test -n default
# STATUS: Available     HANDLE: <hcloud-volume-id>
```

Then mount it on a throw-away service to exercise Attach:

```sh
cat <<'EOF' | rune cast -
service:
  name: hcloud-smoke
  image: alpine:3.19
  command: ["sleep", "infinity"]
  volumes:
    - name: data
      mountPath: /data
      claim:
        name: hcloud-smoke-test
EOF
rune get service hcloud-smoke
# STATUS: Running

rune delete service hcloud-smoke
rune delete volume hcloud-smoke-test -n default
```

### Two `hcloud-volume` gotchas

**Minimum size is 10 GB.** Hetzner Cloud Block Storage volumes are
sized in decimal GB (10⁹ bytes) and Hetzner enforces a 10 GB
minimum. The driver silently rounds up to 10 GB if you ask for
less. `size: 1Gi` provisions a 10 GB Hetzner volume, not 1 GiB —
Hetzner bills per-GB-month, so be deliberate on small mounts.

**`reclaimPolicy: retain` does not reclaim the underlying Hetzner
volume.** When the Rune Volume row is deleted, the Hetzner volume
keeps existing (and being billed) until you delete it manually
from the Hetzner Cloud Console or via
`hcloud volume delete <id>`. Use `reclaimPolicy: delete` on the
StorageClass if you want Rune to reap the Hetzner volume when the
Rune Volume row goes away. `retain` is the safer default for
irreplaceable data — match it to your intent before you delete the
row.

### Surviving a server rebuild

Hetzner Cloud volumes outlive the server they're attached to — the
durability story `hcloud-volume` exists for. The supported recovery
path when `terraform apply` destroys + recreates the server is the
same as DigitalOcean's:

1. Fresh server boots; the (optional) floating/primary IP
   reattaches.
2. New `runed` comes up with the same `node-role` + the same node
   hostname (which must equal the Hetzner server name — see the
   [hostname caveat](#using-hcloud-volume-for-hetzner-cloud-block-storage)
   above).
3. Agent's volumes Subsystem walks every Volume row whose
   `BoundNode` matches this node and calls `Driver.Attach` against
   the existing Hetzner Volume ID.
4. `EnsureFormatted` is a no-op — `lsblk` reports the existing
   filesystem.
5. The mount target is recreated under
   `/var/lib/rune/mounts/<volume-id>/` and services come up
   against the existing data.

Caveats:
- The server's location must still match the StorageClass
  `location` — Hetzner refuses cross-location attaches.
- Server-name collisions inside one Hetzner project surface as
  "no Hetzner server matches hostname …" on the first Attach
  attempt — keep server names unique.

## Using `aws-ebs` for Amazon EBS

The `aws-ebs` driver provisions, attaches, snapshots and reclaims
Amazon EBS volumes via the EC2 API. The shape mirrors `do-volume`,
with two AWS-specific twists:

- **No API token to manage.** On an EC2 node with an instance profile
  (the [`terraform-aws-rune`](/guides/terraform-aws/) module attaches one
  by default), the driver reads AWS credentials from the instance role
  via the standard credential chain — there's no secret to mint or
  rotate. Off-instance / cross-account controllers can still pass static
  credentials on `parameters` (see the
  [reference](/reference/storage-resources/#aws-ebs)).
- **Volumes are AZ-pinned, not region-pinned.** An EBS volume lives in a
  single Availability Zone and only attaches to an instance in that same
  AZ, so the StorageClass names an `availabilityZone` (not just a
  region).

:::caution[Node must be discoverable by hostname]
The driver resolves each Rune node to an EC2 instance by its OS
hostname — matched against the instance's `private-dns-name` (the EC2
default hostname, e.g. `ip-10-0-1-23`), an `i-…` instance ID, or the
`Name` tag. A mismatch surfaces as `no EC2 instance matches node "<host>"`
on the first Attach. The `terraform-aws-rune` module leaves the EC2
default hostname in place, so this works out of the box.
:::

:::note[IMDSv2 hop limit]
runed mints EBS API calls from the instance role through IMDS. The
module sets `http_tokens = "required"` (IMDSv2) and a hop limit of 2;
if you bring your own instance, make sure IMDS is reachable from the
`runed` process.
:::

### Step 1 — Grant the instance role EBS permissions

The instance profile needs the EC2 volume actions the driver calls.
The `terraform-aws-rune` module can attach these for you
(`enable_ebs_volume_access`); to scope a policy by hand:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": [
      "ec2:CreateVolume", "ec2:DeleteVolume", "ec2:DescribeVolumes",
      "ec2:AttachVolume", "ec2:DetachVolume", "ec2:ModifyVolume",
      "ec2:CreateSnapshot", "ec2:DeleteSnapshot", "ec2:DescribeSnapshots",
      "ec2:DescribeInstances", "ec2:CreateTags"
    ],
    "Resource": "*"
  }]
}
```

See the [storage-resources reference](/reference/storage-resources/#aws-ebs)
for the per-operation breakdown of which permission each Driver method
needs.

### Step 2 — Create the StorageClass

No secret is required when the node uses an instance role. EBS volumes
are AZ-pinned, so the class names the zone; for a multi-AZ cluster
create one StorageClass per AZ.

```yaml
storageClass:
  name: ebs-gp3-euw2a
  driver: aws-ebs
  parameters:
    region: eu-west-2
    availabilityZone: eu-west-2a
    volumeType: gp3
    fsType: ext4
  reclaimPolicy: retain
  allowedTopologies:
    - matchLabels:
        rune.io/zone: eu-west-2a
```

```sh
rune storageclass create -f ebs-gp3-euw2a.yaml
rune get storageclasses
# NAME            DRIVER    DEFAULT
# ebs-gp3-euw2a   aws-ebs   false
```

### Verify

Provision a one-off volume to confirm the role and zone are correct
before pointing real workloads at the class:

```sh
cat <<'EOF' | rune cast -
volume:
  name: ebs-smoke-test
  namespace: default
  storageClassName: ebs-gp3-euw2a
  size: "10Gi"
  accessMode: ReadWriteOnce
EOF

rune get volume ebs-smoke-test -n default
# STATUS: Available     HANDLE: vol-0abc…

# Attach test using a throw-away service. If this stalls in Pending,
# the instance role is most likely missing ec2:AttachVolume /
# ec2:DescribeInstances, or the node's AZ doesn't match the class.
cat <<'EOF' | rune cast -
service:
  name: ebs-smoke
  image: alpine:3.19
  command: ["sleep", "infinity"]
  volumes:
    - name: data
      mountPath: /data
      claim:
        name: ebs-smoke-test
EOF
rune get service ebs-smoke
# STATUS: Running

rune delete service ebs-smoke
rune delete volume ebs-smoke-test -n default
```

### `aws-ebs` gotchas

**Sizing is `ceil(GiB)`.** EBS sizes are whole binary gibibytes with a
1 GiB minimum. The driver rounds `size` up to the next GiB, so
`size: 1500Mi` provisions a 2 GiB volume. EBS does not allow shrinking;
`rune volume resize` to a smaller size is a no-op.

**Online expand, separate filesystem grow.** `rune volume resize` calls
EBS `ModifyVolume` and returns once AWS accepts the change — the block
device grows in place while attached (no detach needed). The filesystem
is grown on the next mount cycle, so the new capacity shows up after the
consuming service restarts.

**`reclaimPolicy: retain` does not reclaim the EBS volume.** When the
Rune Volume row is deleted, the EBS volume keeps existing (and being
billed) until you delete it manually (`aws ec2 delete-volume
--volume-id vol-…`). Use `reclaimPolicy: delete` to have Rune reap it.
`retain` is the safer default for irreplaceable data.

### Surviving an instance rebuild

EBS volumes outlive the instance they're attached to — the durability
story `aws-ebs` exists for. The recovery path when `terraform apply`
destroys + recreates the instance mirrors DigitalOcean's:

1. Fresh instance boots; the Elastic IP (when `allocate_eip = true`)
   reattaches.
2. New `runed` comes up with the same `node-role`; its EC2 hostname
   resolves the node to the new instance.
3. The agent's volumes Subsystem walks every Volume row whose
   `BoundNode` matches this node and calls `Driver.Attach` against the
   existing EBS volume ID (the `handle` on the row).
4. `EnsureFormatted` is a no-op — `lsblk` reports the existing
   filesystem, mkfs is skipped.
5. Services come up against the existing data.

Caveats:
- The new instance must land in the **same AZ** as the volume — EBS
  refuses cross-AZ attaches. Keep the instance and its StorageClass on
  one zone, or restore via snapshot to move zones.
- The Volume row's `namespace`/`name` must persist across the rebuild
  (BoundNode lookups key on them). Re-`cast` the same YAML if you're
  seeding from a fresh state store.

## Using `gce-pd` for Google Persistent Disks

The `gce-pd` driver provisions, attaches, snapshots and reclaims Google
Compute Engine Persistent Disks via the Compute API. The shape mirrors
`aws-ebs`:

- **No key to manage.** On a GCE instance with a service account (the
  [`terraform-google-rune`](/guides/terraform-google/) module attaches
  one), the driver authenticates via Application Default Credentials —
  there's no secret to mint or rotate. Off-instance / cross-project
  controllers can pass a service-account key on `parameters.credentialsJSON`
  (see the [reference](/reference/storage-resources/#gce-pd)).
- **Disks are zone-pinned.** A zonal Persistent Disk lives in one zone
  and only attaches to an instance in that same zone, so the StorageClass
  names a `zone` (not just a region). The `project` is read from the
  metadata server on GCE, or set it explicitly on `parameters.project`.

:::caution[Node must be discoverable by name]
The driver resolves each Rune node to a GCE instance by its OS hostname,
which on GCE equals the instance name. A mismatch surfaces as
`no GCE instance "<host>" in zone <zone>` on the first Attach. The
`terraform-google-rune` module leaves the GCE default hostname in place,
so this works out of the box.
:::

### Step 1 — Grant the service account disk permissions

The node's service account needs to manage Persistent Disks. The
`terraform-google-rune` module does this with
`enable_pd_csi_access = true` (grants `roles/compute.storageAdmin`). To
scope a custom role by hand, grant these permissions:

```
compute.disks.create   compute.disks.delete    compute.disks.get
compute.disks.resize   compute.disks.use       compute.disks.createSnapshot
compute.snapshots.create compute.snapshots.delete compute.snapshots.get
compute.instances.attachDisk compute.instances.detachDisk compute.instances.get
compute.zoneOperations.get   compute.globalOperations.get
```

### Step 2 — Create the StorageClass

No secret is required when the node uses a service account. PDs are
zone-pinned, so the class names the zone; for a multi-zone cluster create
one StorageClass per zone.

```yaml
storageClass:
  name: pd-balanced-euw2a
  driver: gce-pd
  parameters:
    zone: europe-west2-a
    diskType: pd-balanced
    fsType: ext4
  reclaimPolicy: retain
  allowedTopologies:
    - matchLabels:
        rune.io/zone: europe-west2-a
```

```sh
rune storageclass create -f pd-balanced-euw2a.yaml
rune get storageclasses
# NAME                DRIVER   DEFAULT
# pd-balanced-euw2a   gce-pd   false
```

### Verify

```sh
cat <<'EOF' | rune cast -
volume:
  name: pd-smoke-test
  namespace: default
  storageClassName: pd-balanced-euw2a
  size: "10Gi"
  accessMode: ReadWriteOnce
EOF

rune get volume pd-smoke-test -n default
# STATUS: Available     HANDLE: rune-default-pd-smoke-test

# Attach test using a throw-away service. If this stalls in Pending, the
# service account is most likely missing compute.instances.attachDisk /
# compute.disks.use, or the node's zone doesn't match the class.
cat <<'EOF' | rune cast -
service:
  name: pd-smoke
  image: alpine:3.19
  command: ["sleep", "infinity"]
  volumes:
    - name: data
      mountPath: /data
      claim:
        name: pd-smoke-test
EOF
rune get service pd-smoke
# STATUS: Running

rune delete service pd-smoke
rune delete volume pd-smoke-test -n default
```

### `gce-pd` gotchas

**Minimum size is 10 GiB.** Persistent Disks start at 10 GiB; the driver
rounds `size` up to the next GiB with a 10 GiB floor. `size: 1Gi`
provisions a 10 GiB disk.

**Online expand, separate filesystem grow.** `rune volume resize` calls
`disks.resize` and returns once GCE accepts the change — the disk grows in
place while attached. The filesystem is grown on the next mount cycle, so
the new capacity shows up after the consuming service restarts.

**`reclaimPolicy: retain` does not reclaim the disk.** When the Rune
Volume row is deleted, the Persistent Disk keeps existing (and being
billed) until you delete it manually (`gcloud compute disks delete <name>
--zone <zone>`). Use `reclaimPolicy: delete` to have Rune reap it.

### Surviving an instance rebuild

Persistent Disks outlive the instance they're attached to. The recovery
path when `terraform apply` destroys + recreates the instance mirrors the
other cloud drivers:

1. Fresh instance boots; the static IP (when `allocate_static_ip = true`)
   reattaches.
2. New `runed` comes up with the same `node-role`; its GCE hostname
   resolves the node to the new instance.
3. The agent's volumes Subsystem walks every Volume row whose `BoundNode`
   matches this node and calls `Driver.Attach` against the existing disk
   (the `handle` is the disk name, derived from namespace+name).
4. `EnsureFormatted` is a no-op — the existing filesystem is detected.
5. Services come up against the existing data.

Caveats:
- The new instance must land in the **same zone** as the disk — GCE
  refuses cross-zone attaches. Restore via snapshot to move zones.
- The Volume row's `namespace`/`name` must persist across the rebuild
  (the disk name is derived from them, and Provision adopts an existing
  same-named disk).

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
