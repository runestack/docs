---
title: rune create
description: Imperative shortcuts for creating namespaces, secrets, and configmaps.
---

`create` is the imperative counterpart to `cast`. Use it when you don't want to write a YAML file for a one-off resource.

## Subcommands

```sh
rune create namespace <name>
rune create secret <name> [--from-literal=k=v]... [--from-file=k=path]...
rune create config <name> [--from-literal=k=v]... [--from-file=k=path]...
```

## Namespace

```sh
rune create namespace prod
rune create namespace prod --description="Production workloads"
```

## Secret

```sh
# Literals
rune create secret db-credentials \
  --from-literal=username=admin \
  --from-literal=password=hunter2

# From files
rune create secret tls-cert \
  --from-file=tls.crt=./certs/server.crt \
  --from-file=tls.key=./certs/server.key

# Replace existing
rune create secret db-credentials --from-literal=password=new-pass --replace
```

## Config

```sh
# Literals
rune create config app-settings \
  --from-literal=log-level=info \
  --from-literal=feature-x=enabled

# From files
rune create config nginx-config \
  --from-file=nginx.conf=./nginx.conf
```

## Common flags

| Flag                  | Notes                                      |
| --------------------- | ------------------------------------------ |
| `-n, --namespace`     | Target namespace.                          |
| `--from-literal=k=v`  | Inline key/value (repeatable).             |
| `--from-file=k=path`  | Read value from file (repeatable).         |
| `--replace`           | Overwrite if it exists.                    |

## When to use `cast` instead

For anything you'd want to commit to git — most config — write a YAML file and `cast` it. `create` is for ad-hoc work, prototyping, and CI bootstraps.

## See also

- [Use secrets & configmaps](/guides/secrets-configmaps/)
- [`rune cast`](/cli/cast/)
