import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useState } from 'react'
import { stickerStates, type StickerState } from '../data/achievements'
import { computeDeviceStats, computeProfileStats, type DeviceStats, type ProfileStats } from '../data/analytics'
import { api } from '../data/api'
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

/** Every family on the server, for the admin view. `undefined` while loading, `null` if it failed. */
export function useAllFamilies(): { stats: DeviceStats | null; error: string | null } | undefined {
  const [state, setState] = useState<{ stats: DeviceStats | null; error: string | null } | undefined>(undefined)
  useEffect(() => {
    let live = true
    api
      .adminOverview()
      .then((o) => {
        const accounts = o.families.map((f) => ({ id: f.id, name: f.name, email: f.email, role: f.role, lastLoginAt: f.lastLoginAt }))
        live && setState({ stats: computeDeviceStats(accounts, o.profiles, o.events, o.pagesFinished), error: null })
      })
      .catch((err: unknown) => live && setState({ stats: null, error: err instanceof Error ? err.message : 'Couldn’t load.' }))
    return () => {
      live = false
    }
  }, [])
  return state
}
