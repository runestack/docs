---
title: rune health
description: Show health status for services, instances, or the node.
---

```sh
rune health [target] [name] [flags]
```

## Examples

```sh
# Service (explicit target)
rune health service api -n default --checks

# Instance
rune health instance api-instance-7c2e --checks

# Node (single-node mode)
rune health node --checks

# Short aliases
rune health svc api
rune health inst api-instance-7c2e

# Autodetect (single argument)
rune health api -n default
```

When you pass a single argument, Rune tries service first, then falls back to instance.

## Flags

| Flag              | Default | Notes                                    |
| ----------------- | ------- | ---------------------------------------- |
| `-n, --namespace` | context | Target namespace.                        |
| `--checks`        | false   | Include detailed probe results.          |
| `--api-server`    | context | One-off API server override.             |

## What it shows

Without `--checks`, you get a summary:

```
NAME    STATUS    READY  RESTARTS  AGE
api     Healthy   3/3    0         2d
```

With `--checks`, you get the per-probe history:

```
Probe: http GET /healthz on :8080
  intervalSeconds: 10  failureThreshold: 3
  Last result: success at 2026-04-25T18:32:14Z (latency 12ms)
  Recent: [✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓ ✓]
```

Failing probes show the most recent error message.

## See also

- [Health checks guide](/guides/health/)
