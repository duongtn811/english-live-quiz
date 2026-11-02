import { WebSocket } from 'ws';

const URL = process.env.RESET_URL || 'ws://127.0.0.1:3210';
const minutes = Number(process.env.RESET_MINUTES ?? 20);
const INTERVAL_MS = (Number.isFinite(minutes) && minutes > 0 ? minutes : 20) * 60 * 1000;

let socket = null;
let state = null;
let pending = false;
let retryDelay = 1000;

function log(message) {
  const time = new Date().toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  console.log(`[${time}] ${message}`);
}

function sendReset() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: 'action', action: 'resetScores' }));
  pending = false;
  log('Đã đặt lại bảng điểm.');
}

function tick() {
  pending = true;
  if (state && state.phase !== 'live') {
    sendReset();
  } else {
    log('Đã đến giờ làm mới bảng điểm — chờ câu hiện tại kết thúc.');
  }
}

function connect() {
  socket = new WebSocket(URL);

  socket.addEventListener('open', () => {
    retryDelay = 1000;
    log(`Đang theo dõi ${URL} — làm mới mỗi ${Math.round(INTERVAL_MS / 60000)} phút.`);
  });

  socket.addEventListener('message', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data.toString());
    } catch {
      return;
    }
    if (payload.type !== 'state') return;
    state = payload.state;
    if (pending && state.phase !== 'live') sendReset();
  });

  socket.addEventListener('close', () => {
    log('Mất kết nối, đang thử lại...');
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(10000, retryDelay * 1.6);
  });

  socket.addEventListener('error', () => socket.close());
}

setInterval(tick, INTERVAL_MS);
connect();
