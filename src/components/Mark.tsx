import { MARK_DOT, MARK_FRAME_PATH } from '../brand/mark.ts';

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" focusable="false" className="mark">
      <path d={MARK_FRAME_PATH} fill="none" stroke="currentColor" strokeWidth="6.5" strokeLinecap="butt" />
      <circle cx={MARK_DOT.cx} cy={MARK_DOT.cy} r={MARK_DOT.r} fill="var(--accent)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <span className="wordmark-tv">TV</span>{' '}
      <span className="wordmark-livre">LIVRE</span>
    </span>
  );
}
