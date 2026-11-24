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
}

/** Saves a page's coloring. A page becomes finished at 80% and un-finishes if mostly erased. */
export async function saveArtwork(input: SaveInput): Promise<Artwork> {
  const id = artworkId(input.profileId, input.bookId, input.pageId)
  const now = Date.now()
  return db.transaction('rw', db.artworks, async () => {
    const prev = await db.artworks.get(id)
    const progress = Math.max(0, Math.min(1, input.progress))
    let completedAt = prev?.completedAt ?? null
    if (!completedAt && progress >= FINISHED_AT) completedAt = now
    if (completedAt && progress < UNFINISHED_BELOW) completedAt = null
    const art: Artwork = {
      id,
      profileId: input.profileId,
      bookId: input.bookId,
      pageId: input.pageId,
      colorLayer: input.colorLayer,
      thumb: input.thumb,
      progress,
      completedAt,
      updatedAt: now,
    }
    await db.artworks.put(art)
    return art
  })
}
