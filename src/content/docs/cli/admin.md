---
title: rune admin
description: Server administration — bootstrap, users, policies, tokens, and registry credentials.
---

`rune admin *` covers everything that's not day-to-day workload management. Most of it is gated to localhost on the server side unless `auth.allow_remote_admin` is enabled.

## Subcommand groups

```sh
rune admin bootstrap
rune admin user      [create | list]
rune admin policy    [create | get | list | attach | detach | delete]
rune admin token     [create | list | revoke]
rune admin registries [add | list | remove]
```

## `rune admin bootstrap`

Mints the root token. Only works on a fresh server.

```sh
rune admin bootstrap --out-file ~/.rune/token
```

| Flag         | Notes                                              |
| ------------ | -------------------------------------------------- |
| `--out-file` | Write token to file (`0600`). Else stdout.         |

## `rune admin user`

```sh
# Create or update
rune admin user create alice --email alice@example.com

# List
rune admin user list
```

User fields: `name`, `email`, `policies` (attached). Use `policy attach` / `policy detach` to manage policies.

## `rune admin policy`

```sh
# Create from a file
rune admin policy create -f policy.yaml

# Inspect
rune admin policy get readwrite
rune admin policy list

# Attach / detach
rune admin policy attach readwrite --to-user alice
rune admin policy detach readwrite --from-user alice

# Delete
rune admin policy delete obsolete-policy
```

Policy YAML:

```yaml
name: editor-prod
description: Edit services in 'prod' only
rules:
  - resource: service
    verbs: [get, list, watch, create, update, delete, scale, exec]
    namespace: prod
```

Built-in policies (`root`, `admin`, `readwrite`, `readonly`) are seeded automatically and cannot be modified or deleted.

## `rune admin token`

```sh
# Create
rune admin token create alice-laptop \
  --subject-name alice \
  --policies readwrite \
  --ttl 720h \
  --out-file ./alice.token

# List
rune admin token list

# Revoke
rune admin token revoke <token-id>
```

| Flag              | Notes                                                          |
| ----------------- | -------------------------------------------------------------- |
| `--subject-name`  | Existing user name.                                            |
| `--subject-id`    | Existing user ID (alternative to name).                        |
| `--policies`      | Comma-separated policy names (attached if missing).            |
| `--ttl`           | Duration (`720h`, `30d`). Omit for no expiry.                  |
| `--description`   | Free-text description.                                         |
| `--out-file`      | Write token secret to file (mode `0600`). Else stdout.         |

The plaintext secret is printed once. Store it like a password.

## `rune admin registries`

Manage Docker registry credentials so `runed` can pull private images:

```sh
rune admin registries add \
  --name ghcr-private \
  --server ghcr.io \
  --username my-bot \
  --password-file ./ghcr.token

rune admin registries list

rune admin registries remove ghcr-private
```

ECR is supported via AWS credentials inferred from the host environment (or the runefile).

## See also

- [Identity & RBAC](/concepts/identity-rbac/)
- [Bootstrap & first user](/start/bootstrap/)
- [Security hardening](/operations/security/)
