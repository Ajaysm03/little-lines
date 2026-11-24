import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { stickerStates, type StickerState } from '../data/achievements'
import { computeDeviceStats, computeProfileStats, type DeviceStats, type ProfileStats } from '../data/analytics'
import { db } from '../data/db'
import { getLastRead, type LastRead } from '../data/events'
import type { Artwork, Profile } from '../data/types'
import { useBooks } from './library-store'
import { useSession } from './session-store'

/** Profiles of the signed-in family, oldest first. `undefined` while loading. */
export function useProfiles(): Profile[] | undefined {
  const accountId = useSession((s) => s.account?.id)
  return useLiveQuery(
    () => (accountId ? db.profiles.where('accountId').equals(accountId).sortBy('createdAt') : []),
    [accountId],
  )
}

/** The child profile currently coloring. `undefined` while loading, `null` if none. */
export function useActiveProfile(): Profile | null | undefined {
  const profileId = useSession((s) => s.profileId)
  return useLiveQuery(async () => (profileId ? ((await db.profiles.get(profileId)) ?? null) : null), [profileId])
}

/** Every page the active child has colored, across all books. `undefined` while loading. */
export function useProfileArtworks(): Artwork[] | undefined {
  const profileId = useSession((s) => s.profileId)
  return useLiveQuery(() => (profileId ? db.artworks.where('profileId').equals(profileId).toArray() : []), [profileId])
}

/** Where the active child last was in a book. `undefined` while loading, `null` if never. */
export function useLastRead(): LastRead | null | undefined {
  const profileId = useSession((s) => s.profileId)
  return useLiveQuery(() => (profileId ? getLastRead(profileId) : null), [profileId])
}

/**
 * Object URLs for each colored page's thumbnail (transparent PNG of the coloring),
 * keyed `${bookId}:${pageId}`. Revoked when the artworks change.
 */
export function useArtworkThumbs(artworks: Artwork[] | undefined): Map<string, string> {
  const urls = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of artworks ?? []) {
      const blob = a.thumb ?? a.colorLayer
      if (blob) map.set(`${a.bookId}:${a.pageId}`, URL.createObjectURL(blob))
    }
    return map
  }, [artworks])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return urls
}

export interface ProfileInsights {
  stats: ProfileStats
  stickers: StickerState[]
  artworks: Artwork[]
}

/** Stats and stickers for one child (the active one by default). `undefined` while loading. */
export function useProfileInsights(profileId?: string | null): ProfileInsights | undefined {
  const active = useSession((s) => s.profileId)
  const books = useBooks()
  const pid = profileId ?? active
  const data = useLiveQuery(
    async () =>
      pid
        ? {
            events: await db.events.where('profileId').equals(pid).toArray(),
            artworks: await db.artworks.where('profileId').equals(pid).toArray(),
          }
        : null,
    [pid],
  )
  return useMemo(() => {
    if (!data) return undefined
    const stats = computeProfileStats(data.events, data.artworks, books)
    return { stats, stickers: stickerStates(stats), artworks: data.artworks }
  }, [data, books])
}

/** Everything on this device, for the admin view. `undefined` while loading. */
export function useDeviceInsights(): DeviceStats | undefined {
  const data = useLiveQuery(async () => ({
    accounts: await db.accounts.toArray(),
    profiles: await db.profiles.toArray(),
    events: await db.events.toArray(),
    artworks: await db.artworks.toArray(),
  }))
  return useMemo(
    () => (data ? computeDeviceStats(data.accounts, data.profiles, data.events, data.artworks) : undefined),
    [data],
  )
}
