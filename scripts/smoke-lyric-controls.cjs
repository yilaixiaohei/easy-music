// Isolated renderer integration check; uses fixture lyrics, never account data.
const { app, BrowserWindow } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const directory = join(__dirname, '../build/.lyric-controls-smoke');
mkdirSync(directory, { recursive: true });
app.setPath('userData', directory);
app.setPath('sessionData', directory);
const timer = setTimeout(() => app.exit(1), 60000);
app.whenReady().then(async () => {
  let window;
  try {
    window = new BrowserWindow({ width: 1280, height: 850, show: false,
      webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
    await window.loadURL(process.argv[2] || 'http://127.0.0.1:5199/');
    await window.webContents.executeJavaScript(`(async () => {
      localStorage.removeItem('easy-music:lyric-display-v1');
      const { useAppearanceStore } = await import('/src/stores/appearance.ts');
      window.fixtureAppearance = useAppearanceStore(); fixtureAppearance.lyricsStyle = 'classic';
      window.desktop = { window: {
        onState: () => () => {}, state: async () => ({ ok: true, data: { maximized: false, focused: true } }),
        control: async () => ({ ok: true, data: { maximized: false, focused: true } })
      }, storage: {
        info: async () => ({ ok: true, data: { cacheLimitMB: window.fixtureLimit === undefined ? 512 : window.fixtureLimit, activeCacheLimitMB: 512, directory: 'D:/Apps/EasyMusic/data', totalBytes: 64000000, cacheBytes: window.fixtureCache ?? 31457280, diagnosticBytes: window.fixtureDiagnostics ?? 131072, temporaryBytes: 100, approximate: false } }),
        setCacheLimit: async value => { window.fixtureLimit = value; return window.desktop.storage.info(); },
        clear: async kind => { if (kind === 'cache') window.fixtureCache = 0; else window.fixtureDiagnostics = 0; return { ok: true, data: { info: (await window.desktop.storage.info()).data, skippedFiles: 0 } }; },
        openDirectory: async () => ({ ok: true })
      }, music: { lyric: async id => ({ ok: true, data: {
        original: '[00:00.00]A morning full of light\\n[00:05.00]A melody beside you',
        translated: id === 1 ? '[00:00.00]洒满晨光的一天\\n[00:05.00]旋律在你身边' : '', instrumental: false
      } }) } };
      const { usePlayerStore } = await import('/src/stores/player.ts');
      window.fixturePlayer = usePlayerStore();
      fixturePlayer.mode = 'order';
      fixturePlayer.state = { ...fixturePlayer.state, song: { id: 1, title: 'Lyric controls preview', artists: 'Fixture artist', album: 'Preview', cover: '', duration: 60 }, position: 1, duration: 60 };
      fixturePlayer.lyricsOpen = true;
    })()`);
    const evaluate = source => window.webContents.executeJavaScript(`(async () => { ${source}; await new Promise(requestAnimationFrame); })()`);
    for (let i = 0; i < 20; i++) {
      if (await window.webContents.executeJavaScript(`!!document.querySelector('[aria-label="显示译文"]')`)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('.lyric-line small').length`), 0);
    await evaluate(`document.querySelector('[aria-label="歌词字体大小"]').focus()`);
    assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.lyrics-tools')).pointerEvents`), 'auto');
    await evaluate(`document.querySelector('[aria-label="显示译文"]').click()`);
    assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('.lyric-line small').length`), 2);
    await evaluate(`document.querySelector('[aria-label="歌词字体大小"]').click();`);
    await evaluate(`const input = document.querySelector('[aria-label="歌词字号"]'); input.value = '27'; input.dispatchEvent(new Event('input', { bubbles: true }))`);
    assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.lyric-line')).fontSize`), '27px');
    const screenshot = await window.webContents.capturePage();
    writeFileSync(join(directory, 'preview.png'), screenshot.toPNG());
    await evaluate(`document.querySelector('[aria-label="歌词字号"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    assert.equal(await window.webContents.executeJavaScript(`!!document.querySelector('#lyric-font-panel')`), false);
    assert.equal(await window.webContents.executeJavaScript(`fixturePlayer.lyricsOpen`), true);
    await evaluate(`fixturePlayer.lyricsOpen = false`);
    await evaluate(`fixturePlayer.lyricsOpen = true`);
    assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.lyric-line')).fontSize`), '27px');
    assert.equal(await window.webContents.executeJavaScript(`JSON.parse(localStorage.getItem('easy-music:lyric-display-v1')).showTranslation`), true);
    await evaluate(`fixturePlayer.state = { ...fixturePlayer.state, song: { ...fixturePlayer.state.song, id: 2 } }`);
    await evaluate(`await Promise.resolve()`);
    assert.equal(await window.webContents.executeJavaScript(`!!document.querySelector('[aria-label="隐藏译文"]')`), false);
    console.log('PASS: translation toggle, font slider, Escape, saved preferences and no-translation visibility');
    await evaluate(`fixturePlayer.lyricsOpen = false`);
    for (const [width, height] of [[1280, 850], [960, 640]]) {
      window.setContentSize(width, height);
      await evaluate(`const trigger = document.querySelector('.settings-button'); trigger.focus(); trigger.click()`);
      const close = await window.webContents.executeJavaScript(`(() => {
        const button = document.querySelector('.modal-close'); const r = button.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        return { x, y, height: innerHeight, hit: button.contains(document.elementFromPoint(x, y)), region: getComputedStyle(document.querySelector('.modal-backdrop')).webkitAppRegion, modalHeight: document.querySelector('.modal').getBoundingClientRect().height };
      })()`);
      assert.ok(close.y > 0 && close.y < close.height && close.hit && close.modalHeight <= close.height - 31, JSON.stringify(close));
      assert.equal(close.region, 'no-drag');
      window.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(close.x), y: Math.round(close.y), button: 'left', clickCount: 1 });
      window.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(close.x), y: Math.round(close.y), button: 'left', clickCount: 1 });
      await evaluate(`await new Promise(resolve => setTimeout(resolve, 100))`);
      assert.equal(await window.webContents.executeJavaScript(`!!document.querySelector('.modal')`), false);
      await evaluate(`document.querySelector('.settings-button').focus(); document.querySelector('.settings-button').click()`);
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await evaluate(`await new Promise(resolve => setTimeout(resolve, 50))`);
      assert.equal(await window.webContents.executeJavaScript(`document.activeElement === document.querySelector('.settings-button') && getComputedStyle(document.activeElement).outlineStyle === 'none'`), true);
      window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
      window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
      await evaluate(`await Promise.resolve()`);
      assert.equal(await window.webContents.executeJavaScript(`!!document.querySelector('[data-restored-focus]')`), false);
    }
    console.log('PASS: settings close pointer hit at 1280/960, bounded scrolling, Escape restores focus without ring, Tab restores keyboard focus');
    await evaluate(`document.querySelector('.settings-button').click(); localStorage.setItem('storage-preserved-fixture', 'keep')`);
    await evaluate(`await new Promise(resolve => setTimeout(resolve, 50))`);
    assert.ok(await window.webContents.executeJavaScript(`document.querySelector('.storage-settings').textContent.includes('30.0 MB')`));
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('#cache-limit').value`), '512');
    for (const value of ['256', '1024', 'unlimited', '512']) {
      await evaluate(`const select = document.querySelector('#cache-limit'); select.value = '${value}'; select.dispatchEvent(new Event('change', { bubbles: true }))`);
      await evaluate(`await new Promise(resolve => setTimeout(resolve, 30))`);
      assert.equal(await window.webContents.executeJavaScript(`fixtureLimit`), value === 'unlimited' ? null : Number(value));
      assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.storage-settings').textContent.includes('待重启生效')`), value !== '512');
    }
    await evaluate(`const buttons = document.querySelectorAll('.storage-item .secondary-button'); buttons[1].scrollIntoView({ block: 'center' }); buttons[1].click()`);
    await evaluate(`await new Promise(resolve => setTimeout(resolve, 50))`);
    assert.equal(await window.webContents.executeJavaScript(`fixtureCache`), 0);
    assert.ok(await window.webContents.executeJavaScript(`document.querySelector('.storage-message').textContent.includes('网络缓存已清理')`));
    await evaluate(`document.querySelectorAll('.storage-item .secondary-button')[2].click()`);
    await evaluate(`await new Promise(resolve => setTimeout(resolve, 50))`);
    assert.equal(await window.webContents.executeJavaScript(`fixtureDiagnostics`), 0);
    assert.equal(await window.webContents.executeJavaScript(`(() => { const b = document.querySelector('.modal-close'); const r = b.getBoundingClientRect(); return r.top > 0 && r.bottom < innerHeight && b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)); })()`), true, 'Close stays reachable after scrolling settings');
    writeFileSync(join(directory, 'storage-settings.png'), (await window.webContents.capturePage()).toPNG());
    await window.webContents.session.cookies.set({ url: 'https://storage-fixture.invalid', name: 'fixture', value: 'keep' });
    await window.webContents.session.clearCache();
    assert.equal((await window.webContents.session.cookies.get({ url: 'https://storage-fixture.invalid' }))[0].value, 'keep');
    assert.equal(await window.webContents.executeJavaScript(`localStorage.getItem('storage-preserved-fixture')`), 'keep');
    await evaluate(`document.querySelector('.modal-close').click()`);
    console.log('PASS: storage UI sizes, cache/log cleanup feedback; actual Electron clearCache preserves fixture cookies and localStorage');
    await evaluate(`
      fixturePlayer.lyricsOpen = false;
      document.querySelector('.settings-button').click();
    `);
    await evaluate(`const select = document.querySelector('#lyrics-style'); select.value = 'immersive'; select.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('.modal-close').click()`);
    assert.equal(await window.webContents.executeJavaScript(`localStorage.getItem('easy-music:lyrics-style')`), 'immersive');
    await evaluate(`
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="700"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#364b85"/><stop offset=".55" stop-color="#962f40"/><stop offset="1" stop-color="#25182c"/></linearGradient></defs><path fill="url(#g)" d="M0 0h700v700H0z"/><circle cx="350" cy="310" r="180" fill="#edbaa4" opacity=".5"/><text x="350" y="570" fill="white" text-anchor="middle" font-size="42">EASY MUSIC</text></svg>';
      fixturePlayer.state = { ...fixturePlayer.state, song: { ...fixturePlayer.state.song, id: 1, title: '让旋律留在这一刻', artists: '测试歌手', album: '明日的世界', artistRefs: [{ id: 123, name: '测试歌手' }], albumId: 456, cover: 'data:image/svg+xml,' + encodeURIComponent(svg) }, phase: 'paused' };
      localStorage.setItem('easy-music:lyric-display-v1', JSON.stringify({ fontSize: 19, showTranslation: true }));
      window.fixtureCalls = [];
      fixturePlayer.toggle = () => fixtureCalls.push('toggle');
      fixturePlayer.next = direction => fixtureCalls.push('next:' + direction);
      fixturePlayer.seek = position => fixtureCalls.push('seek:' + position);
      const { useLibraryStore } = await import('/src/stores/library.ts');
      useLibraryStore().toggleLike = song => fixtureCalls.push('like:' + song.id);
      fixturePlayer.queue = [fixturePlayer.state.song];
      fixturePlayer.lyricsOpen = true;
    `);
    await evaluate(`await new Promise(resolve => setTimeout(resolve, 200))`);
    assert.equal(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.player')).display`), 'none');
    assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('.immersive-transport button').length`), 4);
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.immersive-copy a').getAttribute('href')`), '#/artist/123');
    assert.equal(await window.webContents.executeJavaScript(`document.querySelectorAll('.immersive-copy a')[1].getAttribute('href')`), '#/album/456');
    assert.equal(await window.webContents.executeJavaScript(`document.querySelector('.large-cover img').naturalWidth > 0`), true);
    await evaluate(`document.querySelector('.immersive-mode').click(); document.querySelector('.immersive-heart').click()`);
    assert.equal(await window.webContents.executeJavaScript(`fixturePlayer.mode`), 'loop');
    await evaluate(`document.querySelector('.immersive-play').click(); document.querySelector('.immersive-transport [aria-label="下一首"]').click(); const range = document.querySelector('.immersive-timeline input'); range.value = 20; range.dispatchEvent(new Event('change', { bubbles: true })); const volume = document.querySelector('.immersive-volume input'); volume.value = 38; volume.dispatchEvent(new Event('input', { bubbles: true }))`);
    assert.deepEqual(await window.webContents.executeJavaScript(`fixtureCalls`), ['like:1', 'toggle', 'next:1', 'seek:20']);
    assert.equal(await window.webContents.executeJavaScript(`fixturePlayer.volume`), 38);
    for (const [width, height] of [[1600, 1000], [1280, 850], [960, 640]]) {
      window.setContentSize(width, height);
      await evaluate(`await new Promise(resolve => setTimeout(resolve, 400))`);
      const bounds = await window.webContents.executeJavaScript(`(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width }; };
        return { cover: rect('.large-cover'), play: rect('.immersive-play'), controls: rect('.immersive-controls'), lyrics: rect('.lyrics-section'), overlay: rect('.lyrics-overlay'), height: innerHeight, width: innerWidth };
      })()`);
      assert.equal(bounds.overlay.bottom, bounds.height);
      assert.ok(bounds.cover.top >= 55 && bounds.controls.bottom < bounds.height, JSON.stringify(bounds));
      assert.ok(bounds.cover.right < bounds.lyrics.left && bounds.lyrics.right <= bounds.width, JSON.stringify(bounds));
      assert.ok(Math.abs((bounds.play.left + bounds.play.right - bounds.cover.left - bounds.cover.right) / 2) < 1, 'Play button should stay centered below the cover');
      writeFileSync(join(directory, 'immersive-' + width + '.png'), (await window.webContents.capturePage()).toPNG());
    }
    await evaluate(`document.querySelector('.immersive-copy a').click()`);
    assert.equal(await window.webContents.executeJavaScript(`fixturePlayer.lyricsOpen`), false);
    assert.notEqual(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.player')).display`), 'none');
    await evaluate(`fixtureAppearance.lyricsStyle = 'classic'; fixturePlayer.lyricsOpen = true`);
    assert.equal(await window.webContents.executeJavaScript(`!!document.querySelector('.lyrics-immersive')`), false);
    assert.notEqual(await window.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.player')).display`), 'none');
    console.log('PASS: Settings selection, persistence, immersive transport/seek/volume, artist/album links, footer restoration and 1600/1280/960 layouts');
    window.destroy(); clearTimeout(timer); app.exit(0);
  } catch (reason) { console.error(reason.stack); window?.destroy(); clearTimeout(timer); app.exit(1); }
});
