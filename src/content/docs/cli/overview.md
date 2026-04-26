---
title: CLI overview
description: Every rune subcommand at a glance, plus global flags and config layout.
---

The `rune` CLI is a single binary that talks to a `runed` server over gRPC. It keeps named contexts in `~/.rune/config.yaml`, so you can switch between dev, staging, and prod without flag soup.

## Global flags

| Flag                | Default                    | Notes                                       |
| ------------------- | -------------------------- | ------------------------------------------- |
| `--config <file>`   | `~/.rune/config.yaml`      | Override the config file.                   |
| `--log-level`       | `info`                     | `debug`, `info`, `warn`, `error`.           |
| `-v`, `--verbose`   | off                        | Verbose output (also raises log level).     |
| `--version`         | —                          | Print version and exit.                     |

Most subcommands also accept:

| Flag                  | Default                | Notes                                          |
| --------------------- | ---------------------- | ---------------------------------------------- |
| `--api-server <addr>` | from active context    | One-off override.                              |
| `-n`, `--namespace`   | from active context    | One-off override.                              |
| `-o`, `--output`      | `table`                | `table`, `json`, `yaml`.                       |

## Subcommand groups

| Group              | Commands                                                            |
| ------------------ | ------------------------------------------------------------------- |
| **Core**           | [`cast`](/cli/cast/), [`get`](/cli/get/), [`scale`](/cli/scale/), [`restart` / `stop`](/cli/restart-stop/) |
| **Inspection**     | [`logs`](/cli/logs/), [`exec`](/cli/exec/), [`health`](/cli/health/), [`deps`](/cli/deps/) |
| **Resources**      | [`create`](/cli/create/), [`delete`](/cli/delete/)                  |
| **Authoring**      | [`lint`](/cli/lint/), [`pack`](/cli/pack/)                          |
| **Auth & config**  | [`login` / `config`](/cli/login-config/), [`admin`](/cli/admin/)    |
| **Utility**        | [`whoami`, `status`, `version`](/cli/misc/)                         |

## Config file format

`~/.rune/config.yaml`:

```yaml
current-context: dev
contexts:
  dev:
    server: localhost:7863
    namespace: default
    token: <bearer-token>
  prod:
    server: runed.example.com:7863
    namespace: prod
    token-file: /etc/rune/prod.token
    tls:
      ca: /etc/rune/ca.crt
      cert: /etc/rune/client.crt
      key: /etc/rune/client.key
```

Switch contexts:

```sh
rune use-context prod
rune config list-contexts
rune config view
```

Edit a context:

```sh
rune config set-context dev --namespace=staging
```

Or use the shortcut:

```sh
rune login dev --server=localhost:7863 --token-file=./tok --namespace=default
```

## Auth

Every command that talks to the server includes an `Authorization: Bearer <token>` header. Tokens come from the active context — either inline `token:` or a `token-file:`.

If you see `Unauthenticated`, run `rune whoami` to check the token. If you see `PermissionDenied`, the token is valid but the policy doesn't allow that verb.

## Output formats

Most read commands accept `-o`:

```sh
rune get services -o json | jq '.[] | .name'
rune get service api -o yaml > api.yaml
rune get instances -o table   # default
```

Use `-o yaml` to round-trip a live spec back into a file you can edit and re-cast.

## Quick reference

```sh
rune cast service.yaml                  # apply
rune get services                       # list
rune get service api -o yaml            # describe
rune scale api 5                        # scale
rune logs api --follow                  # tail logs
rune exec api bash                      # interactive shell
rune delete api                         # remove
rune health api --checks                # probe status
rune lint ./manifests --recursive       # validate
rune whoami                             # who am I
rune admin token list                   # admin
```

## Shell completion

```sh
rune completion bash > /etc/bash_completion.d/rune
rune completion zsh  > ~/.zsh/completions/_rune
rune completion fish > ~/.config/fish/completions/rune.fish
```
