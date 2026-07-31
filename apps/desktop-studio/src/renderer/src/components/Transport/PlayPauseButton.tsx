import { cva, cx } from '@styled-system/css';
import { Pause, Play } from 'lucide-react';

type PlayPauseButtonProps = {
  isPlaying: boolean;
  canPlay: boolean;
  onClick: () => void;
  className?: string;
};

const playPauseButtonClass = cva({
  base: {
    minWidth: '114px',
    padding: '10px 22px',
    borderRadius: '999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '13px',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    transitionProperty: 'all',
    transitionDuration: '300ms',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    backdropFilter: 'blur(12px)',
    _disabled: {
      opacity: 0.35,
      cursor: 'default',
    },
    _hover: {
      transform: 'scale(1.05)',
    },
  },
  variants: {
    playing: {
      true: {
        backgroundColor: 'rgba(255, 75, 75, 0.4)',
        borderColor: 'rgba(255, 75, 75, 0.25)',
        _hover: {
          backgroundColor: 'rgba(255, 75, 75, 0.7)',
          transform: 'scale(1.05)',
        },
      },
      false: {
        backgroundColor: 'rgba(0, 191, 255, 0.4)',
        borderColor: 'rgba(0, 191, 255, 0.25)',
        _hover: {
          backgroundColor: 'rgba(0, 191, 255, 0.7)',
          transform: 'scale(1.05)',
        },
      },
    },
  },
  defaultVariants: {
    playing: false,
  },
});

export function PlayPauseButton({ isPlaying, canPlay, onClick, className }: PlayPauseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!canPlay}
      className={cx(playPauseButtonClass({ playing: isPlaying }), className)}
      aria-label={isPlaying ? 'Pause' : 'Play'}
      title={isPlaying ? 'Pause' : 'Play'}
    >
      {isPlaying ? (
        <>
          <Pause size={16} strokeWidth={2.75} aria-hidden="true" />
          <span>PAUSE</span>
        </>
      ) : (
        <>
          <Play size={16} strokeWidth={2.75} aria-hidden="true" />
          <span>PLAY</span>
        </>
      )}
    </button>
  );
}
