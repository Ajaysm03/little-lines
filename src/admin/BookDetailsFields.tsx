import { useId } from 'react'
import { cn, TextField } from '../components/ui'
import type { CatalogMeta } from '../data/api'

/** The same list the server accepts (server/catalog.ts). */
export const CATEGORIES = ['Holidays', 'Animals', 'Nature', 'Fantasy', 'Vehicles', 'Everyday', 'Other']

export interface Details {
  title: string
  subtitle: string
  description: string
  category: string
  ageRange: string
  /** Comma-separated in the form. */
  tags: string
}

export const emptyDetails = (): Details => ({ title: '', subtitle: '', description: '', category: 'Other', ageRange: '', tags: '' })

export function detailsFromMeta(m: CatalogMeta): Details {
  return { title: m.title, subtitle: m.subtitle, description: m.description, category: m.category, ageRange: m.ageRange, tags: m.tags.join(', ') }
}

export function metaFromDetails(d: Details, theme: CatalogMeta['theme'], pageSize: CatalogMeta['pageSize']): CatalogMeta {
  return {
    title: d.title.trim(),
    subtitle: d.subtitle.trim(),
    description: d.description.trim(),
    category: d.category,
    ageRange: d.ageRange.trim(),
    tags: d.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => t[0].toUpperCase() + t.slice(1)),
    theme,
    pageSize,
  }
}

const fieldClass =
  'w-full rounded-2xl bg-paper px-4 text-[1.0625rem] text-ink-deep ring-2 ring-mist outline-none ring-inset transition-shadow placeholder:text-graphite/60 focus:ring-sky disabled:opacity-60'

/** Title, subtitle, description, category, ages and topics: the form used when uploading and editing. */
export function BookDetailsFields({
  value,
  onChange,
  disabled,
  categories,
}: {
  value: Details
  onChange: (d: Details) => void
  disabled?: boolean
  categories: string[]
}) {
  const id = useId()
  const set = (patch: Partial<Details>) => onChange({ ...value, ...patch })
  return (
    <div className="mt-4 grid gap-5 sm:grid-cols-2">
      <TextField label="Title" value={value.title} disabled={disabled} maxLength={80} onChange={(e) => set({ title: e.target.value })} />
      <TextField label="Subtitle" value={value.subtitle} disabled={disabled} maxLength={120} placeholder="A coloring book for…" onChange={(e) => set({ subtitle: e.target.value })} />
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label htmlFor={`${id}-desc`} className="font-semibold text-ink-deep">
          Description
        </label>
        <textarea
          id={`${id}-desc`}
          rows={3}
          maxLength={1000}
          disabled={disabled}
          value={value.description}
          placeholder="What’s inside, in a sentence or two. Shown on the book’s page."
          onChange={(e) => set({ description: e.target.value })}
          className={cn(fieldClass, 'py-3 leading-relaxed')}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-cat`} className="font-semibold text-ink-deep">
          Category
        </label>
        <select id={`${id}-cat`} value={value.category} disabled={disabled} onChange={(e) => set({ category: e.target.value })} className={cn(fieldClass, 'min-h-13')}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <TextField label="Best for ages" value={value.ageRange} disabled={disabled} maxLength={20} placeholder="4–8" onChange={(e) => set({ ageRange: e.target.value })} />
      <TextField
        label="Topics"
        className="sm:col-span-2"
        hint="Separate with commas, e.g. Snow, Animals"
        value={value.tags}
        disabled={disabled}
        onChange={(e) => set({ tags: e.target.value })}
      />
    </div>
  )
}
