import { Link } from "react-router-dom";
import type { ReactNode } from "react";

interface TopBarProps {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}

export function TopBar({ eyebrow, title, children }: TopBarProps) {
  return (
    <header className="top-bar">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      <div className="top-actions">
        <Link to="/" className="ghost-button">
          <span>Home</span>
        </Link>
        {children}
      </div>
    </header>
  );
}
