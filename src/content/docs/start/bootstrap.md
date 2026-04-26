---
title: Bootstrap & first user
description: Bootstrap the root token, then create scoped users with policies — the right way to set up Rune for a team.
---

The very first call to a fresh `runed` is `rune admin bootstrap`. It mints a root token with full privileges. After that, you should create scoped users — never share the root token.

## 1. Bootstrap the root token

`AdminBootstrap` is the only RPC that doesn't require auth. It's also gated to `localhost` on the server side unless `auth.allow_remote_admin` is true. Run it on the server:

```sh
rune admin bootstrap --out-file ~/.rune/token
```

The token is written with mode `0600`. It's a one-time mint — calling bootstrap a second time on a server that already has tokens will fail.

## 2. Configure your CLI to use the root token

```sh
rune login admin \
  --server localhost:7863 \
  --token-file ~/.rune/token \
  --namespace default
rune whoami
```

You're now `root` with the built-in `root` policy (`*` verb on `*` resource in `*` namespace).

## 3. Create a real user

Built-in policies seeded at startup:

| Policy      | Verbs                                                              | Use for                  |
| ----------- | ------------------------------------------------------------------ | ------------------------ |
| `root`      | `*` on `*` in `*`                                                  | Emergency access only.   |
| `admin`     | `*` on `*` in `*`                                                  | Operators.               |
| `readwrite` | `get`, `list`, `watch`, `create`, `update`, `delete`, `scale`, `exec` on `*` | Service developers.      |
| `readonly`  | `get`, `list`, `watch` on `*`                                      | Dashboards, on-call.     |

Create a developer user and attach `readwrite`:

```sh
rune admin user create alice --email alice@example.com
rune admin policy attach readwrite --to-user alice
```

## 4. Issue a token for that user

```sh
rune admin token create alice-laptop \
  --subject-name alice \
  --policies readwrite \
  --ttl 720h \
  --out-file ./alice.token
```

`--ttl` is optional; omit for a non-expiring token. The token secret is printed once and written to the file. Store it like any other credential.

## 5. Switch contexts

Alice can now log in:

```sh
rune login dev \
  --server runed.example.com:7863 \
  --token-file ./alice.token \
  --namespace default
rune whoami
```

The CLI keeps named contexts in `~/.rune/config.yaml`:

```sh
rune config list-contexts
rune use-context dev
```

## 6. Stand up scoped policies (optional)

Built-ins are wide. To restrict alice to a namespace:

```yaml
# alice-dev-policy.yaml
name: alice-dev
description: Read/write only in 'dev' namespace
rules:
  - resource: "*"
    verbs: ["get", "list", "watch", "create", "update", "delete", "scale", "exec"]
    namespace: "dev"
```

```sh
rune admin policy create -f alice-dev-policy.yaml
rune admin policy detach readwrite --from-user alice
rune admin policy attach alice-dev --to-user alice
```

Now alice can only act inside `dev`.

## 7. Revoke when needed

```sh
rune admin token list
rune admin token revoke <token-id>
```

Revocation is immediate — the next request with that token returns `Unauthenticated`.

## What's next

- [Identity & RBAC](/concepts/identity-rbac/) — the policy model in detail.
- [`rune admin`](/cli/admin/) — full reference for user, policy, and token commands.
- [Security hardening](/operations/security/) — turning on TLS, rotating the KEK, restricting CORS.
