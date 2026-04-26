---
title: Identity & RBAC
description: How Rune authenticates clients (bearer tokens) and authorizes them (policies). The full model.
---

Rune has a small, explicit auth model:

- **Subjects** are users (and, eventually, services). Each subject has zero or more attached **policies**.
- **Tokens** are bearer credentials issued to subjects. The token's secret hashes with SHA-256; only the hash is stored.
- **Policies** are lists of **rules**. A rule grants `(verbs)` on `(resource)` in `(namespace)`.

A request is allowed if **any rule** in **any of the subject's policies** matches.

## The request flow

```
                          ┌──────────────┐
   Bearer token  ──────▶  │  authFunc    │  ── token lookup ──▶ subject_id
                          └──────┬───────┘
                                 ▼
                          ┌──────────────┐
   resource + verb ────▶  │  rbac check  │  ── policy eval ────▶ allow / deny
   namespace             └──────────────┘
```

If auth is disabled (`auth.enabled: false` in the runefile) the whole chain is bypassed. Don't run that way in production.

## Policy schema

```yaml
name: editor-prod
description: Edit services in 'prod' namespace only
rules:
  - resource: service
    verbs: [get, list, watch, create, update, delete, scale, exec]
    namespace: prod
  - resource: secret
    verbs: [get, list]
    namespace: prod
```

| Field       | Notes                                                                               |
| ----------- | ----------------------------------------------------------------------------------- |
| `resource`  | Resource type (`service`, `instance`, `secret`, `configmap`, `namespace`, …) or `*`. |
| `verbs`     | List of verbs or `["*"]`.                                                           |
| `namespace` | Specific namespace or `*` or empty (treated as `*`).                                 |

Verbs map to RPCs:

| Verb     | Maps to                                  |
| -------- | ---------------------------------------- |
| `get`    | `Get*`                                   |
| `list`   | `List*`                                  |
| `watch`  | streaming `Watch*` / `StreamLogs`        |
| `create` | `Create*`, `Cast*`                       |
| `update` | `Update*`                                |
| `delete` | `Delete*`                                |
| `scale`  | `Scale*`, `Restart*`                     |
| `exec`   | `Exec*`                                  |
| `*`      | All of the above                         |

## Built-in policies

Seeded at first boot:

| Policy      | Rule                                                                  |
| ----------- | --------------------------------------------------------------------- |
| `root`      | `* on * in *` — full access. Reserved for the bootstrap token.        |
| `admin`     | `* on * in *`.                                                        |
| `readwrite` | get/list/watch/create/update/delete/scale/exec on `*` in `*`.          |
| `readonly`  | get/list/watch on `*` in `*`.                                          |

## Tokens

Tokens are issued for a subject:

```sh
rune admin token create alice-laptop \
  --subject-name alice \
  --policies readwrite \
  --ttl 720h
```

The plaintext secret is printed once. After that, only the SHA-256 hash is in the database.

| Property      | Notes                                              |
| ------------- | -------------------------------------------------- |
| `Name`        | Human label.                                       |
| `SubjectID`   | The user's ID.                                     |
| `SubjectType` | `user` today; `service` planned.                   |
| `IssuedAt`    | When minted.                                       |
| `ExpiresAt`   | Optional — `--ttl 0` for no expiry.                |
| `Revoked`     | If true, all requests fail.                        |

Revoke immediately:

```sh
rune admin token revoke <token-id>
```

## Special cases

### Bootstrap

The very first call to a fresh server is `AdminBootstrap`. It's the only RPC that doesn't require auth. After it succeeds, all future calls need a token.

### Local-only admin

By default, all `admin/*` RPCs are gated to localhost on the server side. Toggle with `auth.allow_remote_admin: true` in the runefile. Don't enable this on a public address without TLS.

### Streaming and namespaces

Note: today, streaming RPCs (`logs`, `exec`, `watch`) bypass namespace-scoped policy rules — only `*` namespace rules apply to streams. Treat namespace-scoped policies as protection for write APIs, not stream APIs. This is tracked as a hardening item.

## Recipes

### Read-only auditor

```yaml
name: auditor
rules:
  - resource: "*"
    verbs: [get, list, watch]
    namespace: "*"
```

### Per-namespace deploy bot

```yaml
name: prod-deploy-bot
rules:
  - resource: service
    verbs: [get, list, watch, create, update, scale]
    namespace: prod
  - resource: secret
    verbs: [get, list]
    namespace: prod
  - resource: configmap
    verbs: [get, list, create, update]
    namespace: prod
```

### Exec-only on-call

```yaml
name: oncall-exec
rules:
  - resource: service
    verbs: [get, list, watch, exec]
    namespace: "*"
  - resource: instance
    verbs: [get, list, watch, exec]
    namespace: "*"
```

## Inspecting

```sh
rune whoami                   # who am I and what policies do I have
rune admin user list
rune admin policy list
rune admin policy get readwrite
rune admin token list
```
