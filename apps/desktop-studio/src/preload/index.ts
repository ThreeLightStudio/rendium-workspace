import { electronAPI } from '@electron-toolkit/preload';
import { contextBridge, ipcRenderer, webUtils } from 'electron';

declare global {
  interface Window {
    electron: typeof electronAPI;
    api: typeof api;
  }
}

// Custom APIs for renderer
const api = {
  // 1. 선택한 File 객체로부터 시스템 전체 경로를 획득합니다. (Electron 28+ 권장)
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // 1-1. 로컬 파일을 ArrayBuffer로 읽어옵니다.
  readFileAsArrayBuffer: (filePath: string) =>
    ipcRenderer.invoke('file:read-array-buffer', filePath) as Promise<ArrayBuffer>,

  // 1-2. 프로젝트 자산 파일을 내부 저장소로 복사합니다.
  projectAssets: {
    storeFile: (request: { projectId: string; sourcePath: string; contentHash: string }) =>
      ipcRenderer.invoke('project-assets:store-file', request) as Promise<{
        success: boolean;
        filePath?: string;
        sourceUrl?: string;
        copied?: boolean;
        error?: string;
      }>,

    deleteFile: (request: { projectId: string; filePath: string }) =>
      ipcRenderer.invoke('project-assets:delete-file', request) as Promise<{
        success: boolean;
        error?: string;
      }>,
  },

  // 2. 인코딩 시작 요청 (설정값 전달)
  startExport: (config: { width: number; height: number; fps: number }) =>
    ipcRenderer.invoke('video:start-export', config),

  // 3. 개별 프레임 버퍼 전송 (단방향, Non-blocking)
  sendFrame: (buffer: ArrayBuffer) => ipcRenderer.send('video:send-frame', buffer),

  // 4. 인코딩 종료 요청
  endExport: () => ipcRenderer.invoke('video:end-export'),

  // 5. MP4 추출 시작 전 파일 스트림 핸들 확보 (경로 지정)
  prepareExport: (originPath?: string) =>
    ipcRenderer.invoke('video:prepare-export', originPath) as Promise<{
      success: boolean;
      exportId?: string;
      filePath?: string;
      error?: string;
    }>,

  // 6. 개별 인코딩 청크를 특정 파일 핸들에 쓰기
  writeExportChunk: (exportId: string, buffer: ArrayBuffer, position: number) =>
    ipcRenderer.invoke('video:write-chunk', exportId, buffer, position) as Promise<{
      success: boolean;
      error?: string;
    }>,

  // 7. MP4 추출 완료 후 파일 핸들 닫기
  finalizeExport: (exportId: string) =>
    ipcRenderer.invoke('video:finalize-export', exportId) as Promise<{
      success: boolean;
      error?: string;
    }>,

  // 8. MP4 추출 중단 (파일 핸들 닫기 및 부분 파일 삭제)
  abortExport: (exportId: string) =>
    ipcRenderer.invoke('video:abort-export', exportId) as Promise<{
      success: boolean;
      error?: string;
    }>,
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api); // React에서는 window.api.sendFrame()으로 사용
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = electronAPI;
  window.api = api;
}
