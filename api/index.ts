import type { IncomingMessage, ServerResponse } from 'node:http'
import { handle } from '../server/app.js'

/**
 * The whole API as one Vercel function. vercel.json rewrites every /api/... path
 * here (as /api?__path=...), and server/app.ts routes it.
 */
export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handle(req, res)
}
