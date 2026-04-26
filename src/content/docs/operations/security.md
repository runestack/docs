---
title: Security hardening
description: A practical checklist — TLS, KEK rotation, RBAC narrowing, and known weak spots.
---

Rune ships with sensible defaults but a few important things are off by default. This page is the punch list before you put a server on a public network.

## Hardening checklist

- [ ] TLS enabled on `:7863` and `:7861`.
- [ ] KEK loaded from env (or vaulted credential), not generated.
- [ ] Bootstrap token rotated to a non-`root` admin token; root token revoked.
- [ ] No service or user has the `root` policy attached for day-to-day use.
- [ ] `auth.allow_remote_admin: false` (default).
- [ ] `runed` binds to a private interface or fronted by a TLS proxy.
- [ ] Per-namespace policies, not `*` policies, for service teams.
- [ ] Token TTLs set on all human and CI tokens.
- [ ] Backups in place for `--data-dir` and the KEK (separate locations).

## TLS

Generate (or obtain) a server cert + key, then:

```yaml
auth:
  tls:
    enabled: true
    cert-file: /etc/rune/tls/server.crt
    key-file:  /etc/rune/tls/server.key
```

Restart `runed`. Update CLI contexts to point at the new TLS-enabled server:

```sh
rune config set-context prod \
  --server runed.example.com:7863 \
  --tls-ca /etc/rune/tls/ca.crt
```

mTLS (client certs) is roadmap (RUNE-028). For now, bearer tokens over TLS are the model.

## KEK lifecycle

### Backup

The KEK file is the master key for every secret. Back it up to a separate, equally-protected location (e.g., a sealed Vault entry):

```sh
sudo cat /var/lib/rune/kek | base64 -d | wc -c   # should be 32
sudo cp /var/lib/rune/kek /secure/offsite/kek.$(date +%F)
```

Store with mode `0600`, owner restricted.

### Rotation (manual today)

KEK rotation is operational, not online — there's no built-in `rune admin rotate-kek` yet. The procedure:

1. Stand up a second `runed` with the new KEK in env, pointed at a fresh data dir.
2. For each secret, fetch the plaintext (mount it into a one-off pod, dump it), and re-create on the new server.
3. Cut clients over to the new server.
4. Decommission the old server and securely destroy the old KEK.

Automated rotation is roadmap.

## Narrowing RBAC

Built-in policies are wide. For real teams, write scoped policies:

```yaml
# policies/team-alpha.yaml
name: team-alpha
description: Alpha team — full edit on alpha namespaces only
rules:
  - resource: "*"
    verbs: [get, list, watch, create, update, delete, scale, exec]
    namespace: alpha
  - resource: "*"
    verbs: [get, list, watch, create, update, delete, scale, exec]
    namespace: alpha-staging
```

```sh
rune admin policy create -f policies/team-alpha.yaml
rune admin policy attach team-alpha --to-user alice
rune admin policy detach readwrite --from-user alice
```

## Known weak spots (be aware)

These are real and tracked. Don't let them surprise you in an audit.

| Issue                                                                 | Risk                                                                 | Mitigation today                                  | Tracked    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------- | ---------- |
| TLS is opt-in; default is plaintext                                  | Bearer tokens cross the wire unencrypted                             | Enable TLS in production. Always.                 | RUNE-028   |
| Token lookup is O(N) and not constant-time                            | Mild perf and timing-side-channel risk                                | Keep token count low; use rate-limited proxies    | RUNE-028   |
| CORS middleware is wide-open (`Allow-Origin: *`)                      | Browser-side abuse if REST gateway is exposed                         | Don't expose REST to public internet today        | RUNE-028   |
| Stream RPCs (logs/exec/watch) bypass namespace-scoped policy rules    | Namespace policies don't restrict streaming                           | Use cluster-wide policies for streaming if needed | RUNE-028   |
| Process runner accepts but doesn't enforce `readOnlyFS`, capabilities, syscall filters | Security claims in spec are not enforced            | Run as unprivileged `user:` only                  | RUNE-004↑  |
| gRPC reflection is on by default                                       | Schema introspection on prod                                          | Front-door with a proxy that strips it             | RUNE-028   |
| No rate limiting / brute-force protection on auth                      | Unbounded credential brute-force                                      | Run behind a proxy that rate-limits               | RUNE-028   |
| Bootstrap is gated to localhost server-side (good)                    | Fine — but `allow_remote_admin: true` removes the gate                | Don't enable `allow_remote_admin`                  | —          |

If any of these matter for your environment, deploy `runed` behind a TLS-terminating, rate-limiting reverse proxy and accept that this is a Release-1 single-node platform under active hardening.

## Audit log (planned)

A per-RPC audit trail is roadmap (RUNE-089). Today, `runed` logs every RPC at debug level — enable that for a poor-man's audit:

```yaml
server:
  log-level: debug
  log-format: json
```

Ship to a tamper-resistant collector if you need durability.

## See also

- [Identity & RBAC](/concepts/identity-rbac/) — the policy model.
- [Running runed](/operations/runed/) — backups and process management.
- [Configuration](/operations/configuration/) — runefile knobs.
