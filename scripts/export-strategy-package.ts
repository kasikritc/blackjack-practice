import fs from "node:fs";
import path from "node:path";
import { queryAll } from "../server/src/db/client.js";
import { migrate } from "../server/src/db/schema.js";
import { makeStrategyEvaluationPackage } from "../server/src/domain/evaluationPackage.js";
import { seedStrategyData } from "../server/src/domain/strategy.js";
import { parseSettingsJson } from "../server/src/util.js";
import type { StrategyChart, StrategyRules } from "@blackjack/shared";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const chartId = Number(argument("--chart-id"));
const output = argument("--output");
if (!Number.isInteger(chartId) || chartId <= 0 || !output) {
  console.error("Usage: npm run strategy:export -- --chart-id <id> --output <package.json>");
  process.exit(1);
}

migrate();
seedStrategyData();
const row = queryAll(`
  SELECT c.id, c.name, c.chart_json, p.rules_json
  FROM strategy_charts c
  JOIN strategy_rule_profiles p ON p.id = c.rule_profile_id
  WHERE c.id = ${chartId}
  LIMIT 1
`)[0];
if (!row) {
  console.error(`Strategy chart ${chartId} was not found.`);
  process.exit(1);
}

const packageBody = makeStrategyEvaluationPackage({
  chartId,
  name: String(row.name),
  chart: parseSettingsJson(row.chart_json) as StrategyChart,
  rules: parseSettingsJson(row.rules_json) as StrategyRules
});
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(packageBody, null, 2)}\n`);
console.log(path.resolve(output));
