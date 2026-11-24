import { db } from './db'
import type { ActivityEvent } from './types'

/**
 * Activity log. Phase 2 records reading (to resume where a child left off);
 * Phase 5 adds coloring events and builds the dashboards from this table.
 */
export type EventType = 'book_open' | 'page_turn'

export interface LogInput {
  accountId: string
  profileId: string
  type: EventType
  bookId?: string
  pageId?: string
  data?: Record<string, unknown>
}

export async function logEvent(input: LogInput): Promise<void> {
  try {
    await db.events.add({ ...input, at: Date.now() })
  } catch {
    // Logging must never break reading or coloring.
  }
}

export interface LastRead {
  bookId: string
  pageIndex: number
  at: number
}

const READING: ReadonlySet<string> = new Set<EventType>(['book_open', 'page_turn'])

/** The book and page this child was last looking at, newest first. */
export async function getLastRead(profileId: string): Promise<LastRead | null> {
  const latest: ActivityEvent | undefined = await db.events
    .where('[profileId+at]')
    .between([profileId, -Infinity], [profileId, Infinity])
    .reverse()
    .filter((e) => READING.has(e.type) && typeof e.bookId === 'string')
    .first()
  if (!latest?.bookId) return null
  const pageIndex = typeof latest.data?.pageIndex === 'number' ? latest.data.pageIndex : 0
  return { bookId: latest.bookId, pageIndex, at: latest.at }
}
