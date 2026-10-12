type Sentinel = { release: () => Promise<void> }

type ScreenHost = {
  wakeLock: { request: (type: 'screen') => Promise<Sentinel> }
}

type Page = EventTarget & { visibilityState: DocumentVisibilityState }

export function canKeepScreenAwake(): boolean {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator
}

export function keepScreenAwake(
  host: ScreenHost,
  page: Page,
  onError: (cause: unknown) => void,
): () => void {
  let held: Sentinel | null = null
  let stopped = false
  const request = () => {
    if (page.visibilityState !== 'visible') return
    host.wakeLock.request('screen').then(
      (sentinel) => {
        if (stopped) {
          void sentinel.release()
          return
        }
        void held?.release()
        held = sentinel
      },
      (cause: unknown) => {
        if (!stopped) onError(cause)
      },
    )
  }
  request()
  page.addEventListener('visibilitychange', request)
  return () => {
    stopped = true
    page.removeEventListener('visibilitychange', request)
    void held?.release()
  }
}
