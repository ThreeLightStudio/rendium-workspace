import type { Decorator } from '@storybook/react';
import { type PropsWithChildren, type ReactElement, createContext, useContext } from 'react';

export interface MockCanvasState {
  isReady: boolean;
  currentTime: number;
  isPlaying: boolean;
}

const MockCanvasContext = createContext<MockCanvasState | null>(null);

export function MockCanvasProvider({
  children,
  isReady,
  currentTime,
  isPlaying,
}: PropsWithChildren<MockCanvasState>): ReactElement {
  return (
    <MockCanvasContext.Provider
      value={{
        isReady,
        currentTime,
        isPlaying,
      }}
    >
      {children}
    </MockCanvasContext.Provider>
  );
}

export function useMockCanvasState(): MockCanvasState {
  const context = useContext(MockCanvasContext);
  if (!context) {
    throw new Error('useMockCanvasState must be used inside <MockCanvasProvider>');
  }

  return context;
}

export function createMockCanvasDecorator(state: MockCanvasState): Decorator {
  return (Story) => (
    <MockCanvasProvider {...state}>
      <Story />
    </MockCanvasProvider>
  );
}
