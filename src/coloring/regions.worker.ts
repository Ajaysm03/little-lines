/// <reference lib="webworker" />
import { computeRegions } from './regions'

interface Request {
  alpha: Uint8Array
  width: number
  height: number
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { alpha, width, height } = e.data
  const map = computeRegions(alpha, width, height)
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(map, [
    map.labels.buffer,
    map.sizes.buffer,
    map.bboxes.buffer,
    map.grid.mask.buffer,
  ])
}
