import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="home-screen">
      <header className="home-header">
        <h1>Page not found</h1>
        <p className="home-sub">That drill path doesn’t exist.</p>
      </header>
      <Link to="/" className="primary-button">
        Back to home
      </Link>
    </div>
  );
}
