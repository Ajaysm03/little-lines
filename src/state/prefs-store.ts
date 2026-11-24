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
  /** Per child: strokes stay inside the area they start in (on unless turned off). */
  stayInLines: Record<string, boolean>
  /** Per child: tools on the right, colors on the left. */
  leftHanded: Record<string, boolean>
  /** Per child: stickers already celebrated, so each "new sticker" note shows once. */
  seenStickers: Record<string, string[]>
  setSound(on: boolean): void
  setPenOnly(on: boolean): void
  markPenSeen(): void
  addRecentColor(profileId: string, color: string): void
  setStayInLines(profileId: string, on: boolean): void
  setLeftHanded(profileId: string, on: boolean): void
  markStickersSeen(profileId: string, ids: string[]): void
}

/** Device-wide preferences. */
export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      sound: true,
      penOnly: false,
      penSeen: false,
      recentColors: {},
      stayInLines: {},
      leftHanded: {},
      seenStickers: {},
      setSound: (sound) => set({ sound }),
      setPenOnly: (penOnly) => set({ penOnly }),
      markPenSeen: () => set({ penSeen: true }),
      addRecentColor: (profileId, color) =>
        set((s) => {
          const c = color.toLowerCase()
          const list = [c, ...(s.recentColors[profileId] ?? []).filter((x) => x !== c)].slice(0, 8)
          return { recentColors: { ...s.recentColors, [profileId]: list } }
        }),
      setStayInLines: (profileId, on) => set((s) => ({ stayInLines: { ...s.stayInLines, [profileId]: on } })),
      setLeftHanded: (profileId, on) => set((s) => ({ leftHanded: { ...s.leftHanded, [profileId]: on } })),
      markStickersSeen: (profileId, ids) =>
        set((s) => ({
          seenStickers: { ...s.seenStickers, [profileId]: [...new Set([...(s.seenStickers[profileId] ?? []), ...ids])] },
        })),
    }),
    { name: 'little-lines:prefs', storage: createJSONStorage(() => safeStorage) },
  ),
)
