---
title: Upgrades
description: How to upgrade runed and the rune CLI safely. Rollback, version skew, what pauses during the swap, and the Terraform pitfalls.
---

Rune ships single binaries — upgrades are mostly "swap and restart." This page covers the corners that matter in production: which path to use, what actually pauses during the swap, the file-capability gotcha, and the Terraform module behaviour that's bitten operators.

## Pick an upgrade path

| Scenario | Path | Notes |
| --- | --- | --- |
| Routine `runed` version bump on an existing host | [`scripts/upgrade-server.sh`](https://github.com/runestack/rune/blob/main/scripts/upgrade-server.sh) | Swaps binaries, re-applies `cap_net_bind_service`, restarts, rolls back on failure. **Doesn't** touch the systemd unit, runefile, or data dir. |
| First-time install, or you want the systemd unit refreshed to current | [`scripts/install-server.sh`](https://github.com/runestack/rune/blob/main/scripts/install-server.sh) | Greenfield path. Re-running it on an existing host *will* rewrite the unit and re-`setcap` — useful when the on-disk unit has drifted behind the installer template. |
| Provisioned via `terraform-digitalocean-rune` (or similar) | `upgrade-server.sh` over SSH, **not** `terraform apply` with a bumped `rune_version` | See the [Terraform-managed deployments](#terraform-managed-deployments) section. |
| Just the CLI on a developer machine | [`scripts/install-cli.sh`](https://github.com/runestack/rune/blob/main/scripts/install-cli.sh) | Doesn't touch `runed`. |

## Version skew

Client and server share a generated proto package. Mismatched versions usually still work for compatible RPCs, but new features only show up when both sides are upgraded.

- **CLI ahead of server**: missing fields in responses, possible `unknown field` warnings on requests. Mostly fine.
- **CLI behind server**: missing client-side support for new flags. Update the CLI.

`rune version` since v0.0.1-dev.38 prints both client and server build info — use it to spot skew at a glance.

```sh
$ rune version
Client:
  Version:    v0.0.1-dev.44
  Commit:     32ab1d04
Server:
  Version:    v0.0.1-dev.43
  Commit:     ffde251c
```

Pin to the same version on both sides for production.

## Upgrade `runed` — the script

Since v0.0.1-dev.44, the recommended in-place upgrade path is `scripts/upgrade-server.sh`. Run it as root on the host:

```sh
sudo bash <(curl -fsSL https://raw.githubusercontent.com/runestack/rune/main/scripts/upgrade-server.sh) \
  --version v0.0.1-dev.44
```

What it does:

1. Downloads `rune_linux_<arch>.tar.gz` for the requested version.
2. Notes whether the current `runed` has `cap_net_bind_service` set (via `getcap`).
3. Backs up the current binaries to `/usr/local/bin/.{rune,runed}.bak`.
4. Stops `runed`, atomically replaces the binaries, re-applies the file capability when applicable, starts `runed`.
5. Polls `systemctl is-active` for up to 15s.
6. **On verification failure**: restores the backup binaries and restarts. The EXIT trap covers any failure point.

Flags worth knowing:

- `--skip-restart` — replace binaries without restarting (for scripted maintenance windows).
- `--skip-caps` — don't re-apply `cap_net_bind_service`. Use if you've moved low-port binding entirely to systemd's `AmbientCapabilities`.
- `--no-keep-backup` — remove the backup files after success. Default keeps them so you can roll back by hand.
- `--refresh-unit` *(since v0.0.1-dev.45)* — replace the on-disk `runed.service` with a fresh one from `runed print-systemd`. See [Refreshing the systemd unit](#refreshing-the-systemd-unit) below.

### Refreshing the systemd unit

The on-disk `/etc/systemd/system/runed.service` is written by `install-server.sh` at first boot and never updated again unless you do something about it. The Rune team adds directives to that template over time — `AmbientCapabilities=CAP_NET_BIND_SERVICE` (the back-stop for the [file-capability trap](#the-file-capability-trap)), resource limits, OOM tuning — and hosts that were provisioned from older installers don't pick those up automatically.

Since v0.0.1-dev.45, the `runed` binary itself emits its canonical unit via `runed print-systemd`, and `upgrade-server.sh --refresh-unit` uses that to swap in a current unit during the upgrade.

```sh
sudo bash <(curl -fsSL https://raw.githubusercontent.com/runestack/rune/main/scripts/upgrade-server.sh) \
  --version v0.0.1-dev.45 \
  --refresh-unit
```

The flow during a `--refresh-unit` run:

1. Binaries are swapped first (same as a plain upgrade).
2. The new `runed` is invoked: `/usr/local/bin/runed print-systemd > runed.service.new`. Rendering uses the new binary, so the unit always matches what *this version* of `runed` expects.
3. The old unit is backed up to `/etc/systemd/system/runed.service.bak`.
4. The new unit is installed and `systemctl daemon-reload` runs.
5. `runed` is restarted; the verification path is the same as the plain upgrade.
6. **On verification failure**, the EXIT trap restores both the binary and the previous unit, reloads, and restarts.

You can inspect what `runed` would write before committing to the refresh:

```sh
# What would the new unit look like?
runed print-systemd

# Diff against what's deployed:
diff <(runed print-systemd) /etc/systemd/system/runed.service
```

`runed print-systemd` accepts `--user`, `--group`, `--binary`, and `--config` if your install uses non-default paths. With no flags it emits the same unit `install-server.sh` would write today.

**Caveat for customized units.** `--refresh-unit` replaces the whole base unit. If you've edited it by hand to add (say) `Environment=` lines or a custom `RestartSec`, those go to the `.bak` file and don't carry forward. Two safer patterns:

- **Drop-ins**: put your customisations in `/etc/systemd/system/runed.service.d/*.conf` instead of editing the base unit. Drop-ins aren't touched by `--refresh-unit`. This is the pattern `install-server.sh` already uses for `SupplementaryGroups=docker` when the docker group exists.
- **Diff first**: run `diff <(runed print-systemd) /etc/systemd/system/runed.service` before `--refresh-unit` and adapt the customisations into drop-ins ahead of the refresh.

### The file-capability trap

This is the one to remember. `cap_net_bind_service` is set via `setcap` and stored as an extended attribute on the binary file. **It does not survive `cp` / `mv` / `install`** — any binary-only replacement strips it, and runed (running as the non-root `rune` user) then fails to bind `:80` / `:443` / `:53` with `bind: permission denied`.

`upgrade-server.sh` handles this automatically. If you're doing a manual swap (see below), you need to re-apply:

```sh
sudo setcap cap_net_bind_service=+ep /usr/local/bin/runed
```

The systemd unit shipped by `install-server.sh` *also* sets `AmbientCapabilities=CAP_NET_BIND_SERVICE` and `CapabilityBoundingSet=CAP_NET_BIND_SERVICE` as a belt-and-braces measure. On modern systemd those alone *should* be sufficient — but on hosts provisioned from older `install-server.sh` versions the unit may pre-date that line. If you suspect that's you, refresh the unit by re-running `install-server.sh` once.

## Upgrade `runed` — manual swap

If you want to know every step or you're building a custom upgrade flow:

```sh
VER=v0.0.1-dev.44
ARCH=$(uname -m); case "$ARCH" in
  x86_64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo "Unsupported"; exit 1 ;;
esac

# Backup
sudo cp /usr/local/bin/rune  /usr/local/bin/.rune.bak
sudo cp /usr/local/bin/runed /usr/local/bin/.runed.bak

# Swap
sudo systemctl stop runed
curl -L -o /tmp/rune.tgz \
  "https://github.com/runestack/rune/releases/download/$VER/rune_linux_${ARCH}.tar.gz"
sudo tar -C /usr/local/bin -xzf /tmp/rune.tgz rune runed

# Re-apply file capability (REQUIRED for edge nodes binding :80/:443/:53)
sudo setcap cap_net_bind_service=+ep /usr/local/bin/runed

sudo systemctl start runed
runed --version
sudo systemctl status runed --no-pager | cat
```

`upgrade-server.sh` is the same flow with rollback and verification baked in — prefer it.

## Upgrade the CLI only

```sh
curl -fsSL https://raw.githubusercontent.com/runestack/rune/main/scripts/install-cli.sh | bash
rune version
```

## What actually pauses during the swap

`runed` is the API server, the orchestrator, the ingress proxy, the embedded DNS resolver, and (when configured) the ACME runner — all in one process. While it's stopped, four things are unavailable:

| Surface | Behaviour during the ~5–15s window |
| --- | --- |
| **gRPC control plane** | `rune` CLI calls fail (connection refused). No new services/instances can start. |
| **Ingress on :80/:443** | Listener is in-process. External HTTP/HTTPS traffic to ingress-exposed services drops. Already-established connections may stall. |
| **Embedded DNS** | `*.rune` name resolution between containers breaks. Already-resolved connections stay up; new lookups fail. |
| **Health probes** | Runner-driven probes don't fire. Services with tight `failureThreshold` × `intervalSeconds` may briefly flip to `Degraded` and recover when `runed` returns. |

**Service workload containers keep running** — they're independent Docker containers, not in runed's data path. Their TCP listeners stay up; whatever was talking to them via container IPs continues unaffected.

True zero-downtime upgrades (and a story for ingress that survives `runed` restart) require multi-node Raft, on the roadmap as RUNE-025.

## Terraform-managed deployments

If you're using [`terraform-digitalocean-rune`](https://github.com/runestack/terraform-digitalocean-rune) (or a similar module), there's a sharp edge worth knowing about.

The module renders `var.rune_version` into the droplet's `user_data` (cloud-init). Cloud-init runs **only on first boot** — bumping `rune_version` in code does not re-run the installer on an existing droplet. Until v0.0.5 of the module, the default Terraform behaviour on a `user_data` change was to **mark the droplet for replacement** (destroy + create), which would wipe `/var/lib/rune` (KEK, BadgerDB store, host-local volumes).

Since v0.0.6 the module sets `lifecycle { ignore_changes = [user_data] }` on the droplet so the variable can advance freely in code without triggering a destroy.

The correct flow with the TF module:

```sh
# 1. SSH to the droplet and upgrade in place:
sudo bash <(curl -fsSL https://raw.githubusercontent.com/runestack/rune/main/scripts/upgrade-server.sh) \
  --version v0.0.1-dev.44

# 2. Bump var.rune_version in your TF code so new droplets (DR rebuild,
#    region migration, etc.) start at the same version. The apply will
#    be a no-op for the existing droplet because of ignore_changes.
terraform apply
```

If you genuinely want a fresh droplet at a new version — e.g. for a deliberate DR rebuild or a disposable preview environment — use `-replace`:

```sh
terraform apply -replace=module.rune.digitalocean_droplet.this
```

This bypasses `ignore_changes` and recreates the droplet. **Expect data loss** on the destroyed host. Floating IPs and externally-attached DO Block Storage volumes survive; everything on the droplet's root disk does not.

## Pre-upgrade checklist

- [ ] **Backup** the data dir (default `/var/lib/rune`) and the KEK separately.
- [ ] **Read the release notes** — breaking changes are flagged.
- [ ] **Run on a staging host first** if your environment supports it.
- [ ] **Confirm reachability** of all your image registries from the host.
- [ ] **Note the current version** (`rune version`) so you have a target if rollback is needed.

## Post-upgrade checks

```sh
rune version                                # both blocks should match
sudo systemctl status runed --no-pager
sudo journalctl -u runed -n 100 --no-pager  # look for binding errors

rune whoami                                  # API responsive, server version line
rune get services -A                         # full inventory, look for Failed
rune status
```

For edge nodes:

```sh
# Confirm the file capability is still in place after upgrade.
getcap /usr/local/bin/runed
# → /usr/local/bin/runed cap_net_bind_service=ep
```

If services come back as `Failed`, check probe configuration — schema validation sometimes tightens between minor versions (see the [Init steps troubleshooting](/guides/init-steps/#11-troubleshooting) section for examples).

## Rollback

If the new version misbehaves and `upgrade-server.sh` has already declared success (the failure surfaced later), restore by hand:

```sh
sudo systemctl stop runed
sudo cp /usr/local/bin/.rune.bak  /usr/local/bin/rune
sudo cp /usr/local/bin/.runed.bak /usr/local/bin/runed
sudo setcap cap_net_bind_service=+ep /usr/local/bin/runed   # if edge
sudo systemctl start runed
```

The backups are at `/usr/local/bin/.{rune,runed}.bak` unless you ran with `--no-keep-backup`.

If `upgrade-server.sh` itself fails verification, it has *already* rolled back via its EXIT trap before exiting non-zero — no manual restore needed.

Data on disk is forward- and backward-compatible across patch versions. Across minor versions, breaking schema migrations are flagged in release notes — back up before, and only roll forward unless the notes say otherwise.

## Schema migrations

Most upgrades are pure binary swaps with no schema migration. When a migration is needed, `runed` runs it on first boot of the new version. If a migration fails:

1. The server refuses to serve until the migration completes or you restore from backup.
2. The journal will tell you exactly which step failed.
3. Restore from backup, downgrade, file an issue.

## Upgrading the CLI on every developer's machine

For teams, ship the CLI version as a managed dependency:

- **Homebrew tap** (planned).
- **CI step** that downloads a known version into the runner.
- **Devcontainer / asdf plugin** for local dev.

Avoid relying on `curl | bash` ad hoc — pin a version per environment.

## See also

- [Installation](/start/installation/)
- [Running runed](/operations/runed/)
- [Configuration](/operations/configuration/)
- [`upgrade-server.sh` source](https://github.com/runestack/rune/blob/main/scripts/upgrade-server.sh)
- [`terraform-digitalocean-rune` module](https://github.com/runestack/terraform-digitalocean-rune)
