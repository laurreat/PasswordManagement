const { app, BrowserWindow, protocol, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

const DEV_URL = 'http://localhost:9002';
const isDev = !app.isPackaged;

// Origen fijo (app://.) para que localStorage persista entre ejecuciones en portable e instalador
const APP_PROTOCOL = 'app';
const APP_ORIGIN = 'app://.';

function getOutPath() {
  if (isDev) {
    return path.join(app.getAppPath(), 'out');
  }
  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'out'),
    path.join(__dirname, '..', 'out'),
    path.join(process.resourcesPath, 'app.asar', 'out'),
    path.join(app.getAppPath(), 'out'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return path.join(__dirname, '..', 'out');
}

// Registrar esquema "app" como privilegiado (localStorage, etc.) antes de app.ready
protocol.registerSchemesAsPrivileged([
  { scheme: APP_PROTOCOL, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function getIcon() {
  const dirs = isDev 
    ? [path.join(__dirname, 'public')]
    : [getOutPath(), path.join(__dirname, '..')];
  
  for (const dir of dirs) {
    const pngPath = path.join(dir, 'icon.png');
    if (fs.existsSync(pngPath)) {
      return nativeImage.createFromPath(pngPath).resize({ width: 256, height: 256 });
    }
    const svgPath = path.join(dir, 'icon.svg');
    if (fs.existsSync(svgPath)) {
      const svgContent = fs.readFileSync(svgPath, 'utf8');
      return nativeImage.createFromBuffer(Buffer.from(svgContent));
    }
  }
  return null;
}

function createWindow() {
  const windowIcon = getIcon();
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'LocalPass',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    show: false,
    autoHideMenuBar: true,
  };

  if (windowIcon) {
    windowConfig.icon = windowIcon;
  }

  mainWindow = new BrowserWindow(windowConfig);

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
    mainWindow.webContents.openDevTools();
  } else {
    const outPath = getOutPath();
    if (!fs.existsSync(outPath)) {
      mainWindow.loadURL(
        'data:text/html,<h1>Error</h1><p>No se pudo iniciar la aplicaci%C3%B3n. Carpeta "out" no encontrada.</p>'
      );
      mainWindow.show();
      return;
    }

    protocol.handle(APP_PROTOCOL, (request) => {
      let url = request.url.slice(APP_ORIGIN.length) || '/';
      const pathname = url.split('?')[0].replace(/^\/+/, '') || 'index.html';
      const filePath = path.join(outPath, path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, ''));

      if (!path.resolve(filePath).startsWith(path.resolve(outPath))) {
        return new Response('Forbidden', { status: 403 });
      }

      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          const ext = path.extname(filePath);
          const mime = { '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json' }[ext] || 'application/octet-stream';
          const body = fs.readFileSync(filePath);
          return new Response(body, { headers: { 'Content-Type': mime } });
        }
        if (stat.isDirectory()) {
          const index = path.join(filePath, 'index.html');
          if (fs.existsSync(index)) {
            const body = fs.readFileSync(index);
            return new Response(body, { headers: { 'Content-Type': 'text/html' } });
          }
        }
      } catch (_) {}
      const indexHtml = path.join(outPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        const body = fs.readFileSync(indexHtml);
        return new Response(body, { headers: { 'Content-Type': 'text/html' } });
      }
      return new Response('Not Found', { status: 404 });
    });

    mainWindow.loadURL(APP_ORIGIN + '/index.html');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
