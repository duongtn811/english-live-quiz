const $ = (id) => document.getElementById(id);

const els = {
  sourcePill: $('sourcePill'),
  sourceText: $('sourceText'),
  phasePill: $('phasePill'),
  phaseText: $('phaseText'),
  sourceTabs: $('sourceTabs'),
  tiktokFields: $('tiktokFields'),
  channelInput: $('channelInput'),
  connectBtn: $('connectBtn'),
  disconnectBtn: $('disconnectBtn'),
  sourceNote: $('sourceNote'),
  roundHint: $('roundHint'),
  cqPhase: $('cqPhase'),
  cqPrompt: $('cqPrompt'),
  cqAnswer: $('cqAnswer'),
  startBtn: $('startBtn'),
  stopBtn: $('stopBtn'),
  nextBtn: $('nextBtn'),
  endBtn: $('endBtn'),
  revealBtn: $('revealBtn'),
  resetBtn: $('resetBtn'),
  durationSelect: $('durationSelect'),
  goalInput: $('goalInput'),
  autoCheck: $('autoCheck'),
  hostInput: $('hostInput'),
  urlOpaque: $('urlOpaque'),
  urlTransparent: $('urlTransparent'),
  statPlayers: $('statPlayers'),
  statRounds: $('statRounds'),
  statWords: $('statWords'),
  statPhase: $('statPhase'),
  wordCount: $('wordCount'),
  wordForm: $('wordForm'),
  wordPrompt: $('wordPrompt'),
  wordAnswer: $('wordAnswer'),
  wordType: $('wordType'),
  wordList: $('wordList'),
  log: $('log'),
  clearLog: $('clearLog'),
  studioToasts: $('studioToasts'),
};

const PHASES = { idle: 'Chờ bắt đầu', live: 'Đang chơi', reveal: 'Đang xem đáp án' };
const overlayBase = `${location.origin}/overlay/`;

let state = null;
let socket = null;
let retryDelay = 800;
let selectedSource = 'demo';
let wordsSignature = '';
let loadedWordCount = -1;
let fetchingWords = false;
let wasOpen = false;

els.urlOpaque.textContent = overlayBase;
els.urlTransparent.textContent = `${overlayBase}?transparent=1`;

function studioToast(message, isError = false) {
  const node = document.createElement('div');
  node.className = `toast${isError ? ' error' : ''}`;
  node.textContent = message;
  els.studioToasts.appendChild(node);
  setTimeout(() => node.remove(), 2400);
}

function addLog(entry) {
  const stick =
    els.log.scrollTop + els.log.clientHeight >= els.log.scrollHeight - 40;
  const row = document.createElement('div');
  row.className = 'log-row';

  const time = document.createElement('span');
  time.className = 'log-time';
  time.textContent = new Date(entry.at || Date.now()).toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const tag = document.createElement('span');
  tag.className = `log-tag ${entry.level || 'info'}`;
  tag.textContent = entry.level === 'success' ? 'ok' : entry.level || 'info';

  const message = document.createElement('span');
  message.className = 'log-msg';
  message.textContent = entry.message || '';

  row.append(time, tag, message);
  els.log.appendChild(row);
  while (els.log.children.length > 150) els.log.firstElementChild.remove();
  if (stick) els.log.scrollTop = els.log.scrollHeight;
}

function setIfIdle(input, value) {
  if (document.activeElement !== input) input.value = value;
}

function syncSourceUi() {
  for (const button of els.sourceTabs.children) {
    button.classList.toggle('active', button.dataset.source === selectedSource);
  }
  els.tiktokFields.classList.toggle('hidden', selectedSource !== 'tiktok');
  els.connectBtn.textContent =
    selectedSource === 'demo' ? 'Kết nối demo' : 'Kết nối TikTok';
  if (selectedSource === 'demo') {
    els.sourceNote.textContent =
      'Người xem ảo sẽ tự bình luận và tặng quà để bạn thử overlay ngay.';
    els.sourceNote.classList.remove('warn');
  } else {
    els.sourceNote.textContent =
      'Cần tài khoản đang phát LIVE. Kết nối dùng thư viện cộng đồng, không chính thức — TikTok có thể thay đổi API bất kỳ lúc nào.';
    els.sourceNote.classList.add('warn');
  }
}

function renderSource(next) {
  els.sourcePill.className = 'pill';
  if (next.source === 'mock') {
    els.sourceText.textContent = 'Demo đang chạy';
    els.sourcePill.classList.add('on');
    selectedSource = 'demo';
    syncSourceUi();
  } else if (next.source === 'tiktok' && next.connected) {
    els.sourceText.textContent = `@${next.channel}`;
    els.sourcePill.classList.add('on');
    selectedSource = 'tiktok';
    syncSourceUi();
  } else {
    els.sourceText.textContent = 'Chưa kết nối';
  }
  els.disconnectBtn.disabled = next.source === 'none';
}

function renderPhase(next) {
  els.phasePill.className = 'pill';
  if (next.phase === 'live') {
    els.phasePill.classList.add('live');
    els.phaseText.textContent = 'Đang chơi';
  } else if (next.phase === 'reveal') {
    els.phasePill.classList.add('reveal');
    els.phaseText.textContent = 'Xem đáp án';
  } else {
    els.phaseText.textContent = 'Chờ bắt đầu';
  }
  els.statPhase.textContent = PHASES[next.phase] || 'Chờ';
  els.roundHint.textContent = `câu ${next.roundNo}`;
  els.cqPhase.textContent = PHASES[next.phase] || 'Chờ';
  els.cqPrompt.textContent = next.round?.prompt || '—';
  els.cqAnswer.textContent = next.round?.answer || '—';
}

function renderWords(words) {
  const signature = words
    .map((word) => `${word.id}:${word.prompt}:${word.answer}:${word.type}`)
    .join('|');
  els.wordCount.textContent = `${words.length} từ`;
  if (signature === wordsSignature) return;
  wordsSignature = signature;
  els.wordList.textContent = '';

  for (const word of words) {
    const row = document.createElement('div');
    row.className = 'word-row';

    const main = document.createElement('div');
    main.className = 'word-main';
    const prompt = document.createElement('b');
    prompt.textContent = word.prompt;
    const answer = document.createElement('span');
    answer.textContent = `→ ${word.answer}`;
    main.append(prompt, answer);

    const type = document.createElement('span');
    type.className = 'type-chip';
    type.textContent = word.type;

    const remove = document.createElement('button');
    remove.className = 'icon-btn';
    remove.type = 'button';
    remove.title = 'Xoá từ này';
    remove.textContent = '×';
    remove.addEventListener('click', () => send('removeWord', { id: word.id }));

    row.append(main, type, remove);
    els.wordList.appendChild(row);
  }
}

async function loadWords() {
  if (!state || fetchingWords) return;
  const target = state.wordCount;
  if (target === loadedWordCount) return;
  fetchingWords = true;
  try {
    const response = await fetch('/api/words');
    const data = await response.json();
    loadedWordCount = target;
    renderWords(data.words || []);
  } catch {
    // Next state update retries the fetch.
  } finally {
    fetchingWords = false;
  }
  if (state && state.wordCount !== loadedWordCount) loadWords();
}

function render(next) {
  if (!next) return;
  state = next;
  renderSource(next);
  renderPhase(next);
  loadWords();

  els.statPlayers.textContent = String(next.players || 0);
  els.statRounds.textContent = String(next.roundNo || 0);
  els.statWords.textContent = String(next.wordCount || 0);

  setIfIdle(els.hostInput, next.host || 'English LIVE');
  setIfIdle(els.goalInput, String(next.goal));
  setIfIdle(els.durationSelect, String(Math.round((next.durationMs || 30000) / 1000)));
  if (document.activeElement !== els.autoCheck) els.autoCheck.checked = Boolean(next.auto);
}

function send(action, payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    studioToast('Chưa kết nối tới server.', true);
    return;
  }
  socket.send(JSON.stringify({ type: 'action', action, payload }));
}

function connectSocket() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${location.host}`);

  socket.addEventListener('open', () => {
    retryDelay = 800;
    if (!wasOpen) addLog({ level: 'success', message: 'Studio đã kết nối tới server.' });
    wasOpen = true;
  });

  socket.addEventListener('message', (event) => {
    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch {
      return;
    }
    if (payload.type === 'state') render(payload.state);
    else if (payload.type === 'log') addLog(payload.log);
  });

  socket.addEventListener('close', () => {
    if (wasOpen) {
      addLog({ level: 'error', message: 'Mất kết nối studio, đang thử lại...' });
      wasOpen = false;
    }
    setTimeout(connectSocket, retryDelay);
    retryDelay = Math.min(5000, retryDelay * 1.6);
  });

  socket.addEventListener('error', () => socket.close());
}

for (const button of els.sourceTabs.children) {
  button.addEventListener('click', () => {
    selectedSource = button.dataset.source;
    syncSourceUi();
  });
}

els.connectBtn.addEventListener('click', () => {
  if (selectedSource === 'demo') {
    send('connect-demo');
  } else {
    const channel = els.channelInput.value.trim();
    if (!channel) {
      studioToast('Nhập tên TikTok trước khi kết nối.', true);
      els.channelInput.focus();
      return;
    }
    addLog({ level: 'info', message: `Đang kết nối tới ${channel}...` });
    send('connect-tiktok', { channel });
  }
});

els.channelInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') els.connectBtn.click();
});

els.disconnectBtn.addEventListener('click', () => send('disconnect'));
els.startBtn.addEventListener('click', () => send('start'));
els.stopBtn.addEventListener('click', () => send('stop'));
els.nextBtn.addEventListener('click', () => send('next'));
els.endBtn.addEventListener('click', () => send('end'));
els.revealBtn.addEventListener('click', () => send('reveal'));
els.resetBtn.addEventListener('click', () => {
  if (window.confirm('Xoá toàn bộ điểm và bảng xếp hạng của phiên này?')) {
    send('resetScores');
  }
});

els.durationSelect.addEventListener('change', () =>
  send('setDuration', { value: Number(els.durationSelect.value) }),
);
els.goalInput.addEventListener('change', () =>
  send('setGoal', { value: Number(els.goalInput.value) }),
);
els.hostInput.addEventListener('change', () =>
  send('setHost', { value: els.hostInput.value }),
);
els.autoCheck.addEventListener('change', () =>
  send('setAuto', { value: els.autoCheck.checked }),
);

els.wordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const prompt = els.wordPrompt.value.trim();
  const answer = els.wordAnswer.value.trim();
  if (!prompt || !answer) return;
  send('addWord', { prompt, answer, type: els.wordType.value });
  els.wordPrompt.value = '';
  els.wordAnswer.value = '';
  els.wordPrompt.focus();
});

els.clearLog.addEventListener('click', () => {
  els.log.textContent = '';
});

async function copyUrl(which) {
  const url = overlayBase + (which === 'transparent' ? '?transparent=1' : '');
  try {
    await navigator.clipboard.writeText(url);
    studioToast('Đã copy URL overlay.');
  } catch {
    const helper = document.createElement('textarea');
    helper.value = url;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
    studioToast('Đã copy URL overlay.');
  }
}

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', () => copyUrl(button.dataset.copy));
}

syncSourceUi();
addLog({ level: 'info', message: 'Studio sẵn sàng.' });
connectSocket();

fetch('/api/state')
  .then((response) => response.json())
  .then(render)
  .catch(() => {});
