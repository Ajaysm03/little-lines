import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../data/db'
import type { Profile } from '../data/types'
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
