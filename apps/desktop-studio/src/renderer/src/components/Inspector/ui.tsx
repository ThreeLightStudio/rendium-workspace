import { css, cx } from '@styled-system/css';
import type { ReactNode } from 'react';

const sectionClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  padding: '4',
  borderRadius: 'lg',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorderSoft',
  backgroundColor: 'panelBgAlt',
});

const sectionHeaderClass = css({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '2',
  minWidth: '0',
});

const sectionTitleClass = css({
  fontSize: 'sm',
  fontWeight: '600',
  color: 'textMuted',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
});

const sectionBodyClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
});

const fieldClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '2',
});

const rowClass = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '2',
  minWidth: '0',
});

const labelClass = css({
  fontSize: 'sm',
  color: 'textSecondary',
  fontWeight: '500',
});

const helperClass = css({
  fontSize: 'xs',
  color: 'textMuted',
  lineHeight: '1.35',
});

const valueClass = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '20px',
  paddingX: '1.5',
  paddingY: '0.5',
  borderRadius: 'sm',
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: 'panelBorderSoft',
  backgroundColor: 'surface',
  color: 'textPrimary',
  fontFamily: 'mono',
  fontSize: 'sm',
  lineHeight: '1',
  whiteSpace: 'nowrap',
});

type InspectorSectionProps = {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
};

const groupClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
});

const disclosureClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
  paddingTop: '3',
  borderTopWidth: '1px',
  borderTopStyle: 'solid',
  borderTopColor: 'panelBorderSoft',
});

const disclosureButtonClass = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  minWidth: 0,
  padding: '0',
  border: '0',
  background: 'transparent',
  color: 'textMuted',
  cursor: 'pointer',
  textAlign: 'left',
  fontSize: 'xs',
  fontWeight: '600',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
});

const disclosureContentClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '3',
});

export function InspectorSection({ title, children, className }: InspectorSectionProps) {
  return (
    <section className={cx(sectionClass, className)}>
      {title ? <div className={sectionTitleClass}>{title}</div> : null}
      <div className={sectionBodyClass}>{children}</div>
    </section>
  );
}

type InspectorGroupProps = {
  children: ReactNode;
  className?: string;
};

export function InspectorGroup({ children, className }: InspectorGroupProps) {
  return <div className={cx(groupClass, className)}>{children}</div>;
}

type InspectorDisclosureProps = {
  title: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
};

export function InspectorDisclosure({
  title,
  open,
  onToggle,
  children,
  className,
}: InspectorDisclosureProps) {
  return (
    <div className={cx(disclosureClass, className)}>
      <button
        type="button"
        className={disclosureButtonClass}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>{title}</span>
        <span aria-hidden="true">{open ? '-' : '+'}</span>
      </button>
      {open ? <div className={disclosureContentClass}>{children}</div> : null}
    </div>
  );
}

type InspectorFieldProps = {
  label: ReactNode;
  value?: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function InspectorField({ label, value, hint, children, className }: InspectorFieldProps) {
  return (
    <div className={cx(fieldClass, className)}>
      <div className={rowClass}>
        <div className={labelClass}>{label}</div>
        {value !== undefined && value !== null ? <span className={valueClass}>{value}</span> : null}
      </div>
      {children !== undefined && children !== null ? children : null}
      {hint ? <div className={helperClass}>{hint}</div> : null}
    </div>
  );
}

export function InspectorValue({
  children,
  className,
}: { children: ReactNode; className?: string }) {
  return <span className={cx(valueClass, className)}>{children}</span>;
}

export const inspectorStyles = {
  sectionClass,
  sectionHeaderClass,
  sectionTitleClass,
  fieldClass,
  rowClass,
  labelClass,
  helperClass,
  valueClass,
};

export {
  InspectorColorInput,
  InspectorFileInput,
  InspectorNumberInput,
  InspectorRangeInput,
  InspectorSelect,
  InspectorTextArea,
  InspectorToggleGroup,
} from './inputs';
export { inspectorInputStyles } from './inputs';
