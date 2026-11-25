/**
 * Painted scenes behind the screens (cozy redesign). Made by `npm run assets:scenes` from the plates in
 * ../Redesign Concepts/Plates into public/scenes/<season>/<scene>.webp (2000 px) and <scene>-1200.webp.
 *
 * Every scene is drawn at 4:3 and designed at 1366×1024; things tied to the picture (signposts, shelves,
 * hooks) are placed in those coordinates with <ScenePin>.
 */
export const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const
export type Season = (typeof SEASONS)[number]

/** Seasons that have a full set of scenes. Books in other seasons fall back to winter until theirs exist. */
export const SCENE_SEASONS: readonly Season[] = ['winter']

export const SCENES = ['login', 'home', 'book', 'reader', 'profiles', 'library', 'myart', 'grownups', 'studio'] as const
export type SceneName = (typeof SCENES)[number]

/** The size every scene is designed at. */
export const SCENE_W = 1366
export const SCENE_H = 1024

export function sceneSeason(season?: Season | null): Season {
  return season && SCENE_SEASONS.includes(season) ? season : 'winter'
}

export function sceneUrl(scene: SceneName, season?: Season | null, small = false): string {
  return `/scenes/${sceneSeason(season)}/${scene}${small ? '-1200' : ''}.webp`
}

export const SEASON_LABELS: Record<Season, string> = {
  winter: 'Winter',
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
}

/** CSS `background-image` for a scene: the 2000 px picture over the 1200 px copy (always offline), or just the copy. */
export function sceneBackground(scene: SceneName, season?: Season | null, small = false): string {
  const copy = `url(${sceneUrl(scene, season, true)})`
  return small ? copy : `url(${sceneUrl(scene, season)}), ${copy}`
}
