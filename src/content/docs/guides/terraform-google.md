---
title: Provision Google Cloud with Terraform
description: Use the official terraform-google-rune module to spin up a Rune edge node on a Compute Engine instance — instance, firewall, service account, optional static IP, cloud-init install, and an optional one-shot admin bootstrap.
---

The [`runestack/rune/google`](https://github.com/runestack/terraform-google-rune)
module provisions a single Rune node on Google Cloud: a Compute Engine
instance, network-tag firewall rules, a service account, an optional
static external IP, cloud-init install, and an optional in-module
`rune admin bootstrap` that hands you a ready-to-paste `rune login`
command.

It's the GCP sibling of [`terraform-aws-rune`](/guides/terraform-aws/),
[`terraform-digitalocean-rune`](/guides/terraform-digitalocean/) and
[`terraform-hetzner-rune`](/guides/terraform-hetzner/), and accepts
almost identical inputs.

:::caution[Pre-1.0]
The module is at `v0.0.1` and tracks Rune's pre-1.0 development. Pin the
module version (`version = "0.0.1"`) and the Rune version
(`rune_version = "v0.0.1-dev.46"`) until v1.0.
:::

## What you need

- [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.5
- GCP credentials (`gcloud auth application-default login`, or
  `GOOGLE_APPLICATION_CREDENTIALS`) — the **project and region** come
  from the `google` provider, not module variables
- An SSH public key
- A domain name with an A record you can point at the new instance

## Minimal example

Worker node, no TLS, no bootstrap, in the `default` network.

```hcl
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = ">= 5.0, < 7.0"
    }
  }
}

provider "google" {
  project = "my-gcp-project"
  region  = "europe-west2"
}

module "rune" {
  source  = "runestack/rune/google"
  version = "0.0.1"

  zone           = "europe-west2-a"
  ssh_public_key = file("~/.ssh/id_ed25519.pub")
  node_role      = "worker"
}

output "ip" {
  value = module.rune.public_ip
}
```

```sh
terraform init
terraform apply
```

When the apply finishes, SSH in (the module creates the `rune` login
user) and bootstrap manually:

```sh
ssh rune@$(terraform output -raw ip) \
  'sudo rune admin bootstrap --out-file /tmp/rune-admin.token'
```

## Edge node with ACME-managed TLS

Same recipe, with edge ingress, Let's Encrypt, and a static external IP
so the public address survives stop/start:

```hcl
module "rune" {
  source  = "runestack/rune/google"
  version = "0.0.1"

  zone           = "europe-west2-a"
  ssh_public_key = file("~/.ssh/id_ed25519.pub")

  node_role          = "edge"
  acme_email         = "ops@example.com"
  allocate_static_ip = true
}
```

What changes vs. the worker example:

- A firewall rule opens `:80` and `:443` to `0.0.0.0/0` so the ACME
  HTTP-01 challenge can complete.
- `runed` binds privileged ports as an unprivileged user via
  `cap_net_bind_service`.
- The ACME orchestrator registers an account with Let's Encrypt using
  `acme_email`.

Point your DNS at the (now stable) address:

```
api.example.com.   IN   A   <module.rune.public_ip>
```

then deploy a service with `expose.tls.mode: auto` (see
[Expose a service](/guides/expose-service/)).

## With automated bootstrap

Set `bootstrap = true` and the module SSHes in, runs
`rune admin bootstrap`, copies the token to local disk, and prints a
ready-to-paste `rune login` command:

```hcl
module "rune" {
  source  = "runestack/rune/google"
  version = "0.0.1"

  zone           = "europe-west2-a"
  ssh_public_key = file("~/.ssh/id_ed25519.pub")

  node_role          = "edge"
  acme_email         = "ops@example.com"
  allocate_static_ip = true

  bootstrap                 = true
  bootstrap_ssh_private_key = file("~/.ssh/id_ed25519")
  bootstrap_token_path      = "rune-admin.token"
}

output "login" {
  value = module.rune.rune_login_command
}
```

After `terraform apply`:

```sh
$(terraform output -raw login)
rune get nodes
```

## Persistent Disks with no service-account key

The module creates a service account and attaches it. Grant it disk
permissions with `enable_pd_csi_access = true` (adds
`roles/compute.storageAdmin`), and the
[`gce-pd` storage driver](/guides/persistent-storage/#using-gce-pd-for-google-persistent-disks)
provisions, attaches and snapshots Persistent Disks through the
instance's own credentials — no key in Terraform state or on disk:

```hcl
module "rune" {
  source  = "runestack/rune/google"
  version = "0.0.1"

  zone                 = "europe-west2-a"
  ssh_public_key       = file("~/.ssh/id_ed25519.pub")
  node_role            = "edge"
  acme_email           = "ops@example.com"
  enable_pd_csi_access = true
}
```

Then create a zone-pinned StorageClass (no `credentialsJSON`):

```yaml
storageClass:
  name: pd-balanced-euw2a
  driver: gce-pd
  parameters:
    zone: europe-west2-a
    diskType: pd-balanced
    fsType: ext4
```

`enable_artifact_registry_access` (on by default) similarly grants
`roles/artifactregistry.reader` for private image pulls.

## Common variables

| Variable | Default | What it does |
|---|---|---|
| `ssh_public_key` | — (required) | SSH public key contents installed for `ssh_user`. |
| `zone` | `europe-west2-a` | GCE zone for the instance and its `gce-pd` disks. |
| `node_role` | `edge` | `edge` opens 80/443 + runs ACME; `worker` skips both. |
| `acme_email` | `""` | Let's Encrypt account email. Required for ACME on edge nodes. |
| `machine_type` | `e2-medium` | GCE machine type. |
| `image` | `ubuntu-os-cloud/ubuntu-2404-lts-amd64` | Boot image (family or self-link). |
| `network` / `subnetwork` | `default` / `""` | VPC placement. |
| `allocate_static_ip` | `false` | Reserve a static external IP that survives stop/start. |
| `create_service_account` | `true` | Create + attach a service account for the node. |
| `enable_pd_csi_access` | `false` | Grant `roles/compute.storageAdmin` so the `gce-pd` driver can manage disks. |
| `enable_artifact_registry_access` | `true` | Grant `roles/artifactregistry.reader` for private image pulls. |
| `rune_version` | `v0.0.1-dev.46` | Release tag passed to `install-server.sh`. |
| `ssh_allowed_cidrs` / `api_allowed_cidrs` | `["0.0.0.0/0"]` | Tighten in production. |
| `bootstrap` | `false` | Run `rune admin bootstrap` automatically after cloud-init. |
| `name` | `""` | Override the instance name. Defaults to `rune-<environment>`. |

The full schema lives in the [module README](https://github.com/runestack/terraform-google-rune#inputs).
The GCP **project and region** are set on the `google` provider block,
not module variables.

## Outputs

| Output | What it is |
|---|---|
| `instance_id` | GCE instance ID. |
| `public_ip` | External IPv4 — the static IP when `allocate_static_ip = true`, else the ephemeral IP. |
| `private_ip` | Internal IPv4 of the instance. |
| `zone` | Zone the instance (and its disks) live in. |
| `grpc_endpoint` | `<ip>:7863` — paste into `rune login --server`. |
| `http_endpoint` | `http://<ip>:7861` — REST API base URL. |
| `network_tag` | Network tag targeted by the firewall rules. |
| `service_account_email` | Service account attached to the node. |
| `static_ip` | Reserved static external IP (empty when `allocate_static_ip = false`). |
| `bootstrap_token_path` | Absolute path to the saved admin token (empty when `bootstrap = false`). |
| `rune_login_command` | Ready-to-paste `rune login` command (empty when `bootstrap = false`). |

## Cloud-init runs once

The installer is rendered into the `user-data` metadata key and cloud-init
runs it **only on first boot**. Changing `rune_version`, `cluster_cidr`,
or anything else that lands in `runefile.toml` after the instance exists
will not take effect on the running instance — the module sets
`lifecycle { ignore_changes = [metadata["user-data"], boot image] }` so a
version bump or new image doesn't silently destroy the instance. To roll
a new config:

```sh
terraform apply -replace=module.rune.google_compute_instance.this
```

This destroys and recreates the instance — service state lives in
`/var/lib/rune`, so plan accordingly. Persistent Disks provisioned via the
`gce-pd` driver survive the rebuild and re-attach to the new instance on
boot (as long as it lands in the same zone).

## Re-rotate the admin token

```sh
terraform apply -replace=module.rune.null_resource.bootstrap[0]
```

## Tear down

```sh
terraform destroy
```

## Next

- [Bootstrap & first user](/start/bootstrap/) — what the bootstrap step
  actually does.
- [Persistent storage](/guides/persistent-storage/) — wire Persistent
  Disks into your services.
- [Expose a service](/guides/expose-service/) — wire a service to a
  public hostname with ACME.
- [Operations → Configuration](/operations/configuration/) — the
  `runefile.toml` reference.
