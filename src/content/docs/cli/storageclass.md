---
title: rune storageclass
description: Inspect storage classes — list, get, delete, set the cluster default. (StorageClasses are created via `rune cast`.)
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
| `rune storageclass delete`    | Delete a storage class.                              |
| `rune storageclass set-default <name>` | Mark a class as the cluster default.        |

To **create** a StorageClass, use [`rune cast`](/cli/cast/) — the same
declarative path used for every other resource (services, secrets,
configmaps, volumes). See the example below.

Promoting a class to default and `--cascade` deletes are admin-only.

## Examples

```sh
# List
rune storageclass list

# Show one
rune sc get local -o yaml

# Apply from a file — StorageClasses are created via `rune cast`,
# the same declarative path used for every other resource.
rune cast do-nyc3.yaml

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

### `delete <name>`

| Flag           | Default | Notes                                            |
| -------------- | ------- | ------------------------------------------------ |
| `--cascade`    | false   | Delete even if volumes still reference this class. **Admin only.** |

## See also

- [`rune volume`](/cli/volume/) · [`rune snapshot`](/cli/snapshot/)
- [Storage resources reference](/reference/storage-resources/)
