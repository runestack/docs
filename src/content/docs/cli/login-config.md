---
title: rune login / config
description: Manage CLI contexts — server addresses, tokens, default namespaces.
---

The CLI keeps named **contexts** in `~/.rune/config.yaml`. Each context is a `(server, token, namespace, tls)` tuple. Switch between them with `rune use-context`.

## `rune login`

Shortcut for "create or update a context, optionally make it the current one."

```sh
rune login dev \
  --server localhost:7863 \
  --token-file ~/.rune/dev.token \
  --namespace default
```

If you omit `<context-name>`, it defaults to `default`.

| Flag             | Notes                                              |
| ---------------- | -------------------------------------------------- |
| `--server`       | gRPC address (`host:port`).                        |
| `--token`        | Inline token value.                                |
| `--token-file`   | Path to a file containing the token.               |
| `--namespace`    | Default namespace for this context.                |
| `--no-verify`    | Skip server verification — just set the context.   |
| `--set-current`  | Make this the active context (default: yes).       |

`rune login` verifies the server is reachable and the token works (unless `--no-verify`).

## `rune config`

Sub-commands:

```sh
rune config view                      # show current config
rune config list-contexts             # list all
rune config use-context <name>        # switch active context
rune config set-context <name> [...]  # create or update a context
rune config delete-context <name>     # remove
```

### `set-context`

```sh
rune config set-context prod \
  --server runed.example.com:7863 \
  --token-file /etc/rune/prod.token \
  --namespace prod \
  --tls-ca /etc/rune/ca.crt \
  --tls-cert /etc/rune/client.crt \
  --tls-key /etc/rune/client.key
```

Update one field on an existing context:

```sh
rune config set-context dev --namespace=staging
```

### Aliases

`rune use-context` is a top-level alias for `rune config use-context`:

```sh
rune use-context prod
```

## Config file layout

`~/.rune/config.yaml`:

```yaml
current-context: dev
contexts:
  dev:
    server: localhost:7863
    namespace: default
    token: <bearer>
  prod:
    server: runed.example.com:7863
    namespace: prod
    token-file: /etc/rune/prod.token
    tls:
      ca: /etc/rune/ca.crt
      cert: /etc/rune/client.crt
      key: /etc/rune/client.key
```

The file is created with mode `0600`.

## Tips

- Prefer `token-file` over inline `token` for shared machines.
- Use one context per environment, not one per cluster — same context, different namespace works fine for many "envs" inside a single Rune.
- `rune whoami` will tell you which context you're in and whether the token works.

## See also

- [`rune whoami`](/cli/misc/)
- [`rune admin`](/cli/admin/)
- [Bootstrap & first user](/start/bootstrap/)
