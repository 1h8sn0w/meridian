<div align="center">

# Meridian

**A meal planner that assembles your week from your dietitian's approved plans.**

![status](https://img.shields.io/badge/status-working%20prototype-46c98b)
![next](https://img.shields.io/badge/next-V2%20·%20local--first-4f9dff)
![license](https://img.shields.io/badge/license-MIT-46c98b)

<img src="docs/preview.svg" width="360" alt="Meridian home screen — day clock and active meal">

[Українською](README-UA.md)

</div>

---

Meridian turns a dietitian's PDF meal plans into a working app. It splits them into individual meals and assembles a new week on its own — keeping the dietitian's calorie targets and meal structure, but mixing dishes across several plans so the rotation doesn't get stale. The home screen answers one question: what to eat right now.

Unlike general-purpose meal planners, it never invents food. Every meal comes from a plan your dietitian approved.

## How the generator works

For each slot it picks a meal so that the type matches, the day's calories stay inside a corridor around the target (±100 kcal by default), no dish repeats too often, and the week draws on several source plans rather than copying one. It's a constraint satisfaction problem, solved greedily with randomness and bounded backtracking. No ML involved.

## Run it

```sh
git clone https://github.com/1h8sn0w/meridian.git
cd meridian
npx serve .          # or: python3 -m http.server 8000
```

Open the `http://localhost:…` address it prints — not `index.html` by double-click. `file://` and `localhost` are separate localStorage origins, so data saved under one vanishes under the other, and service workers need `http(s)`.

## Stack

One HTML file, vanilla JS, `localStorage`, Tailwind CSS v4. No backend, no bundler, no framework — deliberately, until the idea is proven. Next is a local-first rewrite on SQLite + PowerSync + Supabase.

<details>
<summary>Working on the styles</summary>

Runtime and deploy stay build-free: `index.html` and the generated `tailwind.css` are committed and served as static files. The toolchain is only needed to change utility classes or the theme.

```sh
corepack enable pnpm
pnpm install
pnpm build:css       # one-off deterministic build
pnpm watch:css       # rebuild while editing
```

Node.js 22+ and pnpm 11 (the repo is a pnpm workspace since V2 — see below). `tailwindcss` and `@tailwindcss/cli` are pinned to `4.3.3`. Preflight is deliberately left out so native form controls keep their appearance. Run `pnpm build:css` before handing work over. Minimum browsers for Tailwind v4: Chrome 111, Safari 16.4, Firefox 128.

</details>

## Repository layout

V1 — the prototype described above — is the static app at the repository root. V2, the local-first rewrite, is a pnpm workspace alongside it:

| Path | What |
|------|------|
| `apps/web` | Vite + TanStack Start app; Capacitor will later wrap this same build |
| `packages/core` | Domain logic in plain TypeScript: week generator, calories, provenance rules |
| `packages/db` | Drizzle schema and migrations for Supabase Postgres |
| `infra` | Docker Compose, Caddyfile, PowerSync config, `.env` example |

```sh
pnpm install
pnpm dev             # apps/web on http://localhost:3000
pnpm build           # every package
pnpm lint
pnpm typecheck
pnpm format
pnpm db:migrate
```

## Docs

Project context for AI agents lives in [`AGENTS.md`](AGENTS.md). Architecture decisions, research and the task board live in Linear, not in this repository.

## License

[MIT](LICENSE) © 2026 Volodymyr Chornous
