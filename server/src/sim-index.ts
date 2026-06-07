import { createSimulatorApp } from "./simulator/app.js";
import { SIM_DB_PATH, SIM_PORT } from "./simulator/config.js";

const app = createSimulatorApp();
app.listen(SIM_PORT, "0.0.0.0", () => {
  console.log(`Blackjack Simulator service is running at http://localhost:${SIM_PORT}`);
  console.log(`Simulation catalog: ${SIM_DB_PATH}`);
});
