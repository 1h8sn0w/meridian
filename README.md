<div align="center">

# Meridian

**A meal planner that assembles your week from your dietitian's approved plans.**

[![CI](https://github.com/1h8sn0w/meridian/actions/workflows/ci.yml/badge.svg?branch=staging)](https://github.com/1h8sn0w/meridian/actions/workflows/ci.yml)
![V1](https://img.shields.io/badge/V1-shipped%20prototype-46c98b)
![V2](https://img.shields.io/badge/V2-local--first%20·%20in%20progress-4f9dff)
![license](https://img.shields.io/badge/license-MIT-46c98b)

<img src="docs/preview.svg" width="360" alt="Meridian home screen — day clock and active meal">

[Українською](README-UA.md)

</div>

---

Meridian turns a dietitian's PDF meal plans into a working app. It splits them into individual meals and assembles a new week on its own — keeping the dietitian's calorie targets and meal structure, but mixing dishes across several plans so the rotation doesn't get stale. The home screen answers one question: what to eat right now.

Unlike general-purpose meal planners, it never invents food. Every meal comes from a plan your dietitian approved.

## How the generator works

For each slot it picks a meal so that the type matches, the day's calories stay inside a corridor around the target (±100 kcal by default), no dish repeats too often, and the week draws on several source plans rather than copying one. It's a constraint satisfaction problem, solved greedily with randomness and bounded backtracking. No ML involved.

It lives in [`packages/core`](packages/core) as framework-free TypeScript with no storage of its own, and its tests re-run the hard cases across several PRNG seeds — otherwise "greedy with randomness" could pass by luck.

## Run it

Two apps live in this repository: **V1**, the single-file prototype that proved the idea, and **V2**, the local-first rewrite that will replace it.

### V2 — the whole stack, one command

```sh
git clone https://github.com/1h8sn0w/meridian.git
cd meridian
docker compose up
```

That is the entire installation. Nothing to fill in, no keys to copy, no ports or addresses to reconcile: the stack generates its own secrets, applies its own migrations, and the services find each other by name inside the Compose network. The first run takes a few minutes because the app image is built; after that, seconds. Then open <http://localhost>, sign up, and create a family.

Caddy is the only thing published outside — one origin serves the app, auth, the REST endpoint and sync on separate paths, so the browser never sees a port or a second hostname. To reach the stack from the internet, one variable in `.env` next to `compose.yaml`:

```
APP_URL=https://meridian.example.com
```

The scheme matters: `https://` turns on an automatic Let's Encrypt certificate, once the domain resolves to this host and 80/443 reach it. Those ports have to be free on the host, or set `HTTP_PORT` / `HTTPS_PORT`. Everything else — the prebuilt image, where the secrets live, SMTP, closing signup — is in [`infra/README.md`](infra/README.md).

### V1 — the static prototype

```sh
npx serve .          # or: python3 -m http.server 8000
```

Open the `http://localhost:…` address it prints — not `index.html` by double-click. `file://` and `localhost` are separate localStorage origins, so data saved under one vanishes under the other, and service workers need `http(s)`.

## Where it stands

| | V1 — repository root | V2 — `apps/`, `packages/`, `infra/` |
|---|---|---|
| Runs on | one HTML file, `localStorage` | on-device SQLite ↔ PowerSync ↔ Postgres |
| Data | one browser, no accounts | one family, every device, offline-first |
| Install | serve the directory | `docker compose up` |
| Deployed | GitHub Pages from `main` | any host that runs Docker |

V1 is the whole product as a prototype: the generator, manual swaps, profiles and shared family plans, PDF plan import, recipes, shopping list, reminders, PWA install and offline.

V2 has, so far: sign-in and the family model (GoTrue, `family_id` as a token claim, invite codes instead of email), four screens — Today, Week, Meals, Family — reading and writing the on-device database, week generation and manual swap ported into `packages/core` with tests, and seven tables syncing across a family's devices. Still V1-only: PDF import, recipes, shopping list, reminders, PWA and the Capacitor build.

V2 lives on `staging` and replaces V1 at the root when it lands on `main`.

## Stack

**V2.** The on-device SQLite database is the source of truth for the UI, so nothing ever waits on the network; PowerSync keeps it converged with Postgres in the background, and writes go out through PostgREST — which is why conflicts resolve as plain last-write-wins per slot, with no CRDT. The front end is Vite + TanStack Start on Node, and Capacitor will later wrap that same build for mobile. The server side is a deliberate subset of self-hosted Supabase — Postgres, GoTrue and PostgREST, the three services the app actually calls, not the usual eleven — behind Caddy.

**V1.** One HTML file, vanilla JS, `localStorage`, Tailwind CSS v4. No backend, no bundler, no framework — deliberately, until the idea was proven.

<details>
<summary>Working on the styles</summary>

There is exactly one Tailwind build in the repository, and it lives in `apps/web`: the official `@tailwindcss/vite` plugin, entry point `apps/web/src/styles.css`. `pnpm dev` picks up changes to the theme immediately — no separate CSS step.

The old V1 setup — `@tailwindcss/cli` producing a committed `tailwind.css` — was removed in MER-53 along with the `build:css` / `watch:css` scripts. The design tokens moved into `apps/web/src/styles.css` unchanged. Preflight is still deliberately left out so native form controls keep their appearance; the few reset properties that are actually needed are declared in the `base` layer.

**Consequence on `staging`:** V1 at the repository root and the mockups in `docs/design/` render unstyled there, because the stylesheet they used to link no longer exists. `main` — what GitHub Pages deploys — is unaffected, and V1 gets replaced by V2 when `staging` lands.

Minimum browsers for Tailwind v4: Chrome 111, Safari 16.4, Firefox 128.

</details>

## Repository layout

V1 is the static app at the repository root. V2 is a pnpm workspace alongside it:

| Path | What |
|------|------|
| `compose.yaml` | The self-host stack, whole: eight services, zero manual steps |
| `apps/web` | Vite + TanStack Start app; Capacitor will later wrap this same build |
| `packages/core` | Domain logic in plain TypeScript: week generator, calories, provenance rules |
| `packages/db` | Drizzle schema and migrations for Postgres |
| `infra` | Dockerfiles, Caddyfile, PowerSync config, secret generation, `compose` overlay |
| `.github/workflows` | Checks on every PR; the app image published on every push |
| `index.html`, `sw.js`, `data/`, `tests/` | V1, untouched |

Working on the app itself:

```sh
pnpm install
pnpm dev             # apps/web on http://localhost:3000
pnpm build           # every package
pnpm lint
pnpm typecheck
pnpm test            # V1 tests, then packages/core unit tests
pnpm format          # format:check is what CI runs
pnpm db:migrate
```

`pnpm dev` expects the stack running next to it: it uses the same database, the same GoTrue and the same sync service, just with hot module replacement. It needs `apps/web/.env` first, because the anon key only exists inside the stack — [`infra/README.md`](infra/README.md) has the one command that reads it out. Without that file the app renders an explicit "not configured" screen rather than failing silently.

## Docs

Every directory that made a real decision explains it next to the code: [`infra/README.md`](infra/README.md) — self-host, secrets, the published image; [`packages/core/README.md`](packages/core/README.md) — the domain port and its rules; [`packages/db/README.md`](packages/db/README.md) — tables, RLS, replication. Project context for AI agents lives in [`AGENTS.md`](AGENTS.md). Architecture decisions, research and the task board live in Linear, not in this repository.

## License

[MIT](LICENSE) © 2026 Volodymyr Chornous
