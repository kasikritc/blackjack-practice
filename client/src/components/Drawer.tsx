import { useEffect, type ReactNode } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Right-hand slide-over panel used for settings, analytics and strategy tools. */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  className
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside
      className={`drawer${open ? " open" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden={!open}
    >
      <div className="drawer-inner">
        <header className="drawer-header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close panel">
            ✕
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </div>
    </aside>
  );
}
