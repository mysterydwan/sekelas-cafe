// Sekelas Cafe realtime mini-service.
// - socket.io server on port 3030 (browsers connect via gateway: io('/?XTransformPort=3030'))
//   NOTE: socket.io path MUST be '/' for Caddy forwarding — it claims all URLs on that port.
// - Internal HTTP server on port 3031 (localhost-only) exposing POST /emit with a shared
//   secret, letting the Next.js server broadcast events.
import { createServer, type IncomingMessage, type ServerResponse } from 'http'
import { Server } from 'socket.io'

const SOCKET_PORT = 3030
const EMIT_PORT = 3031
const SECRET = process.env.REALTIME_SECRET || 'sekelas-realtime-internal'

// ---------- socket.io (browser-facing) ----------
const socketServer = createServer()
const io = new Server(socketServer, {
  // DO NOT change the path — Caddy uses it to forward gateway traffic
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

io.on('connection', (socket) => {
  console.log(`[realtime] client connected: ${socket.id}`)
  socket.on('disconnect', () => {
    console.log(`[realtime] client disconnected: ${socket.id}`)
  })
})

// ---------- internal emit endpoint (server-to-server) ----------
const emitServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-realtime-secret')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method === 'POST' && req.url === '/emit') {
    if (req.headers['x-realtime-secret'] !== SECRET) {
      res.writeHead(403)
      res.end('forbidden')
      return
    }
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 1_000_000) req.destroy() // 1MB guard
    })
    req.on('end', () => {
      try {
        const { event, payload } = JSON.parse(body)
        if (typeof event !== 'string' || event.length > 100) throw new Error('bad event')
        io.emit(event, payload ?? null)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end('{"ok":true}')
      } catch {
        res.writeHead(400)
        res.end('bad request')
      }
    })
    return
  }
  res.writeHead(404)
  res.end()
})

socketServer.listen(SOCKET_PORT, () => {
  console.log(`[realtime] socket.io listening on :${SOCKET_PORT}`)
})
emitServer.listen(EMIT_PORT, '127.0.0.1', () => {
  console.log(`[realtime] internal emit endpoint on 127.0.0.1:${EMIT_PORT}`)
})
