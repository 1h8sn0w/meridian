<div align="center">

# Meridian

**A meal planner that assembles your week from your dietitian's approved plans.**

[![CI](https://github.com/1h8sn0w/meridian/actions/workflows/ci.yml/badge.svg?branch=staging)](https://github.com/1h8sn0w/meridian/actions/workflows/ci.yml)
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

The scheme matters: `https://` turns on an automatic Let's Encrypt certificate, once the domain resolves to this host and 80/443 reach it. Those ports have to be free on the host, or set `HTTP_PORT` / `HTTPS_PORT`.

Signup is open by default, because a fresh stack has to let someone create the first account — so on a stack reachable from the internet, closing it with `GOTRUE_DISABLE_SIGNUP=true` is the last step of the install rather than an afterthought. Two consequences come with it: adding a new family member needs signup reopened for the length of one registration, and password reset does not work at all until you configure SMTP — there is no mail in the stack. The ordered procedure for all of it, along with the prebuilt image and where the secrets live, is in [`infra/README.md`](infra/README.md).

## Where it stands

V2 now covers what the prototype did: sign-in and the family model (GoTrue, `family_id` as a token claim, invite codes instead of email), the screens — Today, Week, Calendar, Meals, Recipe, Shopping, Family — reading and writing the on-device database, week generation and manual swap ported into `packages/core` with tests, PDF plan import, meal reminders, PWA install and offline, and seven tables syncing across a family's devices. Still ahead: a store release of the mobile build — the wrapper and both native projects are in the repository, but nothing has been compiled on a device yet.

V1 — one HTML file, vanilla JS, `localStorage`, no backend and no bundler — proved the idea and was deleted from the repository in MER-68 once V2 reached parity. It stays in git history, and on GitHub Pages until `staging` lands on `main`; the localStorage data it left behind is imported by V2 from the Family screen.

## Stack

The on-device SQLite database is the source of truth for the UI, so nothing ever waits on the network; PowerSync keeps it converged with Postgres in the background, and writes go out through PostgREST — which is why conflicts resolve as plain last-write-wins per slot, with no CRDT. The front end is a static Vite + TanStack Router SPA — there is no application server at all: Caddy serves the files and fills the browser’s three configuration values into `index.html` as it serves them. Capacitor wraps that same build for mobile. The server side is a deliberate subset of self-hosted Supabase — Postgres, GoTrue and PostgREST, the three services the app actually calls, not the usual eleven — behind Caddy.

<details>
<summary>Working on the styles</summary>

There is exactly one Tailwind build in the repository, and it lives in `apps/web`: the official `@tailwindcss/vite` plugin, entry point `apps/web/src/styles.css`. `pnpm dev` picks up changes to the theme immediately — no separate CSS step.

The old V1 setup — `@tailwindcss/cli` producing a committed `tailwind.css` — was removed in MER-53 along with the `build:css` / `watch:css` scripts. The design tokens moved into `apps/web/src/styles.css` unchanged. Preflight is still deliberately left out so native form controls keep their appearance; the few reset properties that are actually needed are declared in the `base` layer.

Minimum browsers for Tailwind v4: Chrome 111, Safari 16.4, Firefox 128.

</details>

## Repository layout

The repository is a pnpm workspace:

| Path | What |
|------|------|
| `compose.yaml` | The self-host stack, whole: seven services, zero manual steps |
| `apps/web` | Static Vite + TanStack Router app; Capacitor wraps this same build |
| `packages/core` | Domain logic in plain TypeScript: week generator, calories, provenance rules |
| `packages/db` | SQL migrations for Postgres and the script that applies them |
| `infra` | Dockerfiles, Caddyfile, PowerSync config, secret generation, `compose` overlay |
| `.github/workflows` | Checks on every PR; the app image published on every push |

Working on the app itself:

```sh
pnpm install
pnpm dev             # apps/web on http://localhost:3000
pnpm build           # every package
pnpm lint
pnpm typecheck
pnpm test            # unit tests of packages/core and apps/web
pnpm format          # format:check is what CI runs
pnpm db:migrate
```

`pnpm dev` expects the stack running next to it: it uses the same database, the same GoTrue and the same sync service, just with hot module replacement. It needs `apps/web/.env` first, because the anon key only exists inside the stack — [`infra/README.md`](infra/README.md) has the one command that reads it out. Without that file the app renders an explicit "not configured" screen rather than failing silently.

## Docs

Every directory that made a real decision explains it next to the code: [`infra/README.md`](infra/README.md) — self-host, secrets, the published image; [`packages/core/README.md`](packages/core/README.md) — the domain port and its rules; [`packages/db/README.md`](packages/db/README.md) — tables, RLS, replication. Project context for AI agents lives in [`AGENTS.md`](AGENTS.md). Architecture decisions, research and the task board live in Linear, not in this repository.

## License

[MIT](LICENSE) © 2026 Volodymyr Chornous
