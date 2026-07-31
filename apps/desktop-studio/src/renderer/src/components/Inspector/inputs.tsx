import { css, cva, cx } from '@styled-system/css';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { forwardRef } from 'react';

const inputBaseClass = css({
  width: '100%',
  minWidth: 0,
  borderRadius: 'md',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorder',
  backgroundColor: 'surface',
  color: 'textPrimary',
  fontFamily: 'body',
  fontSize: 'md',
  lineHeight: '1.4',
  paddingX: '2.5',
  paddingY: '1.5',
  transitionProperty: 'background-color, border-color, box-shadow, color, opacity',
  transitionDuration: '150ms',
  _hover: {
    backgroundColor: 'surfaceHover',
    borderColor: 'surfaceStrong',
  },
  _focusVisible: {
    outline: 'none',
    borderColor: 'accent',
    boxShadow: '0 0 0 2px rgba(0, 212, 255, 0.18)',
  },
  _disabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
});

const rangeInputClass = css({
  width: '100%',
  accentColor: 'accent',
  cursor: 'pointer',
});

const textAreaClass = css({
  minHeight: '84px',
  resize: 'vertical',
});

const selectClass = css({
  width: '100%',
  minWidth: 0,
  borderRadius: 'md',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorder',
  backgroundColor: 'surface',
  color: 'textPrimary',
  fontFamily: 'body',
  fontSize: 'md',
  lineHeight: '1.4',
  paddingX: '2.5',
  paddingY: '1.5',
  paddingRight: '7',
  appearance: 'none',
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  transitionProperty: 'background-color, border-color, box-shadow, color, opacity',
  transitionDuration: '150ms',
  _hover: {
    backgroundColor: 'surfaceHover',
    borderColor: 'surfaceStrong',
  },
  _focusVisible: {
    outline: 'none',
    borderColor: 'accent',
    boxShadow: '0 0 0 2px rgba(0, 212, 255, 0.18)',
  },
  _disabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
  '& option': {
    background: '#1a1a22',
    color: 'rgba(255, 255, 245, 0.92)',
  },
});

const fileInputClass = css({
  width: '100%',
  minWidth: 0,
  borderRadius: 'md',
  borderWidth: '1px',
  borderStyle: 'dashed',
  borderColor: 'panelBorder',
  backgroundColor: 'surface',
  color: 'textPrimary',
  fontFamily: 'body',
  fontSize: 'md',
  lineHeight: '1.4',
  paddingX: '2.5',
  paddingY: '2',
  cursor: 'pointer',
  transitionProperty: 'background-color, border-color, box-shadow, color, opacity',
  transitionDuration: '150ms',
  _hover: {
    backgroundColor: 'surfaceHover',
    borderColor: 'surfaceStrong',
  },
  _focusVisible: {
    outline: 'none',
    borderColor: 'accent',
    boxShadow: '0 0 0 2px rgba(0, 212, 255, 0.18)',
  },
  _disabled: {
    opacity: 0.45,
    cursor: 'not-allowed',
  },
});

const colorSwatchClass = css({
  flexShrink: 0,
  width: '32px',
  height: '32px',
  borderRadius: 'md',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorder',
  backgroundColor: 'surface',
  overflow: 'hidden',
  cursor: 'pointer',
});

const toggleGroupClass = css({
  display: 'flex',
  gap: '1',
});

const toggleButtonClass = cva({
  base: {
    flex: 1,
    borderRadius: 'md',
    borderWidth: '1px',
    borderStyle: 'solid',
    fontSize: 'sm',
    fontWeight: '600',
    paddingY: '1',
    paddingX: '2',
    cursor: 'pointer',
    transitionProperty: 'background-color, border-color, color, box-shadow, opacity',
    transitionDuration: '150ms',
  },
  variants: {
    active: {
      true: {
        backgroundColor: 'accentSoft',
        borderColor: 'accent',
        color: 'accentStrong',
      },
      false: {
        backgroundColor: 'surface',
        borderColor: 'panelBorder',
        color: 'textSecondary',
      },
    },
    tone: {
      default: {},
      warning: {},
      danger: {},
    },
  },
  defaultVariants: {
    active: false,
    tone: 'default',
  },
});

type SharedControlProps = ComponentPropsWithoutRef<'input'> & {
  density?: 'full' | 'compact';
};

export const InspectorRangeInput = ({ className, ...props }: SharedControlProps) => (
  <input {...props} type="range" className={cx(rangeInputClass, className)} />
);

export const InspectorNumberInput = ({
  className,
  density = 'full',
  ...props
}: SharedControlProps) => (
  <input
    {...props}
    type="number"
    className={cx(
      inputBaseClass,
      density === 'compact'
        ? css({
            width: '64px',
            paddingX: '2',
            paddingY: '1',
            textAlign: 'right',
          })
        : null,
      className,
    )}
  />
);

export const InspectorTextArea = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'textarea'>) => (
  <textarea {...props} className={cx(inputBaseClass, textAreaClass, className)} />
);

export const InspectorSelect = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<'select'>>(
  function InspectorSelect({ className, ...props }, ref) {
    return <select ref={ref} {...props} className={cx(selectClass, className)} />;
  },
);

export const InspectorFileInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<'input'>>(
  function InspectorFileInput({ className, ...props }, ref) {
    return <input ref={ref} {...props} type="file" className={cx(fileInputClass, className)} />;
  },
);

export const InspectorColorInput = forwardRef<HTMLInputElement, ComponentPropsWithoutRef<'input'>>(
  function InspectorColorInput({ className, ...props }, ref) {
    return <input ref={ref} {...props} type="color" className={cx(colorSwatchClass, className)} />;
  },
);

type ToggleOption<T extends string> = {
  value: T;
  label: ReactNode;
  title?: string;
};

type InspectorToggleGroupProps<T extends string> = {
  value: T;
  options: Array<ToggleOption<T>>;
  onChange: (value: T) => void;
  disabled?: boolean;
  tone?: 'default' | 'warning' | 'danger';
  className?: string;
};

export function InspectorToggleGroup<T extends string>({
  value,
  options,
  onChange,
  disabled = false,
  tone = 'default',
  className,
}: InspectorToggleGroupProps<T>) {
  return (
    <div className={cx(toggleGroupClass, className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={toggleButtonClass({ active, tone })}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const inspectorInputStyles = {
  inputBaseClass,
  rangeInputClass,
  textAreaClass,
  selectClass,
  fileInputClass,
  colorSwatchClass,
  toggleGroupClass,
  toggleButtonClass,
};
