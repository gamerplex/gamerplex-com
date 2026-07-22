'use client';

// The ONE reserved currency glyph across all of Gamerplex: hexagon = Credits
// (green #14F195), diamond = $GAME (purple #9945FF). These colors are reserved —
// never use them decoratively. Tabular numerals so balances don't jitter.

import type { CSSProperties, ReactNode } from 'react';

const CR = '#14F195';
const GM = '#9945FF';

export function CurrencyPill({
  kind,
  value,
  onClick,
  style,
  suffix,
}: {
  kind: 'credits' | 'game';
  value: number | null;
  onClick?: () => void;
  style?: CSSProperties;
  suffix?: ReactNode;
}) {
  const color = kind === 'credits' ? CR : GM;
  return (
    <span
      onClick={onClick}
      title={kind === 'credits' ? 'Credits — earned free by playing' : '$GAME — top up on Flipcash'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 13,
        fontWeight: 800,
        fontVariantNumeric: 'tabular-nums',
        color,
        padding: '5px 11px',
        borderRadius: 999,
        border: `1px solid ${color}66`,
        background: `${color}14`,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        {kind === 'credits' ? (
          <path d="M12 2 21 7v10l-9 5-9-5V7z" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
        ) : (
          <path d="M12 2 22 12 12 22 2 12z" stroke={color} strokeWidth="2.2" strokeLinejoin="round" />
        )}
      </svg>
      {value == null ? '—' : value.toLocaleString()}
      {suffix}
    </span>
  );
}
