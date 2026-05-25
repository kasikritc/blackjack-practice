import { Outlet } from "react-router-dom";

export function Layout() {
  return (
    <main className="app">
      <Outlet />
    </main>
  );
}
