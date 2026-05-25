import os from "node:os";
import { createApp } from "./app.js";
import { DB_PATH, PORT } from "./config.js";
import { cleanupEmptySessions, migrate } from "./db/schema.js";
import { seedStrategyData } from "./domain/strategy.js";

migrate();
seedStrategyData();
cleanupEmptySessions();

const app = createApp();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Blackjack Practice server is running at http://localhost:${PORT}`);
  for (const address of getLanAddresses()) {
    console.log(`Network URL: http://${address}:${PORT}`);
  }
  console.log(`Analytics database: ${DB_PATH}`);
});

function getLanAddresses(): string[] {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter(
      (address): address is os.NetworkInterfaceInfo =>
        Boolean(address) && address!.family === "IPv4" && !address!.internal
    )
    .map(address => address.address);
}
