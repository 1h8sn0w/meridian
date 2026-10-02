/**
 * Перемикач профілів (MER-17) — сегментована стрічка над годинником.
 *
 * Профіль — це раціон («Я», «Дружина»), а не акаунт: у сім'ї з одним акаунтом
 * їх може бути кілька, і обидва акаунти бачать усі. Вибір — стан пристрою
 * (`lib/active-profile.ts`), тому перемикання на одному телефоні не смикає
 * екран іншого.
 */

import { GearSix } from '@phosphor-icons/react'
import { Avatar } from './ui'
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
    <div className="glass mb-4 flex gap-1 rounded-full p-1.5">
      {profiles.map((profile) => {
        const active = profile.id === activeId
        return (
          <button
            key={profile.id}
            type="button"
            aria-pressed={active}
            title={`${profile.name} · ${profile.targetCalories} ± ${profile.corridor} ккал/день`}
            onClick={() => onSelect(profile.id)}
            className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-full border-0 py-1 pl-1 pr-3 text-left transition-all duration-300 ease-spring active:scale-97 ${
              active
                ? 'bg-accent-soft text-content'
                : 'bg-transparent text-muted'
            }`}
          >
            <Avatar
              letter={profile.name.trim().charAt(0).toUpperCase() || '?'}
              color={profile.color}
            />
            <span className="min-w-0">
              <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium leading-tight">
                {profile.name}
              </span>
              <span
                className={`block font-mono text-xs leading-tight tabular-nums ${
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
        className="flex h-10 w-10 flex-none cursor-pointer items-center justify-center self-center rounded-full border-0 bg-transparent p-0 text-muted transition-all duration-500 ease-spring hover:rotate-45 hover:text-content active:scale-90"
      >
        <GearSix aria-hidden size={20} />
      </button>
    </div>
  )
}
