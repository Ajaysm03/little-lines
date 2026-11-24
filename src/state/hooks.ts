import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo } from 'react'
import { db } from '../data/db'
import { getLastRead, type LastRead } from '../data/events'
import type { Artwork, Profile } from '../data/types'
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
