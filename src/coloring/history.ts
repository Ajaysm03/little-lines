/**
 * Undo/redo as pixel patches: each step stores the changed rectangle before and
 * after. Memory is capped so long sessions stay comfortable on a tablet.
 */
export interface Patch {
  x: number
  y: number
  before: ImageData
  after: ImageData
}

export const MAX_STEPS = 60
export const MAX_BYTES = 64 * 1024 * 1024

export class History {
  private done: Patch[] = []
  private undone: Patch[] = []
  private bytes = 0
  private readonly maxSteps: number
  private readonly maxBytes: number

  constructor(maxSteps = MAX_STEPS, maxBytes = MAX_BYTES) {
    this.maxSteps = maxSteps
    this.maxBytes = maxBytes
  }

  get canUndo() {
    return this.done.length > 0
  }
  get canRedo() {
    return this.undone.length > 0
  }
  get size() {
    return { steps: this.done.length, redo: this.undone.length, bytes: this.bytes }
  }

  push(patch: Patch) {
    for (const p of this.undone) this.bytes -= cost(p)
    this.undone = []
    this.done.push(patch)
    this.bytes += cost(patch)
    // Drop the oldest steps, but always keep the newest one.
    while (this.done.length > 1 && (this.done.length > this.maxSteps || this.bytes > this.maxBytes)) {
      this.bytes -= cost(this.done.shift()!)
    }
  }

  /** Returns the patch to restore (apply its `before`). */
  undo(): Patch | null {
    const p = this.done.pop()
    if (!p) return null
    this.undone.push(p)
    return p
  }

  /** Returns the patch to re-apply (apply its `after`). */
  redo(): Patch | null {
    const p = this.undone.pop()
    if (!p) return null
    this.done.push(p)
    return p
  }

  clear() {
    this.done = []
    this.undone = []
    this.bytes = 0
  }
}

function cost(p: Patch) {
  return p.before.data.byteLength + p.after.data.byteLength
}
