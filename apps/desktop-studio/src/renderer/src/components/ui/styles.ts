import { css, cva } from '@styled-system/css';

export const surfaceCardClass = css({
  minWidth: 0,
  maxWidth: '100%',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorder',
  backgroundColor: 'panelBg',
  borderRadius: 'lg',
  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.28)',
});

export const surfacePanelClass = css({
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorderSoft',
  backgroundColor: 'panelBgAlt',
  borderRadius: 'lg',
});

export const surfaceMutedClass = css({
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorderSoft',
  backgroundColor: 'surface',
  borderRadius: 'md',
});

export const modalOverlayClass = css({
  position: 'fixed',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  boxSizing: 'border-box',
  overflow: 'auto',
  zIndex: 9999,
  backdropFilter: 'blur(12px)',
  backgroundColor: 'rgba(0, 0, 0, 0.85)',
});

export const modalCardClass = css({
  color: 'textPrimary',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorder',
  borderRadius: '24px',
  boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
  overflow: 'hidden',
});

export const dialogShellClass = css({
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
});

export const sectionLabelClass = css({
  fontSize: 'xs',
  color: 'textMuted',
  marginBottom: '2',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: '600',
});

export const helperTextClass = css({
  fontSize: 'xs',
  color: 'textMuted',
  lineHeight: '1.45',
});

export const primaryButtonClass = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '2',
    borderRadius: 'md',
    borderWidth: '1px',
    borderStyle: 'solid',
    cursor: 'pointer',
    fontWeight: '600',
    transitionProperty: 'background-color, border-color, color, opacity, box-shadow, transform',
    transitionDuration: '150ms',
    fontFamily: 'body',
  },
  variants: {
    tone: {
      default: {
        backgroundColor: 'surface',
        borderColor: 'panelBorder',
        color: 'textPrimary',
      },
      accent: {
        backgroundColor: 'accentSoft',
        borderColor: 'accent',
        color: 'accentStrong',
      },
      danger: {
        backgroundColor: 'rgba(255, 75, 75, 0.12)',
        borderColor: 'rgba(255, 75, 75, 0.35)',
        color: 'danger',
      },
      success: {
        backgroundColor: 'rgba(42, 208, 122, 0.12)',
        borderColor: 'rgba(42, 208, 122, 0.35)',
        color: 'success',
      },
    },
    size: {
      sm: {
        paddingX: '3',
        paddingY: '2',
        fontSize: 'sm',
      },
      md: {
        paddingX: '4',
        paddingY: '3',
        fontSize: 'md',
      },
    },
  },
  defaultVariants: {
    tone: 'default',
    size: 'md',
  },
});

export const segmentedControlClass = css({
  display: 'inline-flex',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorder',
  borderRadius: 'md',
  overflow: 'hidden',
  backgroundColor: 'surface',
});

export const segmentedButtonClass = cva({
  base: {
    border: 'none',
    cursor: 'pointer',
    paddingX: '3',
    paddingY: '2',
    fontSize: 'sm',
    fontWeight: '600',
    transitionProperty: 'background-color, color, opacity',
    transitionDuration: '150ms',
    backgroundColor: 'transparent',
    color: 'textSecondary',
  },
  variants: {
    active: {
      true: {
        backgroundColor: 'accentSoft',
        color: 'accentStrong',
      },
      false: {
        backgroundColor: 'transparent',
        color: 'textSecondary',
      },
    },
  },
  defaultVariants: {
    active: false,
  },
});

export const localeSwitcherRootClass = css({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
});

export const localeSwitcherTriggerClass = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '42px',
    height: '32px',
    paddingX: '3',
    borderRadius: 'md',
    borderWidth: '1px',
    borderStyle: 'solid',
    cursor: 'pointer',
    fontFamily: 'body',
    fontSize: 'sm',
    fontWeight: '700',
    letterSpacing: '0.02em',
    transitionProperty: 'background-color, border-color, color, opacity, transform, box-shadow',
    transitionDuration: '150ms',
    backgroundColor: 'surface',
    borderColor: 'panelBorder',
    color: 'textPrimary',
    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.18)',
  },
  variants: {
    open: {
      true: {
        borderColor: 'accent',
        backgroundColor: 'accentSoft',
        color: 'accentStrong',
      },
      false: {
        borderColor: 'panelBorder',
        backgroundColor: 'surface',
        color: 'textPrimary',
      },
    },
  },
  defaultVariants: {
    open: false,
  },
});

export const localeSwitcherPopoverClass = css({
  position: 'absolute',
  top: 'calc(100% + 8px)',
  right: 0,
  zIndex: 1000,
  minWidth: '132px',
  padding: '6px',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorder',
  borderRadius: '14px',
  backgroundColor: 'panelBg',
  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.35)',
  backdropFilter: 'blur(12px)',
});

export const localeSwitcherOptionClass = cva({
  base: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    border: 'none',
    borderRadius: '10px',
    paddingX: '3',
    paddingY: '2',
    cursor: 'pointer',
    backgroundColor: 'transparent',
    color: 'textSecondary',
    fontFamily: 'body',
    fontSize: 'sm',
    fontWeight: '600',
    transitionProperty: 'background-color, color',
    transitionDuration: '150ms',
    textAlign: 'left',
  },
  variants: {
    active: {
      true: {
        backgroundColor: 'accentSoft',
        color: 'accentStrong',
      },
      false: {
        backgroundColor: 'transparent',
        color: 'textSecondary',
      },
    },
  },
  defaultVariants: {
    active: false,
  },
});

export const localeSwitcherBadgeClass = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '1.8em',
    paddingX: '1.5',
    paddingY: '0.5',
    borderRadius: '999px',
    fontSize: 'xs',
    fontWeight: '700',
    lineHeight: '1',
    backgroundColor: 'surface',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'panelBorderSoft',
    color: 'textSecondary',
  },
  variants: {
    active: {
      true: {
        backgroundColor: 'accentWeak',
        borderColor: 'accent',
        color: 'accentStrong',
      },
      false: {},
    },
  },
  defaultVariants: {
    active: false,
  },
});

export const chipClass = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '999px',
    borderWidth: '1px',
    borderStyle: 'solid',
    paddingX: '2.5',
    paddingY: '1',
    fontSize: 'xs',
    fontWeight: '600',
    whiteSpace: 'nowrap',
  },
  variants: {
    tone: {
      neutral: {
        borderColor: 'panelBorderSoft',
        backgroundColor: 'surface',
        color: 'textSecondary',
      },
      accent: {
        borderColor: 'accent',
        backgroundColor: 'accentWeak',
        color: 'accentStrong',
      },
      danger: {
        borderColor: 'rgba(255, 75, 75, 0.3)',
        backgroundColor: 'rgba(255, 75, 75, 0.12)',
        color: 'danger',
      },
    },
  },
  defaultVariants: {
    tone: 'neutral',
  },
});

export const settingsButtonClass = cva({
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 'md',
    borderWidth: '1px',
    borderStyle: 'solid',
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color, color, opacity, box-shadow',
    transitionDuration: '150ms',
    fontFamily: 'body',
  },
  variants: {
    active: {
      true: {
        backgroundColor: 'accentWeak',
        borderColor: 'accent',
        color: 'accentStrong',
      },
      false: {
        backgroundColor: 'surface',
        borderColor: 'panelBorder',
        color: 'textPrimary',
      },
    },
  },
  defaultVariants: {
    active: false,
  },
});
