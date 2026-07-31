import { cx } from '@styled-system/css';
import type { ReactNode } from 'react';
import { localeSwitcherBadgeClass } from './styles';

type StatusBadgeProps = {
  children: ReactNode;
  active?: boolean;
  className?: string;
};

export function StatusBadge({ children, active = false, className }: StatusBadgeProps) {
  return <span className={cx(localeSwitcherBadgeClass({ active }), className)}>{children}</span>;
}
