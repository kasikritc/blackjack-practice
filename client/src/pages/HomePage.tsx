import { Link } from "react-router-dom";
import { DRILLS } from "../lib/routes";

export function HomePage() {
  return (
    <div className="home-screen">
      <header className="home-header">
        <p className="eyebrow">Hi-Lo Practice</p>
        <h1>Blackjack Counting Trainer</h1>
        <p className="home-subtitle">Pick how you want to practice today.</p>
      </header>
      <div className="mode-grid">
        {DRILLS.map(drill => (
          <Link key={drill.mode} to={drill.path} className="mode-card">
            <span className="mode-card-eyebrow">{drill.tagline}</span>
            <strong>{drill.title}</strong>
            <span className="mode-card-desc">{drill.description}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
