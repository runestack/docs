---
title: Provision Hetzner Cloud with Terraform
description: Use the official terraform-hetzner-rune module to spin up a Rune edge node on a Hetzner Cloud server — server, firewall, cloud-init install, and an optional one-shot admin bootstrap.
---

The [`runestack/rune/hcloud`](https://github.com/runestack/terraform-hetzner-rune)
module provisions a single Rune node on Hetzner Cloud: server,
firewall, cloud-init install, and an optional in-module
`rune admin bootstrap` that hands you a ready-to-paste `rune login`
command.

It's the Hetzner sibling of [`terraform-digitalocean-rune`](/guides/terraform-digitalocean/)
and accepts almost identical inputs, so switching providers is a
one-line module source swap.

:::caution[Pre-1.0]
The module is at `v0.0.1` and tracks Rune's pre-1.0 development.
Pin the module version (`version = "0.0.1"`) and the Rune version
(`rune_version = "v0.0.1-dev.46"`) until v1.0.
:::

## What you need

- [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.5
- A Hetzner Cloud project with an [API token](https://docs.hetzner.cloud/#getting-started)
  (`export HCLOUD_TOKEN=...`)
- An SSH key uploaded to your Hetzner Cloud project
- A domain name with an A record you can point at the new server

## Minimal example

Worker node, no TLS, no bootstrap.

```hcl
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = ">= 1.45, < 2.0"
    }
  }
}

module "rune" {
  source  = "runestack/rune/hcloud"
  version = "0.0.1"

  ssh_keys  = ["my-laptop"]
  node_role = "worker"
}

output "ip" {
  value = module.rune.ipv4_address
}
```

```sh
terraform init
terraform apply
```

When the apply finishes, SSH in and bootstrap manually:

```sh
ssh root@$(terraform output -raw ip) \
  'rune admin bootstrap --out-file /tmp/rune-admin.token'
```

## Edge node with ACME-managed TLS

Same recipe, with edge ingress and Let's Encrypt:

```hcl
module "rune" {
  source  = "runestack/rune/hcloud"
  version = "0.0.1"

  ssh_keys = ["my-laptop"]

  node_role  = "edge"
  acme_email = "ops@example.com"
}
```

What changes vs. the worker example:

- Firewall opens `:80` and `:443` to `0.0.0.0/0` so the ACME
  HTTP-01 challenge can complete.
- The server binds privileged ports as the unprivileged `rune`
  user via `cap_net_bind_service` — set up by the installer.
- The ACME orchestrator is enabled and registers an account with
  Let's Encrypt using `acme_email`.

Once the server is up, point your DNS at it:

```
api.example.com.   IN   A   <module.rune.ipv4_address>
```

then deploy a service with `expose.tls.mode: auto` (see
[Expose a service](/guides/expose-service/)).

## With automated bootstrap

Set `bootstrap = true` and the module SSHes in, runs
`rune admin bootstrap`, copies the token to local disk, and prints
a ready-to-paste `rune login` command:

```hcl
module "rune" {
  source  = "runestack/rune/hcloud"
  version = "0.0.1"

  ssh_keys = ["my-laptop"]

  node_role  = "edge"
  acme_email = "ops@example.com"

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

## Common variables

| Variable | Default | What it does |
|---|---|---|
| `ssh_keys` | — (required) | Hetzner Cloud SSH key names (or IDs) to install on the server. |
| `node_role` | `edge` | `edge` opens 80/443 + runs ACME; `worker` skips both. |
| `acme_email` | `""` | Let's Encrypt account email. Required for ACME on edge nodes. |
| `location` | `nbg1` | Hetzner location (e.g. `nbg1`, `fsn1`, `hel1`, `ash`, `hil`, `sin`). |
| `server_type` | `cx22` | Hetzner server type. Edge nodes terminating TLS should be at least `cx22`. |
| `image` | `ubuntu-24.04` | Base image. Tested on Ubuntu 24.04 LTS. |
| `rune_version` | `v0.0.1-dev.46` | Release tag passed to `install-server.sh`. Bump per Rune release. |
| `cluster_cidr` | `10.96.0.0/16` | CIDR used by the Rune networking layer. |
| `ssh_allowed_cidrs` | `["0.0.0.0/0", "::/0"]` | Tighten in production. |
| `api_allowed_cidrs` | `["0.0.0.0/0", "::/0"]` | Locks down the gRPC + HTTP API ports. |
| `bootstrap` | `false` | Run `rune admin bootstrap` automatically after cloud-init. |
| `bootstrap_ssh_private_key` | `""` | Required (PEM, sensitive) when `bootstrap = true`. |
| `enable_backups` | `false` | Weekly Hetzner server backups (adds 20% to cost). |
| `name` | `""` | Override the server name. Defaults to `rune-<environment>`. |

The full schema lives in the [module README](https://github.com/runestack/terraform-hetzner-rune#inputs).

## Outputs

| Output | What it is |
|---|---|
| `ipv4_address` | Public IPv4 of the server. |
| `ipv6_address` | Public IPv6 (empty if `enable_ipv6 = false`). |
| `location` | Hetzner location the server lives in. |
| `grpc_endpoint` | `<ip>:7863` — paste into `rune login --server`. |
| `http_endpoint` | `http://<ip>:7861` — REST API base URL. |
| `firewall_id` | Firewall ID, or empty when `create_firewall = false`. |
| `bootstrap_token_path` | Absolute path to the saved admin token (empty when `bootstrap = false`). |
| `rune_login_command` | Ready-to-paste `rune login` command (empty when `bootstrap = false`). |

## Hetzner Cloud volumes

The companion [`hcloud-volume` storage driver](/guides/persistent-storage/#using-hcloud-volume-for-hetzner-cloud-block-storage)
provisions and attaches Hetzner Cloud Block Storage to Rune
volumes. After the node is up, mint an API token, store it as a
Rune Secret, and create a StorageClass:

```yaml
storageClass:
  name: hcloud-volumes-nbg1
  driver: hcloud-volume
  parameters:
    location: nbg1
    fsType: ext4
    apiToken: secret:hcloud-api-token.shared.rune/token
```

See the [persistent storage guide](/guides/persistent-storage/#using-hcloud-volume-for-hetzner-cloud-block-storage)
for the full walk-through, including the hostname-matching caveat
and the snapshot/expand support matrix.

## Cloud-init runs once

The installer is rendered into cloud-init and runs **only on first
boot**. Changing `rune_version`, `cluster_cidr`, or anything else
that lands in `runefile.toml` after the server exists will not
take effect on the running server. To roll a new config:

```sh
terraform apply -replace=module.rune.hcloud_server.this
```

This destroys and recreates the server — your service state lives
in `/var/lib/rune` on the server, so plan accordingly. Hetzner
Cloud volumes provisioned via the `hcloud-volume` driver survive
the rebuild and re-attach to the new server on boot.

## Re-rotate the admin token

```sh
terraform apply -replace=module.rune.null_resource.bootstrap[0]
```

Re-runs the SSH bootstrap and overwrites the local token file.

## Tear down

```sh
terraform destroy
```

## Next

- [Bootstrap & first user](/start/bootstrap/) — what the
  bootstrap step actually does.
- [Persistent storage](/guides/persistent-storage/) — wire
  Hetzner Cloud volumes into your services.
- [Expose a service](/guides/expose-service/) — wire a
  service to a public hostname with ACME.
- [Operations → Configuration](/operations/configuration/) — the
  `runefile.toml` reference.
