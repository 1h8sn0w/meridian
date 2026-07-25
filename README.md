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

Для кожного дня добирає по одній страві на слот так, щоб:

1. **тип збігався** — сніданок лише на сніданок і т.д.;
2. **калорійність дня** трималась у коридорі від цілі дієтолога;
3. **не було частих повторів** — страва не частіше, ніж раз на N днів;
4. **тиждень міксував** страви з різних базових планів, а не копіював один.

Технічно — задача з обмеженнями (constraint satisfaction), розв'язується простим переборно-жадібним алгоритмом. Без важкого AI.

## Стек

| Шар | Вибір | Чому |
|-----|-------|------|
| Застосунок | Один HTML-файл + vanilla JS | Уся логіка лишається без фреймворка й бандлера |
| Дані | `localStorage` браузера | Пул страв і плани переживають перезавантаження, без акаунтів |
| UI | Tailwind CSS v4, mobile-first | Статичний зібраний CSS без runtime-залежності |
| Бекенд | немає (у POC) | Спершу довести цінність, потім нарощувати |

Після POC — перенесення на React + невеликий бекенд для синхронізації між пристроями та імпорту PDF.

## Запуск

Застосунок розгортається як готові статичні файли: `index.html` і збережений у репозиторії `tailwind.css` не потребують npm чи runtime-збірки. Для реального користування відкривайте його **через локальний сервер** (сталий `http://localhost`-origin), а не подвійним кліком: `file://` і `localhost` — це **різні origin** сховища localStorage, тож дані, збережені в одному, «зникнуть» в іншому. Через `file://` ще й не працює офлайн/PWA — service worker потребує `http(s)` або `localhost`.

```
git clone https://github.com/1h8sn0w/meridian.git
cd meridian
npx serve .          # or: python3 -m http.server 8000
```

Open the `http://localhost:…` address it prints — not `index.html` by double-click. `file://` and `localhost` are separate localStorage origins, so data saved under one vanishes under the other, and service workers need `http(s)`.

## Stack

One HTML file, vanilla JS, `localStorage`, Tailwind CSS v4. No backend, no bundler, no framework — deliberately, until the idea is proven. Next is a local-first rewrite on SQLite + PowerSync + Supabase.

<details>
<summary>Working on the styles</summary>

Runtime and deploy stay build-free: `index.html` and the generated `tailwind.css` are committed and served as static files. npm is only needed to change utility classes or the theme.

```sh
npm ci
npm run build:css    # one-off deterministic build
npm run watch:css    # rebuild while editing
```

Node.js 20+. `tailwindcss` and `@tailwindcss/cli` are pinned to `4.3.3`. Preflight is deliberately left out so native form controls keep their appearance. Run `npm run build:css` before handing work over. Minimum browsers for Tailwind v4: Chrome 111, Safari 16.4, Firefox 128.

</details>

**Фаза 2 · V1 — наступна.** Імпорт PDF-планів, список покупок, профіль на двох, історія/улюблене, PWA + офлайн, нагадування.

Project context for AI agents lives in [`AGENTS.md`](AGENTS.md). Architecture decisions, research and the task board live in Linear, not in this repository.

- [`AGENTS.md`](AGENTS.md) — контекст проєкту для AI-агентів (опис, ціль, стек, конвенції).
- Задачі, пріоритети й фази ведуться в Linear (команда Meridian).

## Ліцензія

[MIT](LICENSE) © 2026 Volodymyr Chornous
