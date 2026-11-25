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
  /** Sound effects: page flips, the finish chime, drawing sounds. */
  sound: boolean
  /** Scribble sounds while coloring (needs `sound`). */
  drawSounds: boolean
  /** A crackling fireplace while reading and coloring. */
  fireplace: boolean
  /** Falling snow on the snowy scenes (it can be switched off in Grown-ups). */
  snow: boolean
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
  /** Per child, per drawing tool: size and strength (see coloring/tool-settings). */
  toolSettings: Record<string, Partial<Record<string, { size: number; strength: number }>>>
  /** Per child: whether the colors panel is tucked away. */
  colorsTucked: Record<string, boolean>
  setSound(on: boolean): void
  setDrawSounds(on: boolean): void
  setFireplace(on: boolean): void
  setSnow(on: boolean): void
  setPenOnly(on: boolean): void
  markPenSeen(): void
  addRecentColor(profileId: string, color: string): void
  setStayInLines(profileId: string, on: boolean): void
  setLeftHanded(profileId: string, on: boolean): void
  markStickersSeen(profileId: string, ids: string[]): void
  setToolSetting(profileId: string, tool: string, setting: { size: number; strength: number }): void
  setColorsTucked(profileId: string, tucked: boolean): void
}

/** Device-wide preferences. */
export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      sound: true,
      drawSounds: true,
      fireplace: false,
      snow: true,
      penOnly: false,
      penSeen: false,
      recentColors: {},
      stayInLines: {},
      leftHanded: {},
      seenStickers: {},
      toolSettings: {},
      colorsTucked: {},
      setSound: (sound) => set({ sound }),
      setDrawSounds: (drawSounds) => set({ drawSounds }),
      setFireplace: (fireplace) => set({ fireplace }),
      setSnow: (snow) => set({ snow }),
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
      setToolSetting: (profileId, tool, setting) =>
        set((s) => ({ toolSettings: { ...s.toolSettings, [profileId]: { ...s.toolSettings[profileId], [tool]: setting } } })),
      setColorsTucked: (profileId, tucked) => set((s) => ({ colorsTucked: { ...s.colorsTucked, [profileId]: tucked } })),
      markStickersSeen: (profileId, ids) =>
        set((s) => ({
          seenStickers: { ...s.seenStickers, [profileId]: [...new Set([...(s.seenStickers[profileId] ?? []), ...ids])] },
        })),
    }),
    { name: 'little-lines:prefs', storage: createJSONStorage(() => safeStorage) },
  ),
)
