/** Minimal typings for page-flip (StPageFlip) 2.x, which ships without declarations. */
declare module 'page-flip' {
  export type FlippingState = 'user_fold' | 'fold_corner' | 'flipping' | 'read'
  export type Orientation = 'portrait' | 'landscape'
  export type FlipCorner = 'top' | 'bottom'

  export interface FlipSetting {
    startPage: number
    size: 'fixed' | 'stretch'
    width: number
    height: number
    minWidth: number
    maxWidth: number
    minHeight: number
    maxHeight: number
    drawShadow: boolean
    flippingTime: number
    usePortrait: boolean
    startZIndex: number
    autoSize: boolean
    maxShadowOpacity: number
    showCover: boolean
    mobileScrollSupport: boolean
    clickEventForward: boolean
    useMouseEvents: boolean
    swipeDistance: number
    showPageCorners: boolean
    disableFlipByClick: boolean
  }

  export interface WidgetEvent<T> {
    data: T
    object: PageFlip
  }

  export class PageFlip {
    constructor(element: HTMLElement, setting: Partial<FlipSetting>)
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void
    loadFromImages(images: string[]): void
    updateFromHtml(items: NodeListOf<HTMLElement> | HTMLElement[]): void
    destroy(): void
    update(): void
    flipNext(corner?: FlipCorner): void
    flipPrev(corner?: FlipCorner): void
    flip(page: number, corner?: FlipCorner): void
    turnToPage(page: number): void
    turnToNextPage(): void
    turnToPrevPage(): void
    getPageCount(): number
    getCurrentPageIndex(): number
    getOrientation(): Orientation
    /** The live settings object; changing flippingTime affects the next flip. */
    getSettings(): { flippingTime: number }
    getRender(): { getRect(): { left: number; top: number; width: number; height: number; pageWidth: number } }
    getFlipController(): { flip(globalPos: { x: number; y: number }): void }
    getState(): FlippingState
    on(event: 'flip', cb: (e: WidgetEvent<number>) => void): PageFlip
    on(event: 'changeState', cb: (e: WidgetEvent<FlippingState>) => void): PageFlip
    on(event: 'changeOrientation', cb: (e: WidgetEvent<Orientation>) => void): PageFlip
    on(event: 'init' | 'update', cb: (e: WidgetEvent<{ page: number; mode: Orientation }>) => void): PageFlip
    off(event: string): void
  }
}
