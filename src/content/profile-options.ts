/** Animal friends from the Cozy Christmas pages, plus a few more. */
export const AVATARS = [
  { id: 'fox', emoji: '🦊', label: 'Fox' },
  { id: 'bear', emoji: '🐻', label: 'Bear' },
  { id: 'bunny', emoji: '🐰', label: 'Bunny' },
  { id: 'owl', emoji: '🦉', label: 'Owl' },
  { id: 'reindeer', emoji: '🦌', label: 'Reindeer' },
  { id: 'hedgehog', emoji: '🦔', label: 'Hedgehog' },
  { id: 'penguin', emoji: '🐧', label: 'Penguin' },
  { id: 'cat', emoji: '🐱', label: 'Cat' },
  { id: 'puppy', emoji: '🐶', label: 'Puppy' },
  { id: 'panda', emoji: '🐼', label: 'Panda' },
  { id: 'frog', emoji: '🐸', label: 'Frog' },
  { id: 'unicorn', emoji: '🦄', label: 'Unicorn' },
] as const

/** Each profile picks its own crayon; it colors their avatar ring and highlights. */
export const CRAYONS = [
  { id: 'cranberry', hex: '#E0475B', label: 'Cranberry' },
  { id: 'tangerine', hex: '#F28A2E', label: 'Tangerine' },
  { id: 'sunflower', hex: '#F2C230', label: 'Sunflower' },
  { id: 'meadow', hex: '#3BA55C', label: 'Meadow' },
  { id: 'sky', hex: '#3D8BE8', label: 'Sky' },
  { id: 'grape', hex: '#8559D9', label: 'Grape' },
] as const

export function avatarEmoji(id: string): string {
  return AVATARS.find((a) => a.id === id)?.emoji ?? '🎨'
}

export function crayonHex(id: string): string {
  return CRAYONS.find((c) => c.id === id)?.hex ?? CRAYONS[4].hex
}
