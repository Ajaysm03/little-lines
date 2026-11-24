import { PageFlip, type Orientation } from 'page-flip'
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { PageKind } from '../content/books'
import { playPageFlip } from '../lib/sounds'
import './flipbook.css'

export interface FlipPage {
  id: string
  kind: PageKind
  title: string
  /** Cover art, or the black line art (transparent PNG). */
  image: string
  /** The child's coloring for this page, drawn under the line art (Phase 3). */
  colorLayer?: string | null
}

export interface FlipBookHandle {
  next(): void
  prev(): void
  flipTo(index: number): void
}

export interface FlipView {
  index: number
  orientation: Orientation
}

interface FlipBookProps {
  pages: FlipPage[]
  startPage: number
  /** Page aspect ratio, width / height. */
  ratio: number
  onFlip?: (view: FlipView) => void
  onOpenPage?: (page: FlipPage) => void
  className?: string
}

/**
 * A realistic flip book: page curl, shadows, hard covers, drag/swipe from any
 * edge, and corner peeks. Built on page-flip, which moves the page elements it
 * is given into its own DOM, so the pages here are plain elements created
 * outside React and the whole book is rebuilt when the available space changes.
 */
export const FlipBook = forwardRef<FlipBookHandle, FlipBookProps>(function FlipBook(
  { pages, startPage, ratio, onFlip, onOpenPage, className },
  ref,
) {
  const stageRef = useRef<HTMLDivElement>(null)
  const bookRef = useRef<PageFlip | null>(null)
  const currentRef = useRef(startPage)
  const onFlipRef = useRef(onFlip)
  const onOpenRef = useRef(onOpenPage)
  onFlipRef.current = onFlip
  onOpenRef.current = onOpenPage
  const [space, setSpace] = useState<{ w: number; h: number } | null>(null)

  // Track the stage size; rebuild only when it really changes.
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const w = Math.floor(stage.clientWidth)
        const h = Math.floor(stage.clientHeight)
        setSpace((prev) => (prev && Math.abs(prev.w - w) < 4 && Math.abs(prev.h - h) < 4 ? prev : { w, h }))
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(stage)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !space || space.w < 50 || space.h < 50) return

    // Two-page spread when there is room for it, otherwise one page at a time.
    const spreadW = (space.h * ratio) * 2
    const landscape = space.w >= spreadW * 0.82
    let pageW = landscape ? Math.min(space.w / 2, space.h * ratio) : Math.min(space.w, space.h * ratio)
    pageW = Math.floor(pageW)
    const pageH = Math.floor(pageW / ratio)

    const host = document.createElement('div')
    host.className = 'flipbook-host'
    stage.appendChild(host)

    const elements = pages.map((p) => buildPage(p, () => onOpenRef.current?.(p)))
    const book = new PageFlip(host, {
      width: pageW,
      height: pageH,
      size: 'fixed',
      autoSize: false,
      usePortrait: true,
      showCover: true,
      startPage: Math.min(currentRef.current, pages.length - 1),
      drawShadow: true,
      maxShadowOpacity: 0.45,
      flippingTime: 850,
      mobileScrollSupport: false,
      showPageCorners: true,
      disableFlipByClick: true,
      clickEventForward: true,
      swipeDistance: 24,
    })
    book.loadFromHTML(elements)
    book.on('flip', (e) => {
      currentRef.current = e.data
      onFlipRef.current?.({ index: e.data, orientation: book.getOrientation() })
    })
    book.on('changeState', (e) => {
      if (e.data === 'flipping') playPageFlip()
    })
    book.on('init', (e) => {
      onFlipRef.current?.({ index: e.data.page, orientation: e.data.mode })
    })
    bookRef.current = book

    return () => {
      bookRef.current = null
      book.destroy() // also removes `host`
      // page-flip's animation loop keeps running after destroy(); give it nothing to draw.
      const render = (book as unknown as { getRender(): { render: (t: number) => void } }).getRender()
      render.render = () => {}
    }
  }, [space, pages, ratio])

  useImperativeHandle(
    ref,
    () => ({
      next: () => bookRef.current?.flipNext('bottom'),
      prev: () => bookRef.current?.flipPrev('bottom'),
      flipTo: (index) => {
        const book = bookRef.current
        if (!book || index === book.getCurrentPageIndex()) return
        // Neighbouring spreads get the full page-turn animation; far pages jump.
        const spread = book.getOrientation() === 'landscape' ? 2 : 1
        if (Math.abs(index - book.getCurrentPageIndex()) <= spread) book.flip(index, 'bottom')
        else {
          book.turnToPage(index)
          currentRef.current = index
          onFlipRef.current?.({ index, orientation: book.getOrientation() })
        }
      },
    }),
    [],
  )

  return <div ref={stageRef} className={`flipbook-stage ${className ?? ''}`} />
})

function buildPage(page: FlipPage, open: () => void): HTMLElement {
  const el = document.createElement('div')
  el.className = `flip-page flip-page--${page.kind}`
  el.setAttribute('aria-label', page.title)

  if (page.kind !== 'line-art') {
    el.dataset.density = 'hard'
    el.appendChild(img(page.image, 'flip-cover-art'))
    return el
  }

  const paper = document.createElement('div')
  paper.className = 'flip-paper'
  if (page.colorLayer) paper.appendChild(img(page.colorLayer, 'flip-color-layer'))
  paper.appendChild(img(page.image, 'flip-line-art'))
  el.appendChild(paper)

  // A tap (press and release without moving) opens the page for coloring;
  // anything that travels is a page drag and belongs to page-flip.
  let down: { x: number; y: number; t: number; id: number } | null = null
  el.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId }
  })
  el.addEventListener('pointerup', (e) => {
    if (!down || down.id !== e.pointerId) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    const quick = performance.now() - down.t < 600
    down = null
    if (moved < 10 && quick) open()
  })
  el.addEventListener('pointercancel', () => {
    down = null
  })
  return el
}

function img(src: string, className: string): HTMLImageElement {
  const i = document.createElement('img')
  i.src = src
  i.alt = ''
  i.className = className
  i.draggable = false
  i.decoding = 'async'
  return i
}
