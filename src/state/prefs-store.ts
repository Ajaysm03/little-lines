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
  setSound(on: boolean): void
}

/** Device-wide preferences. */
export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      sound: true,
      setSound: (sound) => set({ sound }),
    }),
    { name: 'little-lines:prefs', storage: createJSONStorage(() => safeStorage) },
  ),
)
