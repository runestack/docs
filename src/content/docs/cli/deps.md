---
title: rune deps
description: Manage and inspect service dependencies.
---

## Subcommands

```sh
rune deps graph <service>          # render dependency graph
rune deps check <service>          # readiness check for each dep
rune deps validate <service>       # validate dep declarations
rune deps dependents <service>     # who depends on this service
```

## Examples

```sh
# Visualize what api depends on
rune deps graph api

# Are all deps ready?
rune deps check api

# Validate dep declarations in a spec file
rune deps validate -f api.yaml

# Who depends on postgres? (useful before deletion)
rune deps dependents postgres
```

## Output

`rune deps graph api`:

```
api
├── postgres (healthy)
│   └── pgbouncer (running)
└── redis (running)
```

`rune deps check api`:

```
DEPENDENCY  NAMESPACE  STATE     READY-WHEN  STATUS
postgres    default    Healthy   healthy     ✓
redis       default    Running   running     ✓
```

`rune deps dependents postgres`:

```
NAME  NAMESPACE  REQUIRED
api   default    yes
etl   data       yes
auth  shared     no (optional)
```

## Flags

| Flag              | Default | Notes                       |
| ----------------- | ------- | --------------------------- |
| `-n, --namespace` | context | Target namespace.           |
| `-o, --output`    | `text`  | `text`, `json`, `yaml`.     |
| `-f, --file`      | —       | For `validate` — spec file. |

## See also

- [Service dependencies](/guides/dependencies/)
- [Services concept](/concepts/services/)
