---
title: Write a network policy
description: Restrict which services can reach which using `ServiceNetworkPolicy`. Default-deny activates per-service, so you can adopt policies one workload at a time.
---

`ServiceNetworkPolicy` lets you say which clients are allowed to talk to a service. It's a separate resource from `Service` — write it once, and it applies across every cast cycle of the target service.

This guide walks through writing your first policy, the default-deny semantics, and the v1 limitations you should know about before relying on it for security boundaries.

## The shape of a policy

```yaml
apiVersion: rune/v1
kind: ServiceNetworkPolicy
metadata:
  name: api-allow
  namespace: default
spec:
  service: api                       # the service this policy guards
  ingress:
    - from:
        - service: web               # same namespace
        - service: worker
          namespace: jobs            # cross-namespace
        - cidr: 10.0.0.0/8           # office subnet (any source)
      ports:
        - 8080
```

Apply it with `rune cast` like any other resource:

```bash
rune cast api-policy.yaml
```

The agent picks it up via the OrderedLog watch, compiles the rules, and the next packet to the API service's VIP is filtered against the new table. There is no restart, no reload, no settling period.

## Default-deny — opt in per service

Rune's policy stance is **default-allow until a policy mentions you**. The moment any `ServiceNetworkPolicy` lists `service: api` in its `from:` clauses or as its `spec.service`, the API service flips to default-deny. Every other service in the cluster stays default-allow until it gets the same treatment.

This is intentional — it lets you adopt policies one workload at a time without having to write a giant cluster-wide allow-list to avoid breaking unrelated services.

In practice:

```yaml
# Policy A: gates the api service. Now api is default-deny;
# only web and the office CIDR can hit it.
spec:
  service: api
  ingress:
    - from: [{ service: web }, { cidr: 10.0.0.0/8 }]

# Policy B: gates the worker service. Now worker is default-deny too.
# api still default-deny (Policy A still applies).
# database remains default-allow because no policy mentions it.
spec:
  service: worker
  ingress:
    - from: [{ service: api }]
```

## Validate before you cast

Catch typos before you ship them:

```bash
$ rune policy validate -f api-policy.yaml
api-policy: 1 ingress rule, 2 sources, 1 port — OK
```

`validate` is a pure-CLI compile check (CIDR parsing, port format, rule structure). It doesn't talk to the server, so you can run it in CI on every PR.

## Explain what's enforced

Once a policy is in the store, render it the way the agent sees it:

```bash
$ rune policy explain api -n default
Service: default/api
Default action: DENY
Compiled rules:
  ALLOW from service=default/web port=8080
  ALLOW from service=jobs/worker  port=8080
  ALLOW from cidr=10.0.0.0/8      port=8080
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
spec:
  service: postgres
  ingress:
    - from:
        - service: api
        - service: worker
      ports: [5432]
```

After casting, the database is unreachable from anything except `api` and `worker`. External CIDRs would need an explicit `cidr:` source.

### "Office IPs plus other services"

```yaml
spec:
  service: admin
  ingress:
    - from:
        - cidr: 203.0.113.0/24       # corporate egress
        - cidr: 10.0.0.0/8           # VPN subnet
        - service: bastion
      ports: [8080]
```

### Temporarily disable a policy

There's no `enabled: false` switch — policies are simple enough that "delete it" is the right verb:

```bash
rune delete servicenetworkpolicy api-allow -n default
```

The next packet evaluation runs without the rules, and `api` flips back to default-allow (assuming no other policy targets it).

## Reference

- [`rune policy`](/reference/cli-network/#rune-policy) — `validate`, `explain`.
- [Networking concepts](/concepts/networking/#network-policy) — how the agent compiles and enforces rules.
