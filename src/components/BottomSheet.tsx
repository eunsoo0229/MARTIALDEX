import type { ReactNode } from 'react';

/**
 * A single component for both desktop and mobile — reuses the existing
 * .modal-overlay/.modal-panel classes exactly as every other modal in this
 * app does (so it composes with `.ai-modal`-style width modifiers etc.
 * unchanged), just adding `--sheet` modifier classes that only take effect
 * below the 640px breakpoint (see global.css): centered popup on desktop,
 * bottom-anchored slide-up sheet on mobile. Clicking the overlay itself
 * closes it (stopPropagation on the panel, matching every existing modal's
 * convention) — no separate close button is required by this component,
 * callers add their own if they want one.
 */
export default function BottomSheet({
  onClose,
  children,
  className = '',
}: {
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="modal-overlay modal-overlay--sheet" onClick={onClose}>
      <div className={`modal-panel modal-panel--sheet ${className}`} onClick={(e) => e.stopPropagation()}>
        <div className="bottom-sheet-handle" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
