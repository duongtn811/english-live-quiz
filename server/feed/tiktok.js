const USERNAME_RE = /^[a-zA-Z0-9_.]{2,24}$/;

export class TikTokFeed {
  constructor(game) {
    this.game = game;
    this.connection = null;
    this.username = '';
    this.connecting = false;
  }

  async connect(username) {
    const clean = String(username ?? '').trim().replace(/^@/, '');
    if (!USERNAME_RE.test(clean)) {
      throw new Error('Tên TikTok không hợp lệ. Ví dụ: @yourname');
    }
    if (this.connecting) {
      throw new Error('Đang kết nối, vui lòng chờ...');
    }
    await this.disconnect();

    this.connecting = true;
    this.username = clean;
    try {
      const { TikTokLiveConnection } = await import('tiktok-live-connector');
      // v2.5.0 reads options.processInitialData without defaulting the object.
      const connection = new TikTokLiveConnection(clean, { processInitialData: false });
      this.connection = connection;

      connection.on('chat', (data) => {
        const user = data?.user || {};
        this.game.handleChat(
          { userId: user.uniqueId || user.userId, name: user.nickname || user.uniqueId },
          data?.content ?? data?.comment,
        );
      });

      connection.on('gift', (data) => {
        if (!data) return;
        const user = data.user || {};
        const giftName = data.gift?.name || data.giftName || data.extendedGiftInfo?.name || 'Quà tặng';
        this.game.handleGift(
          { userId: user.uniqueId || user.userId, name: user.nickname || user.uniqueId },
          giftName,
        );
      });

      connection.on('member', (data) => {
        if (!data || (data.actionId != null && data.actionId !== 1)) return;
        const user = data.user || {};
        this.game.handleJoin({ userId: user.uniqueId || user.userId, name: user.nickname });
      });

      connection.on('follow', (data) => {
        if (!data) return;
        const user = data.user || {};
        this.game.handleFollow({ userId: user.uniqueId || user.userId, name: user.nickname });
      });

      connection.on('streamEnd', () => {
        this.game.emit('log', { level: 'error', message: 'Buổi live đã kết thúc.' });
        this.connection = null;
        this.game.setConnection({ source: 'none', channel: '', connected: false });
      });

      connection.on('disconnected', () => {
        this.connection = null;
        this.game.setConnection({ source: 'none', channel: '', connected: false });
        this.game.emit('log', { level: 'error', message: 'Mất kết nối tới TikTok LIVE.' });
      });

      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Hết thời gian kết nối (30s).')), 30000);
      });
      await Promise.race([connection.connect(), timeout]);

      this.game.setConnection({ source: 'tiktok', channel: clean, connected: true });
      this.game.startGame();
      this.game.emit('log', {
        level: 'success',
        message: `Đã kết nối TikTok LIVE @${clean}.`,
      });
    } catch (error) {
      this.connection = null;
      this.game.setConnection({ source: 'none', channel: '', connected: false });
      throw new Error(
        `Không kết nối được @${clean}. Kiểm tra tài khoản có đang live không. (${error?.message || error})`,
      );
    } finally {
      this.connecting = false;
    }
  }

  async disconnect() {
    if (!this.connection) return;
    const connection = this.connection;
    this.connection = null;
    try {
      connection.removeAllListeners?.();
      await connection.disconnect?.();
    } catch {
      // connection already closed
    }
    this.game.setConnection({ source: 'none', channel: '', connected: false });
  }
}
