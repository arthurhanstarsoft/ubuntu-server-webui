import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { TermClientMsg, TermServerMsg } from '@usw/shared';
import { spawnShell } from '../services/pty-manager';

const HEARTBEAT_MS = 30_000;

function send(ws: WebSocket, msg: TermServerMsg): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

export async function terminalRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws/term', { websocket: true }, async (socket, req) => {
    let pty;
    try {
      pty = await spawnShell(80, 24);
    } catch (err) {
      send(socket, { t: 'output', data: `\r\n${(err as Error).message}\r\n` });
      send(socket, { t: 'exit', code: -1 });
      socket.close();
      return;
    }

    req.log.info({ pid: pty.pid }, 'terminal session opened');

    pty.onData((data) => send(socket, { t: 'output', data }));
    pty.onExit(({ exitCode }) => {
      send(socket, { t: 'exit', code: exitCode });
      socket.close();
    });

    socket.on('message', (raw) => {
      let msg: TermClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.t === 'input' && typeof msg.data === 'string') {
        pty.write(msg.data);
      } else if (msg.t === 'resize' && Number.isInteger(msg.cols) && Number.isInteger(msg.rows)) {
        try {
          pty.resize(Math.max(2, Math.min(msg.cols, 500)), Math.max(2, Math.min(msg.rows, 300)));
        } catch {
          // resize can race with pty exit
        }
      }
    });

    // Reap ptys whose clients vanished without a clean close (sleep, wifi drop)
    let alive = true;
    socket.on('pong', () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) return socket.terminate();
      alive = false;
      socket.ping();
    }, HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      try {
        pty.kill();
      } catch {
        // already exited
      }
      req.log.info({ pid: pty.pid }, 'terminal session closed');
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });
}
