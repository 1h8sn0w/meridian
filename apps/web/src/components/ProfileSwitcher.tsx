/**
 * Перемикач профілів (MER-17) — сегментована стрічка над годинником.
 *
 * Профіль — це раціон («Я», «Дружина»), а не акаунт: у сім'ї з одним акаунтом
 * їх може бути кілька, і обидва акаунти бачать усі. Вибір — стан пристрою
 * (`lib/active-profile.ts`), тому перемикання на одному телефоні не смикає
 * екран іншого.
 */

import { Avatar } from './ui'
import { hexToRgba } from '../lib/active-profile'
import type { AppProfile } from '../lib/data/model'

export function ProfileSwitcher({
  profiles,
  activeId,
  onSelect,
  onManage,
}: {
  profiles: ReadonlyArray<AppProfile>
  activeId: string | null
  onSelect: (id: string) => void
  onManage: () => void
}) {
  return (
    <div className="mb-3.5 flex gap-1.5 rounded-2xl border border-line bg-surface p-1.5">
      {profiles.map((profile) => {
        const active = profile.id === activeId
        return (
          <button
            key={profile.id}
            type="button"
            aria-pressed={active}
            title={`${profile.name} · ${profile.targetCalories} ± ${profile.corridor} ккал/день`}
            onClick={() => onSelect(profile.id)}
            className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-xl border bg-transparent px-2 py-1.5 text-left ${
              active
                ? 'border-accent bg-accent-soft text-content'
                : 'border-transparent text-muted'
            }`}
          >
            <Avatar
              letter={profile.name.trim().charAt(0).toUpperCase() || '?'}
              color={profile.color}
              soft={hexToRgba(profile.color, 0.18)}
            />
            <span className="min-w-0">
              <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-xs leading-tight">
                {profile.name}
              </span>
              <span
                className={`block text-xs leading-tight ${
                  active ? 'text-accent' : 'text-muted'
                }`}
              >
                {profile.targetCalories} ккал
              </span>
            </span>
          </button>
        )
      })}

      <button
        type="button"
        title="Профілі"
        aria-label="Керувати профілями"
        onClick={onManage}
        className="flex-none cursor-pointer rounded-xl border-0 bg-transparent px-2 py-0 text-base text-muted"
      >
        ⚙
      </button>
    </div>
  )
}
