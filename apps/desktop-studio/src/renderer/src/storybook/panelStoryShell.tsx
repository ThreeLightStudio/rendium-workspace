import type { Decorator } from '@storybook/react';
import type { ReactNode } from 'react';
import { LocaleProvider, setLocale } from '../i18n/locale';

type PanelStoryRuntimeFrame = 'right-panel-content' | 'right-panel-ai-content' | false;

interface PanelStoryShellOptions {
  width?: number;
  height?: number;
  runtimeFrame?: PanelStoryRuntimeFrame;
}

export const RUNTIME_RIGHT_PANEL_WIDTH = 320;
export const PANEL_STORY_VIEWPORT_KEY = 'runtimeRightPanel320';

export const PANEL_STORY_VIEWPORTS = {
  runtimeRightPanel320: {
    name: 'Runtime Right Panel 320',
    styles: {
      width: '368px',
      height: '812px',
    },
    type: 'desktop' as const,
  },
  compressed300: {
    name: 'Compressed Panel 300',
    styles: {
      width: '348px',
      height: '812px',
    },
    type: 'desktop' as const,
  },
  compressed340: {
    name: 'Compressed Panel 340',
    styles: {
      width: '388px',
      height: '812px',
    },
    type: 'desktop' as const,
  },
  wideReview420: {
    name: 'Wide Review Panel 420',
    styles: {
      width: '468px',
      height: '812px',
    },
    type: 'desktop' as const,
  },
};

export const PANEL_STORY_PARAMETERS = {
  layout: 'fullscreen',
  viewport: {
    viewports: PANEL_STORY_VIEWPORTS,
    defaultViewport: PANEL_STORY_VIEWPORT_KEY,
  },
};

const frameStyle = {
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'flex-start',
  minHeight: '100vh',
  padding: '24px',
  boxSizing: 'border-box',
  background:
    'radial-gradient(circle at top, rgba(0, 212, 255, 0.12), transparent 35%), linear-gradient(180deg, #11131a 0%, #0b0d12 100%)',
} as const;

const panelCardStyle = {
  width: `${RUNTIME_RIGHT_PANEL_WIDTH}px`,
  maxWidth: '100%',
  height: '760px',
  minHeight: 0,
  display: 'flex',
} as const;

export function PanelStoryShell({
  children,
  width = RUNTIME_RIGHT_PANEL_WIDTH,
  height = 760,
  runtimeFrame = false,
}: { children: ReactNode } & PanelStoryShellOptions): React.JSX.Element {
  const panelStyle = {
    ...panelCardStyle,
    width: `${width}px`,
    height: `${height}px`,
  };

  return (
    <div style={frameStyle}>
      <div style={panelStyle}>
        {runtimeFrame === 'right-panel-content' ? (
          <div className="right-panel" style={{ width: '100%', height: '100%' }}>
            <div className="panel-content right-panel__content">
              <div className="right-panel__inspector-view">{children}</div>
            </div>
          </div>
        ) : runtimeFrame === 'right-panel-ai-content' ? (
          <div className="right-panel" style={{ width: '100%', height: '100%' }}>
            <div className="panel-content right-panel__content right-panel__content--ai">
              {children}
            </div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

export function createPanelStoryDecorator(options: PanelStoryShellOptions = {}): Decorator {
  return (Story) => {
    setLocale('en');

    return (
      <LocaleProvider>
        <PanelStoryShell {...options}>
          <Story />
        </PanelStoryShell>
      </LocaleProvider>
    );
  };
}
