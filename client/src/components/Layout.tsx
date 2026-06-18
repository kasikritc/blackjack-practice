import { Outlet, useLocation } from "react-router-dom";

export function Layout() {
  const location = useLocation();
  const simulator = location.pathname.startsWith("/simulator");
  return (
    <main className={`app${simulator ? " simulator-app" : ""}`}>
      <Outlet />
    </main>
  );
}
