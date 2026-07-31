import { useEffect, useMemo, useRef, useState } from 'react';
import { type Locale, useLocale } from '../../i18n/locale';
import { StatusBadge } from './StatusBadge';
import {
  localeSwitcherOptionClass,
  localeSwitcherPopoverClass,
  localeSwitcherRootClass,
  localeSwitcherTriggerClass,
} from './styles';

export function LocaleSwitcher({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const { locale, setLocale, t } = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const menuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const options = useMemo<Array<{ value: Locale; label: string; shortLabel: string }>>(
    () => [
      { value: 'ko', label: t('app.korean'), shortLabel: '가' },
      { value: 'en', label: t('app.english'), shortLabel: 'EN' },
    ],
    [t],
  );

  const activeOption = options.find((option) => option.value === locale) ?? options[0];

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const activeIndex = options.findIndex((option) => option.value === locale);
    const targetIndex = activeIndex >= 0 ? activeIndex : 0;
    menuItemRefs.current[targetIndex]?.focus();
  }, [isOpen, locale, options]);

  const moveFocus = (delta: number) => {
    const items = menuItemRefs.current.filter(Boolean);
    if (items.length === 0) {
      return;
    }

    const activeElement = document.activeElement as HTMLButtonElement | null;
    const currentIndex = items.findIndex((item) => item === activeElement);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  const handleSelect = (nextLocale: Locale) => {
    setLocale(nextLocale);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={localeSwitcherRootClass}>
      <button
        type="button"
        className={localeSwitcherTriggerClass({ open: isOpen })}
        style={compact ? { minWidth: '36px', height: '30px', paddingInline: '10px' } : undefined}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`${t('app.language')}: ${activeOption.label}`}
        title={`${t('app.language')}: ${activeOption.label}`}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
          }
        }}
      >
        {activeOption.shortLabel}
      </button>

      {isOpen ? (
        <div className={localeSwitcherPopoverClass} role="menu" aria-label={t('app.language')}>
          {options.map((option, index) => {
            const active = option.value === locale;
            return (
              <button
                key={option.value}
                ref={(node) => {
                  menuItemRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={localeSwitcherOptionClass({ active })}
                onClick={() => handleSelect(option.value)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveFocus(1);
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveFocus(-1);
                  } else if (event.key === 'Home') {
                    event.preventDefault();
                    menuItemRefs.current.find(Boolean)?.focus();
                  } else if (event.key === 'End') {
                    event.preventDefault();
                    [...menuItemRefs.current].reverse().find(Boolean)?.focus();
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setIsOpen(false);
                  }
                }}
              >
                <span>{option.label}</span>
                <StatusBadge active={active}>{option.shortLabel}</StatusBadge>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
