---
title: Deploy on AWS EC2 with Terraform
description: Provision a Rune server on an EC2 instance using the official Terraform example — security group, user-data install, and first connection.
---

The `examples/terraform/ec2` module in the Rune repo provisions a single EC2 instance with `runed` installed and running as a systemd service. It's the fastest path from zero to a cloud-hosted Rune server.

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.5
- AWS credentials configured (`aws configure` or environment variables)
- An existing EC2 key pair in the target region

## Get the example

```sh
git clone https://github.com/runestack/rune.git
cd rune/examples/terraform/ec2
```

## Configure variables

Create a `terraform.tfvars` file:

```hcl
region       = "us-east-1"
key_name     = "my-keypair"
allowed_cidr = "203.0.113.0/32"   # your IP — tighten this down
```

All variables:

| Variable | Default | Required | Description |
|---|---|---|---|
| `region` | — | yes | AWS region |
| `key_name` | — | yes | Existing EC2 key pair name |
| `allowed_cidr` | — | yes | CIDR allowed SSH (22) and API (8080 / 8081) access |
| `instance_type` | `t3.small` | no | EC2 instance type |
| `ami_id` | auto | no | Override the AMI. Defaults to latest Ubuntu 22.04 |
| `use_amazon_linux` | `false` | no | Use Amazon Linux 2023 instead of Ubuntu 22.04 |
| `rune_version` | `""` | no | Install a specific release tag, e.g. `v0.1.0`. Empty = build from source |
| `git_branch` | `master` | no | Branch to build from when `rune_version` is empty |

:::tip[Pin a version in production]
Set `rune_version = "v0.1.0"` to get a pre-built binary instead of building from source. The build-from-source path takes several minutes and requires Go to be installed at boot.
:::

## Apply

```sh
terraform init
terraform plan
terraform apply
```

Terraform will print three outputs when it completes:

```
instance_public_ip = "54.123.45.67"
grpc_endpoint      = "54.123.45.67:7863"
http_endpoint      = "http://54.123.45.67:7861"
```

## Wait for boot

The instance runs `install-server.sh` via user-data on first boot. This takes 2–5 minutes (longer if building from source). You can tail the progress over SSH:

```sh
ssh -i ~/.ssh/my-keypair.pem ubuntu@$(terraform output -raw instance_public_ip)
sudo tail -f /var/log/user-data.log
```

When you see `Rune installation via Terraform completed!` the service is up.

## Connect the CLI

The install script writes a bootstrap token and CLI config under `/var/lib/rune/.rune/`. It also copies them to the primary user's home directory automatically. After SSH-ing in:

```sh
rune status
```

To connect from your local machine, copy the token:

```sh
# On the instance
cat ~/.rune/config.yaml

# On your local machine
rune login --endpoint $(terraform output -raw grpc_endpoint) --token <token>
rune status
```

## Verify the service

```sh
sudo systemctl status runed --no-pager
journalctl -u runed -f
```

## Tear down

```sh
terraform destroy
```

## Troubleshooting

**User-data still running / service not up**

```sh
sudo tail -f /var/log/user-data.log
sudo systemctl status runed
```

**CLI config wasn't copied automatically**

```sh
sudo mkdir -p ~/.rune
sudo cp /var/lib/rune/.rune/config.yaml ~/.rune/config.yaml
sudo chown -R $USER:$USER ~/.rune
chmod 700 ~/.rune && chmod 600 ~/.rune/config.yaml
rune status
```

**Can't reach the API from outside**

The security group opens ports `8080` and `8081` to `allowed_cidr`. Confirm your IP matches and that you passed the right CIDR during `apply`. You can update `allowed_cidr` and re-run `terraform apply` at any time without reprovisioning the instance.

**AMI not found**

The Ubuntu and Amazon Linux AMI data sources look up the latest image at apply time. If your account has region restrictions or a custom AMI, set `ami_id` explicitly.
