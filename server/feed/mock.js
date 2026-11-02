import { normalize } from '../game.js';

const BOTS = [
  { id: 'uyen', name: 'uyen' },
  { id: 'mynhu', name: 'Mỹ Như' },
  { id: 'changchang', name: 'Chang Chang' },
  { id: 'empe', name: 'Em pé thích ăn 🍔' },
  { id: 'halan', name: 'Hà Lan 28.6.91' },
  { id: 'ngocdiem', name: 'ngọc diễm mmm' },
  { id: 'anninh', name: 'An ninh trật tự' },
  { id: 'chido', name: 'Chido Nguyen' },
  { id: 'dieuthao', name: 'điêu thao' },
  { id: 'minht', name: 'Minh T' },
  { id: 'minhthu', name: 'Minh Thư' },
  { id: 'love', name: 'love' },
  { id: 'tmaii', name: 'tmaii' },
  { id: 'baoan', name: 'Bảo An' },
  { id: 'trucly', name: 'Trúc Ly' },
  { id: 'vinh', name: 'Vinh Nguyễn' },
  { id: 'haidang', name: 'Hải Đăng' },
  { id: 'giahan', name: 'Gia Hân' },
  { id: 'phuongnhi', name: 'Phương Nhi' },
  { id: 'duykhanh', name: 'Duy Khánh' },
];

const WRONG_GUESSES = [
  'hello', 'happy', 'sad', 'food', 'water', 'beautiful', 'teacher', 'student',
  'travel', 'money', 'book', 'family', 'friend', 'angry', 'hungry', 'tired',
  'run', 'sleep', 'study', 'yes', 'no', 'wow', 'hihi', 'ok', 'hello everyone',
];

const GIFTS = ['Hoa hồng', 'Bánh kem', 'Gấu bông', 'Trái tim', 'Cà phê'];

const pick = (items) => items[Math.floor(Math.random() * items.length)];

export class MockFeed {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.tickTimer = null;
    this.roundId = null;
    this.correctThisRound = 0;
    this.gifTimer = 0;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.roundId = null;
    this.correctThisRound = 0;
    this.game.setConnection({ source: 'mock', channel: 'demo', connected: true });
    this.game.startGame();
    this.game.emit('log', {
      level: 'success',
      message: 'Đang chạy chế độ demo: người xem ảo sẽ bình luận và tặng quà.',
    });
    this.schedule();
  }

  stop() {
    this.active = false;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.tickTimer = null;
    this.game.setConnection({ source: 'none', channel: '', connected: false });
  }

  schedule() {
    if (!this.active) return;
    const delay = 700 + Math.round(Math.random() * 900);
    this.tickTimer = setTimeout(() => {
      this.tick();
      this.schedule();
    }, delay);
  }

  tick() {
    if (!this.active) return;
    const game = this.game;
    if (!game.round || game.phase !== 'live') return;

    if (this.roundId !== game.round.id) {
      this.roundId = game.round.id;
      this.correctThisRound = 0;
      this.gifTimer = 0;
    }

    const roll = Math.random();
    const bot = pick(BOTS);
    const user = { userId: `demo-${bot.id}`, name: bot.name };
    const answer = normalize(game.round.answer);

    if (roll < 0.34) {
      const unsolved = BOTS.filter(
        (candidate) => !game.round.solved.has(`demo-${candidate.id}`),
      );
      if (unsolved.length && this.correctThisRound < 5) {
        const winner = pick(unsolved);
        game.handleChat(
          { userId: `demo-${winner.id}`, name: winner.name },
          game.round.answer,
        );
        this.correctThisRound += 1;
      } else {
        const wrong = WRONG_GUESSES.filter((word) => normalize(word) !== answer);
        game.handleChat(user, pick(wrong));
      }
    } else if (roll < 0.68) {
      const wrong = WRONG_GUESSES.filter((word) => normalize(word) !== answer);
      game.handleChat(user, pick(wrong));
    } else if (roll < 0.8) {
      this.gifTimer += 1;
      game.handleGift(user, pick(GIFTS));
    } else if (roll < 0.9) {
      game.handleJoin(user);
    } else {
      game.handleFollow(user);
    }
  }
}
