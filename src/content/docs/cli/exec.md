---
title: rune exec
description: Execute a command inside a running service or instance — interactive or one-off.
---

```sh
rune exec <service-or-instance> [--] <command> [args...]
```

## Examples

```sh
# Interactive shell
rune exec api bash

# One-off
rune exec api ls -la /app

# Specific instance
rune exec api-instance-7c2e ps aux

# Workdir + env + command
rune exec api --workdir=/app --env=DEBUG=true python debug.py

# Non-interactive
rune exec api --no-tty python script.py

# Bound timeout
rune exec api --timeout=30s python long.py
```

## Flags

| Flag              | Default | Notes                                          |
| ----------------- | ------- | ---------------------------------------------- |
| `-n, --namespace` | context | Target namespace.                              |
| `--workdir <dir>` | runner  | Working directory inside the instance.         |
| `--env k=v`       | —       | Extra env var (repeatable).                    |
| `--no-tty`        | false   | Disable TTY allocation.                        |
| `--timeout <dur>` | —       | Bound the session.                             |

## Behavior

- A service-name argument picks any healthy instance.
- An instance ID targets that exact instance.
- Stdin/stdout are forwarded full-duplex when a TTY is allocated.
- Exit code is forwarded — `rune exec` exits with the same status as the inner command.

## Permissions

Gated by the `exec` verb on `service` (or `instance`). Lock this down in production policies — exec is effectively root inside the container.

## See also

- [Logs & exec](/guides/logs-exec/)
- [`rune logs`](/cli/logs/)
