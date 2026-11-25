import { avatarEmoji, avatarImage, crayonHex } from '../content/profile-options'
import { cn } from './ui'

const SIZES = {
  sm: 'size-10 text-[1.25rem] ring-[3px]',
  md: 'size-14 text-[1.75rem] ring-4',
  lg: 'size-28 text-[3.5rem] ring-[6px] md:size-32 md:text-[4rem]',
  /** Fills a sized parent (name tags, the editor preview). */
  fill: 'size-full text-[4rem] ring-[6px]',
}

/** A child's clay animal, ringed in their crayon color. Falls back to the emoji for unknown animals. */
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
  const img = avatarImage(avatar)
  return (
    <span
      aria-hidden
      className={cn('inline-grid shrink-0 place-items-center rounded-full bg-[#f6ebd6]', SIZES[size], className)}
      style={{ ['--tw-ring-color' as string]: hex }}
    >
      {img ? (
        <img src={img} alt="" className="size-full rounded-full object-cover" draggable={false} />
      ) : (
        <span className="leading-none">{avatarEmoji(avatar)}</span>
      )}
    </span>
  )
}
