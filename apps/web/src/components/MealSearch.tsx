import { MagnifyingGlass, X } from '@phosphor-icons/react'

export function MealSearch({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="relative mb-3">
      <MagnifyingGlass
        aria-hidden
        size={18}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
        aria-label="Пошук страв"
        placeholder="Назва або інгредієнт"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        className="block w-full appearance-none rounded-2xl border border-line bg-app py-2.5 pl-10 pr-12 text-base text-content transition-colors duration-200 focus:border-accent [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Очистити пошук"
          title="Очистити пошук"
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-muted transition-transform duration-300 ease-spring hover:text-content active:scale-90 motion-safe:animate-fade"
        >
          <X aria-hidden size={16} weight="bold" />
        </button>
      ) : null}
    </div>
  )
}
