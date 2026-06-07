import type {
  EvaluatorAggregateAnalysis,
  GeneratorEvidenceResponse,
  SimulatorComparison,
  SimulatorComparisonRequest,
  SimulatorEvent,
  SimulatorPresetsResponse,
  SimulatorRunDetail,
  SimulatorRunRequest,
  SimulatorRunsResponse,
  SimulatorServiceHealth,
  SimulatorStrategySourcesResponse,
  SimulatorValidationResponse
} from "@blackjack/shared";

function baseUrl(): string {
  const configured = import.meta.env.VITE_SIM_API_URL as string | undefined;
  if (configured) return configured.replace(/\/$/, "");
  return `${window.location.protocol}//${window.location.hostname}:5175/sim-api`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) {
    let message = `${method} ${path} failed: ${response.status}`;
    try {
      message = (JSON.parse(text) as { error?: string }).error || message;
    } catch {
      // Preserve the status-based message for non-JSON errors.
    }
    throw new Error(message);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export const simulatorApi = {
  health: () => request<SimulatorServiceHealth>("GET", "/health"),
  presets: () => request<SimulatorPresetsResponse>("GET", "/presets"),
  runs: (includeTrashed = false) =>
    request<SimulatorRunsResponse>("GET", `/runs${includeTrashed ? "?trashed=true" : ""}`),
  run: (id: string) => request<SimulatorRunDetail>("GET", `/runs/${encodeURIComponent(id)}`),
  generatorEvidence: (id: string) =>
    request<GeneratorEvidenceResponse>("GET", `/runs/${encodeURIComponent(id)}/generator-evidence`),
  evaluatorAnalysis: (id: string) =>
    request<EvaluatorAggregateAnalysis>(
      "GET",
      `/runs/${encodeURIComponent(id)}/evaluator-analysis`
    ),
  regenerateSummary: (id: string) =>
    request<SimulatorRunDetail>("POST", `/runs/${encodeURIComponent(id)}/summarize`),
  validate: (payload: SimulatorRunRequest) =>
    request<SimulatorValidationResponse>("POST", "/validate", payload),
  submit: (payload: SimulatorRunRequest) => request<SimulatorRunDetail>("POST", "/runs", payload),
  rename: (id: string, name: string) =>
    request<SimulatorRunDetail>("PATCH", `/runs/${encodeURIComponent(id)}`, { name }),
  cancel: (id: string) =>
    request<SimulatorRunDetail>("POST", `/runs/${encodeURIComponent(id)}/cancel`),
  resume: (id: string) =>
    request<SimulatorRunDetail>("POST", `/runs/${encodeURIComponent(id)}/resume`),
  rerun: (id: string) =>
    request<SimulatorRunDetail>("POST", `/runs/${encodeURIComponent(id)}/rerun`),
  trash: (id: string) =>
    request<SimulatorRunDetail>("POST", `/runs/${encodeURIComponent(id)}/trash`),
  restore: (id: string) =>
    request<SimulatorRunDetail>("POST", `/runs/${encodeURIComponent(id)}/restore`),
  purge: (id: string) => request<void>("DELETE", `/runs/${encodeURIComponent(id)}`),
  strategySources: () => request<SimulatorStrategySourcesResponse>("GET", "/strategy-sources"),
  compare: (payload: SimulatorComparisonRequest) =>
    request<SimulatorComparison>("POST", "/compare", payload),
  artifactUrl: (id: string, relativePath: string) =>
    `${baseUrl()}/runs/${encodeURIComponent(id)}/artifacts/${relativePath
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
  eventsUrl: () => `${baseUrl()}/events`
};

export function subscribeSimulatorEvents(
  onEvent: (event: SimulatorEvent) => void,
  onError: () => void
): () => void {
  const source = new EventSource(simulatorApi.eventsUrl());
  source.onmessage = message => {
    try {
      onEvent(JSON.parse(message.data) as SimulatorEvent);
    } catch {
      // Ignore malformed events; polling remains the fallback.
    }
  };
  source.onerror = onError;
  return () => source.close();
}
