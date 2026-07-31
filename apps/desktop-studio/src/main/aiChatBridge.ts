import { type IpcMainInvokeEvent, app, ipcMain, webContents } from 'electron';
import {
  AI_CHAT_CHANNELS,
  type AiChatCancelResult,
  type AiChatEvent,
  type AiChatSettingsResult,
  type AiChatSettingsUpdate,
  type AiChatStartRequest,
  type AiChatStartResult,
} from '../shared/aiChat';
import { createAiChatProvider, formatErrorMessage, isAbortError } from './aiChatProviders';
import { loadAiChatSettings, toAiChatSettingsView, updateAiChatSettings } from './aiChatSettings';

interface ActiveAiChatRequest {
  controller: AbortController;
  webContentsId: number;
}

const activeRequests = new Map<string, ActiveAiChatRequest>();
let isRegistered = false;
let isCleanupRegistered = false;

export function registerAiChatBridge(): void {
  if (isRegistered) {
    return;
  }

  isRegistered = true;
  ipcMain.handle(AI_CHAT_CHANNELS.start, handleStartRequest);
  ipcMain.handle(AI_CHAT_CHANNELS.cancel, handleCancelRequest);
  ipcMain.handle(AI_CHAT_CHANNELS.getSettings, handleGetSettingsRequest);
  ipcMain.handle(AI_CHAT_CHANNELS.updateSettings, handleUpdateSettingsRequest);

  if (!isCleanupRegistered) {
    isCleanupRegistered = true;
    app.on('before-quit', () => {
      void cancelAllActiveRequests();
    });
  }
}

async function handleGetSettingsRequest(): Promise<AiChatSettingsResult> {
  try {
    return { success: true, settings: toAiChatSettingsView(await loadAiChatSettings()) };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

async function handleUpdateSettingsRequest(
  _event: IpcMainInvokeEvent,
  update: AiChatSettingsUpdate,
): Promise<AiChatSettingsResult> {
  try {
    return { success: true, settings: toAiChatSettingsView(await updateAiChatSettings(update)) };
  } catch (error) {
    return { success: false, error: formatErrorMessage(error) };
  }
}

async function handleStartRequest(
  event: IpcMainInvokeEvent,
  request: AiChatStartRequest,
): Promise<AiChatStartResult> {
  const requestId = typeof request?.requestId === 'string' ? request.requestId.trim() : '';
  if (!requestId) {
    return { success: false, error: 'Missing requestId.' };
  }

  if (activeRequests.has(requestId)) {
    return { success: false, error: 'Request already active.' };
  }

  const history = Array.isArray(request?.messages) ? request.messages : [];
  if (history.length === 0) {
    return { success: false, error: 'Message history is empty.' };
  }

  const controller = new AbortController();
  activeRequests.set(requestId, { controller, webContentsId: event.sender.id });

  void streamAiChat({
    controller,
    requestId,
    webContentsId: event.sender.id,
    request,
  });

  return { success: true };
}

async function handleCancelRequest(
  _event: IpcMainInvokeEvent,
  requestId: string,
): Promise<AiChatCancelResult> {
  const activeRequest = activeRequests.get(requestId);
  if (!activeRequest) {
    return { success: false, error: 'Request not found.' };
  }

  activeRequest.controller.abort();
  activeRequests.delete(requestId);
  return { success: true };
}

async function streamAiChat({
  controller,
  requestId,
  webContentsId,
  request,
}: {
  controller: AbortController;
  requestId: string;
  webContentsId: number;
  request: AiChatStartRequest;
}): Promise<void> {
  try {
    const provider = createAiChatProvider(await loadAiChatSettings());
    await provider.streamChat({
      request,
      signal: controller.signal,
      onEvent: (event) => {
        if (!controller.signal.aborted) {
          sendAiChatEvent(webContentsId, event);
        }
      },
    });
  } catch (error) {
    if (isAbortError(error) || controller.signal.aborted) {
      return;
    }

    sendAiChatEvent(webContentsId, {
      type: 'error',
      requestId,
      error: formatErrorMessage(error),
    });
  } finally {
    const activeRequest = activeRequests.get(requestId);
    if (activeRequest?.controller === controller) {
      activeRequests.delete(requestId);
    }
  }
}

function sendAiChatEvent(webContentsId: number, event: AiChatEvent): void {
  const targetWebContents = webContents.fromId(webContentsId);
  if (!targetWebContents || targetWebContents.isDestroyed()) {
    return;
  }

  targetWebContents.send(AI_CHAT_CHANNELS.event, event);
}

async function cancelAllActiveRequests(): Promise<void> {
  const requests = Array.from(activeRequests.values());
  activeRequests.clear();

  for (const request of requests) {
    request.controller.abort();
  }
}
