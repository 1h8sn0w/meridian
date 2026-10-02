import { createRootRoute } from '@tanstack/react-router'

import { AppGate } from '../components/AppGate'

// Стан входу перевіряється один раз для всіх маршрутів (MER-49): екрани
// застосунку рендеряться лише тоді, коли є сесія й сім'я. Розмітка сторінки —
// у `index.html`, провайдери — у `main.tsx`.
export const Route = createRootRoute({ component: AppGate })
