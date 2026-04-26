---
title: Running runed
description: Production layout — systemd, data directories, logs, restarts, and signals.
---

`runed` is one process. Run it under a supervisor, give it a stable data directory, and watch its logs. That's the whole job.

## Systemd (recommended)

The official server install drops a unit at `/etc/systemd/system/runed.service`. If you installed manually, here's a known-good unit:

```ini
[Unit]
Description=Rune control plane
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/local/bin/runed --config /etc/rune/runefile.yaml
Restart=on-failure
RestartSec=2s
LimitNOFILE=65536
StateDirectory=rune
User=root
# Or run as an unprivileged user with access to /var/lib/rune and the docker socket.

[Install]
WantedBy=multi-user.target
```

Lifecycle:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now runed
sudo systemctl status runed
sudo systemctl restart runed
sudo journalctl -u runed -f
```

## Data directory

`--data-dir` (default `/var/lib/rune`) holds:

- BadgerDB state (services, instances, secrets ciphertexts, tokens, policies).
- The KEK file, if `crypto.kek.source: file`.
- Per-resource version history.

**Back this up.** Loss = loss of every service spec, secret, user, and policy.

```sh
# Snapshot
sudo systemctl stop runed
sudo tar -czf rune-backup-$(date +%F).tgz -C /var/lib rune
sudo systemctl start runed
```

For online backup, use BadgerDB's snapshot tooling or copy while accepting that some recent writes may be missed. Multi-node with Raft snapshots is roadmap (RUNE-029).

## Logs

`runed` writes logs to stdout. Under systemd, that goes to `journald`:

```sh
journalctl -u runed -f
journalctl -u runed --since "1 hour ago"
journalctl -u runed -p err  # errors only
```

Configure verbosity in the runefile (`server.log-level`) or with `--log-level`. Use `--log-format=json` if you ship logs to a structured collector.

## Signals

| Signal     | Behavior                                                   |
| ---------- | ---------------------------------------------------------- |
| `SIGTERM`  | Graceful shutdown — drains gRPC, stops orchestrator, exits.|
| `SIGINT`   | Same as `SIGTERM`.                                         |
| `SIGHUP`   | Reserved (no-op today).                                    |

Graceful shutdown waits for in-flight RPCs (with a timeout) and writes any pending state. Don't `SIGKILL` unless something is wedged — you risk losing recent writes.

## Listening addresses

```yaml
server:
  grpc-addr: ":7863"   # bind all interfaces
  http-addr: ":7861"
```

In production, bind to a private interface and front-door with TLS. To restrict to localhost:

```yaml
server:
  grpc-addr: "127.0.0.1:7863"
  http-addr: "127.0.0.1:7861"
```

## Resource sizing

For Release 1 (single node):

| Workload size      | RAM      | Disk        | CPU    |
| ------------------ | -------- | ----------- | ------ |
| ≤ 20 services      | 256 MiB  | 1 GiB       | 0.25 c |
| ≤ 100 services     | 512 MiB  | 5 GiB       | 0.5 c  |
| ≤ 500 services     | 1 GiB    | 20 GiB      | 1 c    |

These are rough. Disk grows with secret/configmap version history — set `storage` retention to taste.

## Health endpoint

`runed` exposes a health endpoint at `:7861/healthz`. Use it for liveness from your host's monitoring.

```sh
curl -fsS http://localhost:7861/healthz
```

Returns 200 when the orchestrator is reconciling. Returns 503 if the store is unreachable or shutting down.

## Failure scenarios

| Scenario                          | Recovery                                                |
| --------------------------------- | ------------------------------------------------------- |
| `runed` crashes                   | Systemd restarts it. State persists on disk.            |
| Disk fills                        | Reconciler logs errors; new writes fail. Free disk.     |
| Docker daemon down                | Container ops fail. Process services keep running.      |
| KEK file deleted/corrupt          | Server refuses to start. Restore from backup.           |
| Bootstrap token lost              | Recover via local-only `rune admin bootstrap` (only works on a server with no live tokens — otherwise: restore from backup). |

## See also

- [Configuration ops guide](/operations/configuration/)
- [Security hardening](/operations/security/)
- [Upgrades](/operations/upgrades/)
- [Runefile reference](/reference/runefile/)
