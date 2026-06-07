import { Navigate, createBrowserRouter } from "react-router-dom";
import { Layout } from "./components/Layout";
import { SimulatorPlaceholder } from "./features/simulator/SimulatorPlaceholder";
import { StrategyGeneratorPage } from "./features/simulator/StrategyGeneratorPage";
import { DRILL_PATHS } from "./lib/routes";
import { HomePage } from "./pages/HomePage";
import { TablePracticePage } from "./pages/TablePracticePage";
import { FlashCountPage } from "./pages/FlashCountPage";
import { BasicStrategyPage } from "./pages/BasicStrategyPage";
import { DeckCountdownPage } from "./pages/DeckCountdownPage";
import { SimulatorPage } from "./pages/SimulatorPage";
import { NotFoundPage } from "./pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: DRILL_PATHS.table, element: <TablePracticePage /> },
      { path: DRILL_PATHS.flash, element: <FlashCountPage /> },
      { path: DRILL_PATHS.strategy, element: <BasicStrategyPage /> },
      { path: DRILL_PATHS.deckCountdown, element: <DeckCountdownPage /> },
      {
        path: DRILL_PATHS.simulator,
        element: <SimulatorPage />,
        children: [
          { index: true, element: <Navigate to="generator" replace /> },
          { path: "generator", element: <StrategyGeneratorPage /> },
          { path: "evaluator", element: <SimulatorPlaceholder title="Evaluator" /> },
          { path: "runs", element: <SimulatorPlaceholder title="Runs" /> },
          { path: "compare", element: <SimulatorPlaceholder title="Compare" /> }
        ]
      },
      { path: "*", element: <NotFoundPage /> }
    ]
  }
]);
