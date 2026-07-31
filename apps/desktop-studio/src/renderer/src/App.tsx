import { PROJECT_CONFIG, SCENE_CONFIG, engineStore } from '@rendium/engine';
import { useEffect, useState } from 'react';
import { StudioEditor } from './components/StudioEditor';
import { ToastProvider } from './components/ToastSystem';
import { useEngineErrorBridge } from './hooks/useEngineErrorBridge';
import { LocaleProvider } from './i18n/locale';
import { StorageService } from './services/StorageService';
import { useStudioStore } from './stores/studioStore';
import { useProjectAssetsStore } from './stores/useProjectAssetsStore';

/**
 * Inner router — must be a child of ToastProvider so that
 * useEngineErrorBridge can call useToast() successfully.
 */
function AppRouter(): React.JSX.Element {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Global engine error → Toast bridge. Single call covers the entire session.
  useEngineErrorBridge();

  useEffect(() => {
    async function initProject() {
      try {
        const metas = await StorageService.getAllProjectMetas();
        let targetProjectId: string;

        if (metas.length > 0) {
          targetProjectId = metas[0].id;
          const manifest = await StorageService.load(targetProjectId);
          if (manifest) {
            engineStore.loadManifest(manifest);
            useStudioStore.getState().loadScene(manifest);
          } else {
            throw new Error('Failed to load project manifest');
          }
        } else {
          const newManifest = engineStore.createBlankProject({
            name: PROJECT_CONFIG.DEFAULT_NAME,
            width: SCENE_CONFIG.DEFAULT_RESOLUTION.width,
            height: SCENE_CONFIG.DEFAULT_RESOLUTION.height,
          });
          useStudioStore.getState().loadScene(newManifest);
          targetProjectId = newManifest.projectInfo.createdAt.toString();
          await StorageService.save();
        }

        await useProjectAssetsStore.getState().setActiveProject(targetProjectId);
        setActiveProjectId(targetProjectId);
      } catch (err) {
        console.error('[App] Failed to initialize project:', err);
      } finally {
        setIsLoading(false);
      }
    }

    void initProject();
  }, []);

  if (isLoading || !activeProjectId) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#08090d',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        Loading Rendium Desktop Studio...
      </div>
    );
  }

  return <StudioEditor activeProjectId={activeProjectId} />;
}

/**
 * Rendium Desktop Studio Main Application Router.
 * Implements Lazy Loading:
 * - Automatically loads the last active project or creates a blank one on startup.
 * - Instantiates WebGPU/WebAudio contexts once mounted.
 */
function App(): React.JSX.Element {
  return (
    <LocaleProvider>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </LocaleProvider>
  );
}

export default App;
