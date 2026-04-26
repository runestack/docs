---
title: Installation
description: Install the rune CLI and the runed server. Pick between a one-liner, a server bundle, or building from source.
---

Rune ships as two binaries: `rune` (CLI) and `runed` (server). Most installs use one of the official scripts.

## CLI only — for developers

If you just need to talk to a remote `runed`, install the CLI:

```sh
curl -fsSL https://raw.githubusercontent.com/runestack/rune/master/scripts/install-cli.sh | bash
```

This drops `rune` in `/usr/local/bin` (or `~/.local/bin` if not root). Verify:

```sh
rune version
```

## Full server bundle — recommended for hosts

The server bundle installs both binaries plus a systemd unit and Docker (if missing):

```sh
curl -fsSL https://raw.githubusercontent.com/runestack/rune/master/scripts/install-server.sh \
  | sudo bash -s -- --version v0.1.0
```

What it does:

1. Installs `rune` and `runed` to `/usr/local/bin`.
2. Installs Docker if not already present (skip with `--skip-docker`).
3. Creates `/etc/rune/runefile.yaml` with sane defaults.
4. Creates `/var/lib/rune` for state (BadgerDB + KEK).
5. Installs and enables `runed.service`.

For automated provisioning (cloud-init, CI/CD), drop `sudo`:

```sh
curl -fsSL https://raw.githubusercontent.com/runestack/rune/master/scripts/install-server.sh \
  | bash -s -- --version v0.1.0
```

## Binary-only — Docker already configured

If Docker is set up and you only want the binaries:

```sh
curl -fsSL https://raw.githubusercontent.com/runestack/rune/master/scripts/install.sh \
  | sudo bash -s -- --version v0.1.0
```

## From source

Requires Go 1.23+.

```sh
git clone https://github.com/runestack/rune.git
cd rune
make setup
make build

# Or via go install
go install github.com/runestack/rune/cmd/rune@latest
go install github.com/runestack/rune/cmd/runed@latest

rune version
```

The `Makefile` targets:

| Target          | What it does                                   |
| --------------- | ---------------------------------------------- |
| `make setup`    | Installs lint and protobuf tooling.            |
| `make build`    | Builds both binaries to `bin/`.                |
| `make test`     | Runs unit tests.                               |
| `make test-int` | Runs integration tests (requires Docker).      |
| `make proto`    | Regenerates protobuf code.                     |
| `make lint`     | Runs `golangci-lint`.                          |

## Manual binary install

Grab a release tarball:

```sh
VER=v0.1.0
ARCH=$(uname -m); case "$ARCH" in
  x86_64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *) echo "Unsupported arch"; exit 1 ;;
esac

curl -L -o /tmp/rune.tgz \
  "https://github.com/runestack/rune/releases/download/$VER/rune_linux_${ARCH}.tar.gz"
sudo tar -C /usr/local/bin -xzf /tmp/rune.tgz rune runed
```

## Upgrading

Stop the service, swap the binaries, restart:

```sh
sudo systemctl stop runed
curl -fsSL https://raw.githubusercontent.com/runestack/rune/master/scripts/install-server.sh \
  | sudo bash -s -- --version v0.1.1 --skip-docker
sudo systemctl start runed

runed --version
sudo systemctl status runed --no-pager | cat
```

## Uninstall

```sh
sudo systemctl stop runed
sudo systemctl disable runed
sudo rm /etc/systemd/system/runed.service
sudo rm /usr/local/bin/rune /usr/local/bin/runed
# State (delete only if you really mean it):
sudo rm -rf /var/lib/rune /etc/rune
```

## Verify

```sh
rune version
runed --version
sudo systemctl status runed --no-pager
```

If `runed` won't start, check:

```sh
sudo journalctl -u runed -n 100 --no-pager
```

Common issues are covered in [Operations → Configuration](/operations/configuration/).
