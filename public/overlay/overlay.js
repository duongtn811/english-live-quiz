const $ = (id) => document.getElementById(id);
const els = {
  stage: $('stage'),
  prompt: $('prompt'),
  ask: $('ask'),
  timer: $('timer'),
  timerFill: $('timerFill'),
  timerNum: $('timerNum'),
  letters: $('letters'),
  leaderboard: $('leaderboard'),
  answers: $('answers'),
};

const params = new URLSearchParams(location.search);
if (params.get('transparent') === '1' || params.get('bg') === 'transparent') {
  document.body.classList.add('transparent');
}

function fit() {
  const scale = Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
  els.stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

window.addEventListener('resize', fit);
fit();

let state = null;
let clockOffset = 0;
let lettersKey = '';
let lettersSignature = '';
let leaderboardSignature = '';
let answersSignature = '';
let previousScores = new Map();
let previousAnswerIds = new Set();

function firstLetter(name) {
  const chars = Array.from(String(name || '?').trim());
  return chars.find((char) => /\p{L}|\p{N}/u.test(char)) || chars[0] || '?';
}

function avatarFor(name) {
  const node = document.createElement('div');
  node.className = 'avatar';
  const text = String(name || '?');
  let hash = 7;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  const hue = hash % 360;
  node.style.background = `linear-gradient(145deg, hsl(${hue} 72% 58%), hsl(${(hue + 48) % 360} 72% 38%))`;
  node.textContent = firstLetter(text);
  return node;
}

function promptSize(length) {
  if (length > 20) return 60;
  if (length > 16) return 74;
  if (length > 12) return 90;
  if (length > 9) return 108;
  if (length > 6) return 126;
  return 136;
}

function setPrompt(text) {
  els.prompt.textContent = text;
  els.prompt.style.fontSize = `${promptSize(Array.from(text).length)}px`;
}

function renderLetters(round) {
  if (!round || !round.letters.length) {
    els.letters.textContent = '';
    lettersKey = '';
    lettersSignature = '';
    return;
  }
  const key = `${round.id}:${round.letters.length}`;
  if (key !== lettersKey) {
    lettersKey = key;
    lettersSignature = '';
    els.letters.textContent = '';
    const count = round.letters.length;
    const gap = count > 10 ? 8 : 14;
    const box = Math.max(50, Math.min(124, Math.floor((972 - gap * (count - 1)) / count)));
    els.letters.style.setProperty('--box', `${box}px`);
    els.letters.style.gap = `${gap}px`;
    round.letters.forEach((letter) => {
      const node = document.createElement('div');
      node.className = 'letter' + (letter.space ? ' space' : '');
      els.letters.appendChild(node);
    });
  }
  const signature = round.letters.map((letter) => (letter.revealed ? '1' : '0')).join('');
  if (signature !== lettersSignature) {
    lettersSignature = signature;
    round.letters.forEach((letter, index) => {
      const node = els.letters.children[index];
      if (!node) return;
      node.classList.toggle('revealed', Boolean(letter.revealed) && !letter.space);
      node.textContent = letter.revealed && !letter.space ? letter.ch : '';
    });
  }
}

function renderLeaderboard(list) {
  const top = list.slice(0, 10);
  const signature = top.map((entry) => `${entry.userId}:${entry.score}:${entry.name}`).join('|');
  if (signature === leaderboardSignature) return;
  leaderboardSignature = signature;
  els.leaderboard.textContent = '';

  if (!top.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Chưa có ai ghi điểm — hãy là người đầu tiên!';
    els.leaderboard.appendChild(empty);
    previousScores = new Map();
    return;
  }

  const nextScores = new Map();
  top.forEach((entry, index) => {
    nextScores.set(entry.userId, entry.score);
    const row = document.createElement('div');
    row.className = `row rank-${index + 1}`;
    if (
      previousScores.has(entry.userId) &&
      entry.score > previousScores.get(entry.userId) &&
      previousScores.size > 0
    ) {
      row.classList.add('bump');
    }

    const rank = document.createElement('div');
    rank.className = 'rank';
    rank.textContent = String(index + 1);

    const name = document.createElement('div');
    name.className = 'row-name';
    name.textContent = entry.name;

    const score = document.createElement('div');
    score.className = 'row-score';
    score.textContent = String(entry.score);

    row.append(rank, name, score);
    els.leaderboard.appendChild(row);
  });
  previousScores = nextScores;
}

function renderAnswers(list) {
  const items = list.slice(0, 5);
  const signature = items
    .map((item) => `${item.id}:${item.answer}:${item.correct ? 1 : 0}:${item.points}`)
    .join('|');
  if (signature === answersSignature) return;
  answersSignature = signature;
  els.answers.textContent = '';

  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'Đang chờ câu trả lời...';
    els.answers.appendChild(empty);
    previousAnswerIds = new Set();
    return;
  }

  const nextIds = new Set(items.map((item) => item.id));
  items.forEach((item) => {
    const correct = item.correct !== false;
    const row = document.createElement('div');
    row.className = `answer-row${correct ? '' : ' wrong'}`;
    if (previousAnswerIds.size && !previousAnswerIds.has(item.id)) {
      row.classList.add('new');
    }

    const main = document.createElement('div');
    main.className = 'answer-main';
    const name = document.createElement('div');
    name.className = 'answer-name';
    name.textContent = item.name;
    const word = document.createElement('div');
    word.className = 'answer-word';
    word.textContent = item.answer;
    main.append(name, word);

    const points = document.createElement('div');
    points.className = 'answer-points';
    points.textContent = correct ? `+${item.points}` : '0';

    row.append(avatarFor(item.name), main, points);
    els.answers.appendChild(row);
  });
  previousAnswerIds = nextIds;
}

function applyAttempt(event) {
  if (!state || !event?.userId || !event.answer) return;
  if (event.roundId && event.roundId !== state.round?.id) return;
  const row = {
    id: event.id,
    userId: event.userId,
    name: event.name,
    answer: event.answer,
    correct: Boolean(event.correct),
    points: event.points || 0,
    at: event.at || Date.now(),
  };
  state.answers = [row, ...(state.answers || []).filter((item) => item.userId !== row.userId)].slice(0, 8);
  renderAnswers(state.answers);
}

function applyState(next) {
  if (!next) return;
  state = next;
  clockOffset = next.serverNow - Date.now();

  els.timer.classList.remove('low', 'done');

  if (next.round) {
    setPrompt(next.round.prompt);
    if (next.phase === 'reveal') {
      els.ask.textContent = `Đáp án: ${next.round.answer}`;
      els.ask.classList.add('reveal');
    } else {
      els.ask.textContent = 'tiếng Anh là gì?';
      els.ask.classList.remove('reveal');
    }
    renderLetters(next.round);
  } else {
    setPrompt('Sẵn sàng?');
    els.ask.textContent = 'Studio sẽ bắt đầu câu hỏi';
    els.ask.classList.remove('reveal');
    renderLetters(null);
  }

  renderLeaderboard(next.leaderboard || []);
  renderAnswers(next.answers || []);
}

function flash(node) {
  node.classList.remove('flash');
  void node.offsetWidth;
  node.classList.add('flash');
}

function handleEvent(event) {
  if (!event) return;
  switch (event.kind) {
    case 'correct':
      applyAttempt(event);
      flash(els.answers.closest('.panel'));
      break;
    case 'wrong':
      applyAttempt(event);
      break;
    case 'reset':
      previousScores = new Map();
      previousAnswerIds = new Set();
      leaderboardSignature = '';
      answersSignature = '';
      break;
    default:
      // Joins and follows are already shown by TikTok's native LIVE UI.
      break;
  }
}

function startTimerLoop() {
  const tick = () => {
    if (!state || !state.round) {
      els.timerFill.style.width = '0%';
      els.timerNum.textContent = '0';
      requestAnimationFrame(tick);
      return;
    }
    if (state.phase === 'live' && state.round.endsAt) {
      const remaining = Math.max(0, state.round.endsAt - (Date.now() + clockOffset));
      const ratio = Math.max(0, Math.min(1, remaining / (state.round.durationMs || 1)));
      els.timerFill.style.width = `${ratio * 100}%`;
      els.timerNum.textContent = String(Math.ceil(remaining / 1000));
      els.timer.classList.toggle('low', ratio < 0.25);
      els.timer.classList.remove('done');
    } else if (state.phase === 'reveal') {
      els.timerFill.style.width = '100%';
      els.timerNum.textContent = '✓';
      els.timer.classList.remove('low');
      els.timer.classList.add('done');
    } else {
      els.timerFill.style.width = '0%';
      els.timerNum.textContent = '0';
      els.timer.classList.remove('low', 'done');
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

let socket = null;
let retryDelay = 500;

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  socket = new WebSocket(`${protocol}://${location.host}`);

  socket.addEventListener('open', () => {
    retryDelay = 500;
  });

  socket.addEventListener('message', (message) => {
    let payload;
    try {
      payload = JSON.parse(message.data);
    } catch {
      return;
    }
    if (payload.type === 'state') applyState(payload.state);
    else if (payload.type === 'event') handleEvent(payload.event);
  });

  socket.addEventListener('close', () => {
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(8000, retryDelay * 1.8);
  });

  socket.addEventListener('error', () => {
    socket.close();
  });
}

startTimerLoop();
connect();
