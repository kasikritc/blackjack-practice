import { createSimulatorApp } from "./simulator/app.js";
import { SIM_DB_PATH, SIM_PORT } from "./simulator/config.js";
import { SimulatorRunner } from "./simulator/runner.js";

const runner = new SimulatorRunner();
const app = createSimulatorApp(runner);
const server = app.listen(SIM_PORT, "0.0.0.0", () => {
  console.log(`Blackjack Simulator service is running at http://localhost:${SIM_PORT}`);
  console.log(`Simulation catalog: ${SIM_DB_PATH}`);
});

let closing = false;
const shutdown = async (signal: string) => {
  if (closing) return;
  closing = true;
  console.log(`Received ${signal}; requeueing active simulation work.`);
  server.close();
  await runner.shutdown();
  process.exit(0);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
