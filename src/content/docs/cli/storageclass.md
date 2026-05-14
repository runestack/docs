---
title: rune storageclass
description: Manage storage classes — list, get, create, delete, set the cluster default.
---

```sh
rune storageclass <subcommand> [flags]
rune sc          <subcommand> [flags]    # short alias
```

`StorageClass` is cluster-scoped: it names a driver and a default set of
parameters that volumes can pick up. Two classes (`local`, `local-host`) are
seeded automatically on first boot. See the [storage concept](/concepts/storage/).

## Subcommands

| Command                       | Purpose                                              |
| ----------------------------- | ---------------------------------------------------- |
| `rune storageclass list`      | List storage classes.                                |
| `rune storageclass get <name>`| Show one storage class.                              |
| `rune storageclass create -f` | Create from a YAML/JSON spec file.                   |
| `rune storageclass delete`    | Delete a storage class.                              |
| `rune storageclass set-default <name>` | Mark a class as the cluster default.        |

StorageClass is **cluster-scoped**, which is why it has a dedicated
`create -f` command rather than going through [`rune cast`](/cli/cast/).
Cast is the declarative path for namespaced resources (services,
secrets, configmaps, volumes, snapshots); cluster-scoped resources
get their own `rune <kind> create -f` so cast's namespace-aware
machinery (`--namespace` flag, per-resource `namespace:` field)
doesn't pretend to apply where it doesn't. The file format is
identical to a cast file's `storageClass:` block, so the same YAML
works either way.

Promoting a class to default and `--cascade` deletes are admin-only.

## Examples

```sh
# List
rune storageclass list

# Show one
rune sc get local -o yaml

# Apply from a file
rune storageclass create -f do-nyc3.yaml

# Promote a different class to default (admin)
rune storageclass set-default do-nyc3

# Delete (refused if any Volume still references this class)
rune storageclass delete do-nyc3

# Force delete even with referencing volumes (admin)
rune storageclass delete do-nyc3 --cascade
```

### `do-nyc3.yaml`

```yaml
storageClass:
  name: do-nyc3
  driver: do-volume
  parameters:
    region: nyc3
    fsType: ext4
    apiTokenSecretRef: do/api-token
  reclaimPolicy: retain
  allowedTopologies:
    - matchLabels:
        rune.io/region: nyc3
```

## Flags

### `list`

| Flag                | Default | Notes                                       |
| ------------------- | ------- | ------------------------------------------- |
| `-o, --output`      | `table` | `table`, `json`, `yaml`, `name`.            |
| `-l, --selector`    | —       | Label selector (`key=value,key=value`).     |

### `get <name>`

| Flag                | Default | Notes                                       |
| ------------------- | ------- | ------------------------------------------- |
| `-o, --output`      | `table` | `table`, `json`, `yaml`.                    |

### `create -f <file>`

| Flag           | Default | Notes                                            |
| -------------- | ------- | ------------------------------------------------ |
| `-f, --file`   | —       | Required. Path to YAML/JSON spec file.           |

### `delete <name>`

| Flag           | Default | Notes                                            |
| -------------- | ------- | ------------------------------------------------ |
| `--cascade`    | false   | Delete even if volumes still reference this class. **Admin only.** |

## See also

- [`rune volume`](/cli/volume/) · [`rune snapshot`](/cli/snapshot/)
- [Storage resources reference](/reference/storage-resources/)
