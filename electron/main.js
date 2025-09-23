// Processo principal do Electron responsável por carregar a build web estática otimizada.
const { app, BrowserWindow, nativeTheme } = require('electron');
const path = require('path');

// Caminho absoluto do HTML principal (mantido fora do asar para facilitar depuração quando necessário).
const APP_ENTRY = path.join(__dirname, '..', 'app', 'index.html');

/**
 * Cria a janela principal configurada para abrir instantaneamente o contador.
 * Mantemos opções enxutas para garantir start-up rápido e bloquear superfícies desnecessárias.
 */
function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#060810',
    show: false, // apenas exibir quando o DOM terminar de carregar para evitar flicker.
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWindow.webContents.once('dom-ready', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Bloqueia abertura de novas janelas externas.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.loadFile(APP_ENTRY);
}

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
