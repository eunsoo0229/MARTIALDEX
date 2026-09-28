import { useEffect, useState, type CSSProperties } from 'react';

/**
 * A number input that behaves like a text field while the user is typing —
 * the field can be freely cleared to "" and edited digit-by-digit — and
 * only coerces/validates (min/max clamp, revert-if-invalid) once the user
 * leaves the field (blur) or presses Enter. Every gym/routine/curriculum
 * numeric input used to coerce on EVERY keystroke via `Math.max(1, Number(v)
 * || 1)`-style logic; since `Number('')` is 0, that fallback fired the
 * instant a field was cleared, snapping it back to "1" before the user
 * could type a replacement digit — for a value backed directly by
 * persisted state (no intermediate component state), this wasn't just
 * annoying: a per-set reps array keyed to `targetSets` got destructively
 * resized on that transient "1" and never recovered the old values (see
 * gymRoutine/service.ts's resizeReps).
 *
 * `allowEmpty` distinguishes two kinds of fields: one whose stored value is
 * genuinely optional (`number | null`, e.g. 목표 중량 — "선택" placeholder,
 * clearing means "unset") commits `null` on blur; one whose stored type is
 * a plain `number` (세트 수, 휴식 초 — there's no valid "empty" state to
 * store) reverts to the last committed value on blur instead of silently
 * writing something invalid.
 */
export default function NumberField({
  value,
  onCommit,
  min,
  max,
  step,
  placeholder,
  className,
  style,
  allowEmpty = false,
}: {
  value: number | null;
  onCommit: (n: number | null) => void;
  min?: number;
  max?: number;
  step?: number | string;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  allowEmpty?: boolean;
}) {
  const [text, setText] = useState(value != null ? String(value) : '');

  // Re-sync from the external value whenever it changes for a reason other
  // than this field's own edits (routine reloaded from another device,
  // "모든 세트 동일하게", a resize from a sibling field, etc.) — safe to do
  // unconditionally since this only runs when `value` itself changes, not
  // on every render, so it never fights the user's own in-progress typing.
  useEffect(() => {
    setText(value != null ? String(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function commit() {
    if (text.trim() === '') {
      if (allowEmpty) {
        onCommit(null);
      } else {
        setText(value != null ? String(value) : '');
      }
      return;
    }
    let n = Number(text);
    if (!Number.isFinite(n)) {
      setText(value != null ? String(value) : '');
      return;
    }
    if (min != null) n = Math.max(min, n);
    if (max != null) n = Math.min(max, n);
    setText(String(n));
    if (n !== value) onCommit(n);
  }

  return (
    <input
      type="number"
      className={className}
      style={style}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
    />
  );
}
