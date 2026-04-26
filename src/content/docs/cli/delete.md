---
title: rune delete
description: Remove resources and inspect deletion operations.
---

## Shorthand — delete a service

```sh
rune delete my-service
rune delete my-service --force --output json
```

## Subcommands

```sh
rune delete service <name>      # full form
rune delete list                # list deletion operations
rune delete status <id>         # inspect a specific deletion op
```

## Examples

```sh
# Delete a service
rune delete api

# Force-delete (ignore "in use" errors)
rune delete api --force

# Delete a secret / configmap
rune delete secret db-credentials
rune delete config app-settings

# Delete a namespace (refuses if not empty unless --force)
rune delete namespace staging --force

# Watch a long-running deletion
rune delete list
rune delete status <id>
```

## Flags

| Flag              | Default | Notes                                            |
| ----------------- | ------- | ------------------------------------------------ |
| `-n, --namespace` | context | Target namespace.                                |
| `--force`         | false   | Skip "in use" / "non-empty" checks.              |
| `--wait`          | `true`  | Wait for deletion to complete.                   |
| `--no-wait`       | false   | Return immediately with a deletion op ID.         |
| `--timeout`       | `5m`    | Wait timeout.                                    |
| `-o, --output`    | `table` | `table`, `json`, `yaml`.                         |

## Behavior

Deletion is staged through finalizers and worker tasks (see [pkg/orchestrator/finalizers](https://github.com/runestack/rune/tree/master/pkg/orchestrator/finalizers)). For services, that means:

1. Mark spec for deletion.
2. Scale to 0.
3. Run finalizers (deregister from discovery, cleanup networks, etc.).
4. Remove the resource from the store.

You can interrogate any of those steps with `rune delete status <id>`.
