import type { ProfileStats } from './analytics'

/**
 * Stickers a child earns by coloring. Each has a rule over the child's stats and
 * reports progress, so locked stickers can say how close they are.
 */
export interface Sticker {
  id: string
  title: string
  /** What to do to earn it, written for the child. */
  how: string
  emoji: string
  /** Sticker background, one of the crayon colors. */
  color: string
  check(s: ProfileStats): { earned: boolean; progress: number }
}

const count = (value: number, goal: number) => ({ earned: value >= goal, progress: Math.min(1, value / goal) })

export const STICKERS: Sticker[] = [
  {
    id: 'first-scribble',
    title: 'First scribble',
    how: 'Put some color on any page.',
    emoji: '🖍️',
    color: '#E0475B',
    check: (s) => count(s.strokes + s.fills, 1),
  },
  {
    id: 'first-page',
    title: 'Page finished',
    how: 'Finish your first page.',
    emoji: '⭐',
    color: '#F2C230',
    check: (s) => count(s.pagesFinished, 1),
  },
  {
    id: 'four-pages',
    title: 'Four-page star',
    how: 'Finish 4 pages.',
    emoji: '🌟',
    color: '#F28A2E',
    check: (s) => count(s.pagesFinished, 4),
  },
  {
    id: 'whole-book',
    title: 'Whole book',
    how: 'Finish every page in a book.',
    emoji: '📚',
    color: '#3D8BE8',
    check: (s) => count(s.booksFinished.length, 1),
  },
  {
    id: 'color-explorer',
    title: 'Color explorer',
    how: 'Use 12 different colors.',
    emoji: '🎨',
    color: '#8559D9',
    check: (s) => count(s.distinctColors, 12),
  },
  {
    id: 'rainbow',
    title: 'Rainbow maker',
    how: 'Fill a shape with a rainbow.',
    emoji: '🌈',
    color: '#3BA55C',
    check: (s) => count(s.tools.has('fill-rainbow') ? 1 : 0, 1),
  },
  {
    id: 'sparkle',
    title: 'Sparkle star',
    how: 'Color with glitter.',
    emoji: '✨',
    color: '#8559D9',
    check: (s) => count(s.tools.has('glitter') ? 1 : 0, 1),
  },
  {
    id: 'painter',
    title: 'Little painter',
    how: 'Color with the paint brush.',
    emoji: '🖌️',
    color: '#3D8BE8',
    check: (s) => count(s.tools.has('watercolor') ? 1 : 0, 1),
  },
  {
    id: 'streak-3',
    title: 'Three days in a row',
    how: 'Color on 3 days in a row.',
    emoji: '🔥',
    color: '#F28A2E',
    check: (s) => count(s.bestStreak, 3),
  },
  {
    id: 'streak-7',
    title: 'A whole week',
    how: 'Color on 7 days in a row.',
    emoji: '🏆',
    color: '#F2C230',
    check: (s) => count(s.bestStreak, 7),
  },
  {
    id: 'hour',
    title: 'Hour of color',
    how: 'Color for 60 minutes in all.',
    emoji: '⏰',
    color: '#E0475B',
    check: (s) => count(s.totalMs / 60000, 60),
  },
  {
    id: 'page-turner',
    title: 'Page turner',
    how: 'Turn 20 pages in your books.',
    emoji: '📖',
    color: '#3BA55C',
    check: (s) => count(s.pageTurns, 20),
  },
]

export interface StickerState extends Sticker {
  earned: boolean
  progress: number
}

export function stickerStates(stats: ProfileStats): StickerState[] {
  return STICKERS.map((s) => ({ ...s, ...s.check(stats) }))
}
