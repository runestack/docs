---
title: Provision DigitalOcean with Terraform
description: Use the official terraform-digitalocean-rune module to spin up a Rune edge node on a DigitalOcean droplet — droplet, firewall, cloud-init install, and an optional one-shot admin bootstrap.
---

The [`runestack/rune/digitalocean`](https://github.com/runestack/terraform-digitalocean-rune)
module provisions a single Rune node on DigitalOcean: droplet,
firewall, cloud-init install, optional project attachment, and an
optional in-module `rune admin bootstrap` that hands you a
ready-to-paste `rune login` command.

If you want to do the same install by hand, follow
[Deploy on a DigitalOcean droplet](/guides/digital-ocean-deploy/)
instead. This guide is the Terraform path.

:::caution[Pre-1.0]
The module is at `v0.0.1` and tracks Rune's pre-1.0 development.
Pin the module version (`version = "0.0.2"`) and the Rune version
(`rune_version = "v0.0.1-dev.22"`) until v1.0.
:::

## What you need

- [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.5
- A DigitalOcean account with an API token (`export DIGITALOCEAN_TOKEN=...`)
- An [SSH key uploaded to DigitalOcean](https://docs.digitalocean.com/products/droplets/how-to/add-ssh-keys/)
- A domain name with an A record you can point at the new droplet

## Minimal example

Worker node, no TLS, no bootstrap. Useful for trying the module
end-to-end before adding edge ingress.

```hcl
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = ">= 2.40, < 3.0"
    }
  }
}

data "digitalocean_ssh_key" "main" {
  name = "my-laptop"
}

module "rune" {
  source  = "runestack/rune/digitalocean"
  version = "0.0.2"

  ssh_key_ids = [data.digitalocean_ssh_key.main.id]
  node_role   = "worker"
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
  source  = "runestack/rune/digitalocean"
  version = "0.0.2"

  ssh_key_ids = [data.digitalocean_ssh_key.main.id]

  node_role  = "edge"
  acme_email = "ops@example.com"
}
```

What changes vs. the worker example:

- Firewall opens `:80` and `:443` to `0.0.0.0/0` so the ACME
  HTTP-01 challenge can complete.
- The droplet binds privileged ports as the unprivileged `rune`
  user via `cap_net_bind_service` — set up by the installer.
- The ACME orchestrator is enabled and registers an account with
  Let's Encrypt using `acme_email`.

Once the droplet is up, point your DNS at it:

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
  source  = "runestack/rune/digitalocean"
  version = "0.0.2"

  ssh_key_ids = [data.digitalocean_ssh_key.main.id]

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

The token file is written to `bootstrap_token_path` (default
`./rune-admin.token`) and is reusable on the same machine.

## Common variables

| Variable | Default | What it does |
|---|---|---|
| `ssh_key_ids` | — (required) | DigitalOcean SSH key IDs / fingerprints to install on the droplet. |
| `node_role` | `edge` | `edge` opens 80/443 + runs ACME; `worker` skips both. |
| `acme_email` | `""` | Let's Encrypt account email. Required for ACME on edge nodes. |
| `region` | `lon1` | DigitalOcean region slug. |
| `droplet_size` | `s-2vcpu-4gb` | Droplet size. Edge nodes terminating TLS should be at least `s-1vcpu-2gb`. |
| `image` | `ubuntu-24-04-x64` | Base image. Tested on Ubuntu 24.04 LTS. |
| `rune_version` | `v0.0.1-dev.22` | Release tag passed to `install-server.sh`. Bump per Rune release. |
| `cluster_cidr` | `10.96.0.0/16` | CIDR used by the Rune networking layer. |
| `ssh_allowed_cidrs` | `["0.0.0.0/0", "::/0"]` | Tighten in production. |
| `api_allowed_cidrs` | `["0.0.0.0/0", "::/0"]` | Locks down the gRPC + HTTP API ports. |
| `bootstrap` | `false` | Run `rune admin bootstrap` automatically after cloud-init. |
| `bootstrap_ssh_private_key` | `""` | Required (PEM, sensitive) when `bootstrap = true`. |
| `enable_backups` | `false` | Weekly droplet backups. |
| `enable_monitoring` | `true` | DigitalOcean monitoring agent. |
| `project_id` | `""` | Optional project to attach the droplet to. |

The full schema lives in the [module README](https://github.com/runestack/terraform-digitalocean-rune#inputs).

## Outputs

| Output | What it is |
|---|---|
| `ipv4_address` | Public IPv4 of the droplet. |
| `ipv6_address` | Public IPv6 (empty if `enable_ipv6 = false`). |
| `grpc_endpoint` | `<ip>:7863` — paste into `rune login --server`. |
| `http_endpoint` | `http://<ip>:7861` — REST API base URL. |
| `firewall_id` | Firewall ID, or empty when `create_firewall = false`. |
| `bootstrap_token_path` | Absolute path to the saved admin token (empty when `bootstrap = false`). |
| `rune_login_command` | Ready-to-paste `rune login` command (empty when `bootstrap = false`). |

## Cloud-init runs once

The installer is rendered into cloud-init and runs **only on first
boot**. Changing `rune_version`, `cluster_cidr`, or anything else
that lands in `runefile.toml` after the droplet exists will not
take effect on the running droplet. To roll a new config:

```sh
terraform apply -replace=module.rune.digitalocean_droplet.this
```

This destroys and recreates the droplet — your service state lives
in `/var/lib/rune` on the droplet, so plan accordingly.

## Re-rotate the admin token

```sh
terraform apply -replace=module.rune.null_resource.bootstrap[0]
```

Re-runs the SSH bootstrap and overwrites the local token file.
`rune admin bootstrap` itself refuses to run twice unless you
reset the auth state on the server.

## Tear down

```sh
terraform destroy
```

## Next

- [Bootstrap & first user](/start/bootstrap/) — what the
  bootstrap step actually does.
- [Expose a service](/guides/expose-service/) — wire a
  service to a public hostname with ACME.
- [Operations → Configuration](/operations/configuration/) — the
  `runefile.toml` reference.
