import { useEffect, useRef } from 'react';

// Shown only when copyToClipboard() (src/lib/clipboard.ts) couldn't copy
// automatically by any method — a real, visible way to still get the code
// out, instead of the old window.prompt() fallback (which throws outright
// in Electron and isn't guaranteed to render in an Android WebView).
export default function ManualCopyBox({ text, onClose }: { text: string; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="ai-inline-warning" style={{ marginTop: 10 }}>
      <div style={{ marginBottom: 6 }}>자동 복사에 실패했습니다. 아래 코드를 직접 선택해서 복사해주세요.</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          type="text"
          readOnly
          value={text}
          className="select"
          style={{ flex: 1 }}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button className="btn btn-ghost btn-sm" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
