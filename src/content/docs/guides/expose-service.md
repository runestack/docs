---
title: Expose a service to the internet
description: Add an `expose:` block to your service spec, point DNS at an edge node, and let Rune's ingress controller terminate HTTPS with an automatically-issued Let's Encrypt certificate.
---

This guide walks you from "service running internally" to "publicly reachable on `https://api.example.com`" using Rune's built-in ingress controller and ACME orchestrator. It assumes you already have a single-node cluster running (see [Quick start](/start/quick-start/)) on a host with a public IP.

If you're starting from scratch on a fresh VM, skip to the [DigitalOcean deploy guide](/guides/digital-ocean-deploy/) which covers the host-side setup as well.

## What you need

1. A `runed` node reachable from the public internet on `:80` and `:443`.
2. The node started with `--node-role=edge` (this enables the ingress controller and the ACME orchestrator on that node).
3. A DNS A record pointing your hostname at the node's public IP. ACME's HTTP-01 challenge requires this — the certificate authority will hit `http://<host>/.well-known/acme-challenge/<token>` and expect to land on your node.
4. An `acme.email` configured. Let's Encrypt rejects accounts without a contact address.

## Step 1 — start `runed` as an edge node

The minimum extra flags on top of a normal startup:

```bash
runed \
  --data-dir=/var/lib/rune \
  --node-role=edge \
  --acme-email=ops@example.com
```

Or, equivalently, in `/etc/rune/runefile.toml`:

```toml
data_dir = "/var/lib/rune"

[node]
role = "edge"

[acme]
email = "ops@example.com"
# directory = ""  # defaults to Let's Encrypt production
```

Restart `runed`. You'll see two new lines in the log:

```
Ingress + ACME enabled (edge node) http=:80 https=:443
acme orchestrator started
```

If the ports fail to bind (`permission denied`), either run `runed` as root, give the binary the `cap_net_bind_service` capability, or run in `--dev-mode` for laptop testing.

## Step 2 — add `expose:` to your service

```yaml
service:
  name: api
  namespace: default
  image: ghcr.io/example/api:1.4.0
  scale: 2
  ports:
    - { name: http, port: 8080 }
  expose:
    host: api.example.com
    port: 8080
    tls:
      auto: true            # use ACME (default Let's Encrypt prod)
```

Apply it:

```bash
rune cast api.yaml
```

That's the entire developer-facing change. The orchestrator publishes endpoints, the edge node adds the route to its ingress router, and the ACME orchestrator queues a certificate request.

## Step 3 — watch the certificate land

```bash
$ rune ingress list
NAMESPACE  SERVICE  HOST             MODE  STATE     EXPIRES
default    api      api.example.com  acme  pending   -

# … 10–30 seconds later …

$ rune ingress list
NAMESPACE  SERVICE  HOST             MODE  STATE     EXPIRES
default    api      api.example.com  acme  ready     in 89d
```

For more detail (including the last error if a request failed):

```bash
rune ingress get api -n default -o yaml
```

The orchestrator retries on failure with exponential backoff, capped at the `acme_renewal_window` (default: 30 days before expiry). Existing certificates keep serving traffic while a renewal is in flight, so a temporary issuance error never causes a public-facing outage.

## Step 4 — verify

```bash
curl -I https://api.example.com/healthz
# HTTP/2 200
# server: rune-ingress
```

`Server: rune-ingress` confirms the request went through Rune's edge proxy. The TLS handshake will use the freshly issued certificate.

## Manual TLS (BYO certificate)

If you manage certificates out of band — wildcard certs from your CA, mTLS rigs, etc. — set `tls.mode: manual` and reference a `Secret` containing the cert and key:

```yaml
service:
  name: api
  expose:
    host: api.example.com
    port: 8080
    tls:
      mode: manual
      secretName: api-tls       # Secret must contain `tls.crt` and `tls.key`
```

Create the secret with:

```bash
rune create secret tls api-tls --cert=fullchain.pem --key=privkey.pem
```

Rotate by updating the secret — the cert loader hot-reloads on the next handshake.

## Common gotchas

- **DNS not propagated yet.** The ACME provider must reach your node. If `dig +short api.example.com` doesn't return your edge node's IP from a public DNS server, the challenge will fail. Wait, then the orchestrator will retry on its own.
- **Port 80 blocked upstream.** HTTP-01 needs port 80 specifically. Cloud firewalls and security groups must allow inbound 80 *and* 443. (If only 443 is allowed, switch to manual TLS.)
- **`acme.directory` left at default in CI.** Tests should point at a Pebble URL — Let's Encrypt's production endpoint has rate limits that you will hit.
- **Multiple edge nodes.** Phase 1 ships single-node ingress. Multi-node leader election lands with Phase 2; for now run one edge node and front it with your cloud's L4 load balancer if you need HA.

## Reference

- [`rune ingress`](/reference/cli-network/#rune-ingress) — list, inspect.
- [`networking.md`](/concepts/networking/) — what's happening behind the scenes.
- [`runefile.md`](/reference/runefile/) — every `acme.*` and `ingress.*` knob.
