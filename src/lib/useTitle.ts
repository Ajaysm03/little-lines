import { useEffect } from 'react'

/** Sets the browser tab / screen-reader page title for the current screen. */
export function useTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return
    document.title = `${title} – Little Lines`
    return () => {
      document.title = 'Little Lines'
    }
  }, [title])
}
