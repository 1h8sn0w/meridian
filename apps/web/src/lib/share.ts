export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed'

export type ShareTarget = {
  clipboard?: Pick<Clipboard, 'writeText'>
  canShare?: (data: ShareData) => boolean
  share?: (data: ShareData) => Promise<void>
}

export async function shareOrCopy(
  data: { title: string; text: string },
  target: ShareTarget = navigator,
): Promise<ShareOutcome> {
  if (target.share && target.canShare?.(data)) {
    try {
      await target.share(data)
      return 'shared'
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') {
        return 'cancelled'
      }
    }
  }
  if (!target.clipboard) return 'failed'
  try {
    await target.clipboard.writeText(data.text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
