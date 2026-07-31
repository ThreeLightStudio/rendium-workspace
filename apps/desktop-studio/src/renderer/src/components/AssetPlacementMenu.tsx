import { css } from '@styled-system/css';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '../i18n/locale';
export type AssetScenePlacementScopeRole = 'main' | 'overlay';
import { primaryButtonClass } from './ui/styles';

const placementMenuRootClass = css({
  position: 'relative',
  display: 'inline-flex',
});

const placementMenuClass = css({
  position: 'absolute',
  left: 0,
  top: 'calc(100% + 6px)',
  zIndex: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: '1',
  minWidth: '180px',
  padding: '1.5',
  borderRadius: 'md',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorder',
  backgroundColor: 'surface',
  boxShadow: '0 12px 28px rgba(0, 0, 0, 0.34)',
});

const placementMenuItemClass = css({
  width: '100%',
  appearance: 'none',
  borderWidth: 0,
  borderRadius: 'sm',
  backgroundColor: 'transparent',
  color: 'textPrimary',
  cursor: 'pointer',
  fontFamily: 'body',
  fontSize: 'sm',
  fontWeight: '600',
  lineHeight: '1.35',
  paddingX: '2.5',
  paddingY: '2',
  textAlign: 'left',
  _hover: {
    backgroundColor: 'surfaceHover',
  },
  _focusVisible: {
    outline: '2px solid rgba(0, 212, 255, 0.5)',
    outlineOffset: '1px',
  },
});

interface AssetPlacementMenuProps {
  disabled?: boolean;
  onPlace: (scopeRole: AssetScenePlacementScopeRole) => void;
}

export function AssetPlacementMenu({ disabled = false, onPlace }: AssetPlacementMenuProps) {
  const { t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handlePlace = (scopeRole: AssetScenePlacementScopeRole) => {
    setIsOpen(false);
    onPlace(scopeRole);
  };

  return (
    <div className={placementMenuRootClass} ref={rootRef}>
      <button
        type="button"
        className={primaryButtonClass({ tone: 'accent', size: 'sm' })}
        onClick={() => setIsOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
      >
        {t('assets.apply')}
      </button>
      {isOpen ? (
        <div className={placementMenuClass} role="menu">
          <button
            type="button"
            className={placementMenuItemClass}
            role="menuitem"
            onClick={() => handlePlace('main')}
          >
            {t('assets.applyAsMainMedia')}
          </button>
          <button
            type="button"
            className={placementMenuItemClass}
            role="menuitem"
            onClick={() => handlePlace('overlay')}
          >
            {t('assets.applyAsOverlay')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
