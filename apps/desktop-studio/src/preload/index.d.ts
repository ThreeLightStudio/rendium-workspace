import type { ElectronAPI } from '@electron-toolkit/preload';
import type {
  AiChatCancelResult,
  AiChatEvent,
  AiChatSettingsResult,
  AiChatSettingsUpdate,
  AiChatStartRequest,
  AiChatStartResult,
} from '../shared/aiChat';


export interface ExportApi {
  /** 선택한 File 객체로부터 시스템 전체 경로를 획득합니다. (Electron 28+ 권장) */
  getPathForFile: (file: File) => string;
  readFileAsArrayBuffer: (filePath: string) => Promise<ArrayBuffer>;
  startExport: (config: { width: number; height: number; fps: number }) => Promise<void>;
  sendFrame: (buffer: ArrayBuffer) => void;
  endExport: () => Promise<void>;
  /** MP4 추출 시작 전 파일 스트림 핸들 확보 (경로 지정) */
  prepareExport: (
    originPath?: string,
  ) => Promise<{ success: boolean; exportId?: string; filePath?: string; error?: string }>;

  /** 개별 인코딩 청크를 특정 파일 핸들에 순차적(또는 임의적)으로 쓰기 */
  writeExportChunk: (
    exportId: string,
    buffer: ArrayBuffer,
    position: number,
  ) => Promise<{ success: boolean; error?: string }>;

  /** MP4 추출 완료 후 파일 핸들 안전하게 닫기 */
  finalizeExport: (exportId: string) => Promise<{ success: boolean; error?: string }>;

  /** MP4 추출 중단 (파일 핸들 닫기 및 부분 파일 삭제) */
  abortExport: (exportId: string) => Promise<{ success: boolean; error?: string }>;
}

export interface ProjectAssetsApi {
  storeFile: (request: {
    projectId: string;
    sourcePath: string;
    contentHash: string;
  }) => Promise<{
    success: boolean;
    filePath?: string;
    sourceUrl?: string;
    copied?: boolean;
    error?: string;
  }>;

  deleteFile: (request: {
    projectId: string;
    filePath: string;
  }) => Promise<{ success: boolean; error?: string }>;
}

export interface AiChatApi {
  start: (request: AiChatStartRequest) => Promise<AiChatStartResult>;
  cancel: (requestId: string) => Promise<AiChatCancelResult>;
  getSettings: () => Promise<AiChatSettingsResult>;
  updateSettings: (update: AiChatSettingsUpdate) => Promise<AiChatSettingsResult>;
  onEvent: (listener: (event: AiChatEvent) => void) => () => void;
}


export interface RendererApi extends ExportApi {
  aiChat?: AiChatApi;
  projectAssets: ProjectAssetsApi;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: RendererApi;
  }
}
