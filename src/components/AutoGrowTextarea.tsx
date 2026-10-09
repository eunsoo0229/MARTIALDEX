import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

// A textarea that grows with its content (up to maxRows, then scrolls
// inside) so a long goal/description is always fully readable — never cut
// off or pushed into a horizontal scroll. Wrapping/overflow rules come from
// the global `textarea` style.
export default function AutoGrowTextarea({ minRows = 3, maxRows = 10, style, value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number; maxRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const line = parseFloat(cs.lineHeight) || 21;
    const chrome = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = 'auto';
    const wanted = el.scrollHeight + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = `${Math.min(maxRows * line + chrome, Math.max(minRows * line + chrome, wanted))}px`;
  }, [value, minRows, maxRows]);
  return <textarea ref={ref} rows={minRows} value={value} style={{ width: '100%', ...style }} {...rest} />;
}
