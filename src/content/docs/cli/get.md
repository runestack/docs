---
title: rune get
description: Display one or many resources. The read side of cast.
---

```sh
rune get <resource-type> [name] [flags]
```

## Resource types

| Type         | Aliases | Notes                            |
| ------------ | ------- | -------------------------------- |
| `services`   | `svc`   | Top-level workloads.             |
| `instances`  | `inst`  | Running copies of services.      |
| `namespaces` | `ns`    | Logical scopes.                  |
| `jobs`       |         | Batch workloads (roadmap).       |
| `configs`    |         | ConfigMaps.                      |
| `secrets`    |         | Secrets (values redacted).       |

## Examples

```sh
# List all services in the current namespace
rune get services

# Describe one in YAML
rune get service api -o yaml

# Across all namespaces
rune get services --all-namespaces

# Watch for live updates
rune get services --watch

# JSON for scripting
rune get instances -o json | jq '.[] | select(.status=="Running") | .id'
```

## Flags

| Flag                | Default | Notes                                          |
| ------------------- | ------- | ---------------------------------------------- |
| `-n, --namespace`   | context | Target namespace.                              |
| `-A, --all-namespaces` | false | List across every namespace.                   |
| `-o, --output`      | `table` | `table`, `json`, `yaml`.                       |
| `--watch`           | false   | Stream updates as state changes.               |
| `-l, --selector`    | —       | Label selector (e.g. `app=api,tier=frontend`). |

## Tips

- `rune get service <name> -o yaml` round-trips into something you can edit and re-cast.
- `--watch` is great for "what's the rollout doing right now?" — Ctrl-C exits.
- `-o json` plus `jq` is the scripting path. Don't try to parse table output.

## See also

- [`rune health`](/cli/health/) for probe state.
- [`rune logs`](/cli/logs/) for runtime output.
