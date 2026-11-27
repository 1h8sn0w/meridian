import { useState } from 'react'
import { Check, GearSix } from '@phosphor-icons/react'
import { useActiveProfile } from '../lib/active-profile'
import { useMeals, useProfiles } from '../lib/data/queries'
import type { AppProfile } from '../lib/data/model'
import { useMessages } from '../lib/i18n/use-messages'
import {
  SEARCH_FROM,
  STACK_NARROW,
  STACK_WIDE,
  activeFirst,
  findProfiles,
  hiddenCount,
} from '../lib/profile-stack'
import { ProfilesSheet } from './ProfilesSheet'
import { Avatar, Button, Empty, Field, Sheet } from './ui'

const initial = (profile: AppProfile) =>
  profile.name.trim().charAt(0).toUpperCase() || '?'

export function ProfileMenu({ familyId }: { familyId: string }) {
  const profiles = useProfiles().data
  const { profile, setActive } = useActiveProfile(profiles)
  const [open, setOpen] = useState(false)
  const [managing, setManaging] = useState(false)
  const t = useMessages().profileSwitcher

  if (!profile) return null

  const stack = activeFirst(profiles, profile.id).slice(0, STACK_WIDE)
  const narrowMore = hiddenCount(profiles.length, STACK_NARROW)
  const wideMore = hiddenCount(profiles.length, STACK_WIDE)

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={t.open(profile.name, profiles.length)}
        title={t.open(profile.name, profiles.length)}
        onClick={() => setOpen(true)}
        className="flex h-9 flex-none cursor-pointer items-center rounded-full border border-line bg-app p-0.5 transition-colors duration-300 hover:border-accent motion-safe:transition motion-safe:ease-spring motion-safe:active:scale-97"
      >
        {stack.map((member, index) => (
          <span
            key={member.id}
            className={`rounded-full ring-2 ${
              index === 0 ? 'ring-accent' : '-ml-2.5 ring-app'
            } ${index >= STACK_NARROW ? 'hidden min-[360px]:inline-flex' : 'inline-flex'}`}
          >
            <Avatar letter={initial(member)} color={member.color} />
          </span>
        ))}
        {narrowMore > 0 ? (
          <MoreChip
            count={narrowMore}
            className="inline-flex min-[360px]:hidden"
          />
        ) : null}
        {wideMore > 0 ? (
          <MoreChip
            count={wideMore}
            className="hidden min-[360px]:inline-flex"
          />
        ) : null}
      </button>

      {open ? (
        <ProfilePicker
          profiles={profiles}
          activeId={profile.id}
          onPick={setActive}
          onManage={() => setManaging(true)}
          onClose={() => setOpen(false)}
        />
      ) : null}

      {managing ? (
        <ManageProfiles
          profiles={profiles}
          familyId={familyId}
          onClose={() => setManaging(false)}
        />
      ) : null}
    </>
  )
}

function MoreChip({ count, className }: { count: number; className: string }) {
  return (
    <span
      aria-hidden
      className={`-ml-2.5 h-8 min-w-8 items-center justify-center rounded-full bg-surface px-1.5 font-mono text-xs font-semibold tabular-nums text-muted ring-2 ring-app ${className}`}
    >
      +{count}
    </span>
  )
}

function ProfilePicker({
  profiles,
  activeId,
  onPick,
  onManage,
  onClose,
}: {
  profiles: ReadonlyArray<AppProfile>
  activeId: string
  onPick: (id: string) => void
  onManage: () => void
  onClose: () => void
}) {
  const messages = useMessages()
  const t = messages.profileSwitcher
  const [query, setQuery] = useState('')
  const found = findProfiles(profiles, query)

  return (
    <Sheet title={messages.profiles.title} onClose={onClose}>
      {(close) => (
        <>
          {profiles.length >= SEARCH_FROM ? (
            <Field
              type="search"
              label={t.search}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}

          {found.length ? (
            <ul className="m-0 mb-3 list-none p-0">
              {found.map((member) => {
                const active = member.id === activeId
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      aria-current={active ? 'true' : undefined}
                      onClick={() => {
                        onPick(member.id)
                        close()
                      }}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border-0 px-2 py-2 text-left transition-colors duration-300 hover:bg-accent-soft ${
                        active ? 'bg-accent-soft' : 'bg-transparent'
                      }`}
                    >
                      <Avatar letter={initial(member)} color={member.color} />
                      <span className="min-w-0 flex-1">
                        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium text-content">
                          {member.name}
                        </span>
                        <span className="block font-mono text-xs tabular-nums text-muted">
                          {messages.profiles.corridor(
                            member.targetCalories,
                            member.corridor,
                          )}
                        </span>
                      </span>
                      {active ? (
                        <Check
                          aria-hidden
                          size={18}
                          weight="bold"
                          className="flex-none text-accent"
                        />
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="mb-3">
              <Empty>{t.notFound}</Empty>
            </div>
          )}

          <Button
            block
            onClick={() => {
              close()
              onManage()
            }}
          >
            <GearSix aria-hidden size={18} />
            {t.manage}
          </Button>
        </>
      )}
    </Sheet>
  )
}

function ManageProfiles({
  profiles,
  familyId,
  onClose,
}: {
  profiles: ReadonlyArray<AppProfile>
  familyId: string
  onClose: () => void
}) {
  const meals = useMeals().data
  return (
    <ProfilesSheet
      profiles={profiles}
      meals={meals}
      familyId={familyId}
      onClose={onClose}
    />
  )
}
