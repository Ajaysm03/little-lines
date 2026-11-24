import { avatarEmoji, crayonHex } from '../content/profile-options'
import { cn } from './ui'

const SIZES = {
  sm: 'size-10 text-[1.25rem] ring-[3px]',
  md: 'size-14 text-[1.75rem] ring-4',
  lg: 'size-28 text-[3.5rem] ring-[6px] md:size-32 md:text-[4rem]',
}

/** A child's animal on a soft wash of their crayon color, ringed in the full crayon. */
export function Avatar({
  avatar,
  color,
  size = 'md',
  className,
}: {
  avatar: string
  color: string
  size?: keyof typeof SIZES
  className?: string
}) {
  const hex = crayonHex(color)
  return (
    <span
      aria-hidden
      className={cn('inline-grid shrink-0 place-items-center rounded-full ring-inset', SIZES[size], className)}
      style={{ backgroundColor: `color-mix(in srgb, ${hex} 18%, white)`, ['--tw-ring-color' as string]: hex }}
    >
      <span className="leading-none">{avatarEmoji(avatar)}</span>
    </span>
  )
}
