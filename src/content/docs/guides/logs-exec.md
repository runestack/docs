---
title: Logs & exec
description: Stream logs and run interactive commands inside live services. Your two best debugging tools.
---

Both `logs` and `exec` work uniformly across container and process services.

## Tailing logs

```sh
# Follow live logs (newest first)
rune logs api --follow

# Last 100 lines, then exit
rune logs api --tail=100

# Last 10 minutes
rune logs api --since=10m

# Window: from 10m ago up to 5m ago
rune logs api --since=10m --until=5m

# Filter
rune logs api --grep=error
```

By default `rune logs <name>` aggregates across all instances of the service. To pin a single instance:

```sh
rune logs api-instance-7c2e8a3b
# or with explicit type:
rune logs instance/api-instance-7c2e8a3b
```

### Useful flags

| Flag           | Purpose                                                 |
| -------------- | ------------------------------------------------------- |
| `--follow`     | Stream as logs arrive.                                  |
| `--tail=N`     | Start with the last N lines.                            |
| `--since=DUR`  | Only logs after `now - DUR`.                            |
| `--until=DUR`  | Only logs before `now - DUR`.                           |
| `--grep=PAT`   | Server-side filter. Faster than piping through `grep`.  |
| `--timestamps` | Include timestamps in the stream.                       |
| `-o json`      | Structured logs (line-delimited JSON).                  |

### Persistence

Today, `runed` streams logs straight from the runner — no log retention beyond what the container/process itself keeps. For longer retention, ship logs to RuneSight or a third-party log store (RUNE-074, roadmap).

## Exec

Run a command inside a running instance:

```sh
# Interactive shell
rune exec api bash

# One-off command
rune exec api ls -la /app

# Inspect a specific instance
rune exec api-instance-7c2e8a3b ps aux

# With env and workdir
rune exec api --workdir=/app --env=DEBUG=true python debug.py

# Non-interactive (no TTY)
rune exec api --no-tty python script.py

# Bound timeout
rune exec api --timeout=30s python long-running.py
```

If you pass a service name, Rune picks any healthy instance for you. Pass an instance ID to be specific.

### When exec hangs

- The container has no TTY-capable shell — try `sh` instead of `bash`, or `--no-tty`.
- Your terminal isn't forwarding signals — run with `--timeout` to bound it.
- The instance is `Unhealthy` — `rune health instance <id> --checks` will tell you why.

## Common debugging recipes

### "My service is failing — why?"

```sh
rune get service api
rune get instances
rune get instance <failing-id> -o yaml | grep -i message
rune logs <failing-id> --tail=200
```

### "Did my config update land?"

```sh
rune exec api cat /etc/config/log-level
rune exec api env | grep LOG
```

### "Is the database reachable from the api?"

```sh
rune exec api sh
# inside:
nc -zv postgres 5432
curl -sv http://postgres:5432
```

### "Where are my mounted secrets?"

```sh
rune exec api ls /etc/secrets/db
rune exec api cat /etc/secrets/db/username
```

## Security note

`rune exec` is gated by the `exec` verb on `service` (or `instance`). Restrict it in policies for non-on-call users — it's effectively root inside the container.
