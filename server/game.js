import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { SEED_WORDS, WORD_TYPES } from './words.js';

const MAX_LETTERS = 18;
const REVEAL_MS = 6000;
const CHAT_COOLDOWN_MS = 600;
const RECENT_LIMIT = 40;

export const normalize = (value = '') =>
  String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class Game extends EventEmitter {
  constructor() {
    super();
    this.host = 'English LIVE';
    this.durationMs = 30000;
    this.goal = 100;
    this.auto = true;
    this.source = 'none';
    this.channel = '';
    this.connected = false;
    this.phase = 'idle';
    this.round = null;
    this.roundNo = 0;
    this.words = SEED_WORDS.map((word, index) => ({ ...word, id: `seed-${index + 1}` }));
    this.bag = [];
    this.recentAnswerIds = [];
    this.leaderboard = new Map();
    this.answers = [];
    this.players = new Set();
    this.chatCooldown = new Map();
    this.endTimer = null;
    this.nextTimer = null;
  }

  setConnection({ source, channel = '', connected }) {
    this.source = source;
    this.channel = channel;
    this.connected = connected;
    this.emit('change');
  }

  setHost(name) {
    const clean = String(name ?? '').trim().slice(0, 40);
    if (!clean) return;
    this.host = clean;
    this.emit('change');
  }

  setDuration(seconds) {
    const value = Math.round(Number(seconds));
    if (!Number.isFinite(value)) return;
    this.durationMs = Math.min(120, Math.max(10, value)) * 1000;
    if (this.phase === 'live' && this.round) {
      this.round.endsAt = Date.now() + this.durationMs;
      this.scheduleEnd();
    }
    this.emit('change');
  }

  setGoal(value) {
    const goal = Math.round(Number(value));
    if (!Number.isFinite(goal)) return;
    this.goal = Math.min(100000, Math.max(1, goal));
    this.emit('change');
  }

  addWord({ prompt, answer, type }) {
    const cleanPrompt = String(prompt ?? '').trim().slice(0, 60);
    const cleanAnswer = String(answer ?? '').trim().slice(0, MAX_LETTERS);
    if (!cleanPrompt || !cleanAnswer) {
      this.emit('log', { level: 'error', message: 'Từ mới cần đủ nghĩa tiếng Việt và đáp án tiếng Anh.' });
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z '-]*$/.test(cleanAnswer)) {
      this.emit('log', { level: 'error', message: 'Đáp án chỉ gồm chữ cái tiếng Anh (có thể có dấu cách).' });
      return;
    }
    if (this.words.some((word) => normalize(word.answer) === normalize(cleanAnswer))) {
      this.emit('log', { level: 'error', message: `Đáp án "${cleanAnswer}" đã có trong bộ từ.` });
      return;
    }
    this.words.push({
      id: randomUUID(),
      prompt: cleanPrompt,
      answer: cleanAnswer,
      type: WORD_TYPES.includes(type) ? type : 'Từ vựng',
    });
    this.bag = [];
    this.emit('change');
    this.emit('log', { level: 'success', message: `Đã thêm từ "${cleanPrompt}" → "${cleanAnswer}".` });
  }

  removeWord(id) {
    const before = this.words.length;
    this.words = this.words.filter((word) => word.id !== id);
    if (this.words.length === before) return;
    this.bag = [];
    this.emit('change');
  }

  pickWord() {
    if (!this.words.length) return null;
    if (!this.bag.length) {
      const fresh = this.words.filter((word) => !this.recentAnswerIds.includes(word.id));
      this.bag = shuffle(fresh.length ? fresh : this.words);
    }
    const word = this.bag.pop();
    this.recentAnswerIds = [word.id, ...this.recentAnswerIds].slice(0, RECENT_LIMIT);
    return word;
  }

  startRound() {
    const word = this.pickWord();
    if (!word) {
      this.emit('log', { level: 'error', message: 'Chưa có từ vựng nào để chơi.' });
      return;
    }
    this.clearTimers();
    this.roundNo += 1;
    this.answers = [];
    const startedAt = Date.now();
    this.round = {
      id: randomUUID(),
      wordId: word.id,
      prompt: word.prompt,
      answer: word.answer,
      type: word.type,
      letters: Array.from(word.answer).map((ch) => ({
        ch,
        revealed: ch === ' ' || ch === '-' || ch === "'",
      })),
      startedAt,
      endsAt: startedAt + this.durationMs,
      solved: new Set(),
      revealedPoints: new Set(),
    };
    this.phase = 'live';
    this.scheduleEnd();
    this.emit('event', { kind: 'round', roundNo: this.roundNo });
    this.emit('log', { level: 'info', message: `Câu ${this.roundNo}: "${word.prompt}"` });
    this.emit('change');
  }

  scheduleEnd() {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => this.endRound(), this.durationMs);
  }

  startGame() {
    if (!this.words.length) {
      this.emit('log', { level: 'error', message: 'Thêm từ vựng trước khi bắt đầu.' });
      return;
    }
    this.auto = true;
    if (this.phase !== 'live') {
      this.startRound();
    } else {
      this.emit('change');
    }
  }

  stopGame() {
    this.auto = false;
    this.clearTimers();
    this.phase = 'idle';
    this.round = null;
    this.emit('event', { kind: 'idle' });
    this.emit('change');
  }

  setAuto(value) {
    this.auto = Boolean(value);
    if (!this.auto && this.nextTimer) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    }
    if (this.auto && this.phase === 'reveal' && !this.nextTimer) {
      this.nextTimer = setTimeout(() => this.startRound(), 1500);
    }
    this.emit('change');
  }

  nextRound() {
    this.clearTimers();
    this.startRound();
  }

  endRound() {
    if (!this.round || this.phase !== 'live') return;
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    this.phase = 'reveal';
    this.round.letters = this.round.letters.map((letter) => ({ ...letter, revealed: true }));
    this.emit('event', {
      kind: 'reveal',
      answer: this.round.answer,
      prompt: this.round.prompt,
    });
    this.emit('change');
    if (this.auto) {
      this.nextTimer = setTimeout(() => this.startRound(), REVEAL_MS);
    }
  }

  revealLetter() {
    if (!this.round || this.phase !== 'live') return;
    const index = this.round.letters.findIndex(
      (letter) => !letter.revealed && ![' ', '-', "'"].includes(letter.ch),
    );
    if (index === -1) {
      this.emit('event', { kind: 'hint', message: 'Đã mở hết các chữ rồi!' });
      return;
    }
    this.round.letters[index].revealed = true;
    this.emit('event', {
      kind: 'hint',
      message: `Mở chữ ${index + 1}: ${this.round.letters[index].ch.toUpperCase()}`,
      index,
    });
    this.emit('change');
  }

  resetScores() {
    this.leaderboard.clear();
    this.answers = [];
    this.players.clear();
    this.chatCooldown.clear();
    this.roundNo = 0;
    if (this.round) this.round.solved.clear();
    this.emit('event', { kind: 'reset' });
    this.emit('log', { level: 'info', message: 'Đã đặt lại bảng điểm.' });
    this.emit('change');
  }

  registerPlayer(user) {
    const userId = String(user?.userId || user?.name || 'unknown').slice(0, 64);
    const name = String(user?.name || 'Người xem').trim().slice(0, 40) || 'Người xem';
    this.players.add(userId);
    return { userId, name };
  }

  scoreEntry(userId, name) {
    let entry = this.leaderboard.get(userId);
    if (!entry) {
      entry = { userId, name, score: 0, at: 0 };
      this.leaderboard.set(userId, entry);
    } else if (name) {
      entry.name = name;
    }
    return entry;
  }

  handleChat(user, comment) {
    const { userId, name } = this.registerPlayer(user);
    const text = String(comment ?? '').slice(0, 200);
    if (!text) return false;

    this.emit('log', {
      level: 'chat',
      message: `${name}: ${text}`,
    });

    if (this.phase !== 'live' || !this.round) {
      this.emit('change');
      return false;
    }
    if (this.round.solved.has(userId)) return false;
    const normalized = normalize(text);
    if (!normalized) return false;

    const existing = this.answers.find((answer) => answer.userId === userId);

    if (normalized !== normalize(this.round.answer)) {
      const lastAt = this.chatCooldown.get(userId) || 0;
      if (Date.now() - lastAt < CHAT_COOLDOWN_MS) return false;
      this.chatCooldown.set(userId, Date.now());
      const attempt = {
        id: existing?.id || randomUUID(),
        userId,
        name,
        answer: text.trim().slice(0, 40),
        correct: false,
        points: 0,
        at: Date.now(),
      };
      this.answers = [attempt, ...this.answers.filter((item) => item.userId !== userId)].slice(0, 10);
      this.emit('event', { kind: 'wrong', roundId: this.round.id, ...attempt });
      this.emit('change');
      return false;
    }

    this.round.solved.add(userId);
    const elapsed = Math.min(this.durationMs, Date.now() - this.round.startedAt);
    const speedBonus = Math.round(10 * Math.max(0, 1 - elapsed / this.durationMs));
    const points = 10 + speedBonus;

    const entry = this.scoreEntry(userId, name);
    entry.score += points;
    entry.at = Date.now();

    const answer = {
      id: existing?.id || randomUUID(),
      userId,
      name,
      answer: this.round.answer,
      correct: true,
      points,
      at: Date.now(),
    };
    this.answers = [answer, ...this.answers.filter((item) => item.userId !== userId)].slice(0, 10);
    this.emit('event', { kind: 'correct', roundId: this.round.id, ...answer });
    this.emit('log', { level: 'success', message: `${name} trả lời đúng "${answer.answer}" +${points}` });
    this.emit('change');
    return true;
  }

  handleGift(user, giftName = 'Quà') {
    const { userId, name } = this.registerPlayer(user);
    if (this.leaderboard.has(userId)) this.leaderboard.get(userId).name = name;

    if (this.round && this.phase === 'live') {
      const lastAt = this.chatCooldown.get(`gift:${userId}`) || 0;
      if (Date.now() - lastAt < 2500) {
        this.emit('change');
        return;
      }
      this.chatCooldown.set(`gift:${userId}`, Date.now());
      const index = this.round.letters.findIndex(
        (letter) => !letter.revealed && ![' ', '-', "'"].includes(letter.ch),
      );
      if (index !== -1) {
        this.round.letters[index].revealed = true;
      }
      this.emit('event', {
        kind: 'gift',
        name,
        gift: String(giftName).slice(0, 40),
        letterIndex: index,
        letter: index === -1 ? null : this.round.letters[index].ch,
      });
      this.emit('log', {
        level: 'gift',
        message: `${name} tặng ${giftName}${index === -1 ? '' : ` → mở chữ "${this.round.letters[index].ch.toUpperCase()}"`}`,
      });
    } else {
      this.emit('event', { kind: 'gift', name, gift: String(giftName).slice(0, 40), letter: null });
    }
    this.emit('change');
  }

  handleJoin(user) {
    const { name } = this.registerPlayer(user);
    this.emit('event', { kind: 'join', name });
    this.emit('log', { level: 'info', message: `${name} đã vào phòng.` });
    this.emit('change');
  }

  handleFollow(user) {
    const { name } = this.registerPlayer(user);
    this.emit('event', { kind: 'follow', name });
    this.emit('log', { level: 'info', message: `${name} đã theo dõi bạn.` });
    this.emit('change');
  }

  clearTimers() {
    if (this.endTimer) clearTimeout(this.endTimer);
    if (this.nextTimer) clearTimeout(this.nextTimer);
    this.endTimer = null;
    this.nextTimer = null;
  }

  getWords() {
    return this.words.map(({ id, prompt, answer, type }) => ({ id, prompt, answer, type }));
  }

  getState() {
    const leaderboard = [...this.leaderboard.values()]
      .sort((a, b) => b.score - a.score || a.at - b.at)
      .slice(0, 10)
      .map(({ userId, name, score }) => ({ userId, name, score }));

    return {
      host: this.host,
      source: this.source,
      channel: this.channel,
      connected: this.connected,
      auto: this.auto,
      phase: this.phase,
      durationMs: this.durationMs,
      goal: this.goal,
      roundNo: this.roundNo,
      players: this.players.size,
      round: this.round
        ? {
            id: this.round.id,
            prompt: this.round.prompt,
            type: this.round.type,
            letters: this.round.letters.map((letter) => ({
              ch: letter.revealed ? letter.ch : '',
              revealed: letter.revealed,
              space: letter.ch === ' ',
            })),
            answer: this.round.answer,
            startedAt: this.round.startedAt,
            endsAt: this.phase === 'live' ? this.round.endsAt : null,
            durationMs: this.durationMs,
          }
        : null,
      leaderboard,
      answers: this.answers.slice(0, 8),
      wordCount: this.words.length,
      serverNow: Date.now(),
    };
  }
}
