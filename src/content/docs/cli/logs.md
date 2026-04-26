---
title: rune logs
description: Stream or fetch logs from services and instances.
---

```sh
rune logs <service-or-instance> [flags]
```

## Examples

```sh
# Stream live
rune logs api --follow

# Last 100 lines
rune logs api --tail=100

# Last 10 minutes
rune logs api --since=10m

# Window
rune logs api --since=10m --until=5m

# Filter
rune logs api --grep=error

# A specific instance
rune logs api-instance-7c2e8a3b
rune logs instance/api-instance-7c2e8a3b

# Service-typed prefix
rune logs service/api
```

## Flags

| Flag             | Default | Notes                                                           |
| ---------------- | ------- | --------------------------------------------------------------- |
| `-f, --follow`   | false   | Stream as logs arrive.                                          |
| `--tail <n>`     | `100`   | Last N lines on start.                                          |
| `--since <dur>`  | —       | Start time relative to now (e.g. `10m`, `1h`).                  |
| `--until <dur>`  | —       | End time relative to now.                                       |
| `--grep <pat>`   | —       | Server-side substring filter.                                   |
| `--timestamps`   | false   | Prefix lines with timestamps.                                   |
| `-o, --output`   | `text`  | `text` or `json` (line-delimited).                              |

## Behavior

- A service-name argument aggregates across all instances.
- An instance ID streams just that instance.
- The runner's buffer is the source — there's no central log store today.

## See also

- [Logs & exec](/guides/logs-exec/)
- [`rune exec`](/cli/exec/)
