---
title: Upgrades
description: How to upgrade runed and the rune CLI safely. Rollback, version skew, and what to test.
---

Rune ships single binaries — upgrades are mostly "swap and restart." This page covers the corners.

## Version skew

The CLI and server share a generated proto package. Mismatched versions usually still work for compatible RPCs, but new features only show up when both sides are upgraded.

Rule of thumb:

- **CLI ahead of server**: missing fields in responses, "unknown field" warnings on requests. Mostly fine.
- **CLI behind server**: missing client-side support for new flags. Update the CLI.

Pin to the same version on both sides for production.

## Upgrade `runed` — scripted

Recommended path for hosts that used `install-server.sh`:

```sh
curl -fsSL https://raw.githubusercontent.com/runestack/rune/master/scripts/install-server.sh \
  | sudo bash -s -- --version v0.1.1 --skip-docker
```

The script:

1. Downloads the new tarball.
2. Stops `runed` cleanly.
3. Replaces the binaries.
4. Starts `runed`.
5. Leaves config and data untouched.

## Upgrade `runed` — manual

```sh
VER=v0.1.1
ARCH=$(uname -m); case "$ARCH" in
  x86_64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo "Unsupported"; exit 1 ;;
esac

sudo systemctl stop runed
curl -L -o /tmp/rune.tgz \
  "https://github.com/runestack/rune/releases/download/$VER/rune_linux_${ARCH}.tar.gz"
sudo tar -C /usr/local/bin -xzf /tmp/rune.tgz rune runed
sudo systemctl start runed

runed --version
sudo systemctl status runed --no-pager | cat
```

## Upgrade the CLI only

```sh
curl -fsSL https://raw.githubusercontent.com/runestack/rune/master/scripts/install-cli.sh | bash
rune version
```

## Pre-upgrade checklist

- [ ] **Backup**: `--data-dir` and the KEK file (separately).
- [ ] **Read the release notes**: breaking changes are flagged.
- [ ] **Run on a staging host first**.
- [ ] **Confirm reachability** of all your registries from the host.

## Post-upgrade checks

```sh
runed --version
rune version
sudo systemctl status runed --no-pager
sudo journalctl -u runed -n 100 --no-pager

rune whoami
rune get services -A          # full inventory
rune status
```

If services come back as `Failed` after restart, check probe configuration — schema rules sometimes tighten between minor versions.

## Rollback

If the new version misbehaves:

```sh
sudo systemctl stop runed
# Re-install the previous version with install-server.sh --version vX.Y.Z
sudo systemctl start runed
```

Data on disk is forward- and backward-compatible across patch versions. Across minor versions, breaking schema migrations are flagged in release notes — back up before, and only roll forward.

## Zero-downtime?

Single-node `runed` cannot be upgraded with zero downtime — there's only one. Workloads keep running (containers don't restart on a `runed` restart), but the API is unavailable for ~5–15 seconds during the swap.

True zero-downtime requires multi-node Raft (Release 2 — RUNE-025).

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
