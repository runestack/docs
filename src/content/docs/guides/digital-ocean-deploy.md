---
title: Deploy on a DigitalOcean droplet
description: From a fresh Ubuntu 22.04 droplet to a public HTTPS service in under fifteen minutes — Docker, runed, edge ingress, and an automatically-issued Let's Encrypt certificate.
---

This guide is the minimum-viable production-ish setup: one droplet, one service, real DNS, real TLS. Everything here works the same on Hetzner, Vultr, Linode, EC2, or any other cloud that gives you an Ubuntu VM with a public IP.

If you're on a laptop and just want to kick the tires, use the [Quick start](/start/quick-start/) instead.

## What you need

- A DigitalOcean account (or any cloud that gives you a Linux VM).
- A domain name where you can add an A record. We'll use `api.example.com` in the examples — substitute your own.
- ~15 minutes.

## Step 1 — create the droplet

- **Image:** Ubuntu 22.04 LTS x64
- **Plan:** Basic, 1 GB RAM is enough to start
- **Region:** anywhere
- **Authentication:** SSH key (recommended)

Note the public IPv4 address. We'll call it `$DROPLET_IP`.

## Step 2 — point DNS at the droplet

In your DNS provider, add an A record:

```
api.example.com.   IN   A   $DROPLET_IP
```

ACME's HTTP-01 challenge needs this in place before issuance succeeds. Wait until `dig +short api.example.com` from your laptop returns the droplet IP. (TTL is usually 5 minutes on a fresh record.)

## Step 3 — install Docker

SSH into the droplet and install Docker from the official repository:

```bash
ssh root@$DROPLET_IP
apt-get update
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io
systemctl enable --now docker
```

Verify:

```bash
docker run --rm hello-world
```

## Step 4 — install `runed`

Grab the latest release binary. Replace `<VERSION>` with the current release tag (or build from source):

```bash
RUNE_VERSION=v0.5.0    # check https://github.com/runestack/rune/releases
ARCH=$(uname -m)
case "$ARCH" in
  x86_64) ARCH=amd64 ;;
  aarch64) ARCH=arm64 ;;
esac

curl -fsSL "https://github.com/runestack/rune/releases/download/${RUNE_VERSION}/rune_${RUNE_VERSION#v}_linux_${ARCH}.tar.gz" \
  | tar -xz -C /usr/local/bin runed rune

# Allow runed to bind low ports (80, 443) without running as root.
setcap 'cap_net_bind_service=+ep' /usr/local/bin/runed

mkdir -p /var/lib/rune /etc/rune
```

## Step 5 — configure the runefile

Drop a TOML runefile at `/etc/rune/runefile.toml`:

```toml
data_dir = "/var/lib/rune"

[server]
grpc_address = ":7863"
http_address = ":7861"

[log]
level  = "info"
format = "json"

[networking]
cluster_cidr = "10.96.0.0/16"

[telemetry]
metrics_addr = "127.0.0.1:9100"

[node]
role = "edge"

[acme]
email = "ops@example.com"
# directory = ""    # defaults to Let's Encrypt production
```

## Step 6 — run `runed` as a systemd service

```ini
# /etc/systemd/system/runed.service
[Unit]
Description=Rune server
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
Type=simple
ExecStart=/usr/local/bin/runed --config /etc/rune/runefile.toml
Restart=on-failure
RestartSec=5s
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now runed
journalctl -u runed -f
```

You should see the ingress + ACME enabled banner:

```
Ingress + ACME enabled (edge node) http=:80 https=:443
acme orchestrator started
```

## Step 7 — bootstrap the admin token

`bootstrap` is a one-shot, server-enforced **local-only** operation that mints the root management token. Run it directly on the droplet:

```bash
rune config set-context default --server 127.0.0.1:7863 --token unused
rune admin bootstrap --out-file /var/lib/rune/admin.token
chmod 600 /var/lib/rune/admin.token

# point the CLI at the just-minted token
rune config set-context default \
  --server 127.0.0.1:7863 \
  --token-file /var/lib/rune/admin.token
```

Verify:

```bash
$ rune whoami
Subject: root
Policies: [root]
```

Don't ship `/var/lib/rune/admin.token` off the box. For day-to-day use, mint a less-privileged token with `rune admin token create`.

## Step 8 — cast a service

Create a minimal HTTPS-exposed service. We'll use `nginx` so you can see something land in a browser:

```yaml
# /root/api.yaml
service:
  name: api
  namespace: default
  image: nginx:alpine
  scale: 1
  ports:
    - { name: http, port: 80 }
  expose:
    host: api.example.com
    port: http
    tls:
      auto: true
```

```bash
rune cast /root/api.yaml
rune get services
```

## Step 9 — watch the certificate land

```bash
$ rune ingress list
NAMESPACE  SERVICE  HOST             TLS   CERT      EXPIRES
default    api      api.example.com  acme  pending   -

# … wait 10–30 seconds …

$ rune ingress list
NAMESPACE  SERVICE  HOST             TLS   CERT      EXPIRES
default    api      api.example.com  acme  ready     89d
```

From your laptop:

```bash
curl -I https://api.example.com/
# HTTP/2 200
# server: rune-ingress
```

That's it. You have a single-droplet Rune cluster with:

- automatically-issued, auto-renewing TLS certificates
- service VIPs and embedded DNS for service-to-service traffic
- network policy you can layer on with `rune cast`
- Prometheus metrics on `127.0.0.1:9100`

## Hardening checklist

For real production traffic:

1. **Firewall.** Open `:80` and `:443` to the world, restrict `:7863`/`:7861` (gRPC/HTTP API) to your management IPs.
2. **Backups.** `data_dir` (`/var/lib/rune`) is the source of truth — snapshot it nightly.
3. **Metrics.** Expose `:9100` to your scraper only (bind it to a private interface, or front it with a tunnel).
4. **Tokens.** Rotate the bootstrap token (`rune admin token rotate`) after creating per-user tokens.
5. **Image registries.** Configure private-registry auth via `rune admin registries add` if you're pulling from a private repo.

## Where to go next

- [Concepts: Networking](/concepts/networking/) — how the pieces fit together.
- [Write a network policy](/guides/network-policy/) — restrict service-to-service traffic.
- [`rune ingress` reference](/reference/cli-network/) — list and inspect TLS certificate state.
- [`runefile.md`](/reference/runefile/) — every server-side knob.
