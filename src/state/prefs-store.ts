import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

/** localStorage that quietly does nothing when storage is blocked. */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* not fatal */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* not fatal */
    }
  },
}

interface PrefsState {
  sound: boolean
  /** Only the Apple Pencil / stylus draws; fingers move and zoom the page. */
  penOnly: boolean
  /** Set once a pen has been used, so pencil-only switches on by itself just the first time. */
  penSeen: boolean
  /** Last colors each child picked, newest first. */
  recentColors: Record<string, string[]>
  setSound(on: boolean): void
  setPenOnly(on: boolean): void
  markPenSeen(): void
  addRecentColor(profileId: string, color: string): void
}

/** Device-wide preferences. */
export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      sound: true,
      penOnly: false,
      penSeen: false,
      recentColors: {},
      setSound: (sound) => set({ sound }),
      setPenOnly: (penOnly) => set({ penOnly }),
      markPenSeen: () => set({ penSeen: true }),
      addRecentColor: (profileId, color) =>
        set((s) => {
          const c = color.toLowerCase()
          const list = [c, ...(s.recentColors[profileId] ?? []).filter((x) => x !== c)].slice(0, 8)
          return { recentColors: { ...s.recentColors, [profileId]: list } }
        }),
    }),
    { name: 'little-lines:prefs', storage: createJSONStorage(() => safeStorage) },
  ),
)
