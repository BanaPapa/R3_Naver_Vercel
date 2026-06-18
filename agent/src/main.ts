import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import * as path from 'path';
import * as http from 'http';
import { createServer, AGENT_PORT } from './server';

let tray: Tray | null = null;
let httpServer: http.Server | null = null;

function startHttpServer(): void {
  const expressApp = createServer();
  httpServer = expressApp.listen(AGENT_PORT, '127.0.0.1', () => {
    console.log(`[Estate-OS Agent] HTTP 서버 시작: http://127.0.0.1:${AGENT_PORT}`);
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Estate-OS Agent] 포트 ${AGENT_PORT} 이미 사용 중. 에이전트가 이미 실행 중입니다.`);
      app.quit();
    } else {
      console.error('[Estate-OS Agent] 서버 오류:', err);
    }
  });
}

function createTray(): void {
  // 빈 16x16 흰색 아이콘 (아이콘 파일 없을 때 fallback)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Estate-OS Agent v1.0.0',
      enabled: false,
    },
    {
      label: `포트: ${AGENT_PORT}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '웹앱 열기',
      click: () => {
        const win = new BrowserWindow({ width: 1200, height: 800 });
        win.loadURL('https://estate-os.vercel.app');
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Estate-OS Agent — 실행 중');
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  // 독(macOS)·작업표시줄 아이콘 숨기기
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  startHttpServer();
  createTray();
});

// 모든 창이 닫혀도 트레이앱 유지 (macOS 기본 동작 덮어쓰기)
app.on('window-all-closed', () => {
  // 아무것도 하지 않음 — 트레이 유지
});

app.on('before-quit', () => {
  httpServer?.close();
  tray?.destroy();
});
