---
title: "Tutorial: build a full project"
description: A guided, five-part walkthrough that takes a real project from an empty repo to an HTTPS-exposed service auto-deploying from GitHub Actions.
---

This tutorial is the long-form companion to the per-topic guides. Instead of showing each feature in isolation, it walks through one realistic shape — a small app deployed to a single DigitalOcean droplet — and wires every piece together: Terraform, the runeset, secrets, CI/CD, DNS.

When you finish you'll have:

- A repo with an `infra/` directory holding all deployable state.
- A Rune server running on a DigitalOcean droplet behind a Reserved IP.
- A runeset of services + configmaps + secrets that deploys with one `rune cast`.
- A GitHub Actions workflow that builds your Docker images and casts on every push.
- A real HTTPS endpoint with an auto-issued Let's Encrypt certificate.

The whole tutorial takes ~45 minutes if you're following along. Pick a project name and a domain you control before you start.

## The five parts

| # | Part | What you'll do |
|---|------|----------------|
| 1 | [Project layout](/tutorial/layout/) | Decide the repo structure so every later step has a home. |
| 2 | [Provision with Terraform](/tutorial/terraform/) | Spin up a Rune droplet with a Reserved IP and admin token. |
| 3 | [Author your runeset](/tutorial/runeset/) | Write the casts, configmaps, secrets, and values files. |
| 4 | [Wire up CI/CD](/tutorial/ci-cd/) | Auto-deploy from GitHub Actions on every push to `main`. |
| 5 | [Deploy & verify](/tutorial/deploy/) | First end-to-end deploy, DNS cutover, smoke checks. |

Each part is self-contained. If you already have a droplet, skip part 2. If you don't want CI yet, stop after part 3 and cast from your laptop.

## What you need before starting

- A laptop with [Terraform ≥ 1.5](https://developer.hashicorp.com/terraform/install), the [Rune CLI](/start/installation/), and [`gh`](https://cli.github.com/) (only needed in part 4).
- A DigitalOcean account with an [API token](https://cloud.digitalocean.com/account/api/tokens) and an [SSH key uploaded](https://cloud.digitalocean.com/account/security).
- A domain name where you can edit DNS records.
- A GitHub repository for your project (empty is fine).

## Reference project

Everything in this tutorial is drawn from a real reference layout — a single app with a Dockerfile, a public web component, and a runeset that deploys it. Use it as a template and adjust component names as you go. We'll call the project `myapp` and the domain `example.com`; substitute your own throughout.

:::tip[Already know the parts?]
If you just want to copy the file layout and skim, jump straight to [part 1 → Project layout](/tutorial/layout/).
:::

---

**Next:** [Part 1 — Project layout →](/tutorial/layout/)
