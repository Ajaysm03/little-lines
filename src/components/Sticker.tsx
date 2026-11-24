import type { StickerState } from '../data/achievements'
import { cn } from './ui'

/** A die-cut sticker: crayon-colored disc with a white border. Locked ones are a gray outline with progress. */
export function StickerBadge({ sticker, size = 'md', showText = true }: { sticker: StickerState; size?: 'sm' | 'md'; showText?: boolean }) {
  const disc = size === 'sm' ? 'size-14 text-[1.75rem]' : 'size-20 text-[2.5rem]'
  return (
    <figure className={cn('flex flex-col items-center text-center', size === 'sm' ? 'w-20' : 'w-28')}>
      <span
        className={cn(
          'grid place-items-center rounded-full',
          disc,
          sticker.earned ? 'shadow-[0_0_0_4px_white,0_8px_18px_-8px_rgb(27_30_69/0.55)]' : 'border-[3px] border-dashed border-mist bg-paper',
        )}
        style={sticker.earned ? { backgroundColor: `color-mix(in srgb, ${sticker.color} 30%, white)` } : undefined}
        aria-hidden
      >
        <span className={cn('leading-none', !sticker.earned && 'opacity-30 grayscale')}>{sticker.emoji}</span>
      </span>
      {showText ? (
        <figcaption className="mt-2.5">
          <span className={cn('block text-[0.875rem] leading-tight font-semibold', sticker.earned ? 'text-ink-deep' : 'text-graphite')}>
            {sticker.title}
          </span>
          {!sticker.earned ? (
            <>
              <span className="mt-1 block text-[0.75rem] leading-snug text-graphite">{sticker.how}</span>
              {sticker.progress > 0 ? (
                <span
                  className="mx-auto mt-1.5 block h-1.5 w-16 overflow-hidden rounded-full bg-mist"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(sticker.progress * 100)}
                  aria-label={`${sticker.title} progress`}
                >
                  <span className="block h-full rounded-full bg-graphite" style={{ width: `${Math.round(sticker.progress * 100)}%` }} />
                </span>
              ) : null}
            </>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  )
}
