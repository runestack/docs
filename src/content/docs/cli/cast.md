---
title: rune cast
description: Apply Rune resources from YAML files, directories, runeset bundles, or remote URLs.
---

Aliases: `apply`.

`cast` is the universal "apply this spec" command. It accepts:

- A single YAML file
- A directory of YAML files
- A glob (`services/*.yaml`)
- A runeset directory or `.runeset.tgz` archive
- A remote URL or git ref

```sh
rune cast my-service.yaml
rune cast my-service.yaml --namespace=production
rune cast my-service.yaml --tag=stable
rune cast my-directory/ --recursive
rune cast services/*.yaml
rune cast my-service.yaml --force
rune cast github.com/org/repo/path@ref --create-namespace
rune cast https://example.com/runeset.tgz --release=my-release
rune cast ./runeset.tgz --release=my-release
rune cast ./runeset --render --set=key=value
rune cast ./runeset --render --values=values.yaml
```

## Flags

| Flag                  | Default     | Notes                                                    |
| --------------------- | ----------- | -------------------------------------------------------- |
| `-n, --namespace`     | from context | Target namespace.                                        |
| `--create-namespace`  | false       | Create the namespace if it doesn't exist.                |
| `--detach`            | false       | Return immediately; don't wait for rollout.              |
| `--dry-run`           | false       | Validate without applying.                               |
| `--force`             | false       | Force generation increment even with no diff.            |
| `-r, --recursive`     | false       | Recurse into directories.                                |
| `--tag <name>`        | —           | Tag this deployment for later reference (rollback aid).  |
| `--render`            | false       | Runesets only — print rendered YAML and exit.            |
| `--set k=v`           | —           | Runesets only — override a value (repeatable).           |
| `--values <file>`     | —           | Runesets only — extra values file (repeatable).          |
| `--release <name>`    | —           | Runesets only — install identity.                        |
| `--timeout <dur>`     | `5m`        | Rollout wait timeout.                                    |

## Behavior

- **Idempotent.** Re-applying the same spec is a no-op (unless `--force`).
- **Generation bumps** on every accepted change. The reconciler keys off generation.
- **Multi-document YAML** is supported — separate documents with `---`.
- **Mixed resource files** (services + secrets + configmaps in one file) are fine.

## Common patterns

```sh
# Validate first
rune lint manifests/ --recursive

# Apply everything
rune cast manifests/ --recursive

# Diff a runeset before installing
rune cast ./my-app --render --values=prod.yaml | diff - last-rendered.yaml

# Dry-run a deploy in CI
rune cast service.yaml --dry-run
```

## See also

- [Service spec](/reference/service-spec/)
- [Runesets](/concepts/runesets/)
- [`rune lint`](/cli/lint/)
