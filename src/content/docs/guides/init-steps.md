---
title: Init steps
description: Run one-shot setup commands — like formatting a database's data volume — before a service's main process starts.
---

Some services need a one-shot setup step before their main process can
run for the first time. The classic example is a database whose data
volume has to be **formatted** into a ledger file before the daemon
will accept connections. Rune calls these `initSteps`.

An init step:

- runs to completion **before** the main service process starts,
- executes inside the same network/volume namespace as the parent so
  it can read and write the parent's mounts,
- gates the service: a failed init step puts the service into
  `Failed` with reason `InitStepFailed`,
- by default, runs **only on a fresh volume** so a restart does not
  re-format your database.

If you want the operational view first, see
[concepts → service lifecycle](/concepts/service/) for where
`Initializing` slots between `Pending` and `Running`.

## 1. The minimal shape

```yaml
apiVersion: v1
kind: Service
metadata:
  name: tb
spec:
  image: ghcr.io/tigerbeetle/tigerbeetle:0.16.11
  command: ["tigerbeetle"]
  args: ["start", "--addresses=0.0.0.0:3000", "/data/0_0.tigerbeetle"]
  volumes:
    - name: data
      mountPath: /data
      claimTemplate:
        spec:
          storageClassName: local
          capacity: "1Gi"
  initSteps:
    - name: format
      image: ghcr.io/tigerbeetle/tigerbeetle:0.16.11
      command: tigerbeetle
      args:
        - "format"
        - "--cluster=0"
        - "--replica=0"
        - "--replica-count=1"
        - "/data/0_0.tigerbeetle"
```

Cast it:

```sh
$ rune cast examples/init/tigerbeetle.yaml
    ▶ init step "format" on tb-0
    ✓ init step "format" on tb-0 succeeded
✓ tb is Running
```

The full example lives at
[examples/init/tigerbeetle.yaml](https://github.com/runestack/rune/blob/main/examples/init/tigerbeetle.yaml).

## 2. When does a step run?  `runIf`

Every step has an implicit `runIf`. The default is `freshVolume`, which
covers the database-formatting case: the step executes only when at
least one of the volumes mounted into the step is brand new for this
service. Once the step succeeds, the controller stamps each parent
volume with `initializedFor[<service>] = <timestamp>` so subsequent
restarts skip it.

The full predicate set:

| `runIf.type`   | Runs when…                                                                      |
| -------------- | ------------------------------------------------------------------------------- |
| `freshVolume`  | (default) any mounted volume has no `initializedFor` entry for this service.    |
| `fileMissing`  | the file at `runIf.path` does not exist on a mounted parent volume.             |
| `always`       | every instance start. Use sparingly — usually you want one of the others.       |

`fileMissing` is useful when one volume hosts several initialised
artifacts and `freshVolume` is too coarse. Restrict the check to one
mount with `runIf.volume`:

```yaml
initSteps:
  - name: seed-schema
    image: postgres:16
    command: psql
    args: ["-f", "/seed/schema.sql"]
    runIf:
      type: fileMissing
      volume: data
      path: /var/lib/postgresql/data/.seeded
```

## 3. Retries and timeouts

Init steps default to `restartPolicy: OnFailure`. The runner retries a
failing step up to 3 times with linear backoff before giving up and
flipping the service to `Failed`. Set `restartPolicy: Never` if a
single bad attempt should fail the service immediately.

`timeout` caps a single attempt. The default is 5 minutes. The
cast-level `--timeout` still wraps the whole sequence.

```yaml
initSteps:
  - name: format
    command: tigerbeetle
    args: [...]
    timeout: 2m
    restartPolicy: Never
```

## 4. Process runner specifics

When the parent service uses `runtime: process` instead of containers,
init steps inherit that — they run as subprocesses of `runed` under
the parent's working directory, environment, and security context.

Two restrictions follow:

- **`image` must be empty** for process-runtime init steps. There is no
  image to pull; the binary must already be on `PATH` or referenced by
  absolute path in `command`.
- The step is killed (SIGKILL) if its context is cancelled — for
  example when `rune cast --timeout` fires. The runner reports this
  as a runtime error rather than as a non-zero exit code.

Resources can still be capped per step on Linux via cgroups v2. On
non-Linux hosts the resource block is silently ignored.

## 5. Watching progress

`rune cast` prints a transition line per init step as the controller
advances each instance:

```
    ▶ init step "format" on tb-0
    ✓ init step "format" on tb-0 succeeded
    ↷ init step "seed" on tb-0: skipped (volume already initialized)
    ✗ init step "format" on tb-1 failed: ExitNonZero
        exit code 9 after 3 attempts
```

Once the cluster is up:

- `rune get services` surfaces `InitStepFailed` in the `REASON`
  column for any service the init sequence broke.
- `rune get service <name>` includes the same reason and message in
  the paragraph view.
- `rune logs <service> --init-step <name>` prints the per-instance
  init step state (status, exit code, attempts, reason, message).

```sh
$ rune logs tb --init-step format
INSTANCE  STATUS     EXIT  ATTEMPTS  REASON  MESSAGE
tb-0      Succeeded  0     1         -       -
```

## 6. What an init step inherits

An init step starts from the parent service's pod-shape and overlays
its own keys:

- **Volumes / SecretMounts / ConfigmapMounts**: a `nil` slice (the
  default) inherits all parent mounts. An empty non-nil slice mounts
  none. Naming a parent mount restricts the step to that subset.
- **Env / EnvFrom**: merged on top of the parent env; step-local keys
  win on conflict.
- **Resources**: a step-level block fully replaces the parent's. Init
  for databases is often heavier than steady state; budget for it.
- **SecurityContext** (process runtime): inherited from the parent
  unchanged.

Anything not listed here is copied from the parent verbatim.

## 7. Common pitfalls

- **Forgetting `runIf` semantics on a stateful set.** With
  `claimTemplate`, every replica gets its own volume. `freshVolume`
  fires per-replica, so scaling from 1 → 3 will run `format` on the
  two new instances and not touch the existing one. That is the
  intended behaviour.
- **Side-effecting outside the volume.** If your step writes to an
  external system (an S3 bucket, a config server), `freshVolume`
  cannot prove the work is done. Use `fileMissing` against a marker
  file the step itself writes, or accept that `always` will run on
  every restart.
- **Process runtime + `image`**. The validator rejects this at cast
  time with a clear message. There is no image registry resolver in
  the process runner.
- **Bound resources too low.** A formatter that gets OOM-killed
  retries forever (well, three times) and looks like a bug in your
  init logic. Confirm the cgroup limit can hold your formatter.

## 8. Where to next

- [Persistent storage](/guides/persistent-storage/) — the volume
  primitives `freshVolume` keys off.
- [Logs and exec](/guides/logs-exec/) — `--init-step` integrates with
  the same surface.
- [Service spec reference](/reference/service/) — the full
  `initSteps[]` field schema.
