import { GearSix } from '@phosphor-icons/react'
import { Avatar } from './ui'
import type { AppProfile } from '../lib/data/model'
import { useMessages } from '../lib/i18n/use-messages'

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
  const t = useMessages()
  return (
    <div className="glass mb-4 flex gap-1 rounded-full p-1.5">
      {profiles.map((profile) => {
        const active = profile.id === activeId
        return (
          <button
            key={profile.id}
            type="button"
            aria-pressed={active}
            title={t.profileSwitcher.summary(
              profile.name,
              profile.targetCalories,
              profile.corridor,
            )}
            onClick={() => onSelect(profile.id)}
            className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-full border-0 py-1 pl-1 pr-3 text-left transition duration-300 ease-spring active:scale-97 ${
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
                {t.common.kcal(profile.targetCalories)}
              </span>
            </span>
          </button>
        )
      })}

      <button
        type="button"
        title={t.profileSwitcher.profiles}
        aria-label={t.profileSwitcher.manage}
        onClick={onManage}
        className="flex h-10 w-10 flex-none cursor-pointer items-center justify-center self-center rounded-full border-0 bg-transparent p-0 text-muted transition duration-500 ease-spring hover:rotate-45 hover:text-content active:scale-90"
      >
        <GearSix aria-hidden size={20} />
      </button>
    </div>
  )
}
