import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { Game } from './game.js';
import { MockFeed } from './feed/mock.js';
import { TikTokFeed } from './feed/tiktok.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 3210;
const HOST = process.env.HOST || '127.0.0.1';

const app = express();
app.disable('x-powered-by');
app.use(express.static(publicDir));

app.get('/api/state', (_req, res) => {
  res.json(game.getState());
});

app.get('/api/words', (_req, res) => {
  res.json({ words: game.getWords() });
});

app.get('/', (_req, res) => res.redirect('/studio/'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const game = new Game();
const mock = new MockFeed(game);
const tiktok = new TikTokFeed(game);

let stateTimer = null;

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(data);
  }
}

function pushState() {
  if (stateTimer) return;
  stateTimer = setTimeout(() => {
    stateTimer = null;
    broadcast({ type: 'state', state: game.getState() });
  }, 40);
}

game.on('change', pushState);
game.on('event', (event) => broadcast({ type: 'event', event: { ...event, at: Date.now() } }));
game.on('log', (log) => broadcast({ type: 'log', log: { ...log, at: Date.now() } }));

async function handleAction(action, payload = {}) {
  switch (action) {
    case 'connect-demo':
      await tiktok.disconnect();
      mock.start();
      break;
    case 'connect-tiktok':
      mock.stop();
      await tiktok.connect(payload.channel);
      break;
    case 'disconnect':
      mock.stop();
      await tiktok.disconnect();
      game.setConnection({ source: 'none', channel: '', connected: false });
      break;
    case 'start':
      game.startGame();
      break;
    case 'stop':
      mock.stop();
      await tiktok.disconnect();
      game.stopGame();
      break;
    case 'next':
      game.nextRound();
      break;
    case 'end':
      game.endRound();
      break;
    case 'reveal':
      game.revealLetter();
      break;
    case 'resetScores':
      game.resetScores();
      break;
    case 'setAuto':
      game.setAuto(payload.value);
      break;
    case 'setDuration':
      game.setDuration(payload.value);
      break;
    case 'setHost':
      game.setHost(payload.value);
      break;
    case 'setGoal':
      game.setGoal(payload.value);
      break;
    case 'addWord':
      game.addWord(payload);
      break;
    case 'removeWord':
      game.removeWord(payload.id);
      break;
    default:
      throw new Error(`Hành động không hợp lệ: ${action}`);
  }
}

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.send(JSON.stringify({ type: 'state', state: game.getState() }));

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  socket.on('message', async (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (message?.type !== 'action') return;
    try {
      await handleAction(message.action, message.payload);
    } catch (error) {
      socket.send(
        JSON.stringify({
          type: 'log',
          log: { level: 'error', message: error?.message || String(error), at: Date.now() },
        }),
      );
    }
  });
});

const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) {
      client.terminate();
      continue;
    }
    client.isAlive = false;
    client.ping();
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

const shutdown = async () => {
  clearInterval(heartbeat);
  mock.stop();
  await tiktok.disconnect();
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, () => {
  console.log(`English Live Quiz đang chạy:`);
  console.log(`  Studio : http://${HOST}:${PORT}/studio/`);
  console.log(`  Overlay: http://${HOST}:${PORT}/overlay/`);
});
