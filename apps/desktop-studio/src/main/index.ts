import type { FileHandle } from 'node:fs/promises';
import { copyFile, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname, join, parse } from 'node:path';
import { electronApp, is, optimizer } from '@electron-toolkit/utils';
import { BrowserWindow, Menu, app, dialog, ipcMain, nativeImage, shell } from 'electron';
import icon from '../../resources/icon.png?asset';

import {
  createProjectAssetSourceUrl,
  getProjectAssetFilePath,
  getProjectAssetFilesDir,
  isProjectAssetSourceUrl,
  resolveProjectAssetDeletionPath,
  resolveProjectAssetSourceUrl,
} from './projectAssetPaths';

// 앱이 시작되자마자 이름을 설정해야 OS(Dock/Taskbar)에 브랜딩이 즉시 반영됩니다.
app.setName('Rendium Desktop Studio');

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'Rendium Desktop Studio',
    icon: icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  // Keep app at 100% zoom; timeline zoom is handled inside the renderer.
  mainWindow.webContents.setZoomFactor(1);
  mainWindow.webContents.setZoomLevel(0);

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(1);
    mainWindow.webContents.setZoomLevel(0);
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = (input.key || '').toLowerCase();
    const mod = input.control || input.meta;
    const isZoomShortcut = mod && (key === '+' || key === '-' || key === '=' || key === '0');
    if (isZoomShortcut) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// Export file streams tracking map
const exportFileHandles = new Map<string, { handle: FileHandle; path: string }>();

async function ensureProjectAssetFile(
  projectId: string,
  sourcePath: string,
  contentHash: string,
): Promise<{ filePath: string; sourceUrl: string; copied: boolean }> {
  if (!projectId || !sourcePath || !contentHash) {
    throw new Error('Missing project asset storage parameters.');
  }

  const userDataPath = app.getPath('userData');
  const filePath = getProjectAssetFilePath({ userDataPath, projectId, contentHash, sourcePath });
  const sourceUrl = createProjectAssetSourceUrl({ projectId, contentHash, sourcePath });
  const targetDir = getProjectAssetFilesDir({ userDataPath, projectId });
  await mkdir(targetDir, { recursive: true });

  const resolvedSourcePath = isProjectAssetSourceUrl(sourcePath)
    ? resolveProjectAssetSourceUrl({
        userDataPath,
        sourceUrl: sourcePath,
        expectedProjectId: projectId,
      })
    : sourcePath;

  if (resolvedSourcePath === filePath) {
    return { filePath, sourceUrl, copied: false };
  }

  try {
    await copyFile(resolvedSourcePath, filePath);
    return { filePath, sourceUrl, copied: true };
  } catch (error) {
    // 이미 동일한 내부 파일이 있으면 복사를 생략합니다.
    try {
      await readFile(filePath);
      return { filePath, sourceUrl, copied: false };
    } catch {
      throw error;
    }
  }
}

async function deleteProjectAssetFile(projectId: string, filePath: string): Promise<void> {
  if (!projectId || !filePath) {
    throw new Error('Missing project asset deletion parameters.');
  }

  const resolvedPath = resolveProjectAssetDeletionPath({
    userDataPath: app.getPath('userData'),
    projectId,
    sourceUrlOrPath: filePath,
  });
  await unlink(resolvedPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  });
}

// This method will be called when Electron has finished
app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(icon));
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.rendium.desktop.studio');

  // Minimal application menu
  const isMac = process.platform === 'darwin';
  // biome-ignore lint/suspicious/noExplicitAny: Electron Menu template needs wide type to avoid deep nested literal inference issues
  const template: any[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
          : [{ role: 'close' }]),
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://github.com/rendium-studio/rendium');
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  ipcMain.handle('file:read-array-buffer', async (_event, filePath: string) => {
    try {
      const resolvedPath = isProjectAssetSourceUrl(filePath)
        ? resolveProjectAssetSourceUrl({
            userDataPath: app.getPath('userData'),
            sourceUrl: filePath,
          })
        : filePath;
      const file = await readFile(resolvedPath);
      return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    } catch (err) {
      console.error('[Main] Failed to read file as ArrayBuffer:', filePath, err);
      throw err;
    }
  });

  ipcMain.handle(
    'project-assets:store-file',
    async (_event, request: { projectId: string; sourcePath: string; contentHash: string }) => {
      try {
        const result = await ensureProjectAssetFile(
          request.projectId,
          request.sourcePath,
          request.contentHash,
        );
        return {
          success: true,
          filePath: result.filePath,
          sourceUrl: result.sourceUrl,
          copied: result.copied,
        };
      } catch (error) {
        console.error('[Main] Failed to store project asset file:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle(
    'project-assets:delete-file',
    async (_event, request: { projectId: string; filePath: string }) => {
      try {
        await deleteProjectAssetFile(request.projectId, request.filePath);
        return { success: true };
      } catch (error) {
        console.error('[Main] Failed to delete project asset file:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  // MP4 인코딩을 위해 사전에 저장 경로를 묻고 파일 스트림 핸들을 확보
  ipcMain.handle('video:prepare-export', async (event, originPath?: string) => {
    console.log('[Main] Received video:prepare-export, originPath:', originPath);

    // 1. 기본 저장 디렉토리 결정 (원본 경로의 dirname, 없으면 바탕화면)
    const defaultDir = originPath ? dirname(originPath) : app.getPath('desktop');

    // 2. 기본 파일명 결정 (원본파일명_rendered.mp4, 없으면 timestamp 기반)
    let suggestedName = `rendium-export-${Date.now()}.mp4`;
    if (originPath) {
      const { name } = parse(originPath);
      suggestedName = `${name}_rendered.mp4`;
    }

    const dialogOptions = {
      title: 'Export MP4 Video',
      defaultPath: join(defaultDir, suggestedName),
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
    };
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    const { canceled, filePath } = ownerWindow
      ? await dialog.showSaveDialog(ownerWindow, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions);

    if (canceled || !filePath) {
      return { success: false };
    }

    try {
      const fileHandle = await open(filePath, 'w');
      const exportId = `export-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      exportFileHandles.set(exportId, { handle: fileHandle, path: filePath });

      console.log(`[Main] Export stream readied: ${exportId} at ${filePath}`);
      return { success: true, exportId, filePath };
    } catch (err) {
      console.error('[Main] Failed to open export stream:', err);
      return { success: false, error: String(err) };
    }
  });

  // 인코딩된 개별 버퍼 청크를 파일에 순차/임의 접근으로 저장 (Stream/Random Access)
  ipcMain.handle(
    'video:write-chunk',
    async (_event, exportId: string, chunk: ArrayBuffer, position: number) => {
      const entry = exportFileHandles.get(exportId);
      if (!entry) {
        console.error(`[Main] Invalid exportId: ${exportId} for chunk write`);
        return { success: false, error: 'Invalid exportId' };
      }

      try {
        const buffer = Buffer.from(chunk);
        await entry.handle.write(buffer, 0, buffer.byteLength, position);
        return { success: true };
      } catch (err) {
        console.error(`[Main] Failed writing chunk to export stream ${exportId}:`, err);
        return { success: false, error: String(err) };
      }
    },
  );

  // 인코딩 완료 후 파일 핸들 안전하게 닫기
  ipcMain.handle('video:finalize-export', async (_event, exportId: string) => {
    const entry = exportFileHandles.get(exportId);
    if (!entry) {
      console.warn(`[Main] Attempted to finalize unknown exportId: ${exportId}`);
      return { success: false, error: 'Invalid exportId' };
    }

    try {
      await entry.handle.sync(); // 버퍼 강제 플러시
      await entry.handle.close();
      exportFileHandles.delete(exportId);
      console.log(`[Main] Export finalized: ${exportId}`);
      return { success: true };
    } catch (err) {
      console.error(`[Main] Failed closing export stream ${exportId}:`, err);
      return { success: false, error: String(err) };
    }
  });

  // 인코딩 중도 취소 (파일 핸들 강제 종료 및 파일 삭제)
  ipcMain.handle('video:abort-export', async (_event, exportId: string) => {
    const entry = exportFileHandles.get(exportId);
    if (!entry) {
      console.warn(`[Main] Attempted to abort unknown exportId: ${exportId}`);
      return { success: false, error: 'Invalid exportId' };
    }

    try {
      // 핸들을 닫고 임시 생성된 쓸모없는 파일을 삭제
      await entry.handle.close();
      await unlink(entry.path);
      exportFileHandles.delete(exportId);
      console.log(`[Main] Export aborted and file deleted: ${exportId}`);
      return { success: true };
    } catch (err) {
      console.error(`[Main] Failed to abort export ${exportId}:`, err);
      return { success: false, error: String(err) };
    }
  });

  createWindow();

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
