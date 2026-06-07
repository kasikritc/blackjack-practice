import { useCallback, useEffect, useState } from "react";
import type {
  SimulatorEvent,
  SimulatorRunListItem,
  SimulatorServiceHealth
} from "@blackjack/shared";
import { Link, NavLink, Outlet } from "react-router-dom";
import { simulatorApi, subscribeSimulatorEvents } from "./api";

function applyEvent(
  event: SimulatorEvent,
  setRuns: React.Dispatch<React.SetStateAction<SimulatorRunListItem[]>>
) {
  if (event.type === "snapshot") setRuns(event.runs);
  if (event.type === "run")
    setRuns(current => [event.run, ...current.filter(run => run.id !== event.run.id)]);
  if (event.type === "progress")
    setRuns(current =>
      current.map(run => (run.id === event.runId ? { ...run, progress: event.progress } : run))
    );
}

export function SimulatorWorkspace() {
  const [health, setHealth] = useState<SimulatorServiceHealth | null>(null);
  const [runs, setRuns] = useState<SimulatorRunListItem[]>([]);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextHealth, response] = await Promise.all([
        simulatorApi.health(),
        simulatorApi.runs()
      ]);
      setHealth(nextHealth);
      setRuns(response.runs);
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeSimulatorEvents(
      event => applyEvent(event, setRuns),
      () => {
        setOffline(true);
      }
    );
    const polling = window.setInterval(() => void refresh(), 5000);
    return () => {
      unsubscribe();
      window.clearInterval(polling);
    };
  }, [refresh]);

  const active = runs.find(run => run.status === "running" || run.status === "cancelling");
  const queued = runs.filter(run => run.status === "queued").length;

  return (
    <div className="simulator-workspace">
      <header className="simulator-header">
        <div>
          <Link to="/" className="simulator-back-link">
            ← Practice home
          </Link>
          <p className="eyebrow">Analytical workstation</p>
          <h1>Simulator</h1>
        </div>
        <div className={`simulator-service-status${offline ? " is-offline" : ""}`}>
          <span className="simulator-status-dot" />
          <div>
            <strong>
              {offline ? "Service offline" : active ? "Simulation running" : "Service ready"}
            </strong>
            <small>
              {offline
                ? "Start npm run dev:sim"
                : active
                  ? `${active.name} · ${queued} queued`
                  : `${health?.machine.cpuCores || "?"} CPU cores · ${queued} queued`}
            </small>
          </div>
        </div>
      </header>

      <nav className="simulator-nav" aria-label="Simulator sections">
        <NavLink to="/simulator/generator">Strategy Optimizer</NavLink>
        <NavLink to="/simulator/evaluator">Performance Evaluator</NavLink>
        <NavLink to="/simulator/runs">Runs</NavLink>
        <NavLink to="/simulator/compare">Compare</NavLink>
      </nav>

      {offline ? (
        <section className="simulator-offline-panel">
          <div>
            <span className="eyebrow">Dedicated process required</span>
            <h2>Start the simulation service</h2>
            <p>
              The practice server remains independent. Run <code>npm run dev:sim</code> for
              development or <code>npm run start:sim</code> after building.
            </p>
          </div>
          <button className="ghost-button" onClick={() => void refresh()}>
            Retry connection
          </button>
        </section>
      ) : (
        <Outlet context={{ runs, refresh }} />
      )}
    </div>
  );
}

export interface SimulatorOutletContext {
  runs: SimulatorRunListItem[];
  refresh: () => Promise<void>;
}
