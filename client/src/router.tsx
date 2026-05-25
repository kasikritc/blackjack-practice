import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout";
import { DRILL_PATHS } from "./lib/routes";
import { HomePage } from "./pages/HomePage";
import { TablePracticePage } from "./pages/TablePracticePage";
import { FlashCountPage } from "./pages/FlashCountPage";
import { BasicStrategyPage } from "./pages/BasicStrategyPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: DRILL_PATHS.table, element: <TablePracticePage /> },
      { path: DRILL_PATHS.flash, element: <FlashCountPage /> },
      { path: DRILL_PATHS.strategy, element: <BasicStrategyPage /> },
      { path: "*", element: <NotFoundPage /> }
    ]
  }
]);
