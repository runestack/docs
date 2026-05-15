---
title: "Part 1 — Project layout"
description: Decide the repo structure before you write Terraform or YAML. Everything else in the tutorial slots into this skeleton.
---

Spend five minutes on layout now and the rest of the tutorial slots in cleanly. The shape we'll use:

```
myapp/
├── apps/
│   └── web/                       # Your application code
│       ├── Dockerfile
│       └── ...
├── infra/
│   ├── terraform/
│   │   └── do/                    # Terraform root for DigitalOcean
│   │       ├── main.tf
│   │       ├── provider.tf
│   │       ├── variables.tf
│   │       ├── outputs.tf
│   │       └── terraform.tfvars   # gitignored — your real values
│   ├── runeset/
│   │   ├── runeset.yaml           # name + version + namespace
│   │   ├── casts/
│   │   │   └── web.yaml           # one cast per service
│   │   ├── values/
│   │   │   ├── dev.yaml
│   │   │   └── prod.yaml
│   │   ├── configs.example.yaml   # configmap reference (committed)
│   │   └── secrets.example.yaml   # secret schema reference (committed)
│   └── runefile.toml              # optional: rendered server config reference
└── .github/
    ├── deploy-config.yml          # which paths trigger which deploys
    └── workflows/
        └── deploy.yml             # build + cast on push
```

Three rules that keep this tidy:

1. **`infra/` is the source of truth for everything that touches a server.** Terraform, casts, values, registry config. Nothing deployable lives outside it.
2. **`casts/*.yaml` are templates.** Every component-specific value comes from `values/<env>.yaml` via `{{ values:foo.bar }}` placeholders so the same cast renders for dev, staging, and prod.
3. **Anything sensitive is `.example.yaml`.** Real secrets are created with `rune create secret` or applied from a local-only file. The example versions document the schema and ship in git.

## Why this shape

| Decision | Reason |
|----------|--------|
| `infra/terraform/do/` (not `terraform/`) | Leaves room for `terraform/aws/`, `terraform/hetzner/`, etc. without churn. |
| One `casts/<name>.yaml` per component | Lets CI build + cast components independently. See [part 4](/tutorial/ci-cd/). |
| `values/<env>.yaml` per environment | Same cast, different env. `rune cast` takes `--values` so you don't fork YAML. |
| `*.example.yaml` for secrets | Schema lives in git, values do not. The [secrets guide](/guides/secrets-configmaps/) covers the mechanics. |

## Create the skeleton

```sh
mkdir -p myapp/{apps/web,infra/terraform/do,infra/runeset/casts,infra/runeset/values,.github/workflows}
cd myapp
git init
```

Add a `.gitignore` that protects the obvious leaks:

```gitignore
# Terraform state and tfvars (anything that holds tokens)
**/.terraform/
**/terraform.tfstate*
**/terraform.tfvars
**/*.token

# Local secret materializations
infra/runeset/secrets.yaml
```

Commit the empty skeleton so subsequent parts can be reviewed as small diffs:

```sh
git add . && git commit -m "infra: scaffold"
```

That's the whole step. The next four parts each fill in one slice of this tree.

---

**Next:** [Part 2 — Provision with Terraform →](/tutorial/terraform/) · **Back:** [Overview](/tutorial/overview/)
