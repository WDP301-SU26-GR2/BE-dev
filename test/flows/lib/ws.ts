import { io as ioClient, type Socket } from 'socket.io-client'
import { API } from './env.js'

const NS = '/board'

export type BoardSocket = Socket

export const connectBoard = (token?: string): BoardSocket => {
  const sock: BoardSocket = ioClient(`${API}${NS}`, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 8000,
    forceNew: true,
    ...(token ? { auth: { token } } : {})
  })
  return sock
}

// Trả Promise<{ connected, error }>:
//   connected=true  → on 'connect' trong timeout
//   connected=false → on 'disconnect' hoặc 'connect_error' (auth fail)
export const waitConnected = (sock: BoardSocket, timeoutMs = 5000): Promise<{ connected: boolean; error?: string }> => {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        sock.disconnect()
      } catch {
        // ignore
      }
      resolve({ connected: false, error: 'timeout' })
    }, timeoutMs)

    sock.on('connect', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ connected: true })
    })
    sock.on('connect_error', (err: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        sock.disconnect()
      } catch {
        // ignore
      }
      resolve({ connected: false, error: err.message })
    })
    sock.on('disconnect', (reason: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ connected: false, error: `disconnect:${reason}` })
    })
  })
}

// joinSession với ack: { status: 'SUCCESS' | 'DENIED', message? }
export const joinSession = (
  sock: BoardSocket,
  sessionId: string,
  timeoutMs = 3000
): Promise<{ status: 'SUCCESS' | 'DENIED'; message?: string }> => {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ status: 'DENIED', message: 'timeout' })
    }, timeoutMs)
    sock.emit('joinSession', { sessionId }, (ack: { status?: string; message?: string } | undefined) => {
      clearTimeout(timer)
      if (ack && (ack.status === 'SUCCESS' || ack.status === 'DENIED')) {
        resolve({ status: ack.status, message: ack.message })
      } else {
        resolve({ status: 'DENIED', message: 'no-ack' })
      }
    })
  })
}

// Đợi event từ socket, resolve với payload. Reject nếu timeout.
export const waitForEvent = <T = unknown>(sock: BoardSocket, event: string, timeoutMs = 5000): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sock.off(event, listener)
      reject(new Error(`waitForEvent(${event}) timeout ${timeoutMs}ms`))
    }, timeoutMs)
    const listener = (payload: T) => {
      clearTimeout(timer)
      sock.off(event, listener)
      resolve(payload)
    }
    sock.on(event, listener)
  })
}
