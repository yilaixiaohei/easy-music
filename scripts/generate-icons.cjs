// Render the existing vector brand artwork; no external assets or services.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../build');
const profile = path.join(root, '.icon-render');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.setPath('sessionData', profile);
let window;
app.whenReady().then(async () => {
  try {
    const svg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
    await window.loadURL('data:text/html,<html><body></body></html>');
    const sizes = [16, 20, 24, 28, 32, 40, 48, 64, 128, 256, 512];
    const data = await window.webContents.executeJavaScript(`(async () => {
      const image = new Image();
      image.src = ${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))};
      await image.decode();
      return ${JSON.stringify(sizes)}.map(size => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(image, 0, 0, size, size);
        return canvas.toDataURL('image/png').split(',')[1];
      });
    })()`);
    const pngs = data.map(value => Buffer.from(value, 'base64'));
    fs.writeFileSync(path.join(root, 'icon.png'), pngs.at(-1));
    const entries = pngs.slice(0, -1);
    const header = Buffer.alloc(6 + entries.length * 16);
    header.writeUInt16LE(1, 2); header.writeUInt16LE(entries.length, 4);
    let offset = header.length;
    entries.forEach((png, index) => {
      const start = 6 + index * 16;
      header[start] = header[start + 1] = sizes[index] === 256 ? 0 : sizes[index];
      header.writeUInt16LE(1, start + 4); header.writeUInt16LE(32, start + 6);
      header.writeUInt32LE(png.length, start + 8); header.writeUInt32LE(offset, start + 12);
      offset += png.length;
    });
    fs.writeFileSync(path.join(root, 'icon.ico'), Buffer.concat([header, ...entries]));
    console.log('Generated icon.png (512px) and multi-resolution icon.ico (16–256px, including common Windows DPI sizes).');
    window.destroy(); app.exit(0);
  } catch (error) { console.error(error.message); window?.destroy(); app.exit(1); }
});
