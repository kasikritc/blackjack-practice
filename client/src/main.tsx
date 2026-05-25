import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { initTracking } from "./features/analytics/tracker";
import { router } from "./router";
import "./styles/global.css";

// Probe the local API so the analytics tracker knows whether to record.
void initTracking();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(<RouterProvider router={router} />);
