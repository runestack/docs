---
title: Namespaces
description: Namespaces partition resources logically — services, secrets, and configmaps live inside one.
---

A **namespace** is a logical scope for resources. Two services can share a name as long as they're in different namespaces. Tokens, policies, and namespaces themselves live in the special `system` namespace.

## Built-in namespaces

| Namespace | Purpose                                                              |
| --------- | -------------------------------------------------------------------- |
| `default` | Where workloads land if you don't specify one.                       |
| `system`  | Internal — tokens, users, policies, namespaces. You rarely touch it. |

Both are seeded automatically on first server start.

## Creating a namespace

```sh
rune create namespace prod
rune create namespace staging
```

Or declaratively:

```yaml
namespace:
  name: prod
  description: Production workloads
```

```sh
rune cast prod-ns.yaml
```

## Using a namespace

Most commands take `-n` / `--namespace`:

```sh
rune get services -n prod
rune cast api.yaml -n prod
rune scale api 5 -n prod
```

Or set a default per context:

```sh
rune login prod \
  --server runed.example.com:7863 \
  --token-file ./prod.token \
  --namespace prod
```

Now `rune` defaults to `prod` for that context.

The `service.namespace:` field in your YAML wins over `-n` if both are set, so prefer one approach per environment.

## Cross-namespace references

Most things are scoped to a single namespace. The exceptions:

- **Tokens, users, policies** live in `system` and are global.
- **Service dependencies** can target other namespaces explicitly:
  ```yaml
  dependencies:
    - service: postgres
      namespace: data
  ```

Secrets and configmaps **cannot** be referenced across namespaces. Copy them or use a runeset.

## Listing across namespaces

```sh
rune get services --all-namespaces
```

This requires a policy that allows the verb in `*` namespace.

## Listing namespaces

```sh
rune get namespaces
```

## Deleting a namespace

```sh
rune delete namespace staging
```

Refuses if the namespace contains resources unless you pass `--force` (cascade delete).
