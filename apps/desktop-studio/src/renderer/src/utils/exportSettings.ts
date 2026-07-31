import { translate } from '../i18n/locale';

export type ExportContainerFormat = 'mp4' | 'mov' | 'webm' | 'mkv';
export type ExportResolutionPreset = '720p' | '1080p' | '4k';
export type ExportFrameRate = 24 | 30;

export interface ExportSettings {
  format: ExportContainerFormat;
  resolutionPreset: ExportResolutionPreset;
  fps: ExportFrameRate;
}

export interface ExportFormatOption {
  format: ExportContainerFormat;
  label: string;
  description: string;
  disabled?: boolean;
}

export interface ExportProfile {
  format: ExportContainerFormat;
  resolutionPreset: ExportResolutionPreset;
  label: string;
  width: number;
  height: number;
  bitrate: number;
  fps: ExportFrameRate;
  recommended: string;
  disabled?: boolean;
}

export const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  format: 'mp4',
  resolutionPreset: '1080p',
  fps: 30,
};

const RESOLUTION_PROFILES: Record<
  ExportResolutionPreset,
  Omit<ExportProfile, 'fps' | 'bitrate' | 'label' | 'recommended'>
> = {
  '720p': {
    format: 'mp4',
    resolutionPreset: '720p',
    width: 1280,
    height: 720,
  },
  '1080p': {
    format: 'mp4',
    resolutionPreset: '1080p',
    width: 1920,
    height: 1080,
  },
  '4k': {
    format: 'mp4',
    resolutionPreset: '4k',
    width: 3840,
    height: 2160,
    disabled: true,
  },
};

function getBaseBitrate(resolutionPreset: ExportResolutionPreset): number {
  if (resolutionPreset === '720p') return 5_500_000;
  if (resolutionPreset === '1080p') return 8_800_000;
  return 22_000_000;
}

function getFpsMultiplier(fps: ExportFrameRate): number {
  return fps === 30 ? 1 : 0.8;
}

export function resolveExportProfile(settings: ExportSettings): ExportProfile {
  const profile = RESOLUTION_PROFILES[settings.resolutionPreset];
  return {
    ...profile,
    format: settings.format,
    label:
      settings.resolutionPreset === '720p'
        ? translate('export.resolution720p')
        : settings.resolutionPreset === '1080p'
          ? translate('export.resolution1080p')
          : translate('export.resolution4k'),
    fps: settings.fps,
    bitrate: Math.round(getBaseBitrate(settings.resolutionPreset) * getFpsMultiplier(settings.fps)),
    recommended:
      settings.resolutionPreset === '720p'
        ? translate('export.mobileLightweight')
        : settings.resolutionPreset === '1080p'
          ? translate('export.defaultPc')
          : translate('export.followupReview'),
  };
}

export function formatBitrate(bitrate: number): string {
  if (bitrate >= 1_000_000) {
    return `${(bitrate / 1_000_000).toFixed(bitrate % 1_000_000 === 0 ? 0 : 1)} Mbps`;
  }
  if (bitrate >= 1_000) {
    return `${Math.round(bitrate / 1_000)} kbps`;
  }
  return `${bitrate} bps`;
}

export function getExportResolutionOptions(): ExportProfile[] {
  return (['720p', '1080p', '4k'] as const).map((preset) =>
    resolveExportProfile({ format: 'mp4', resolutionPreset: preset, fps: 30 }),
  );
}

export function getExportFormatOptions(): ExportFormatOption[] {
  return [
    {
      format: 'mp4',
      label: 'MP4',
      description: translate('export.mp4Desc'),
    },
    {
      format: 'mov',
      label: 'MOV',
      description: translate('export.movDesc'),
      disabled: true,
    },
    {
      format: 'webm',
      label: 'WebM',
      description: translate('export.webmDesc'),
      disabled: true,
    },
    {
      format: 'mkv',
      label: 'MKV',
      description: translate('export.mkvDesc'),
      disabled: true,
    },
  ];
}
