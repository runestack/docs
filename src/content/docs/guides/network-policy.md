---
title: Write a network policy
description: Restrict which services can reach which using `ServiceNetworkPolicy`. Default-deny activates per-service, so you can adopt policies one workload at a time.
---

`ServiceNetworkPolicy` lets you say which clients are allowed to talk to a service. In Rune, it's embedded directly in the service spec under `networkPolicy:` — there is no standalone `ServiceNetworkPolicy` cast-file resource.

This guide walks through writing your first policy, the default-deny semantics, and the v1 limitations you should know about before relying on it for security boundaries.

## The shape of a policy

```yaml
service:
  name: api
  namespace: default
  image: ghcr.io/example/api:1.4.0
  scale: 2
  ports:
    - name: http
      port: 8080
  networkPolicy:
    ingress:
      - from:
          - service: web               # same namespace
          - service: worker
            namespace: jobs            # cross-namespace
          - cidr: 10.0.0.0/8           # office subnet (any source)
        ports:
          - http
```

Apply it with `rune cast` like any other resource:

```bash
rune cast api.yaml
```

The agent picks it up via the OrderedLog watch, compiles the rules, and the next packet to the API service's VIP is filtered against the new table. There is no restart, no reload, no settling period.

## Default-deny — opt in per service

Rune's policy stance is **default-allow until a service has a `networkPolicy` block**. The moment `api` carries ingress or egress rules, that direction flips to default-deny. Every other service in the cluster stays default-allow until it gets the same treatment.

This is intentional — it lets you adopt policies one workload at a time without having to write a giant cluster-wide allow-list to avoid breaking unrelated services.

In practice:

```yaml
# Service A: gates api. Now api is default-deny on ingress;
# only web and the office CIDR can hit it.
service:
  name: api
  networkPolicy:
    ingress:
      - from: [{ service: web }, { cidr: 10.0.0.0/8 }]

# Service B: gates worker too.
# api stays default-deny because its own policy still exists.
# database remains default-allow because it has no networkPolicy block.
service:
  name: worker
  networkPolicy:
    ingress:
      - from: [{ service: api }]
```

## Validate before you cast

Catch typos before you ship them:

```bash
$ rune lint api.service.yaml
service:   default/api
policy:    default/api
default-deny ingress=true egress=false
ingress rules:
  [0] peers=[service=default/web cidr=10.0.0.0/8] ports=[http]
```

`validate` is a pure-CLI compile check (CIDR parsing, port format, peer shape). It reads a raw `Service` document, not a cast file wrapper, so validate the inner service body or pipe it on stdin. It doesn't talk to the server, so you can run it in CI on every PR.

## Explain what's enforced

Once a policy is in the store, render it the way the agent sees it:

```bash
$ rune get netpolicy api -n default
service:   default/api
policy:    default/api
default-deny ingress=true egress=false
ingress rules:
  [0] peers=[service=default/web service=jobs/worker cidr=10.0.0.0/8] ports=[http]
```

This is the same compiled form the in-process evaluator uses, rendered deterministically so it's diff-friendly across CI runs.

## Watching it bite

Every drop increments a Prometheus counter:

```text
rune_policy_drops_total{service="api",namespace="default",policy="api-allow",reason="no_match"} 14
```

Useful PromQL for "policy bites in the last 5 minutes":

```promql
sum by (service, namespace, reason) (
  increase(rune_policy_drops_total[5m])
)
```

A non-zero rate after a deploy usually means a new caller wasn't accounted for in the policy. Add it to the `from:` list and re-cast.

## v1 limitations to know about

The policy engine is shipped as **Phase 1**. There are two limits worth understanding before you treat it as a hard security boundary:

1. **Service-name selectors are same-node only.**
   `from: { service: web }` matches `web` pods scheduled on the *same node* as the target. Cross-node identity (tying a container IP back to its owning service across the cluster) requires the multi-node identity backbone that lands with Phase 2 and Raft.
   *Until then:* use CIDR selectors for cross-node matches, or run the talking and target services co-scheduled.

2. **No L7 rules.** Policies match on source IP / source service / destination port. There is no path, header, or method matching. If you need that, terminate at the [ingress controller](/guides/expose-service/) and apply policy at the application layer.

These are documented in the package comment and tracked for Phase 2.

## Common patterns

### "Internal-only" service

```yaml
service:
  name: postgres
  image: postgres:alpine
  ports:
    - name: postgres
      port: 5432
  networkPolicy:
    ingress:
      - from:
          - service: api
          - service: worker
        ports: [postgres]
```

After casting, the database is unreachable from anything except `api` and `worker`. External CIDRs would need an explicit `cidr:` source.

### "Office IPs plus other services"

```yaml
service:
  name: admin
  image: ghcr.io/example/admin:latest
  ports:
    - name: http
      port: 8080
  networkPolicy:
    ingress:
      - from:
          - cidr: 203.0.113.0/24       # corporate egress
          - cidr: 10.0.0.0/8           # VPN subnet
          - service: bastion
        ports: [http]
```

### Temporarily disable a policy

There's no `enabled: false` switch. To remove enforcement, delete the `networkPolicy:` block from the service spec and cast the service again:

```bash
rune cast api.yaml
```

The next packet evaluation runs without the rules, and `api` flips back to default-allow.

## Reference

- [`rune get netpolicy`](/reference/cli-network/#rune-get-netpolicy-service) — inspect a compiled policy. Use `rune lint` for offline validation.
- [Networking concepts](/concepts/networking/#network-policy) — how the agent compiles and enforces rules.
