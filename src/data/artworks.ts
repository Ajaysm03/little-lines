import { db } from './db'
import type { Artwork } from './types'

/** Progress at which a page counts as finished, and below which it stops counting. */
export const FINISHED_AT = 0.8
export const UNFINISHED_BELOW = 0.6

export function artworkId(profileId: string, bookId: string, pageId: string) {
  return `${profileId}:${bookId}:${pageId}`
}

export function getArtwork(profileId: string, bookId: string, pageId: string): Promise<Artwork | undefined> {
  return db.artworks.get(artworkId(profileId, bookId, pageId))
}

export interface SaveInput {
  profileId: string
  bookId: string
  pageId: string
  colorLayer: Blob
  thumb: Blob
  progress: number
  /** The child tapped "I'm finished". */
  finish?: boolean
}

/**
 * Saves a page's coloring. A page finishes by itself at 80% and un-finishes if
 * mostly erased, unless the child marked it finished themselves.
 */
export async function saveArtwork(input: SaveInput): Promise<Artwork> {
  const id = artworkId(input.profileId, input.bookId, input.pageId)
  const now = Date.now()
  return db.transaction('rw', db.artworks, async () => {
    const prev = await db.artworks.get(id)
    const progress = Math.max(0, Math.min(1, input.progress))
    let completedAt = prev?.completedAt ?? null
    let finishedByChild = prev?.finishedByChild ?? false
    if (input.finish) {
      completedAt = completedAt ?? now
      finishedByChild = true
    }
    if (!completedAt && progress >= FINISHED_AT) completedAt = now
    if (completedAt && !finishedByChild && progress < UNFINISHED_BELOW) completedAt = null
    // Clearing nearly everything always resets the page.
    if (progress < 0.02) {
      completedAt = null
      finishedByChild = false
    }
    const art: Artwork = {
      id,
      profileId: input.profileId,
      bookId: input.bookId,
      pageId: input.pageId,
      colorLayer: input.colorLayer,
      thumb: input.thumb,
      progress,
      completedAt,
      finishedByChild,
      updatedAt: now,
    }
    await db.artworks.put(art)
    return art
  })
}
