import { isChinese, t } from "./locale.mjs?v=1";

const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_CODEX_STREAM_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_STREAM_LINE_CHARS = 2 * 1024 * 1024;
const MAX_SOURCE_FILES = 200;
const MAX_RECORDS = 100_000;
const MAX_GROUPS_FOR_CHECKOUT = 60;
const MIN_REPLAY_RECORDS = 3;
const MIN_REPLAY_TOKENS = 10_000;
const MIN_CACHE_EVIDENCE_RECORDS = 3;
const MIN_CACHE_EVIDENCE_INPUT_TOKENS = 100_000;
const MAX_LOW_CACHE_READ_RATIO = 0.05;
const MIN_PERIODIC_SPEND_RECORDS = 4;
const MIN_PERIODIC_INTERVAL_MS = 5 * 60 * 1000;
const MAX_PERIODIC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MIN_PERIODIC_INTERVAL_MATCH_RATIO = 0.75;
const MAX_PERIODIC_VALUE_DEVIATION = 0.15;
const INPUT_FORMATS = new Set(["csv", "json", "jsonl"]);
const TRANSACTION_HASH_PATTERN = /^0x[a-f0-9]{64}$/i;
const REPORT_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function selectCodexRolloutFiles(files, options = {}) {
  const maxFiles = Number.isInteger(options.maxFiles)
    ? Math.max(1, Math.min(options.maxFiles, MAX_SOURCE_FILES))
    : MAX_SOURCE_FILES;
  const maxBytes = Number.isInteger(options.maxBytes)
    ? Math.max(1, Math.min(options.maxBytes, MAX_CODEX_STREAM_BYTES))
    : MAX_CODEX_STREAM_BYTES;
  const listed = Array.from(files || []);
  const nameIncludes = String(options.nameIncludes || "").trim().toLowerCase();
  const skipped = {
    unsupported: 0,
    empty: 0,
    oversized: 0,
    budget: 0
  };
  const candidates = [];

  for (const file of listed) {
    const name = String(file?.name || "");
    const size = Number(file?.size);
    if (!/\.(?:jsonl|ndjson)$/i.test(name)) {
      skipped.unsupported += 1;
      continue;
    }
    if (!Number.isFinite(size) || size <= 0) {
      skipped.empty += 1;
      continue;
    }
    if (size > maxBytes) {
      skipped.oversized += 1;
      continue;
    }
    candidates.push(file);
  }

  const searchableName = (file) =>
    String(file?.webkitRelativePath || file?.name || "").toLowerCase();
  const matches = nameIncludes
    ? candidates.filter((file) => searchableName(file).includes(nameIncludes))
    : [];
  if (nameIncludes && !matches.length) {
    return {
      files: [],
      totalBytes: 0,
      discoveredFiles: listed.length,
      compatibleFiles: candidates.length,
      matchedFiles: 0,
      skipped
    };
  }
  const referenceModified = matches.length
    ? Math.max(...matches.map((file) => Number(file?.lastModified || 0)))
    : null;
  candidates.sort((left, right) => {
    if (nameIncludes) {
      const leftMatch = searchableName(left).includes(nameIncludes);
      const rightMatch = searchableName(right).includes(nameIncludes);
      if (leftMatch !== rightMatch) return leftMatch ? -1 : 1;
      const leftDistance = Math.abs(Number(left?.lastModified || 0) - referenceModified);
      const rightDistance = Math.abs(Number(right?.lastModified || 0) - referenceModified);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    }
    const modified = Number(right?.lastModified || 0) - Number(left?.lastModified || 0);
    return modified || String(left?.name || "").localeCompare(String(right?.name || ""));
  });

  const selected = [];
  let totalBytes = 0;
  for (const file of candidates) {
    if (selected.length >= maxFiles || totalBytes + file.size > maxBytes) {
      skipped.budget += 1;
      continue;
    }
    selected.push(file);
    totalBytes += file.size;
  }

  return {
    files: selected,
    totalBytes,
    discoveredFiles: listed.length,
    compatibleFiles: candidates.length,
    matchedFiles: matches.length,
    skipped
  };
}

const FIELD_PATHS = {
  provider: [
    "provider",
    "Provider",
    "provider_name",
    "providerName",
    "resolved_provider",
    "resolvedProvider",
    "message.provider",
    "metadata.provider",
    "response.provider",
    "data.provider",
    "data.provider_name",
    "data.providerName",
    "data.resolved_provider",
    "data.resolvedProvider"
  ],
  model: [
    "actual_model",
    "actualModel",
    "resolved_model",
    "resolvedModel",
    "model",
    "Model",
    "model_name",
    "modelName",
    "message.model",
    "response.model",
    "metadata.model",
    "data.actual_model",
    "data.actualModel",
    "data.resolved_model",
    "data.resolvedModel",
    "data.model",
    "data.model_name",
    "data.modelName"
  ],
  configuredModel: [
    "configured_model",
    "configuredModel",
    "requested_model",
    "requestedModel",
    "request.model",
    "message.configured_model",
    "message.configuredModel",
    "message.requestedModel",
    "metadata.configured_model",
    "data.configured_model",
    "data.configuredModel",
    "data.requested_model",
    "data.requestedModel"
  ],
  agent: [
    "agent_id",
    "agentId",
    "agent",
    "agent_name",
    "agentName",
    "message.agent_id",
    "message.agentId",
    "metadata.agent_id",
    "metadata.agentId",
    "data.agent_id",
    "data.agentId",
    "data.agent",
    "requestMetadata.openclaw:agentId"
  ],
  feature: [
    "feature",
    "feature_id",
    "featureId",
    "workflow",
    "workflow_id",
    "workflowId",
    "endpoint",
    "route",
    "origin",
    "app_id",
    "appId",
    "Source",
    "message.feature",
    "message.workflow",
    "metadata.feature",
    "data.feature",
    "data.workflow",
    "data.endpoint",
    "data.route",
    "data.origin",
    "data.app_id",
    "data.appId"
  ],
  status: [
    "status",
    "state",
    "finish_reason",
    "finishReason",
    "message.stopReason",
    "message.stop_reason",
    "response.status",
    "data.status",
    "data.state",
    "data.finish_reason",
    "data.finishReason",
    "data.native_finish_reason",
    "data.nativeFinishReason"
  ],
  inputTokens: [
    "input_tokens",
    "in",
    "In",
    "inputTokens",
    "prompt_tokens",
    "promptTokens",
    "prompt_token_count",
    "promptTokenCount",
    "usage.input_tokens",
    "usage.inputTokens",
    "totalUsage.inputTokens",
    "response.usage.input_tokens",
    "response.usage.inputTokens",
    "response.totalUsage.inputTokens",
    "usage.prompt_tokens",
    "usage.promptTokens",
    "usage.prompt_token_count",
    "usage.promptTokenCount",
    "usageMetadata.promptTokenCount",
    "response.usageMetadata.promptTokenCount",
    "message.usageMetadata.promptTokenCount",
    "message.usage.input",
    "message.usage.input_tokens",
    "message.usage.inputTokens",
    "message.totalUsage.inputTokens",
    "native_tokens_prompt",
    "tokens_prompt",
    "data.native_tokens_prompt",
    "data.tokens_prompt",
    "data.input_tokens",
    "data.inputTokens",
    "data.prompt_tokens",
    "data.promptTokens",
    "data.usage.input_tokens",
    "data.usage.inputTokens",
    "data.usage.prompt_tokens",
    "data.usage.promptTokens",
    "data.totalUsage.inputTokens"
  ],
  outputTokens: [
    "output_tokens",
    "out",
    "Out",
    "outputTokens",
    "completion_tokens",
    "completionTokens",
    "candidates_token_count",
    "candidatesTokenCount",
    "usage.output_tokens",
    "usage.outputTokens",
    "totalUsage.outputTokens",
    "response.usage.output_tokens",
    "response.usage.outputTokens",
    "response.totalUsage.outputTokens",
    "usage.completion_tokens",
    "usage.completionTokens",
    "usage.candidates_token_count",
    "usage.candidatesTokenCount",
    "usageMetadata.candidatesTokenCount",
    "response.usageMetadata.candidatesTokenCount",
    "message.usageMetadata.candidatesTokenCount",
    "message.usage.output",
    "message.usage.output_tokens",
    "message.usage.outputTokens",
    "message.totalUsage.outputTokens",
    "native_tokens_completion",
    "tokens_completion",
    "data.native_tokens_completion",
    "data.tokens_completion",
    "data.output_tokens",
    "data.outputTokens",
    "data.completion_tokens",
    "data.completionTokens",
    "data.usage.output_tokens",
    "data.usage.outputTokens",
    "data.usage.completion_tokens",
    "data.usage.completionTokens",
    "data.totalUsage.outputTokens",
    "outputTokenDetails.textTokens",
    "usage.outputTokenDetails.textTokens",
    "totalUsage.outputTokenDetails.textTokens",
    "response.usage.outputTokenDetails.textTokens",
    "response.totalUsage.outputTokenDetails.textTokens",
    "message.usage.outputTokenDetails.textTokens",
    "message.totalUsage.outputTokenDetails.textTokens",
    "data.usage.outputTokenDetails.textTokens",
    "data.totalUsage.outputTokenDetails.textTokens"
  ],
  reasoningTokens: [
    "reasoning_tokens",
    "reasoningTokens",
    "reasoning_output_tokens",
    "reasoningOutputTokens",
    "usage.reasoning_tokens",
    "usage.reasoningTokens",
    "usage.reasoning_output_tokens",
    "usage.reasoningOutputTokens",
    "outputTokenDetails.reasoningTokens",
    "usage.outputTokenDetails.reasoningTokens",
    "totalUsage.reasoningTokens",
    "totalUsage.outputTokenDetails.reasoningTokens",
    "response.usage.reasoningTokens",
    "response.usage.outputTokenDetails.reasoningTokens",
    "response.totalUsage.reasoningTokens",
    "response.totalUsage.outputTokenDetails.reasoningTokens",
    "message.usage.reasoningTokens",
    "message.usage.outputTokenDetails.reasoningTokens",
    "message.totalUsage.reasoningTokens",
    "message.totalUsage.outputTokenDetails.reasoningTokens",
    "thoughts_token_count",
    "thoughtsTokenCount",
    "usage.thoughts_token_count",
    "usage.thoughtsTokenCount",
    "usageMetadata.thoughtsTokenCount",
    "response.usageMetadata.thoughtsTokenCount",
    "message.usageMetadata.thoughtsTokenCount",
    "native_tokens_reasoning",
    "data.native_tokens_reasoning",
    "data.reasoning_tokens",
    "data.reasoningTokens",
    "data.usage.reasoning_tokens",
    "data.usage.reasoningTokens",
    "data.usage.outputTokenDetails.reasoningTokens",
    "data.totalUsage.reasoningTokens",
    "data.totalUsage.outputTokenDetails.reasoningTokens"
  ],
  toolUsePromptTokens: [
    "tool_use_prompt_token_count",
    "toolUsePromptTokenCount",
    "usage.tool_use_prompt_token_count",
    "usage.toolUsePromptTokenCount",
    "usageMetadata.toolUsePromptTokenCount",
    "response.usageMetadata.toolUsePromptTokenCount",
    "message.usageMetadata.toolUsePromptTokenCount"
  ],
  cachedTokens: [
    "cached_input_tokens",
    "cachedInputTokens",
    "cached_tokens",
    "cachedTokens",
    "cache_read_input_tokens",
    "cacheReadInputTokens",
    "cache_read_tokens",
    "cache_read",
    "cached_content_token_count",
    "cachedContentTokenCount",
    "usage.cached_tokens",
    "usage.cachedTokens",
    "usage.cached_input_tokens",
    "usage.cachedInputTokens",
    "usage.cache_read_input_tokens",
    "usage.cacheRead",
    "inputTokenDetails.cacheReadTokens",
    "usage.inputTokenDetails.cacheReadTokens",
    "totalUsage.cachedInputTokens",
    "totalUsage.inputTokenDetails.cacheReadTokens",
    "response.usage.cachedInputTokens",
    "response.usage.cache_read_input_tokens",
    "response.usage.inputTokenDetails.cacheReadTokens",
    "response.totalUsage.cachedInputTokens",
    "response.totalUsage.inputTokenDetails.cacheReadTokens",
    "usage.cached_content_token_count",
    "usage.cachedContentTokenCount",
    "usageMetadata.cachedContentTokenCount",
    "response.usageMetadata.cachedContentTokenCount",
    "message.usageMetadata.cachedContentTokenCount",
    "usage.input_tokens_details.cached_tokens",
    "message.usage.cacheRead",
    "message.usage.cache_read",
    "message.usage.cache_read_input_tokens",
    "message.usage.cached_tokens",
    "message.usage.cachedInputTokens",
    "message.usage.inputTokenDetails.cacheReadTokens",
    "message.totalUsage.cachedInputTokens",
    "message.totalUsage.inputTokenDetails.cacheReadTokens",
    "native_tokens_cached",
    "data.native_tokens_cached",
    "data.cached_input_tokens",
    "data.cachedInputTokens",
    "data.cached_tokens",
    "data.cachedTokens",
    "data.usage.cached_tokens",
    "data.usage.cachedTokens",
    "data.usage.cached_input_tokens",
    "data.usage.cachedInputTokens",
    "data.usage.inputTokenDetails.cacheReadTokens",
    "data.totalUsage.cachedInputTokens",
    "data.totalUsage.inputTokenDetails.cacheReadTokens"
  ],
  cacheWriteTokens: [
    "cache_write_input_tokens",
    "cacheWriteInputTokens",
    "cache_creation_input_tokens",
    "cache_creation",
    "cacheCreationInputTokens",
    "usage.cache_write_input_tokens",
    "usage.cache_creation_input_tokens",
    "usage.cacheWrite",
    "inputTokenDetails.cacheWriteTokens",
    "usage.inputTokenDetails.cacheWriteTokens",
    "totalUsage.inputTokenDetails.cacheWriteTokens",
    "response.usage.inputTokenDetails.cacheWriteTokens",
    "response.usage.cache_creation_input_tokens",
    "response.totalUsage.inputTokenDetails.cacheWriteTokens",
    "message.usage.cacheWrite",
    "message.usage.cache_write",
    "message.usage.cache_creation_input_tokens",
    "message.usage.inputTokenDetails.cacheWriteTokens",
    "message.totalUsage.inputTokenDetails.cacheWriteTokens",
    "data.cache_write_input_tokens",
    "data.cacheWriteInputTokens",
    "data.cache_creation_input_tokens",
    "data.cacheCreationInputTokens",
    "data.usage.cache_write_input_tokens",
    "data.usage.cache_creation_input_tokens",
    "data.usage.inputTokenDetails.cacheWriteTokens",
    "data.totalUsage.inputTokenDetails.cacheWriteTokens"
  ],
  costUsd: [
    "cost_usd",
    "observed_cost_usd",
    "Cost",
    "costUsd",
    "total_cost",
    "totalCost",
    "response_cost",
    "responseCost",
    "usage.cost.total",
    "usage.cost",
    "usage.cost_usd",
    "response.usage.cost.total",
    "response.usage.cost",
    "response.usage.cost_usd",
    "message.usage.cost.total",
    "message.usage.cost_usd",
    "metadata.cost_usd",
    "data.cost_usd",
    "data.observed_cost_usd",
    "data.costUsd",
    "data.total_cost",
    "data.totalCost",
    "data.response_cost",
    "data.responseCost",
    "data.usage.cost.total",
    "data.usage.cost",
    "data.usage.cost_usd"
  ],
  costEvaluable: [
    "cost_evaluable",
    "costEvaluable",
    "metadata.cost_evaluable",
    "metadata.costEvaluable",
    "data.cost_evaluable",
    "data.costEvaluable"
  ],
  inputRate: [
    "input_rate_per_million",
    "inputRatePerMillion",
    "pricing.input_per_million"
  ],
  outputRate: [
    "output_rate_per_million",
    "outputRatePerMillion",
    "pricing.output_per_million"
  ],
  cachedRate: [
    "cached_rate_per_million",
    "cache_read_rate_per_million",
    "cachedRatePerMillion",
    "pricing.cached_per_million"
  ],
  cacheWriteRate: [
    "cache_write_rate_per_million",
    "cacheWriteRatePerMillion",
    "pricing.cache_write_per_million"
  ],
  usageIdentity: [
    "attempt_id",
    "attemptId",
    "response_id",
    "responseId",
    "completion_id",
    "completionId",
    "generation_id",
    "generationId",
    "event_id",
    "eventId",
    "message.id",
    "response.id",
    "metadata.attempt_id",
    "metadata.attemptId",
    "metadata.response_id",
    "metadata.responseId",
    "data.attempt_id",
    "data.attemptId",
    "data.response_id",
    "data.responseId",
    "data.completion_id",
    "data.completionId",
    "data.generation_id",
    "data.generationId"
  ],
  timestamp: [
    "timestamp",
    "Time",
    "created_at",
    "createdAt",
    "started_at",
    "startedAt",
    "time",
    "message.timestamp",
    "metadata.timestamp",
    "data.timestamp",
    "data.created_at",
    "data.createdAt",
    "data.started_at",
    "data.startedAt"
  ]
};

const SAMPLE_RECORDS = [
  {
    type: "session",
    version: 3,
    id: "sample-session",
    timestamp: "2026-07-30T00:00:00Z",
    cwd: "/redacted"
  },
  {
    type: "model_change",
    id: "sample-model-change",
    parentId: null,
    timestamp: "2026-07-30T00:00:01Z",
    provider: "google",
    modelId: "gemini-2.5-pro"
  },
  {
    type: "message",
    id: "sample-tool-use",
    parentId: "sample-model-change",
    timestamp: "2026-07-30T00:04:00Z",
    message: {
      role: "assistant",
      provider: "google",
      model: "gemini-3.1-pro-preview",
      agentId: "research",
      workflow: "web_research",
      stopReason: "toolUse",
      content: [{ type: "toolUse", name: "exec", input: { command: "redacted" } }],
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: { total: 0 }
      }
    }
  },
  {
    type: "message",
    id: "sample-failed-turn",
    parentId: "sample-tool-use",
    timestamp: "2026-07-30T00:04:00Z",
    message: {
      role: "assistant",
      provider: "google",
      model: "gemini-3.1-pro-preview",
      agentId: "research",
      workflow: "web_research",
      stopReason: "error",
      content: [{ type: "text", text: "redacted" }],
      usage: {
        input: 4200,
        output: 310,
        cacheRead: 1200,
        cacheWrite: 0,
        cost: { total: 0.0184 }
      }
    }
  },
  {
    type: "message",
    id: "sample-final-turn",
    parentId: "sample-failed-turn",
    timestamp: "2026-07-30T00:10:00Z",
    message: {
      role: "assistant",
      provider: "google",
      model: "gemini-3.1-pro-preview",
      agentId: "support",
      workflow: "telegram_reply",
      stopReason: "stop",
      content: [{ type: "text", text: "redacted" }],
      usage: {
        input: 12200,
        output: 1600,
        cacheRead: 8000,
        cacheWrite: 2200,
        cost: { total: 0.087 }
      }
    }
  }
];

const PROVIDER_CACHE_SAMPLE_RECORDS = [
  "route-a",
  "route-b",
  "route-c",
  "route-d",
  "route-e"
].map((provider, index) => ({
  data: {
    id: `sample-generation-${index + 1}`,
    provider_name: provider,
    model: "anthropic/long-context-model",
    agent_id: "coding-agent",
    app_id: "tool-loop",
    native_tokens_prompt: 1_000_000,
    native_tokens_completion: 120,
    native_tokens_cached: 0,
    total_cost: 11.25,
    finish_reason: "stop",
    created_at: new Date(Date.parse("2026-07-30T00:00:00Z") + index * 60_000).toISOString()
  }
}));

const CLINE_CACHE_MISS_SAMPLE_RECORDS = [
  ["2026-07-31T08:00:00Z", 300_000, 620, 0.05],
  ["2026-07-31T08:05:00Z", 300_000, 540, 0.05],
  ["2026-07-31T08:10:00Z", 300_000, 510, 0.05]
].map(([timestamp, inputTokens, outputTokens, costUsd], index) => ({
  id: `sample-cline-cache-control-${index + 1}`,
  timestamp,
  provider: "cline",
  model: "deepseek-flash-low",
  agent_id: "coding-agent",
  feature: "bounded-summary-control",
  status: "succeeded",
  input_tokens: inputTokens,
  output_tokens: outputTokens,
  cached_tokens: 0,
  cost_usd: costUsd
}));

const SPARKY_GEMINI_CACHE_SAMPLE_RECORDS = [
  {
    timestamp: "2026-07-31T22:00:00Z",
    provider: "google",
    model: "gemini-2.5-flash",
    agent_id: "fitness-agent",
    feature: "tool-result-cache-control",
    status: "succeeded",
    usageMetadata: {
      promptTokenCount: 6188,
      candidatesTokenCount: 163,
      totalTokenCount: 7157,
      thoughtsTokenCount: 806
    }
  },
  {
    timestamp: "2026-07-31T22:01:00Z",
    provider: "google",
    model: "gemini-2.5-flash",
    agent_id: "fitness-agent",
    feature: "tool-result-cache-control",
    status: "succeeded",
    usageMetadata: {
      promptTokenCount: 8459,
      candidatesTokenCount: 478,
      totalTokenCount: 10774,
      thoughtsTokenCount: 1837
    }
  },
  {
    timestamp: "2026-07-31T22:02:00Z",
    provider: "google",
    model: "gemini-2.5-flash",
    agent_id: "fitness-agent",
    feature: "tool-result-cache-control",
    status: "succeeded",
    usageMetadata: {
      promptTokenCount: 11077,
      cachedContentTokenCount: 8077,
      cacheTokensDetails: [{ modality: "TEXT", tokenCount: 8077 }]
    }
  }
];

const VERCEL_GATEWAY_REASONING_SAMPLE_RECORDS = [
  ["2026-08-02T00:00:00Z", "wafer-ai", 5_600, 900, 640],
  ["2026-08-02T00:01:00Z", "fireworks-ai", 6_200, 1_100, 780],
  ["2026-08-02T00:02:00Z", "wafer-ai", 6_800, 1_300, 920]
].map(([timestamp, provider, inputTokens, outputTokens, reasoningTokens], index) => ({
  id: `sample-reasoning-disabled-step-${index + 1}`,
  timestamp,
  provider,
  model: "zai/glm-5.2-fast",
  configured_model: "zai/glm-5.2-fast",
  agent_id: "multi-step-agent",
  feature: "reasoning-disabled-control",
  status: "succeeded",
  requested_reasoning: "none",
  usage: {
    inputTokens,
    inputTokenDetails: {
      noCacheTokens: inputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0
    },
    outputTokens,
    outputTokenDetails: {
      textTokens: outputTokens - reasoningTokens,
      reasoningTokens
    }
  }
}));

const CLAUDE_BACKGROUND_RUNAWAY_SAMPLE_RECORDS = [
  122_600,
  130_300,
  102_900,
  71_800,
  118_500,
  98_300,
  126_500,
  76_000,
  129_700,
  99_300
].map((inputTokens, index) => ({
  type: "assistant",
  uuid: `sample-claude-background-${index + 1}`,
  requestId: `sample-background-request-${index + 1}`,
  sessionId: "sample-runaway-background-session",
  isSidechain: true,
  timestamp: new Date(
    Date.parse("2026-07-30T00:00:00Z") + index * 60 * 60 * 1000
  ).toISOString(),
  message: {
    id: `sample-background-message-${index + 1}`,
    role: "assistant",
    model: "unknown-background-model",
    stop_reason: "end_turn",
    content: [{ type: "text", text: "redacted" }],
    usage: {
      input_tokens: inputTokens,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 0
    }
  }
}));

const PERIODIC_SPEND_SAMPLE_RECORDS = [
  ["2026-07-08T14:02:00Z", 63_981, 20, 0.2001],
  ["2026-07-08T14:32:00Z", 64_039, 31, 0.2004],
  ["2026-07-08T15:02:00Z", 64_108, 133, 0.2013],
  ["2026-07-08T15:32:00Z", 64_280, 83, 0.2015]
].map(([timestamp, inputTokens, outputTokens, costUsd], index) => ({
  id: `sample-background-charge-${index + 1}`,
  timestamp,
  provider: "opencode-zen",
  model: "qwen3.7-max",
  agent_id: "background-runner",
  feature: "go-plan-scheduled-call",
  status: "succeeded",
  input_tokens: inputTokens,
  output_tokens: outputTokens,
  cost_usd: costUsd
}));

const OPENCODE_FILTERED_SPEND_SAMPLE_RECORDS = [
  ["2026-07-05T21:00:00Z", 534_929, 1, 6.69],
  ["2026-07-05T21:01:00Z", 534_963, 1, 6.69],
  ["2026-07-05T21:02:00Z", 534_982, 5, 6.68]
].map(([timestamp, inputTokens, outputTokens, costUsd], index) => ({
  id: `sample-opencode-filtered-spend-${index + 1}`,
  timestamp,
  provider: "opencode-zen",
  model: "claude-fable-5",
  agent_id: "redacted-agent",
  feature: "content-filtered-response",
  status: "content-filter",
  input_tokens: inputTokens,
  output_tokens: outputTokens,
  cost_usd: costUsd
}));

const OPENCLAW_UNEXPECTED_MODEL_SAMPLE_RECORDS = [
  {
    type: "session",
    version: 3,
    id: "sample-openclaw-session",
    timestamp: "2026-07-23T00:00:00Z",
    cwd: "/redacted"
  },
  {
    type: "model_change",
    id: "sample-openclaw-model-change",
    parentId: null,
    timestamp: "2026-07-23T00:00:01Z",
    provider: "anthropic",
    modelId: "claude-sonnet-4-6"
  },
  ...[
    ["2026-07-23T00:02:00Z", 31_200, 1_450],
    ["2026-07-23T00:19:00Z", 42_800, 1_120],
    ["2026-07-23T01:07:00Z", 55_400, 1_810],
    ["2026-07-23T02:34:00Z", 47_900, 1_330],
    ["2026-07-23T02:51:00Z", 62_100, 1_680],
    ["2026-07-23T04:21:00Z", 58_700, 1_590]
  ].map(([timestamp, input, output], index) => ({
    type: "message",
    id: `sample-openclaw-opus-${index + 1}`,
    parentId: index === 0
      ? "sample-openclaw-model-change"
      : `sample-openclaw-opus-${index}`,
    timestamp,
    message: {
      role: "assistant",
      provider: "anthropic",
      model: "claude-opus-4-7",
      agentId: "redacted-agent",
      workflow: "long-running-task",
      stopReason: "stop",
      content: [{ type: "text", text: "redacted" }],
      usage: {
        input,
        output,
        cacheRead: 0,
        cacheWrite: 0,
        cost: { total: 0.435 }
      }
    }
  }))
];

const CACHE_INCIDENT_CAMPAIGNS = new Set([
  "bifrost_bedrock_cache_5629",
  "cline_openrouter_cache_cost",
  "portkey_vertex_cache_1579"
]);

const CLINE_CACHE_MISS_CAMPAIGNS = new Set([
  "cline_cache_miss_12785"
]);

const SPARKY_GEMINI_CACHE_CAMPAIGNS = new Set([
  "sparky-gemini-context-cost-1987",
  "sparky_gemini_context_cost_1987"
]);

const PERIODIC_SPEND_CAMPAIGNS = new Set([
  "opencode_recurring_billing_36399"
]);

const OPENCODE_FILTERED_SPEND_CAMPAIGNS = new Set([
  "opencode_content_filter_spend_35475"
]);

const OPENCLAW_UNEXPECTED_MODEL_CAMPAIGNS = new Set([
  "openclaw_unexpected_opus_113080"
]);

const VERCEL_GATEWAY_REASONING_CAMPAIGNS = new Set([
  "vercel_gateway_reasoning_17505",
  "vercel-gateway-reasoning-17505"
]);

const CLAUDE_BACKGROUND_RUNAWAY_CAMPAIGNS = new Set([
  "claude_background_runaway_75314",
  "claude-background-runaway-75314"
]);

export function resolveAuditSample(campaign) {
  const normalized = String(campaign || "").trim().toLowerCase();
  if (CLAUDE_BACKGROUND_RUNAWAY_CAMPAIGNS.has(normalized)) {
    return {
      autoPreview: true,
      platform: "claude-code",
      records: CLAUDE_BACKGROUND_RUNAWAY_SAMPLE_RECORDS,
      title: t("See the 10 runaway Claude Code background tasks", "查看 10 个失控的 Claude Code 后台任务"),
      detail: t(
        "The public task totals add up to 1,075,900 recorded prompt tokens across 10 background requests. The exact dollar amount remains unknown because the issue did not include trusted price data.",
        "公开任务合计记录了 10 个后台请求和 1,075,900 个提示 Token。原问题没有可信价格数据，因此无法确认准确金额。"
      ),
      button: t("Run the background-task example", "查看后台任务示例"),
      note: t(
        "Synthetic rows preserve only the published per-task token totals. Choose your local ~/.claude/projects folder before using the result as quota or refund evidence.",
        "模拟记录只保留公开的单任务 Token 总量。用作额度或退款证据前，请选择本机 ~/.claude/projects 文件夹。"
      )
    };
  }
  if (VERCEL_GATEWAY_REASONING_CAMPAIGNS.has(normalized)) {
    return {
      autoPreview: true,
      platform: "other",
      records: VERCEL_GATEWAY_REASONING_SAMPLE_RECORDS,
      title: t("See reasoning-disabled requests that still report reasoning tokens", "查看关闭推理后仍出现思考 Token 的请求"),
      detail: t(
        "All three illustrative AI SDK 7 rows request reasoning: none, yet they report 2,340 nested reasoning tokens across Wafer AI and Fireworks AI.",
        "这 3 条 AI SDK 7 示例都要求不使用推理，但 Wafer AI 和 Fireworks AI 仍记录了 2,340 个思考 Token。"
      ),
      button: t("Run the AI SDK 7 example", "查看 AI SDK 7 示例"),
      note: t(
        "Synthetic data shaped from the public incident. Replace it with the same prompt and tool sequence through each provider before using the result as billing evidence.",
        "这是按公开故障构造的模拟数据。用作计费证据前，请用相同提示词和工具流程分别复现并替换。"
      )
    };
  }
  if (SPARKY_GEMINI_CACHE_CAMPAIGNS.has(normalized)) {
    return {
      autoPreview: true,
      platform: "gemini",
      records: SPARKY_GEMINI_CACHE_SAMPLE_RECORDS,
      title: t("See the three-request Gemini cache evidence", "查看三次 Gemini 请求的缓存证据"),
      detail: t(
        "This redacted example preserves 25,724 prompt tokens. Only the third request reports cachedContentTokenCount: 8,077 cached tokens out of its 11,077 prompt tokens.",
        "脱敏示例保留了 25,724 个提示 Token。只有第三次请求记录 cachedContentTokenCount：11,077 个提示 Token 中有 8,077 个来自缓存。"
      ),
      button: t("Run the Gemini cache example", "查看 Gemini 缓存示例"),
      note: t(
        "Public incident shape only. Missing cachedContentTokenCount is not zero: compare one cold request with at least two warm requests while provider, model, system instruction, tools, stable prefix, and workload remain fixed.",
        "这里只复现公开故障形态。缺少 cachedContentTokenCount 不等于零；请固定服务商、模型、系统指令、工具、稳定前缀和任务，对比一次冷请求与至少两次热请求。"
      )
    };
  }
  if (CLINE_CACHE_MISS_CAMPAIGNS.has(normalized)) {
    return {
      autoPreview: true,
      platform: "other",
      records: CLINE_CACHE_MISS_SAMPLE_RECORDS,
      title: t("See a bounded cache-miss control before blaming billing", "先用受控对比确认是否真的没有缓存"),
      detail: t(
        "This illustrative three-call control keeps the provider, model, workload, and input size fixed. It records 900,000 input tokens, 0% explicit cache reads, and $0.15 total cost.",
        "这 3 次受控调用固定服务商、模型、任务和输入规模，共记录 900,000 个输入 Token、0% 明确缓存读取和 $0.15 费用。"
      ),
      button: t("Run the cache-control example", "查看缓存对比示例"),
      note: t(
        "Illustrative data only. A 600k context window is not a measured input-token count; replace this sample with at least three comparable local records before claiming a cache or billing defect.",
        "仅为示例。600k 上下文窗口不等于实测输入 Token；声称缓存或计费异常前，请换成至少 3 条可比较的本地记录。"
      )
    };
  }
  if (OPENCLAW_UNEXPECTED_MODEL_CAMPAIGNS.has(normalized)) {
    return {
      autoPreview: true,
      platform: "openclaw",
      records: OPENCLAW_UNEXPECTED_MODEL_SAMPLE_RECORDS,
      title: t("See the unexpected Opus trace shape immediately", "查看意外切换到 Opus 的调用形态"),
      detail: t(
        "This six-call example keeps Sonnet as the configured model while the recorded assistant calls use Opus, exposing $2.61 of model-mismatch spend.",
        "这 6 次调用的配置模型保持为 Sonnet，但实际助手调用记录为 Opus，暴露出 $2.61 的模型不一致费用。"
      ),
      button: t("Run the unexpected-model example", "查看意外模型示例"),
      note: t(
        "Synthetic data shaped from the public incident; replace it with a bounded local transcript and billing window for actual evidence.",
        "这是按公开故障构造的模拟数据；请换成限定范围的本地会话和计费时间窗，才能形成真实证据。"
      )
    };
  }
  if (OPENCODE_FILTERED_SPEND_CAMPAIGNS.has(normalized)) {
    return {
      autoPreview: true,
      platform: "other",
      records: OPENCODE_FILTERED_SPEND_SAMPLE_RECORDS,
      title: t("See three billed, content-filtered calls immediately", "查看 3 次被内容过滤但仍计费的调用"),
      detail: t(
        "This three-call example preserves 1,604,874 input tokens, 7 output tokens, and $20.06 of spend even though every response ended as content-filtered.",
        "这 3 次调用都以内容过滤结束，但仍记录 1,604,874 个输入 Token、7 个输出 Token 和 $20.06 费用。"
      ),
      button: t("Run the filtered-spend example", "查看过滤后计费示例"),
      note: t(
        "Synthetic data shaped from the public incident. Per-call amounts are rounded to the published $20.06 aggregate; replace the sample with your own export before using it as refund evidence.",
        "这是按公开故障构造的模拟数据，单次金额由公开的 $20.06 总额取整拆分。用作退款证据前，请替换为你自己的导出文件。"
      )
    };
  }
  if (PERIODIC_SPEND_CAMPAIGNS.has(normalized)) {
    return {
      autoPreview: true,
      platform: "other",
      records: PERIODIC_SPEND_SAMPLE_RECORDS,
      title: t("See a 30-minute billing pattern immediately", "查看每 30 分钟重复计费的模式"),
      detail: t(
        "This four-call example keeps the workload stable and exposes $0.8033 of observed spend at an exact 30-minute cadence, or $9.64 per day if it continues.",
        "这 4 次调用保持任务稳定，显示每 30 分钟准确发生一次费用，共 $0.8033；若持续，每天约 $9.64。"
      ),
      button: t("Run the recurring-spend example", "查看周期费用示例"),
      note: t(
        "Public incident pattern only; replace it with timestamped billing rows for your actual result.",
        "这里只复现公开故障模式；请换成带时间戳的真实计费记录。"
      )
    };
  }
  if (CACHE_INCIDENT_CAMPAIGNS.has(normalized)) {
    return {
      autoPreview: true,
      platform: "other",
      records: PROVIDER_CACHE_SAMPLE_RECORDS,
      title: t("See provider switching and missing cache reads immediately", "查看服务商切换和缓存读取缺失"),
      detail: t(
        "This five-request example keeps the model and workload fixed while the provider changes. It reports 5,000,000 prompt tokens, five providers, 0% cache reads, and $56.25 of priced spend.",
        "这 5 次请求固定模型和任务，只切换服务商，共记录 5,000,000 个提示 Token、5 个服务商、0% 缓存读取和 $56.25 可计价费用。"
      ),
      button: t("Run the provider-cache example", "查看服务商缓存示例"),
      note: t(
        "Public incident pattern only; replace it with one bounded export for your actual result.",
        "这里只复现公开故障模式；请换成限定范围的真实导出文件。"
      )
    };
  }
  return {
    autoPreview: false,
    platform: "openclaw",
    records: SAMPLE_RECORDS,
    title: t("A failed retry used $0.0184", "一次失败重试仍消耗了 $0.0184"),
    detail: t(
      "See the answer format before choosing your own records.",
      "先用示例看看最终会得到什么，不会计入真实客户分析。"
    ),
    button: t("Show example result", "查看示例结果"),
    note: t(
      "Example data only. It is never counted as a customer analysis.",
      "仅为示例数据，不会计入真实客户分析。"
    )
  };
}

export function resolveAuditRunPolicy(source = "user") {
  if (source === "user") {
    return {
      trackSampleClick: false,
      trackCompletion: true,
      trackJourney: true,
      allowCheckout: true,
      promptOwnData: false
    };
  }
  if (source === "sample") {
    return {
      trackSampleClick: true,
      trackCompletion: false,
      trackJourney: false,
      allowCheckout: false,
      promptOwnData: true
    };
  }
  if (source === "campaign_preview") {
    return {
      trackSampleClick: false,
      trackCompletion: false,
      trackJourney: false,
      allowCheckout: false,
      promptOwnData: true
    };
  }
  throw new Error("Unsupported audit run source.");
}

export function shouldAutoPreviewAuditSample(
  sample,
  { hasRequestedSession = false, hasRecoveryToken = false } = {}
) {
  return Boolean(sample?.autoPreview && !hasRequestedSession && !hasRecoveryToken);
}

function valueAtPath(record, path) {
  let current = record;
  for (const part of path.split(".")) {
    if (!current || typeof current !== "object" || !Object.hasOwn(current, part)) return undefined;
    current = current[part];
  }
  return current;
}

function firstValue(record, paths) {
  for (const path of paths) {
    const value = valueAtPath(record, path);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function boundedLabel(value, fallback) {
  const normalized = String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return normalized ? normalized.slice(0, 80) : fallback;
}

function finiteNumber(value) {
  if (typeof value === "string") {
    const normalized = value.trim().replace(/^\$/, "").replace(/,/g, "");
    if (!normalized) return null;
    value = normalized;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function integerValue(value) {
  const number = finiteNumber(value);
  return number === null ? 0 : Math.min(Math.round(number), 1_000_000_000_000_000);
}

function isExplicitFalse(value) {
  if (value === false || value === 0) return true;
  return typeof value === "string" && /^(?:false|0|no)$/i.test(value.trim());
}

function hasIndependentCacheTokenCounters(record) {
  const containers = [
    record,
    record?.usage,
    record?.response?.usage,
    record?.message?.usage,
    record?.data,
    record?.data?.usage
  ];
  const inputFields = ["input_tokens", "in"];
  const cacheFields = [
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
    "cache_read",
    "cache_creation"
  ];
  return containers.some((container) =>
    container &&
    typeof container === "object" &&
    !Array.isArray(container) &&
    inputFields.some((field) => Object.hasOwn(container, field)) &&
    cacheFields.some((field) => Object.hasOwn(container, field))
  );
}

function normalizedStatus(record) {
  if (record?.cancelled === true || record?.data?.cancelled === true) {
    return "cancelled";
  }
  if (
    record?.error ||
    record?.error_code ||
    record?.errorCode ||
    record?.data?.error ||
    record?.data?.error_code ||
    record?.data?.errorCode ||
    record?.message?.errorMessage ||
    record?.message?.isError === true ||
    record?.success === false ||
    record?.data?.success === false
  ) {
    return "failed";
  }
  const raw = boundedLabel(firstValue(record, FIELD_PATHS.status), "unknown").toLowerCase();
  if (/(?:fail|error|reject|time(?:d)?[_ -]?out|block|filter|denied|safety|moderation)/.test(raw)) {
    return "failed";
  }
  if (/(?:cancel|abort)/.test(raw)) return "cancelled";
  if (/(?:success|succeed|complete|completed|stop|tool[_-]?(?:use|calls?)|end[_-]?turn|length|ok)/.test(raw)) {
    return "succeeded";
  }
  return "unknown";
}

function isToolUseRecord(record) {
  const message = record?.message;
  if (!message || message.role !== "assistant" || !Array.isArray(message.content)) {
    return false;
  }
  return message.content.some((entry) => {
    const type = String(entry?.type || "").toLowerCase().replace(/[_-]/g, "");
    return type === "tooluse" || type === "toolcall";
  });
}

function hasUsageEnvelope(record) {
  return Boolean(
    record?.usage &&
    typeof record.usage === "object" &&
    !Array.isArray(record.usage)
  ) || Boolean(
    record?.message?.usage &&
    typeof record.message.usage === "object" &&
    !Array.isArray(record.message.usage)
  ) || Boolean(
    record?.usageMetadata &&
    typeof record.usageMetadata === "object" &&
    !Array.isArray(record.usageMetadata)
  ) || Boolean(
    record?.response?.usageMetadata &&
    typeof record.response.usageMetadata === "object" &&
    !Array.isArray(record.response.usageMetadata)
  ) || Boolean(
    record?.message?.usageMetadata &&
    typeof record.message.usageMetadata === "object" &&
    !Array.isArray(record.message.usageMetadata)
  );
}

function normalizedTimestamp(record) {
  const raw = firstValue(record, FIELD_PATHS.timestamp);
  if (raw === undefined) return null;
  const parsed = typeof raw === "number" && raw < 10_000_000_000
    ? new Date(raw * 1000)
    : new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function stableUsageIdentity(record) {
  const value = firstValue(record, FIELD_PATHS.usageIdentity);
  if (value === undefined || (value && typeof value === "object")) return null;
  const normalized = String(value).trim();
  return normalized && normalized.length <= 512 ? normalized : null;
}

function explicitOrCalculatedCost(record, tokens) {
  if (isExplicitFalse(firstValue(record, FIELD_PATHS.costEvaluable))) return null;
  const explicit = finiteNumber(firstValue(record, FIELD_PATHS.costUsd));
  if (explicit !== null) return explicit;
  const inputRate = finiteNumber(firstValue(record, FIELD_PATHS.inputRate));
  const outputRate = finiteNumber(firstValue(record, FIELD_PATHS.outputRate));
  const cachedRate = finiteNumber(firstValue(record, FIELD_PATHS.cachedRate));
  const cacheWriteRate = finiteNumber(firstValue(record, FIELD_PATHS.cacheWriteRate));
  if (inputRate === null || outputRate === null) return null;
  const uncachedInput = Math.max(
    0,
    tokens.inputTokens - tokens.cachedTokens - tokens.cacheWriteTokens
  );
  return (
    uncachedInput * inputRate +
    tokens.outputTokens * outputRate +
    tokens.reasoningTokens * outputRate +
    tokens.toolUsePromptTokens * inputRate +
    tokens.cachedTokens * (cachedRate ?? inputRate) +
    tokens.cacheWriteTokens * (cacheWriteRate ?? inputRate)
  ) / 1_000_000;
}

function normalizedRecord(record, context = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Each usage row must be an object.");
  }
  const baseInputTokens = integerValue(firstValue(record, FIELD_PATHS.inputTokens));
  const outputTokens = integerValue(firstValue(record, FIELD_PATHS.outputTokens));
  const reasoningTokens = integerValue(firstValue(record, FIELD_PATHS.reasoningTokens));
  const toolUsePromptTokens = integerValue(
    firstValue(record, FIELD_PATHS.toolUsePromptTokens)
  );
  const rawCachedTokens = firstValue(record, FIELD_PATHS.cachedTokens);
  const cachedTokens = integerValue(rawCachedTokens);
  const cacheWriteTokens = integerValue(firstValue(record, FIELD_PATHS.cacheWriteTokens));
  const inputTokens = hasIndependentCacheTokenCounters(record)
    ? integerValue(baseInputTokens + cachedTokens + cacheWriteTokens)
    : baseInputTokens;
  const toolUseRecord = isToolUseRecord(record);
  const unmeteredToolUseRecord =
    toolUseRecord &&
    (
      !hasUsageEnvelope(record) ||
      inputTokens +
        outputTokens +
        reasoningTokens +
        toolUsePromptTokens +
        cachedTokens +
        cacheWriteTokens === 0
    );
  const model = boundedLabel(firstValue(record, FIELD_PATHS.model), "unknown");
  const explicitConfiguredModel = boundedLabel(
    firstValue(record, FIELD_PATHS.configuredModel),
    "unknown"
  );
  const configuredModel = explicitConfiguredModel === "unknown"
    ? boundedLabel(context.configuredModel, "unknown")
    : explicitConfiguredModel;
  const parsedCostUsd = explicitOrCalculatedCost(record, {
    inputTokens,
    outputTokens,
    reasoningTokens,
    toolUsePromptTokens,
    cachedTokens,
    cacheWriteTokens
  });
  const costUsd =
    unmeteredToolUseRecord && parsedCostUsd === 0
      ? null
      : parsedCostUsd;
  const blockingWaitCalls = integerValue(context.blockingWaitCalls);
  const emptyBlockingWaitCalls = Math.min(
    blockingWaitCalls,
    integerValue(context.emptyBlockingWaitCalls)
  );
  const blockingWaitRequestedMs = blockingWaitCalls > 0
    ? integerValue(context.blockingWaitRequestedMs)
    : 0;
  return {
    provider: boundedLabel(firstValue(record, FIELD_PATHS.provider), "unknown"),
    model,
    configuredModel,
    actualModel: model,
    agent: boundedLabel(firstValue(record, FIELD_PATHS.agent), "unattributed"),
    feature: boundedLabel(firstValue(record, FIELD_PATHS.feature), "unattributed"),
    status: normalizedStatus(record),
    inputTokens,
    outputTokens,
    reasoningTokens,
    toolUsePromptTokens,
    reasoningTokenRecord: reasoningTokens > 0,
    cachedTokens,
    cacheReadObserved: rawCachedTokens !== undefined,
    cacheWriteTokens,
    costUsd,
    toolUseRecord,
    unmeteredToolUseRecord,
    backgroundRecord: context.background === true,
    blockingWaitRecord: blockingWaitCalls > 0,
    blockingWaitCalls,
    emptyBlockingWaitCalls,
    blockingWaitRequestedMs,
    timestamp: normalizedTimestamp(record),
    replayedUsage: context.replayedUsage === true,
    duplicateUsage: context.duplicateUsage === true
  };
}

function genericDuplicateSignature(sourceRecord) {
  if (sourceRecord?.context?.genericUsage !== true) return null;
  const identity = stableUsageIdentity(sourceRecord.record);
  if (!identity) return null;
  const record = normalizedRecord(sourceRecord.record, sourceRecord.context);
  return JSON.stringify([
    identity,
    record.provider,
    record.model,
    record.configuredModel,
    record.actualModel,
    record.status,
    record.inputTokens,
    record.outputTokens,
    record.reasoningTokens,
    record.toolUsePromptTokens,
    record.cachedTokens,
    record.cacheWriteTokens,
    record.costUsd
  ]);
}

function markGenericDuplicateUsage(sourceRecords) {
  const seen = new Set();
  for (const sourceRecord of sourceRecords) {
    const signature = genericDuplicateSignature(sourceRecord);
    if (!signature) continue;
    if (seen.has(signature)) {
      sourceRecord.context.duplicateUsage = true;
    } else {
      seen.add(signature);
    }
  }
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function matchesMedian(value, expected, relativeDeviation, absoluteDeviation = 0) {
  return Math.abs(value - expected) <= Math.max(
    absoluteDeviation,
    Math.abs(expected) * relativeDeviation
  );
}

export function summarizePeriodicSpend(records) {
  const workloads = new Map();
  for (const record of records || []) {
    if (!record?.timestamp || record.costUsd === null || Number(record.costUsd) <= 0) {
      continue;
    }
    const key = JSON.stringify([
      record.provider,
      record.actualModel,
      record.agent,
      record.feature,
      record.status
    ]);
    const workload = workloads.get(key) || [];
    workload.push(record);
    workloads.set(key, workload);
  }

  const candidates = [];
  for (const workload of workloads.values()) {
    if (workload.length < MIN_PERIODIC_SPEND_RECORDS) continue;
    const ordered = [...workload].sort(
      (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)
    );
    const intervals = ordered.slice(1).map((record, index) =>
      Date.parse(record.timestamp) - Date.parse(ordered[index].timestamp)
    );
    if (intervals.some((interval) => interval <= 0)) continue;
    const intervalMs = median(intervals);
    if (
      intervalMs < MIN_PERIODIC_INTERVAL_MS ||
      intervalMs > MAX_PERIODIC_INTERVAL_MS
    ) {
      continue;
    }
    const matchingIntervals = intervals.filter((interval) =>
      matchesMedian(interval, intervalMs, 0.1, 60_000)
    ).length;
    const intervalMatchRatio = matchingIntervals / intervals.length;
    if (
      matchingIntervals < MIN_PERIODIC_SPEND_RECORDS - 1 ||
      intervalMatchRatio < MIN_PERIODIC_INTERVAL_MATCH_RATIO
    ) {
      continue;
    }

    const costs = ordered.map((record) => Number(record.costUsd));
    const medianCost = median(costs);
    const costMatchRatio = costs.filter((cost) =>
      matchesMedian(cost, medianCost, MAX_PERIODIC_VALUE_DEVIATION, 0.000001)
    ).length / costs.length;
    const inputs = ordered.map((record) => Number(record.inputTokens || 0));
    const medianInput = median(inputs);
    const inputMatchRatio = medianInput > 0
      ? inputs.filter((tokens) =>
          matchesMedian(tokens, medianInput, MAX_PERIODIC_VALUE_DEVIATION, 1)
        ).length / inputs.length
      : 0;
    if (
      costMatchRatio < MIN_PERIODIC_INTERVAL_MATCH_RATIO &&
      inputMatchRatio < MIN_PERIODIC_INTERVAL_MATCH_RATIO
    ) {
      continue;
    }

    const costUsd = costs.reduce((total, cost) => total + cost, 0);
    const projectedDailyCostUsd = costUsd / costs.length * 86_400_000 / intervalMs;
    candidates.push({
      records: ordered.length,
      pricedRecords: ordered.length,
      intervalSeconds: Math.round(intervalMs / 1000),
      consistencyPermille: Math.round(intervalMatchRatio * 1000),
      costUsd: Math.round(costUsd * 1_000_000) / 1_000_000,
      projectedDailyCostUsd:
        Math.round(projectedDailyCostUsd * 1_000_000) / 1_000_000
    });
  }

  return candidates.sort((left, right) =>
    right.projectedDailyCostUsd - left.projectedDailyCostUsd
  )[0] || null;
}

export function summarizeCacheEvidence(groups) {
  const providerNames = new Set();
  const workloads = new Map();
  let totalRecords = 0;
  let observedInputTokens = 0;
  let observedCachedTokens = 0;
  let cacheReadObservedRecords = 0;
  let failedCostUsd = 0;

  for (const group of groups || []) {
    const effectiveRecords = Math.max(
      0,
      Number(group?.records || 0) - Number(group?.duplicateUsageRecords || 0)
    );
    const provider = String(group?.provider || "unknown").trim();
    if (provider && provider.toLowerCase() !== "unknown") providerNames.add(provider.toLowerCase());
    if (["failed", "cancelled"].includes(group?.status)) {
      failedCostUsd += Number(group?.costUsd || 0);
    }
    const records = effectiveRecords;
    const observedRecords = Number(group?.cacheReadObservedRecords || 0);
    totalRecords += records;
    if (observedRecords > 0) {
      observedInputTokens += Number(group?.cacheReadObservedInputTokens || 0);
      observedCachedTokens += Number(group?.cachedTokens || 0);
      cacheReadObservedRecords += observedRecords;
    }

    const key = JSON.stringify([
      String(group?.actualModel || group?.model || "unknown").toLowerCase(),
      String(group?.agent || "unattributed").toLowerCase(),
      String(group?.feature || "unattributed").toLowerCase()
    ]);
    const workload = workloads.get(key) || {
      records: 0,
      cacheReadObservedRecords: 0,
      inputTokens: 0,
      cachedTokens: 0,
      costUsd: 0,
      providers: new Set()
    };
    workload.records += records;
    workload.cacheReadObservedRecords += observedRecords;
    workload.inputTokens += Number(group?.inputTokens || 0);
    workload.cachedTokens += Number(group?.cachedTokens || 0);
    workload.costUsd += Number(group?.costUsd || 0);
    if (provider && provider.toLowerCase() !== "unknown") {
      workload.providers.add(provider.toLowerCase());
    }
    workloads.set(key, workload);
  }

  const eligible = [...workloads.values()].filter((workload) =>
    workload.records >= MIN_CACHE_EVIDENCE_RECORDS &&
    workload.inputTokens >= MIN_CACHE_EVIDENCE_INPUT_TOKENS &&
    workload.cacheReadObservedRecords === workload.records
  );
  const lowCacheReuse = eligible.filter((workload) =>
    workload.cachedTokens / Math.max(1, workload.inputTokens) <= MAX_LOW_CACHE_READ_RATIO
  );
  const providerFragmentation = lowCacheReuse.filter((workload) => workload.providers.size >= 2);
  const sum = (items, field) => items.reduce((total, item) => total + Number(item[field] || 0), 0);

  return {
    providerCount: providerNames.size,
    cacheReadObservedRecords,
    cacheReadObservedInputTokens: observedInputTokens,
    cacheReadMissingRecords: Math.max(0, totalRecords - cacheReadObservedRecords),
    cacheReadRatio: observedInputTokens > 0
      ? Math.min(1, observedCachedTokens / observedInputTokens)
      : null,
    failedCostUsd: Math.round(failedCostUsd * 1_000_000) / 1_000_000,
    lowCacheReuseWorkloads: lowCacheReuse.length,
    lowCacheReuseRecords: sum(lowCacheReuse, "records"),
    lowCacheReuseInputTokens: sum(lowCacheReuse, "inputTokens"),
    lowCacheReuseRatio: sum(lowCacheReuse, "inputTokens") > 0
      ? Math.min(1, sum(lowCacheReuse, "cachedTokens") / sum(lowCacheReuse, "inputTokens"))
      : null,
    providerFragmentationWorkloads: providerFragmentation.length,
    providerFragmentationRecords: sum(providerFragmentation, "records"),
    maxProvidersPerWorkload: providerFragmentation.reduce(
      (maximum, workload) => Math.max(maximum, workload.providers.size),
      0
    )
  };
}

function isOpenClawTranscript(records) {
  const hasNestedMessage = records.some(
    (record) => record?.type === "message" && record?.message
  );
  if (!hasNestedMessage) return false;
  return records.some((record) => record?.type === "session") ||
    records.some((record) => record?.type === "model_change") ||
    records.every((record) => record?.type === "message" && record?.message);
}

function openClawAssistantRecords(records) {
  const contextByEntryId = new Map();
  let sequentialContext = null;
  const assistantRecords = [];
  for (const record of records) {
    const inheritedContext =
      (record?.parentId && contextByEntryId.get(record.parentId)) ||
      sequentialContext;
    const currentContext = record?.type === "model_change"
      ? {
          configuredModel: boundedLabel(record.modelId, "unknown"),
          configuredProvider: boundedLabel(record.provider, "unknown")
        }
      : inheritedContext;
    if (record?.id) contextByEntryId.set(record.id, currentContext);
    sequentialContext = currentContext;
    if (record?.type === "message" && record?.message?.role === "assistant") {
      assistantRecords.push({ record, context: currentContext || {} });
    }
  }
  return assistantRecords;
}

function isClaudeCodeTranscript(records) {
  return records.some((record) =>
    record?.type === "assistant" &&
    record?.message?.role === "assistant" &&
    record?.message?.usage &&
    typeof record.message.usage === "object" &&
    !Array.isArray(record.message.usage) &&
    (
      typeof record?.sessionId === "string" ||
      typeof record?.requestId === "string" ||
      typeof record?.uuid === "string"
    )
  );
}

function claudeCodeUsageMagnitude(record) {
  const usage = record?.message?.usage || {};
  return [
    "input_tokens",
    "output_tokens",
    "cache_read_input_tokens",
    "cache_creation_input_tokens"
  ].reduce((total, field) => total + integerValue(usage[field]), 0);
}

function claudeCodeAssistantRecords(records) {
  const requests = new Map();
  for (const record of records) {
    if (
      record?.type !== "assistant" ||
      record?.message?.role !== "assistant" ||
      !record?.message?.usage ||
      typeof record.message.usage !== "object" ||
      Array.isArray(record.message.usage)
    ) {
      continue;
    }
    const rawSessionId = String(record.sessionId || "claude-code-session");
    const rawRequestId = String(
      record.requestId || record.message.id || record.uuid || `request-${requests.size + 1}`
    );
    const key = JSON.stringify([rawSessionId, rawRequestId]);
    const contentTypes = new Set(
      Array.isArray(record.message.content)
        ? record.message.content.map((entry) => boundedLabel(entry?.type, "unknown"))
        : []
    );
    const existing = requests.get(key);
    if (!existing) {
      requests.set(key, {
        record,
        magnitude: claudeCodeUsageMagnitude(record),
        contentTypes,
        background: record.isSidechain === true
      });
      continue;
    }
    for (const type of contentTypes) existing.contentTypes.add(type);
    existing.background ||= record.isSidechain === true;
    const magnitude = claudeCodeUsageMagnitude(record);
    if (magnitude > existing.magnitude) {
      existing.record = record;
      existing.magnitude = magnitude;
    }
  }

  return [...requests.values()].map(({ record, contentTypes, background }) => {
    const usage = record.message.usage;
    return {
      record: {
        timestamp: record.timestamp,
        provider: "unknown",
        agent_id: boundedLabel(record.sessionId, "claude-code-session"),
        feature: background ? "claude-code-background" : "claude-code-main",
        message: {
          role: "assistant",
          model: record.message.model,
          stop_reason: record.message.stop_reason,
          content: [...contentTypes].map((type) => ({ type })),
          usage: {
            ...usage,
            input_tokens: integerValue(usage.input_tokens),
            cache_read_input_tokens: integerValue(usage.cache_read_input_tokens),
            cache_creation_input_tokens: integerValue(usage.cache_creation_input_tokens)
          }
        }
      },
      context: { background }
    };
  });
}

function isOpenCodeSessionExport(records) {
  return records.some((record) =>
    record?.info &&
    typeof record.info === "object" &&
    !Array.isArray(record.info) &&
    Array.isArray(record.messages) &&
    (
      (
        record?.info?.tokens &&
        typeof record.info.tokens === "object" &&
        !Array.isArray(record.info.tokens)
      ) ||
      record.messages.some((message) =>
        message?.info?.role === "assistant" &&
        message?.info?.tokens &&
        typeof message.info.tokens === "object" &&
        !Array.isArray(message.info.tokens)
      )
    )
  );
}

function openCodeUsageRecord(info, sessionInfo, configuredModel) {
  const tokens = info?.tokens || {};
  const feature = sessionInfo?.parentID
    ? "opencode-child-session"
    : "opencode-main-session";
  return {
    record: {
      timestamp: info?.time?.completed ?? info?.time?.created ?? sessionInfo?.time?.updated,
      provider: info?.providerID ?? sessionInfo?.model?.providerID,
      model: info?.modelID ?? sessionInfo?.model?.id,
      configured_model: configuredModel ?? info?.modelID ?? sessionInfo?.model?.id,
      agent_id: boundedLabel(sessionInfo?.id, "OpenCode session"),
      feature,
      status: info?.error ? "failed" : info?.finish || "completed",
      error: info?.error ? true : undefined,
      attempt_id: info?.id ?? sessionInfo?.id,
      usage: {
        input_tokens: tokens?.input,
        output_tokens: tokens?.output,
        reasoning_tokens: tokens?.reasoning,
        cache_read_input_tokens: tokens?.cache?.read,
        cache_write_input_tokens: tokens?.cache?.write
      },
      cost_usd: info?.cost
    },
    context: { genericUsage: true }
  };
}

function openCodeAssistantRecords(records) {
  const sourceRecords = [];
  for (const sessionExport of records) {
    const sessionInfo = sessionExport?.info || {};
    const messages = Array.isArray(sessionExport?.messages)
      ? sessionExport.messages
      : [];
    const configuredModelByMessage = new Map();
    for (const message of messages) {
      if (message?.info?.role !== "user" || !message.info.id) continue;
      configuredModelByMessage.set(message.info.id, message.info?.model?.modelID);
    }
    const assistantMessages = messages.filter((message) =>
      message?.info?.role === "assistant" &&
      message?.info?.tokens &&
      typeof message.info.tokens === "object" &&
      !Array.isArray(message.info.tokens)
    );
    if (assistantMessages.length) {
      for (const message of assistantMessages) {
        sourceRecords.push(openCodeUsageRecord(
          message.info,
          sessionInfo,
          configuredModelByMessage.get(message.info.parentID)
        ));
      }
      continue;
    }
    if (
      sessionInfo?.tokens &&
      typeof sessionInfo.tokens === "object" &&
      !Array.isArray(sessionInfo.tokens)
    ) {
      sourceRecords.push(openCodeUsageRecord(
        {
          id: sessionInfo.id,
          time: { completed: sessionInfo?.time?.updated },
          providerID: sessionInfo?.model?.providerID,
          modelID: sessionInfo?.model?.id,
          finish: "completed",
          tokens: sessionInfo.tokens,
          cost: sessionInfo.cost
        },
        sessionInfo,
        sessionInfo?.model?.id
      ));
    }
  }
  return sourceRecords;
}

function isCodexRollout(records) {
  return records.some(
    (record) =>
      record?.type === "event_msg" &&
      record?.payload?.type === "token_count" &&
      record?.payload?.info?.last_token_usage &&
      typeof record.payload.info.last_token_usage === "object"
  );
}

function validTimestamp(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function codexFunctionArguments(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || ""));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function codexBlockingWaitCall(record) {
  if (record?.type !== "response_item" || record?.payload?.type !== "function_call") {
    return null;
  }
  const callId = String(record?.payload?.call_id || "").trim();
  if (!callId) return null;
  if (record?.payload?.blocking_wait) {
    const requestedMs = integerValue(record.payload.blocking_wait.requested_ms);
    return requestedMs > 0 ? { callId, requestedMs } : null;
  }
  const name = String(record?.payload?.name || "").split(".").pop();
  const args = codexFunctionArguments(record?.payload?.arguments);
  const requestedMs = integerValue(args?.yield_time_ms);
  if (!args || requestedMs <= 0) return null;
  const writePoll =
    name === "write_stdin" &&
    String(args.chars ?? "") === "" &&
    Number.isInteger(Number(args.session_id)) &&
    Number(args.session_id) > 0;
  const cellPoll =
    name === "wait" &&
    typeof args.cell_id === "string" &&
    args.cell_id.trim() !== "" &&
    args.terminate !== true;
  return writePoll || cellPoll ? { callId, requestedMs } : null;
}

function codexFunctionOutputEmpty(record) {
  if (typeof record?.payload?.output_empty === "boolean") {
    return record.payload.output_empty;
  }
  const output = record?.payload?.output;
  if (typeof output !== "string") return null;
  if (!output.trim()) return true;
  const marker = output.match(/^Output:\s*$/m);
  if (!marker) return null;
  return output.slice(marker.index + marker[0].length).trim() === "";
}

function createCodexWaitState() {
  return { pending: new Map(), completed: [] };
}

function consumeCodexBlockingWait(record, state) {
  const precomputed = record?.payload?.info?.blocking_wait;
  if (
    record?.type === "event_msg" &&
    record?.payload?.type === "token_count" &&
    precomputed &&
    typeof precomputed === "object"
  ) {
    return {
      calls: integerValue(precomputed.calls),
      emptyCalls: integerValue(precomputed.empty_calls),
      requestedMs: integerValue(precomputed.requested_ms)
    };
  }

  const call = codexBlockingWaitCall(record);
  if (call) {
    state.pending.set(call.callId, call);
    return null;
  }
  if (
    record?.type === "response_item" &&
    record?.payload?.type === "function_call_output"
  ) {
    const callId = String(record?.payload?.call_id || "").trim();
    const pending = state.pending.get(callId);
    if (pending) {
      state.pending.delete(callId);
      state.completed.push({
        ...pending,
        empty: codexFunctionOutputEmpty(record) === true
      });
    }
    return null;
  }
  if (record?.type !== "event_msg" || record?.payload?.type !== "token_count") {
    return null;
  }
  const completed = state.completed.splice(0);
  state.pending.clear();
  return {
    calls: completed.length,
    emptyCalls: completed.filter((entry) => entry.empty).length,
    requestedMs: completed.reduce((total, entry) => total + entry.requestedMs, 0)
  };
}

function codexRolloutRecords(records) {
  let provider = "openai-codex";
  let model = "unknown";
  let sourceStartedAt = Number.POSITIVE_INFINITY;
  const sourceRecords = [];
  const signatures = [];
  const waitState = createCodexWaitState();

  for (const record of records) {
    const blockingWait = consumeCodexBlockingWait(record, waitState);
    sourceStartedAt = Math.min(sourceStartedAt, validTimestamp(record?.timestamp));
    if (record?.type === "session_meta") {
      provider = boundedLabel(record?.payload?.model_provider, provider);
      sourceStartedAt = Math.min(
        sourceStartedAt,
        validTimestamp(record?.payload?.timestamp)
      );
      continue;
    }
    if (record?.type === "turn_context") {
      model = boundedLabel(record?.payload?.model, model);
      continue;
    }
    if (record?.type !== "event_msg" || record?.payload?.type !== "token_count") {
      continue;
    }
    const usage = record?.payload?.info?.last_token_usage;
    if (!usage || typeof usage !== "object" || Array.isArray(usage)) continue;
    const inputTokens = integerValue(usage.input_tokens);
    const outputTokens = integerValue(usage.output_tokens);
    const reasoningTokens = integerValue(usage.reasoning_output_tokens);
    const cachedTokens = integerValue(usage.cached_input_tokens);
    const cacheWriteTokens = integerValue(usage.cache_write_input_tokens);
    const totalTokens = integerValue(usage.total_tokens);
    if (
      inputTokens +
        outputTokens +
        reasoningTokens +
        cacheWriteTokens ===
      0
    ) {
      continue;
    }
    const normalizedUsage = {
      timestamp: record.timestamp,
      provider,
      model,
      configured_model: model,
      agent_id: "Codex session",
      feature: blockingWait?.calls > 0
        ? "codex-blocking-wait"
        : "multi-agent rollout",
      status: "succeeded",
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        reasoning_tokens: reasoningTokens,
        cached_input_tokens: cachedTokens,
        cache_write_input_tokens: cacheWriteTokens
      }
    };
    sourceRecords.push({
      record: normalizedUsage,
      context: {
        blockingWaitCalls: blockingWait?.calls || 0,
        emptyBlockingWaitCalls: blockingWait?.emptyCalls || 0,
        blockingWaitRequestedMs: blockingWait?.requestedMs || 0
      }
    });
    signatures.push(JSON.stringify([
      provider,
      model,
      inputTokens,
      cachedTokens,
      cacheWriteTokens,
      outputTokens,
      reasoningTokens,
      totalTokens
    ]));
  }

  return {
    sourceRecords,
    signatures,
    sourceStartedAt
  };
}

function replayTokenCount(sourceRecords, length) {
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    const usage = sourceRecords[index].record.usage;
    // Codex output_tokens already includes reasoning_output_tokens.
    total += integerValue(usage.input_tokens) + integerValue(usage.output_tokens);
  }
  return total;
}

function markCodexReplayPrefixes(sourceSets) {
  const ordered = sourceSets
    .filter((source) => source.signatures.length)
    .sort(
      (left, right) =>
        left.sourceStartedAt - right.sourceStartedAt ||
        left.sourceIndex - right.sourceIndex
    );
  const priorByFirstSignature = new Map();

  for (const source of ordered) {
    const firstSignature = source.signatures[0];
    const candidates = priorByFirstSignature.get(firstSignature) || [];
    let longestPrefix = 0;
    for (const prior of candidates) {
      const limit = Math.min(source.signatures.length, prior.signatures.length);
      let length = 0;
      while (
        length < limit &&
        source.signatures[length] === prior.signatures[length]
      ) {
        length += 1;
      }
      longestPrefix = Math.max(longestPrefix, length);
    }
    if (
      longestPrefix >= MIN_REPLAY_RECORDS &&
      replayTokenCount(source.sourceRecords, longestPrefix) >= MIN_REPLAY_TOKENS
    ) {
      for (let index = 0; index < longestPrefix; index += 1) {
        source.sourceRecords[index].context.replayedUsage = true;
      }
    }
    candidates.push(source);
    priorByFirstSignature.set(firstSignature, candidates);
  }
}

function parseDelimited(text) {
  const firstLine = String(text).split(/\r?\n/, 1)[0] || "";
  const delimiters = [",", "\t", ";"];
  const delimiter = delimiters
    .map((candidate) => ({
      candidate,
      count: firstLine.split(candidate).length - 1
    }))
    .sort((left, right) => right.count - left.count)[0]?.candidate || ",";
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === delimiter) {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(field.replace(/\r$/, ""));
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows.length < 2) throw new Error("CSV needs a header and at least one usage row.");
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("CSV contains an empty header.");
  return rows.slice(1).map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]))
  );
}

function parseJsonRecords(text, format) {
  if (format === "jsonl") {
    return String(text)
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(`JSONL line ${index + 1} is invalid: ${error.message}`);
        }
      });
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`JSON is invalid: ${error.message}`);
  }
  if (Array.isArray(value)) return value;
  for (const key of ["records", "events", "data", "usage", "rows"]) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  if (value && typeof value === "object") return [value];
  throw new Error("JSON must be an object, an array, or contain a records/events/data array.");
}

export function detectCostUsageFormat(text, fileName = "") {
  const extension = String(fileName).toLowerCase().split(".").pop();
  if (extension === "csv" || extension === "tsv") return "csv";
  if (extension === "jsonl" || extension === "ndjson") return "jsonl";
  if (extension === "json") return "json";
  const trimmed = String(text).trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      return trimmed.split(/\r?\n/).filter(Boolean).length > 1 ? "jsonl" : "json";
    }
  }
  return "csv";
}

function aggregateRecords(sourceRecords, sourceFormat) {
  if (!sourceRecords.length) throw new Error("No usage records were found.");
  if (sourceRecords.length > MAX_RECORDS) {
    throw new Error(`The local analyzer accepts at most ${MAX_RECORDS.toLocaleString()} records.`);
  }
  const groups = new Map();
  const normalizedRecords = [];
  let rangeStart = null;
  let rangeEnd = null;
  for (const sourceRecord of sourceRecords) {
    const record = normalizedRecord(sourceRecord.record, sourceRecord.context);
    normalizedRecords.push(record);
    if (record.timestamp) {
      if (!rangeStart || record.timestamp < rangeStart) rangeStart = record.timestamp;
      if (!rangeEnd || record.timestamp > rangeEnd) rangeEnd = record.timestamp;
    }
    const key = JSON.stringify([
      record.provider,
      record.model,
      record.agent,
      record.feature,
      record.configuredModel,
      record.actualModel,
      record.status
    ]);
    const group = groups.get(key) || {
      provider: record.provider,
      model: record.model,
      agent: record.agent,
      feature: record.feature,
      configuredModel: record.configuredModel,
      actualModel: record.actualModel,
      status: record.status,
      records: 0,
      pricedRecords: 0,
      toolUseRecords: 0,
      unmeteredToolUseRecords: 0,
      reasoningTokenRecords: 0,
      cacheReadObservedRecords: 0,
      cacheReadObservedInputTokens: 0,
      replayedUsageRecords: 0,
      duplicateUsageRecords: 0,
      duplicatePricedRecords: 0,
      backgroundRecords: 0,
      blockingWaitRecords: 0,
      blockingWaitCalls: 0,
      emptyBlockingWaitCalls: 0,
      blockingWaitRequestedMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      toolUsePromptTokens: 0,
      cachedTokens: 0,
      cacheWriteTokens: 0,
      replayedInputTokens: 0,
      replayedOutputTokens: 0,
      replayedReasoningTokens: 0,
      replayedCachedTokens: 0,
      replayedCacheWriteTokens: 0,
      duplicateInputTokens: 0,
      duplicateOutputTokens: 0,
      duplicateReasoningTokens: 0,
      duplicateToolUsePromptTokens: 0,
      duplicateCachedTokens: 0,
      duplicateCacheWriteTokens: 0,
      duplicateCostUsd: 0,
      backgroundInputTokens: 0,
      backgroundOutputTokens: 0,
      backgroundCachedTokens: 0,
      backgroundCacheWriteTokens: 0,
      blockingWaitInputTokens: 0,
      blockingWaitOutputTokens: 0,
      blockingWaitReasoningTokens: 0,
      blockingWaitCachedTokens: 0,
      blockingWaitCacheWriteTokens: 0,
      costUsd: 0
    };
    group.records += 1;
    if (record.duplicateUsage) {
      group.duplicateUsageRecords += 1;
      group.duplicateInputTokens += record.inputTokens;
      group.duplicateOutputTokens += record.outputTokens;
      group.duplicateReasoningTokens += record.reasoningTokens;
      group.duplicateToolUsePromptTokens += record.toolUsePromptTokens;
      group.duplicateCachedTokens += record.cachedTokens;
      group.duplicateCacheWriteTokens += record.cacheWriteTokens;
      if (record.costUsd !== null) {
        group.duplicatePricedRecords += 1;
        group.duplicateCostUsd += record.costUsd;
      }
      groups.set(key, group);
      continue;
    }
    group.toolUseRecords += record.toolUseRecord ? 1 : 0;
    group.unmeteredToolUseRecords += record.unmeteredToolUseRecord ? 1 : 0;
    group.reasoningTokenRecords += record.reasoningTokenRecord ? 1 : 0;
    group.cacheReadObservedRecords += record.cacheReadObserved ? 1 : 0;
    group.cacheReadObservedInputTokens += record.cacheReadObserved
      ? record.inputTokens
      : 0;
    group.replayedUsageRecords += record.replayedUsage ? 1 : 0;
    group.backgroundRecords += record.backgroundRecord ? 1 : 0;
    group.blockingWaitRecords += record.blockingWaitRecord ? 1 : 0;
    group.blockingWaitCalls += record.blockingWaitCalls;
    group.emptyBlockingWaitCalls += record.emptyBlockingWaitCalls;
    group.blockingWaitRequestedMs += record.blockingWaitRequestedMs;
    group.inputTokens += record.inputTokens;
    group.outputTokens += record.outputTokens;
    group.reasoningTokens += record.reasoningTokens;
    group.toolUsePromptTokens += record.toolUsePromptTokens;
    group.cachedTokens += record.cachedTokens;
    group.cacheWriteTokens += record.cacheWriteTokens;
    if (record.replayedUsage) {
      group.replayedInputTokens += record.inputTokens;
      group.replayedOutputTokens += record.outputTokens;
      group.replayedReasoningTokens += record.reasoningTokens;
      group.replayedCachedTokens += record.cachedTokens;
      group.replayedCacheWriteTokens += record.cacheWriteTokens;
    }
    if (record.backgroundRecord) {
      group.backgroundInputTokens += record.inputTokens;
      group.backgroundOutputTokens += record.outputTokens;
      group.backgroundCachedTokens += record.cachedTokens;
      group.backgroundCacheWriteTokens += record.cacheWriteTokens;
    }
    if (record.blockingWaitRecord) {
      group.blockingWaitInputTokens += record.inputTokens;
      group.blockingWaitOutputTokens += record.outputTokens;
      group.blockingWaitReasoningTokens += record.reasoningTokens;
      group.blockingWaitCachedTokens += record.cachedTokens;
      group.blockingWaitCacheWriteTokens += record.cacheWriteTokens;
    }
    if (record.costUsd !== null) {
      group.pricedRecords += 1;
      group.costUsd += record.costUsd;
    }
    groups.set(key, group);
  }
  const normalizedGroups = [...groups.values()]
    .map((group) => ({
      ...group,
      costUsd: group.pricedRecords ? Math.round(group.costUsd * 1_000_000) / 1_000_000 : null,
      duplicateCostUsd: Math.round(group.duplicateCostUsd * 1_000_000) / 1_000_000
    }))
    .sort((left, right) => Number(right.costUsd || 0) - Number(left.costUsd || 0));
  const totalCostUsd = normalizedGroups.reduce(
    (total, group) => total + Number(group.costUsd || 0),
    0
  );
  const pricedRecords = normalizedGroups.reduce((total, group) => total + group.pricedRecords, 0);
  const toolUseRecords = normalizedGroups.reduce(
    (total, group) => total + group.toolUseRecords,
    0
  );
  const unmeteredToolUseRecords = normalizedGroups.reduce(
    (total, group) => total + group.unmeteredToolUseRecords,
    0
  );
  const reasoningTokenRecords = normalizedGroups.reduce(
    (total, group) => total + group.reasoningTokenRecords,
    0
  );
  const replayedUsageRecords = normalizedGroups.reduce(
    (total, group) => total + group.replayedUsageRecords,
    0
  );
  const duplicateUsageRecords = normalizedGroups.reduce(
    (total, group) => total + group.duplicateUsageRecords,
    0
  );
  const duplicateCostUsd = normalizedGroups.reduce(
    (total, group) => total + Number(group.duplicateCostUsd || 0),
    0
  );
  const effectiveRecords = sourceRecords.length - duplicateUsageRecords;
  const fallbackRecords = normalizedGroups
    .filter((group) =>
      group.configuredModel !== "unknown" &&
      group.configuredModel.toLowerCase() !== group.actualModel.toLowerCase()
    )
    .reduce(
      (total, group) => total + group.records - group.duplicateUsageRecords,
      0
    );
  const failedOrCancelledRecords = normalizedGroups
    .filter((group) =>
      ["failed", "cancelled"].includes(group.status) &&
      (group.inputTokens + group.outputTokens > 0 || Number(group.costUsd || 0) > 0)
    )
    .reduce(
      (total, group) => total + group.records - group.duplicateUsageRecords,
      0
    );
  const unattributedRecords = normalizedGroups
    .filter((group) =>
      ["unattributed", "unknown"].includes(group.agent.toLowerCase()) ||
      ["unattributed", "unknown"].includes(group.feature.toLowerCase())
    )
    .reduce(
      (total, group) => total + group.records - group.duplicateUsageRecords,
      0
    );
  const cacheEvidence = summarizeCacheEvidence(normalizedGroups);
  const periodicSpend = summarizePeriodicSpend(
    normalizedRecords.filter((record) => !record.duplicateUsage)
  );
  return {
    schemaVersion: 1,
    sourceFormat,
    recordCount: sourceRecords.length,
    rangeStart,
    rangeEnd,
    periodicSpend,
    groups: normalizedGroups,
    summary: {
      totalCostUsd: Math.round(totalCostUsd * 1_000_000) / 1_000_000,
      pricedRecords,
      unpricedRecords: effectiveRecords - pricedRecords,
      toolUseRecords,
      unmeteredToolUseRecords,
      reasoningTokenRecords,
      replayedUsageRecords,
      duplicateUsageRecords,
      duplicateCostUsd: Math.round(duplicateCostUsd * 1_000_000) / 1_000_000,
      backgroundRecords: normalizedGroups.reduce(
        (total, group) => total + group.backgroundRecords,
        0
      ),
      blockingWaitRecords: normalizedGroups.reduce(
        (total, group) => total + group.blockingWaitRecords,
        0
      ),
      blockingWaitCalls: normalizedGroups.reduce(
        (total, group) => total + group.blockingWaitCalls,
        0
      ),
      emptyBlockingWaitCalls: normalizedGroups.reduce(
        (total, group) => total + group.emptyBlockingWaitCalls,
        0
      ),
      blockingWaitRequestedMs: normalizedGroups.reduce(
        (total, group) => total + group.blockingWaitRequestedMs,
        0
      ),
      deduplicatedUsageRecords: effectiveRecords,
      uniqueUsageRecords:
        sourceRecords.length - replayedUsageRecords - duplicateUsageRecords,
      fallbackRecords,
      failedOrCancelledRecords,
      failedCostUsd: cacheEvidence.failedCostUsd,
      unattributedRecords,
      providerCount: cacheEvidence.providerCount,
      cacheReadObservedRecords: cacheEvidence.cacheReadObservedRecords,
      cacheReadObservedInputTokens: cacheEvidence.cacheReadObservedInputTokens,
      cacheReadMissingRecords: cacheEvidence.cacheReadMissingRecords,
      cacheReadRatio: cacheEvidence.cacheReadRatio,
      lowCacheReuseWorkloads: cacheEvidence.lowCacheReuseWorkloads,
      lowCacheReuseRecords: cacheEvidence.lowCacheReuseRecords,
      lowCacheReuseInputTokens: cacheEvidence.lowCacheReuseInputTokens,
      lowCacheReuseRatio: cacheEvidence.lowCacheReuseRatio,
      providerFragmentationWorkloads: cacheEvidence.providerFragmentationWorkloads,
      providerFragmentationRecords: cacheEvidence.providerFragmentationRecords,
      maxProvidersPerWorkload: cacheEvidence.maxProvidersPerWorkload,
      periodicSpendRecords: periodicSpend?.records || 0,
      periodicIntervalSeconds: periodicSpend?.intervalSeconds || null,
      periodicSpendCostUsd: periodicSpend?.costUsd || 0,
      periodicProjectedDailyCostUsd: periodicSpend?.projectedDailyCostUsd || 0,
      inputTokens: normalizedGroups.reduce((total, group) => total + group.inputTokens, 0),
      outputTokens: normalizedGroups.reduce((total, group) => total + group.outputTokens, 0),
      reasoningTokens: normalizedGroups.reduce(
        (total, group) => total + group.reasoningTokens,
        0
      ),
      toolUsePromptTokens: normalizedGroups.reduce(
        (total, group) => total + group.toolUsePromptTokens,
        0
      ),
      cachedTokens: normalizedGroups.reduce(
        (total, group) => total + group.cachedTokens,
        0
      ),
      cacheWriteTokens: normalizedGroups.reduce(
        (total, group) => total + group.cacheWriteTokens,
        0
      ),
      replayedInputTokens: normalizedGroups.reduce(
        (total, group) => total + group.replayedInputTokens,
        0
      ),
      replayedOutputTokens: normalizedGroups.reduce(
        (total, group) => total + group.replayedOutputTokens,
        0
      ),
      replayedReasoningTokens: normalizedGroups.reduce(
        (total, group) => total + group.replayedReasoningTokens,
        0
      ),
      replayedCachedTokens: normalizedGroups.reduce(
        (total, group) => total + group.replayedCachedTokens,
        0
      ),
      replayedCacheWriteTokens: normalizedGroups.reduce(
        (total, group) => total + group.replayedCacheWriteTokens,
        0
      ),
      duplicateInputTokens: normalizedGroups.reduce(
        (total, group) => total + group.duplicateInputTokens,
        0
      ),
      duplicateOutputTokens: normalizedGroups.reduce(
        (total, group) => total + group.duplicateOutputTokens,
        0
      ),
      duplicateReasoningTokens: normalizedGroups.reduce(
        (total, group) => total + group.duplicateReasoningTokens,
        0
      ),
      duplicateToolUsePromptTokens: normalizedGroups.reduce(
        (total, group) => total + group.duplicateToolUsePromptTokens,
        0
      ),
      duplicateCachedTokens: normalizedGroups.reduce(
        (total, group) => total + group.duplicateCachedTokens,
        0
      ),
      duplicateCacheWriteTokens: normalizedGroups.reduce(
        (total, group) => total + group.duplicateCacheWriteTokens,
        0
      ),
      backgroundInputTokens: normalizedGroups.reduce(
        (total, group) => total + group.backgroundInputTokens,
        0
      ),
      backgroundOutputTokens: normalizedGroups.reduce(
        (total, group) => total + group.backgroundOutputTokens,
        0
      ),
      backgroundCachedTokens: normalizedGroups.reduce(
        (total, group) => total + group.backgroundCachedTokens,
        0
      ),
      backgroundCacheWriteTokens: normalizedGroups.reduce(
        (total, group) => total + group.backgroundCacheWriteTokens,
        0
      ),
      blockingWaitInputTokens: normalizedGroups.reduce(
        (total, group) => total + group.blockingWaitInputTokens,
        0
      ),
      blockingWaitOutputTokens: normalizedGroups.reduce(
        (total, group) => total + group.blockingWaitOutputTokens,
        0
      ),
      blockingWaitReasoningTokens: normalizedGroups.reduce(
        (total, group) => total + group.blockingWaitReasoningTokens,
        0
      ),
      blockingWaitCachedTokens: normalizedGroups.reduce(
        (total, group) => total + group.blockingWaitCachedTokens,
        0
      ),
      blockingWaitCacheWriteTokens: normalizedGroups.reduce(
        (total, group) => total + group.blockingWaitCacheWriteTokens,
        0
      )
    }
  };
}

function aggregateParsedCostUsageSources(parsedSources) {
  const sourceSets = parsedSources.map(({ records, format, sourceIndex }) => {
    if (isCodexRollout(records)) {
      const codex = codexRolloutRecords(records);
      if (!codex.sourceRecords.length) {
        throw new Error(`Usage source ${sourceIndex + 1} has no Codex token_count deltas.`);
      }
      return { ...codex, format, sourceIndex };
    }
    const sourceRecords = isClaudeCodeTranscript(records)
      ? claudeCodeAssistantRecords(records)
      : isOpenCodeSessionExport(records)
        ? openCodeAssistantRecords(records)
      : isOpenClawTranscript(records)
        ? openClawAssistantRecords(records)
        : records.map((record) => ({
            record,
            context: { genericUsage: true }
          }));
    if (!sourceRecords.length) {
      throw new Error(`Usage source ${sourceIndex + 1} has no assistant usage records.`);
    }
    return {
      sourceRecords,
      signatures: [],
      sourceStartedAt: Number.POSITIVE_INFINITY,
      format,
      sourceIndex
    };
  });
  const sourceRecords = sourceSets.flatMap((source) => source.sourceRecords);
  if (sourceRecords.length > MAX_RECORDS) {
    throw new Error(`The local analyzer accepts at most ${MAX_RECORDS.toLocaleString()} records.`);
  }
  markCodexReplayPrefixes(sourceSets);
  markGenericDuplicateUsage(sourceRecords);
  const formats = new Set(sourceSets.map((source) => source.format));
  const sourceFormat = formats.size === 1 ? sourceSets[0].format : "mixed";
  return aggregateRecords(sourceRecords, sourceFormat);
}

function parseCostUsageSourceText(source, sourceIndex, text) {
  const requestedFormat = String(source?.format || "").toLowerCase();
  const format = requestedFormat && requestedFormat !== "auto"
    ? requestedFormat
    : detectCostUsageFormat(text, source?.fileName);
  if (!INPUT_FORMATS.has(format)) {
    throw new Error(`Usage source ${sourceIndex + 1} has an unsupported format.`);
  }
  const records = format === "csv"
    ? parseDelimited(text)
    : parseJsonRecords(text, format);
  return { records, format, sourceIndex };
}

export function parseCostUsageSources(sources) {
  if (!Array.isArray(sources) || !sources.length) {
    throw new Error("Choose a usage export or paste usage records.");
  }
  if (sources.length > MAX_SOURCE_FILES) {
    throw new Error(`Choose at most ${MAX_SOURCE_FILES} usage files at once.`);
  }
  const validatedSources = sources.map((source, sourceIndex) => {
    const text = String(source?.text ?? "");
    const bytes = new TextEncoder().encode(text).byteLength;
    if (!bytes) throw new Error(`Usage source ${sourceIndex + 1} is empty.`);
    return { source, sourceIndex, text, bytes };
  });
  const totalBytes = validatedSources.reduce(
    (total, source) => total + source.bytes,
    0
  );
  if (totalBytes > MAX_SOURCE_BYTES) {
    throw new Error("The combined local input limit is 10 MB.");
  }
  return aggregateParsedCostUsageSources(
    validatedSources.map(({ source, sourceIndex, text }) =>
      parseCostUsageSourceText(source, sourceIndex, text)
    )
  );
}

function projectCodexStreamRecord(record, waitState) {
  const blockingWait = consumeCodexBlockingWait(record, waitState);
  if (record?.type === "session_meta") {
    return {
      timestamp: record.timestamp,
      type: "session_meta",
      payload: {
        timestamp: record?.payload?.timestamp,
        model_provider: record?.payload?.model_provider
      }
    };
  }
  if (record?.type === "turn_context") {
    return {
      timestamp: record.timestamp,
      type: "turn_context",
      payload: { model: record?.payload?.model }
    };
  }
  if (
    record?.type === "event_msg" &&
    record?.payload?.type === "token_count" &&
    record?.payload?.info?.last_token_usage &&
    typeof record.payload.info.last_token_usage === "object"
  ) {
    return {
      timestamp: record.timestamp,
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: record.payload.info.last_token_usage,
          blocking_wait: {
            calls: blockingWait?.calls || 0,
            empty_calls: blockingWait?.emptyCalls || 0,
            requested_ms: blockingWait?.requestedMs || 0
          }
        }
      }
    };
  }
  return null;
}

function projectClaudeCodeStreamRecord(record) {
  if (
    record?.type !== "assistant" ||
    record?.message?.role !== "assistant" ||
    !record?.message?.usage ||
    typeof record.message.usage !== "object" ||
    Array.isArray(record.message.usage)
  ) {
    return null;
  }
  return {
    timestamp: record.timestamp,
    type: "assistant",
    sessionId: record.sessionId,
    requestId: record.requestId,
    uuid: record.uuid,
    isSidechain: record.isSidechain === true,
    message: {
      id: record.message.id,
      role: "assistant",
      model: record.message.model,
      stop_reason: record.message.stop_reason,
      content: Array.isArray(record.message.content)
        ? record.message.content.map((entry) => ({ type: entry?.type }))
        : [],
      usage: record.message.usage
    }
  };
}

async function streamSessionJsonlFile(file, sourceIndex) {
  if (!/\.(?:jsonl|ndjson)$/i.test(String(file?.name || ""))) {
    throw new Error(
      `Usage source ${sourceIndex + 1} exceeds 10 MB; large local streaming is available only for Codex or Claude Code JSONL and NDJSON.`
    );
  }
  if (typeof file?.stream !== "function") {
    throw new Error(
      `Usage source ${sourceIndex + 1} requires a browser with local file streaming support.`
    );
  }

  const reader = file.stream().getReader();
  const decoder = new TextDecoder();
  const records = [];
  const codexWaitState = createCodexWaitState();
  let buffered = "";
  let droppingOversizedLine = false;
  let lineNumber = 0;

  const parseLine = (line) => {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed) return;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      throw new Error(
        `Usage source ${sourceIndex + 1} has invalid JSONL near line ${lineNumber}.`
      );
    }
    const projected =
      projectCodexStreamRecord(record, codexWaitState) ||
      projectClaudeCodeStreamRecord(record);
    if (projected) records.push(projected);
    if (records.length > MAX_RECORDS) {
      throw new Error(`The local analyzer accepts at most ${MAX_RECORDS.toLocaleString()} records.`);
    }
  };

  const consume = (decoded, final = false) => {
    let cursor = 0;
    while (cursor < decoded.length) {
      const newline = decoded.indexOf("\n", cursor);
      const hasNewline = newline >= 0;
      const end = hasNewline ? newline : decoded.length;
      const segment = decoded.slice(cursor, end);
      if (droppingOversizedLine) {
        if (hasNewline) droppingOversizedLine = false;
      } else if (buffered.length + segment.length > MAX_STREAM_LINE_CHARS) {
        buffered = "";
        droppingOversizedLine = !hasNewline;
        lineNumber += 1;
      } else {
        buffered += segment;
        if (hasNewline) {
          parseLine(buffered);
          buffered = "";
        }
      }
      if (!hasNewline) break;
      cursor = newline + 1;
    }
    if (final && !droppingOversizedLine && buffered) {
      parseLine(buffered);
      buffered = "";
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      consume(decoder.decode(value, { stream: true }));
    }
    consume(decoder.decode(), true);
  } finally {
    reader.releaseLock();
  }

  if (!isCodexRollout(records) && !isClaudeCodeTranscript(records)) {
    throw new Error(
      `Usage source ${sourceIndex + 1} exceeds 10 MB but has no Codex token_count deltas or Claude Code assistant usage.`
    );
  }
  return { records, format: "jsonl", sourceIndex };
}

export async function parseCostUsageFiles(files) {
  const listed = Array.from(files || []);
  if (!listed.length) {
    throw new Error("Choose a usage export or paste usage records.");
  }
  if (listed.length > MAX_SOURCE_FILES) {
    throw new Error(`Choose at most ${MAX_SOURCE_FILES} usage files at once.`);
  }
  const totalRawBytes = listed.reduce((total, file, sourceIndex) => {
    const size = Number(file?.size);
    if (!Number.isFinite(size) || size <= 0) {
      throw new Error(`Usage source ${sourceIndex + 1} is empty.`);
    }
    return total + size;
  }, 0);
  if (totalRawBytes > MAX_CODEX_STREAM_BYTES) {
    throw new Error("The combined local session streaming limit is 2 GB.");
  }

  const parsedSources = [];
  let genericBytes = 0;
  for (let sourceIndex = 0; sourceIndex < listed.length; sourceIndex += 1) {
    const file = listed[sourceIndex];
    if (file.size > MAX_SOURCE_BYTES) {
      parsedSources.push(await streamSessionJsonlFile(file, sourceIndex));
      continue;
    }
    if (typeof file?.text !== "function") {
      throw new Error(`Usage source ${sourceIndex + 1} cannot be read locally.`);
    }
    const text = await file.text();
    const parsed = parseCostUsageSourceText(
      { fileName: file.name },
      sourceIndex,
      text
    );
    if (isCodexRollout(parsed.records)) {
      const codexWaitState = createCodexWaitState();
      parsed.records = parsed.records
        .map((record) => projectCodexStreamRecord(record, codexWaitState))
        .filter(Boolean);
    } else if (isClaudeCodeTranscript(parsed.records)) {
      parsed.records = parsed.records
        .map(projectClaudeCodeStreamRecord)
        .filter(Boolean);
    } else {
      genericBytes += file.size;
      if (genericBytes > MAX_SOURCE_BYTES) {
        throw new Error("Other exports have a combined local input limit of 10 MB.");
      }
    }
    parsedSources.push(parsed);
  }
  return aggregateParsedCostUsageSources(parsedSources);
}

export function parseCostUsageText(text, options = {}) {
  return parseCostUsageSources([{
    text,
    fileName: options.fileName || "",
    format: options.format
  }]);
}

export function buildPrivateCheckoutAudit(audit) {
  const agentAliases = new Map();
  const featureAliases = new Map();
  const safeSystemFeatures = new Set([
    "claude-code-main",
    "claude-code-background",
    "opencode-main-session",
    "opencode-child-session",
    "codex-blocking-wait"
  ]);
  const alias = (map, value, prefix) => {
    const normalized = String(value || "").trim();
    if (["", "unknown", "unattributed"].includes(normalized.toLowerCase())) {
      return "unattributed";
    }
    if (!map.has(normalized)) map.set(normalized, `${prefix} ${map.size + 1}`);
    return map.get(normalized);
  };
  const grouped = new Map();
  for (const group of audit.groups) {
    const sanitized = {
      ...group,
      agent: alias(agentAliases, group.agent, "Agent"),
      feature: safeSystemFeatures.has(group.feature)
        ? group.feature
        : alias(featureAliases, group.feature, "Feature")
    };
    const key = JSON.stringify([
      sanitized.provider,
      sanitized.model,
      sanitized.agent,
      sanitized.feature,
      sanitized.configuredModel,
      sanitized.actualModel,
      sanitized.status
    ]);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...sanitized });
      continue;
    }
    for (const field of [
      "records",
      "pricedRecords",
      "toolUseRecords",
      "unmeteredToolUseRecords",
      "reasoningTokenRecords",
      "cacheReadObservedRecords",
      "cacheReadObservedInputTokens",
      "replayedUsageRecords",
      "duplicateUsageRecords",
      "duplicatePricedRecords",
      "backgroundRecords",
      "blockingWaitRecords",
      "blockingWaitCalls",
      "emptyBlockingWaitCalls",
      "blockingWaitRequestedMs",
      "inputTokens",
      "outputTokens",
      "reasoningTokens",
      "toolUsePromptTokens",
      "cachedTokens",
      "cacheWriteTokens",
      "replayedInputTokens",
      "replayedOutputTokens",
      "replayedReasoningTokens",
      "replayedCachedTokens",
      "replayedCacheWriteTokens",
      "duplicateInputTokens",
      "duplicateOutputTokens",
      "duplicateReasoningTokens",
      "duplicateToolUsePromptTokens",
      "duplicateCachedTokens",
      "duplicateCacheWriteTokens",
      "duplicateCostUsd",
      "backgroundInputTokens",
      "backgroundOutputTokens",
      "backgroundCachedTokens",
      "backgroundCacheWriteTokens",
      "blockingWaitInputTokens",
      "blockingWaitOutputTokens",
      "blockingWaitReasoningTokens",
      "blockingWaitCachedTokens",
      "blockingWaitCacheWriteTokens"
    ]) {
      existing[field] += sanitized[field];
    }
    existing.costUsd = existing.costUsd === null && sanitized.costUsd === null
      ? null
      : Number(existing.costUsd || 0) + Number(sanitized.costUsd || 0);
  }
  const groups = [...grouped.values()]
    .sort((left, right) => Number(right.costUsd || 0) - Number(left.costUsd || 0))
    .slice(0, MAX_GROUPS_FOR_CHECKOUT);
  const retainedRecordCount = groups.reduce((total, group) => total + group.records, 0);
  if (retainedRecordCount !== audit.recordCount) {
    throw new Error(
      `This export creates more than ${MAX_GROUPS_FOR_CHECKOUT} aggregate groups. Filter or combine the export before checkout.`
    );
  }
  return {
    schemaVersion: 1,
    sourceFormat: audit.sourceFormat,
    recordCount: audit.recordCount,
    rangeStart: audit.rangeStart,
    rangeEnd: audit.rangeEnd,
    periodicSpend: audit.periodicSpend || null,
    groups
  };
}

function money(value) {
  return `$${Number(value || 0).toFixed(Number(value || 0) < 1 ? 4 : 2)}`;
}

function percent(value) {
  if (value === null || value === undefined) return t("Not reported", "未记录");
  return `${(Number(value) * 100).toFixed(Number(value) < 0.1 ? 1 : 0)}%`;
}

function intervalLabel(seconds, compact = false) {
  const value = Number(seconds || 0);
  if (!value) return t("Not detected", "未发现");
  if (value % 3600 === 0) {
    const hours = value / 3600;
    return compact
      ? `${hours}h`
      : t(`${hours} hour${hours === 1 ? "" : "s"}`, `${hours} 小时`);
  }
  const minutes = Math.round(value / 60);
  return compact
    ? `${minutes}m`
    : t(`${minutes} minute${minutes === 1 ? "" : "s"}`, `${minutes} 分钟`);
}

function number(value) {
  return Number(value || 0).toLocaleString();
}

function byteSize(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${number(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setHidden(id, hidden) {
  const element = document.getElementById(id);
  if (element) element.hidden = hidden;
}

function dispatchEngagement(event) {
  window.dispatchEvent(new CustomEvent("mailcheck:engagement", { detail: { event } }));
}

export function encodeErc20Transfer(recipientAddress, amountMinor) {
  const recipient = String(recipientAddress || "");
  if (!/^0x[a-f0-9]{40}$/i.test(recipient)) throw new Error("Payment address is invalid.");
  const amount = BigInt(amountMinor);
  if (amount <= 0n || amount >= 2n ** 256n) throw new Error("Payment amount is invalid.");
  return `0xa9059cbb${recipient.slice(2).toLowerCase().padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`;
}

function findingRows(audit) {
  const findings = [];
  if (audit.summary.duplicateUsageRecords) {
    findings.push([
      "Critical",
      t("Exact duplicate provider rows were excluded from the cost total", "费用合计已排除完全重复的服务商记录"),
      audit.summary.duplicateUsageRecords
    ]);
  }
  if (audit.summary.replayedUsageRecords) {
    findings.push([
      "Critical",
      t("Child rollout files replay usage already recorded in an ancestor session", "子记录重复包含了上级会话已经记录的用量"),
      audit.summary.replayedUsageRecords
    ]);
  }
  if (audit.summary.unmeteredToolUseRecords) {
    findings.push([
      "Critical",
      t("Some tool activity has no usage data, so the total may be too low", "部分工具活动没有用量数据，当前合计可能偏低"),
      audit.summary.unmeteredToolUseRecords
    ]);
  }
  if (audit.summary.blockingWaitRecords) {
    findings.push([
      "High",
      t("Codex blocking-poll turns consumed recorded usage", "Codex 阻塞轮询回合消耗了已记录用量"),
      audit.summary.blockingWaitRecords
    ]);
  }
  if (audit.summary.reasoningTokenRecords) {
    findings.push([
      "High",
      t("Reasoning tokens need provider-specific cost reconciliation", "思考 Token 需要按服务商规则核对费用"),
      audit.summary.reasoningTokenRecords
    ]);
  }
  if (audit.summary.fallbackRecords) {
    findings.push(["Critical", t("A different model was used than the one selected", "实际使用的模型与所选模型不同"), audit.summary.fallbackRecords]);
  }
  if (audit.summary.backgroundRecords) {
    findings.push([
      "High",
      t("Claude Code background or sidechain requests consumed recorded usage", "Claude Code 后台或旁路请求消耗了已记录用量"),
      audit.summary.backgroundRecords
    ]);
  }
  if (audit.summary.providerFragmentationWorkloads) {
    findings.push([
      "High",
      t(
        `A repeated workload crossed up to ${number(audit.summary.maxProvidersPerWorkload)} providers`,
        `同一重复任务经过了最多 ${number(audit.summary.maxProvidersPerWorkload)} 个服务商`
      ),
      audit.summary.providerFragmentationRecords
    ]);
  }
  if (audit.summary.unpricedRecords) {
    findings.push(["High", t("Some records have no reliable price", "部分记录没有可靠价格"), audit.summary.unpricedRecords]);
  }
  if (
    audit.summary.cacheReadObservedRecords > 0 &&
    audit.summary.cacheReadMissingRecords > 0
  ) {
    findings.push([
      "Medium",
      t(
        `Cache-read metadata is present on ${number(audit.summary.cacheReadObservedRecords)} of ${number(audit.recordCount)} records`,
        `${number(audit.recordCount)} 条记录中只有 ${number(audit.summary.cacheReadObservedRecords)} 条包含缓存复用数据`
      ),
      audit.summary.cacheReadMissingRecords
    ]);
  }
  if (audit.summary.lowCacheReuseWorkloads) {
    findings.push([
      "High",
      t(
        `Explicit cache reads stayed at ${percent(audit.summary.lowCacheReuseRatio)} on repeated high-input work`,
        `重复的大输入任务中，明确记录的缓存复用率仅为 ${percent(audit.summary.lowCacheReuseRatio)}`
      ),
      audit.summary.lowCacheReuseRecords
    ]);
  }
  if (audit.summary.periodicSpendRecords) {
    findings.push([
      "High",
      t(
        `Priced calls repeat every ${intervalLabel(audit.summary.periodicIntervalSeconds)}`,
        `付费调用每隔 ${intervalLabel(audit.summary.periodicIntervalSeconds)} 重复一次`
      ),
      audit.summary.periodicSpendRecords
    ]);
  }
  if (audit.summary.failedOrCancelledRecords) {
    findings.push(["High", t("Failed or cancelled requests still cost usage", "失败或取消的请求仍然产生了用量"), audit.summary.failedOrCancelledRecords]);
  }
  if (audit.summary.unattributedRecords) {
    findings.push(["Medium", t("Usage cannot be assigned to an agent or feature", "部分用量无法归属到具体 Agent 或功能"), audit.summary.unattributedRecords]);
  }
  const top = audit.groups[0];
  if (
    audit.groups.length > 1 &&
    audit.summary.totalCostUsd > 0 &&
    Number(top?.costUsd || 0) / audit.summary.totalCostUsd >= 0.5
  ) {
    findings.push(["Medium", t("One session or task used most of the recorded spend", "一个会话或任务占用了大部分已记录费用"), top.records]);
  }
  return findings;
}

export function buildAuditVerdict(audit) {
  const summary = audit?.summary || {};
  if (summary.duplicateUsageRecords > 0) {
    return {
      tone: "critical",
      title: t("Exact duplicate usage rows were excluded", "已排除完全重复的用量记录"),
      detail: t(
        `${number(summary.duplicateUsageRecords)} rows reused the same stable attempt or response ID with identical model, status, token, and cost values. ${money(summary.duplicateCostUsd)} of repeated recorded cost was excluded. Root request IDs alone are not deduplicated, so distinct primary and fallback attempts stay separate.`,
        `${number(summary.duplicateUsageRecords)} 条记录使用了相同的稳定尝试或响应 ID，并且模型、状态、Token 和费用完全一致；已从合计中排除 ${money(summary.duplicateCostUsd)} 的重复费用。仅根请求 ID 相同不会被去重，因此主要请求和回退请求仍分别保留。`
      )
    };
  }
  if (summary.replayedUsageRecords > 0) {
    const replayedTokens =
      Number(summary.replayedInputTokens || 0) +
      Number(summary.replayedOutputTokens || 0);
    return {
      tone: "critical",
      title: t("Repeated usage is present across Codex rollout files", "Codex 记录文件之间存在重复用量"),
      detail: t(
        `${number(summary.replayedUsageRecords)} usage records and ${number(replayedTokens)} input/output tokens match an ancestor prefix. This is local replay evidence; compare the unique total with the server-side quota before claiming an overcharge.`,
        `${number(summary.replayedUsageRecords)} 条用量记录和 ${number(replayedTokens)} 个输入/输出 Token 与上级会话前缀一致。这是本机重复证据；提出重复计费前，应把去重后的合计与服务端额度核对。`
      )
    };
  }
  if (summary.unmeteredToolUseRecords > 0) {
    const records = Number(summary.unmeteredToolUseRecords);
    return {
      tone: "critical",
      title: t("Some AI activity has no usage data", "部分 AI 活动没有用量数据"),
      detail: t(
        `${number(records)} tool action${records === 1 ? "" : "s"} ${records === 1 ? "has" : "have"} no tokens or cost in these files, so the total shown may be too low. Check the provider usage page for the same time before disputing the bill.`,
        `${number(records)} 次工具操作在这些文件里没有 Token 或费用，因此当前合计可能偏低。质疑账单前，请先核对服务商在相同时间段的用量页面。`
      )
    };
  }
  if (summary.fallbackRecords > 0) {
    return {
      tone: "critical",
      title: t("Requests reached a different model than configured", "请求实际使用了不同于配置的模型"),
      detail: t(
        `${number(summary.fallbackRecords)} records show a configured-versus-actual model mismatch. Reconcile those calls at the actual provider rate and record the fallback reason.`,
        `${number(summary.fallbackRecords)} 条记录显示配置模型与实际模型不一致。请按实际服务商价格核对这些调用，并记录发生模型回退的原因。`
      )
    };
  }
  if (summary.blockingWaitRecords > 0) {
    const associatedTokens =
      Number(summary.blockingWaitInputTokens || 0) +
      Number(summary.blockingWaitOutputTokens || 0);
    const requestedSeconds = Math.round(
      Number(summary.blockingWaitRequestedMs || 0) / 1000
    );
    return {
      tone: "warning",
      title: t("Codex blocking-poll turns consumed recorded usage", "Codex 阻塞轮询回合消耗了已记录用量"),
      detail: t(
        `${number(summary.blockingWaitRecords)} usage turns are directly associated with ${number(summary.blockingWaitCalls)} blocking wait calls and ${number(associatedTokens)} input/output tokens; ${number(summary.emptyBlockingWaitCalls)} recognized tool results contained no output payload. The ${number(requestedSeconds)} seconds shown are requested timeout ceilings, not measured elapsed time or proof of a separate backend overcharge.`,
        `${number(summary.blockingWaitRecords)} 个用量回合直接对应 ${number(summary.blockingWaitCalls)} 次阻塞等待调用和 ${number(associatedTokens)} 个输入/输出 Token；其中 ${number(summary.emptyBlockingWaitCalls)} 个工具结果没有输出内容。显示的 ${number(requestedSeconds)} 秒是请求超时上限，不是实际耗时，也不能单独证明服务端重复收费。`
      )
    };
  }
  if (summary.backgroundRecords > 0) {
    return {
      tone: "warning",
      title: t("Claude Code background usage is present in this session", "这个会话中存在 Claude Code 后台用量"),
      detail: t(
        `${number(summary.backgroundRecords)} background or sidechain requests report ${number(summary.backgroundInputTokens)} prompt tokens, including ${number(summary.backgroundCachedTokens)} cache-read and ${number(summary.backgroundCacheWriteTokens)} cache-write tokens, plus ${number(summary.backgroundOutputTokens)} output tokens. Compare these request timestamps with the credit window before claiming an incorrect charge.`,
        `${number(summary.backgroundRecords)} 个后台或旁路请求记录了 ${number(summary.backgroundInputTokens)} 个提示 Token，其中包括 ${number(summary.backgroundCachedTokens)} 个缓存读取、${number(summary.backgroundCacheWriteTokens)} 个缓存写入和 ${number(summary.backgroundOutputTokens)} 个输出 Token。提出计费异常前，请先把请求时间与额度变化时间核对。`
      )
    };
  }
  if (summary.providerFragmentationWorkloads > 0) {
    return {
      tone: "critical",
      title: t(
        `One repeated workload reached ${number(summary.maxProvidersPerWorkload)} providers`,
        `同一重复任务经过了 ${number(summary.maxProvidersPerWorkload)} 个服务商`
      ),
      detail: t(
        `${number(summary.providerFragmentationRecords)} high-input records report multiple providers and a ${percent(summary.lowCacheReuseRatio ?? summary.cacheReadRatio)} cache-read ratio. Provider-local cache may be fragmented; compare the same bounded task with provider pinning before assigning causality.`,
        `${number(summary.providerFragmentationRecords)} 条大输入记录经过多个服务商，缓存复用率为 ${percent(summary.lowCacheReuseRatio ?? summary.cacheReadRatio)}。服务商各自的缓存可能被分散；确认原因前，请固定服务商对同一个限定任务做对照。`
      )
    };
  }
  if (summary.unpricedRecords > 0) {
    return {
      tone: "warning",
      title: t("Usage is visible, but the exact bill is not reconstructable yet", "已看到用量，但暂时无法还原准确账单"),
      detail: t(
        `${number(summary.unpricedRecords)} records have no trusted cost or effective rate. The token evidence is usable, but exact currency claims require provider pricing or an invoice for the same interval.`,
        `${number(summary.unpricedRecords)} 条记录没有可信费用或有效单价。Token 证据仍可使用，但要确认准确金额，还需要同一时间段的服务商价格或账单。`
      )
    };
  }
  if (summary.cacheReadObservedRecords > 0 && summary.cacheReadMissingRecords > 0) {
    return {
      tone: "warning",
      title: t("Cache evidence is only partially reported", "缓存证据只记录了一部分"),
      detail: t(
        `${number(summary.cacheReadObservedRecords)} of ${number(audit.recordCount)} records expose an explicit cache-read field. The reported subset has a ${percent(summary.cacheReadRatio)} cache-read ratio; do not infer zero cache reads for the ${number(summary.cacheReadMissingRecords)} records where the field is absent.`,
        `${number(audit.recordCount)} 条记录中只有 ${number(summary.cacheReadObservedRecords)} 条明确包含缓存读取字段，已记录部分的缓存复用率为 ${percent(summary.cacheReadRatio)}；其余 ${number(summary.cacheReadMissingRecords)} 条缺少字段，不能直接当作缓存读取为零。`
      )
    };
  }
  if (summary.lowCacheReuseWorkloads > 0) {
    return {
      tone: "warning",
      title: t("Repeated high-input calls show little observed cache reuse", "重复的大输入调用几乎没有观察到缓存复用"),
      detail: t(
        `${number(summary.lowCacheReuseInputTokens)} input tokens across ${number(summary.lowCacheReuseRecords)} records explicitly report a ${percent(summary.lowCacheReuseRatio)} cache-read ratio. Check stable-prefix placement and provider routing with a bounded before/after run.`,
        `${number(summary.lowCacheReuseRecords)} 条记录共 ${number(summary.lowCacheReuseInputTokens)} 个输入 Token，明确记录的缓存复用率为 ${percent(summary.lowCacheReuseRatio)}。请用一次范围受控的前后对照，检查固定前缀位置和服务商路由。`
      )
    };
  }
  if (summary.periodicSpendRecords > 0) {
    return {
      tone: "warning",
      title: t(
        `Priced calls recur every ${intervalLabel(summary.periodicIntervalSeconds)}`,
        `付费调用每隔 ${intervalLabel(summary.periodicIntervalSeconds)} 重复一次`
      ),
      detail: t(
        `${number(summary.periodicSpendRecords)} similar timestamped records cost ${money(summary.periodicSpendCostUsd)}. If that cadence continues, the observed per-call cost implies about ${money(summary.periodicProjectedDailyCostUsd)} per day; correlate those timestamps with cron, daemon, heartbeat, and session-wake logs before assigning a trigger.`,
        `${number(summary.periodicSpendRecords)} 条时间规律相似的记录共花费 ${money(summary.periodicSpendCostUsd)}。如果频率不变，按实测单次费用推算约为每天 ${money(summary.periodicProjectedDailyCostUsd)}；确认触发源前，请把时间与定时任务、后台进程、心跳和会话唤醒日志核对。`
      )
    };
  }
  if (summary.failedOrCancelledRecords > 0) {
    return {
      tone: "warning",
      title: t("Failed work still consumed recorded usage", "失败任务仍消耗了已记录用量"),
      detail: t(
        `${number(summary.failedOrCancelledRecords)} failed or cancelled records contain tokens or cost. Preserve their terminal usage and cap the retry path before another run.`,
        `${number(summary.failedOrCancelledRecords)} 条失败或取消的记录仍包含 Token 或费用。请保留这些最终用量证据，并在再次运行前限制自动重试。`
      )
    };
  }
  return {
    tone: "clear",
    title: t("No supported cost-leak pattern appears in these records", "这些记录中没有发现当前支持的异常消耗模式"),
    detail: t(
      "The selected data has complete pricing and no detected replay, unmetered tool loop, hidden fallback, or failed-request spend. This does not rule out server-side entitlement or quota errors.",
      "所选数据的计价完整，未发现重复记录、无法计量的工具循环、隐藏模型回退或失败请求费用；但这不能排除服务端权限或额度错误。"
    )
  };
}

export function buildClearedAuditLocation(value) {
  const url = new URL(String(value || ""), "https://mailcheck.agentcartai.com");
  url.searchParams.delete("session");
  url.hash = "";
  return `${url.pathname}${url.search}`;
}

const COST_AUDIT_PLATFORMS = new Set([
  "codex",
  "claude-code",
  "opencode",
  "openclaw",
  "gemini",
  "other"
]);

export function resolveInitialAuditPlatform(value, hasRequestedSession = false) {
  if (hasRequestedSession) return "codex";
  const platform = String(value || "").trim().toLowerCase();
  return COST_AUDIT_PLATFORMS.has(platform) ? platform : "codex";
}

export function usesDirectoryPicker(platform) {
  return ["codex", "claude-code"].includes(String(platform || "").toLowerCase());
}

export function resetAuditPaymentUi(root) {
  const get = (id) => root?.getElementById?.(id) || null;
  const hide = (id, hidden) => {
    const element = get(id);
    if (element) element.hidden = hidden;
  };
  const text = (id, value) => {
    const element = get(id);
    if (element) element.textContent = value;
  };

  hide("payment-panel", true);
  hide("paid-report", true);
  hide("payment-status", true);
  text("payment-amount", "1 USDC");
  text("payment-network", t("Base Mainnet", "Base 主网"));
  text("payment-address", "");
  text("payment-status", "");
  text("paid-total-cost", "$0");
  text("paid-daily-rate", t("Time range unavailable", "没有可用的时间范围"));
  get("paid-findings")?.replaceChildren?.();

  const transactionHash = get("transaction-hash");
  if (transactionHash) transactionHash.value = "";
  const confirmButton = get("confirm-payment");
  if (confirmButton?.dataset) delete confirmButton.dataset.token;
  const walletButton = get("wallet-payment");
  if (walletButton?.dataset) delete walletButton.dataset.token;
  if (walletButton) delete walletButton._payment;
  const markdownButton = get("download-markdown");
  if (markdownButton) markdownButton.onclick = null;
  const csvButton = get("download-csv");
  if (csvButton) csvButton.onclick = null;
}

export function resetAuditUi(root) {
  const get = (id) => root?.getElementById?.(id) || null;
  const hide = (id, hidden) => {
    const element = get(id);
    if (element) element.hidden = hidden;
  };
  const text = (id, value) => {
    const element = get(id);
    if (element) element.textContent = value;
  };
  const empty = (id) => get(id)?.replaceChildren?.();

  hide("audit-empty", false);
  hide("audit-results", true);
  hide("checkout-section", true);
  hide("sample-next-step", true);
  hide("finding-count", true);
  hide("group-section", true);

  text("finding-count", "");
  text("audit-verdict-title", "");
  text("audit-verdict-detail", "");
  text("metric-records", "0");
  text("metric-cost", "$0");
  text("metric-providers", "0");
  text("metric-cache", t("Not reported", "未记录"));
  text("metric-unpriced", "0");
  text("metric-duplicates", "0");
  text("metric-replayed", "0");
  text("metric-blocking-waits", "0");
  text("metric-failed", "$0");
  text("metric-reasoning", "0");
  text("metric-recurring", t("None", "未发现"));

  empty("finding-list");
  empty("group-table-body");

  const verdict = get("audit-verdict");
  if (verdict?.dataset) delete verdict.dataset.tone;
  resetAuditPaymentUi(root);
}

function renderLocalAudit(
  audit,
  { trackCompletion = true, allowCheckout = true, promptOwnData = false } = {}
) {
  resetAuditPaymentUi(document);
  setHidden("audit-empty", true);
  setHidden("audit-results", false);
  setHidden("checkout-section", !allowCheckout);
  setHidden("sample-next-step", !promptOwnData);
  setHidden("group-section", false);
  setText("metric-records", number(audit.recordCount));
  setText("metric-cost", money(audit.summary.totalCostUsd));
  setText("metric-providers", number(audit.summary.providerCount));
  setText(
    "metric-cache",
    audit.summary.cacheReadObservedRecords > 0
      ? t(
          `${percent(audit.summary.cacheReadRatio)} · ${number(audit.summary.cacheReadObservedRecords)}/${number(audit.recordCount)} rows`,
          `${percent(audit.summary.cacheReadRatio)} · ${number(audit.summary.cacheReadObservedRecords)}/${number(audit.recordCount)} 条`
        )
      : t("Not reported", "未记录")
  );
  setText("metric-unpriced", number(audit.summary.unpricedRecords));
  setText("metric-duplicates", number(audit.summary.duplicateUsageRecords));
  setText("metric-replayed", number(audit.summary.replayedUsageRecords));
  setText(
    "metric-blocking-waits",
    t(
      `${number(audit.summary.blockingWaitCalls)} calls / ${number(audit.summary.blockingWaitRecords)} turns`,
      `${number(audit.summary.blockingWaitCalls)} 次调用 / ${number(audit.summary.blockingWaitRecords)} 个回合`
    )
  );
  setText("metric-failed", money(audit.summary.failedCostUsd));
  setText("metric-reasoning", number(audit.summary.reasoningTokens));
  setText(
    "metric-recurring",
    audit.summary.periodicSpendRecords
      ? t(
          `${intervalLabel(audit.summary.periodicIntervalSeconds, true)} · ${money(audit.summary.periodicProjectedDailyCostUsd)}/day`,
          `${intervalLabel(audit.summary.periodicIntervalSeconds, true)} · 每天 ${money(audit.summary.periodicProjectedDailyCostUsd)}`
        )
      : t("None", "未发现")
  );
  const verdict = buildAuditVerdict(audit);
  const verdictElement = document.getElementById("audit-verdict");
  verdictElement.dataset.tone = verdict.tone;
  setText("audit-verdict-title", verdict.title);
  setText("audit-verdict-detail", verdict.detail);
  const findings = findingRows(audit);
  setText(
    "finding-count",
    t(`${findings.length} issue${findings.length === 1 ? "" : "s"} found`, `发现 ${findings.length} 个问题`)
  );
  setHidden("finding-count", false);
  const list = document.getElementById("finding-list");
  list.replaceChildren(...findings.map(([severity, title, records]) => {
    const item = document.createElement("li");
    const badge = document.createElement("span");
    badge.className = `severity severity-${severity.toLowerCase()}`;
    badge.textContent = t(
      severity,
      severity === "Critical" ? "严重" : severity === "High" ? "高" : "中"
    );
    const copy = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = title;
    const detail = document.createElement("span");
    detail.textContent = t(
      `${number(records)} affected record${records === 1 ? "" : "s"}`,
      `影响 ${number(records)} 条记录`
    );
    copy.append(strong, detail);
    item.append(badge, copy);
    return item;
  }));
  const body = document.getElementById("group-table-body");
  body.replaceChildren(...audit.groups.slice(0, 12).map((group) => {
    const row = document.createElement("tr");
    for (const value of [
      group.provider,
      group.agent,
      group.feature,
      group.actualModel,
      group.status,
      group.duplicateUsageRecords > 0
        ? t(
            `${number(group.records - group.duplicateUsageRecords)} · ${number(group.duplicateUsageRecords)} duplicate`,
            `${number(group.records - group.duplicateUsageRecords)} 条有效 · ${number(group.duplicateUsageRecords)} 条重复`
          )
        : number(group.records),
      group.cacheReadObservedRecords > 0
        ? t(
            `${percent(group.cachedTokens / Math.max(1, group.cacheReadObservedInputTokens))} · ${number(group.cacheReadObservedRecords)}/${number(group.records)} rows`,
            `${percent(group.cachedTokens / Math.max(1, group.cacheReadObservedInputTokens))} · ${number(group.cacheReadObservedRecords)}/${number(group.records)} 条`
          )
        : t("Not reported", "未记录"),
      group.costUsd === null ? t("Unpriced", "无法计价") : money(group.costUsd)
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  }));
  if (trackCompletion) dispatchEngagement("tool_completed");
}

function reportMarkdown(report) {
  const lines = [
    "# AI Agent Cost Leak Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Records: ${report.source.recordCount}`,
    `Priced cost: ${money(report.summary.totalCostUsd)}`,
    `Input tokens: ${number(report.summary.inputTokens)}`,
    `Output tokens: ${number(report.summary.outputTokens)}`,
    `Thinking tokens: ${number(report.summary.reasoningTokens)}`,
    `Tool-use prompt tokens: ${number(report.summary.toolUsePromptTokens)}`,
    `Tool-use records: ${number(report.summary.toolUseRecords)}`,
    `Tool-use records without observable usage: ${number(report.summary.unmeteredToolUseRecords)}`,
    `Codex blocking-wait records: ${number(report.summary.blockingWaitRecords)}`,
    `Codex blocking-wait calls: ${number(report.summary.blockingWaitCalls)}`,
    `Codex empty blocking-wait results: ${number(report.summary.emptyBlockingWaitCalls)}`,
    `Codex requested blocking-wait milliseconds: ${number(report.summary.blockingWaitRequestedMs)}`,
    `Codex blocking-wait input tokens: ${number(report.summary.blockingWaitInputTokens)}`,
    `Codex blocking-wait output tokens: ${number(report.summary.blockingWaitOutputTokens)}`,
    `Claude Code background records: ${number(report.summary.backgroundRecords)}`,
    `Claude Code background prompt tokens: ${number(report.summary.backgroundInputTokens)}`,
    `Claude Code background output tokens: ${number(report.summary.backgroundOutputTokens)}`,
    `Observed providers: ${number(report.summary.providerCount)}`,
    `Cache-read ratio: ${percent(report.summary.cacheReadRatio)}`,
    `Priced failed spend: ${money(report.summary.failedCostUsd)}`,
    `Recurring priced calls: ${number(report.summary.periodicSpendRecords)}`,
    `Recurring interval: ${intervalLabel(report.summary.periodicIntervalSeconds)}`,
    `Recurring observed cost: ${money(report.summary.periodicSpendCostUsd)}`,
    `Recurring projected daily cost: ${money(report.summary.periodicProjectedDailyCostUsd)}`,
    `Exact duplicate usage records excluded: ${number(report.summary.duplicateUsageRecords)}`,
    `Duplicate recorded cost excluded: ${money(report.summary.duplicateCostUsd)}`,
    `Deduplicated usage records: ${number(report.summary.deduplicatedUsageRecords ?? report.source.recordCount)}`,
    `Replayed usage records: ${number(report.summary.replayedUsageRecords)}`,
    `Unique usage records: ${number(report.summary.uniqueUsageRecords)}`,
    `Replayed input tokens: ${number(report.summary.replayedInputTokens)}`,
    `Replayed output tokens: ${number(report.summary.replayedOutputTokens)}`,
    "",
    "## Findings",
    ""
  ];
  for (const finding of report.findings) {
    lines.push(
      `### ${finding.severity.toUpperCase()}: ${finding.title}`,
      "",
      `Affected records: ${finding.affectedRecords}`,
      `Associated priced cost: ${money(finding.costUsd)}`,
      "",
      finding.action,
      ""
    );
  }
  lines.push(
    "## Cost groups",
    "",
    "| Agent | Feature | Provider | Actual model | Status | Counted records | Duplicate rows | Cost USD |",
    "| --- | --- | --- | --- | --- | ---: | ---: | ---: |"
  );
  for (const group of report.groups) {
    lines.push(
      `| ${group.agent} | ${group.feature} | ${group.provider} | ${group.actualModel} | ${group.status} | ${group.records - Number(group.duplicateUsageRecords || 0)} | ${Number(group.duplicateUsageRecords || 0)} | ${group.costUsd === null ? "unpriced" : group.costUsd} |`
    );
  }
  lines.push(
    "",
    "Raw logs, prompts, messages, and credentials were not stored in this report."
  );
  return lines.join("\n");
}

function reportCsv(report) {
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = [[
    "agent",
    "feature",
    "provider",
    "configured_model",
    "actual_model",
    "status",
    "records",
    "priced_records",
    "tool_use_records",
    "unmetered_tool_use_records",
    "reasoning_token_records",
    "duplicate_usage_records",
    "duplicate_priced_records",
    "replayed_usage_records",
    "background_records",
    "blocking_wait_records",
    "blocking_wait_calls",
    "empty_blocking_wait_calls",
    "blocking_wait_requested_ms",
    "input_tokens",
    "output_tokens",
    "reasoning_tokens",
    "tool_use_prompt_tokens",
    "cached_tokens",
    "cache_write_tokens",
    "duplicate_input_tokens",
    "duplicate_output_tokens",
    "duplicate_reasoning_tokens",
    "duplicate_tool_use_prompt_tokens",
    "duplicate_cached_tokens",
    "duplicate_cache_write_tokens",
    "duplicate_cost_usd",
    "replayed_input_tokens",
    "replayed_output_tokens",
    "replayed_reasoning_tokens",
    "replayed_cached_tokens",
    "replayed_cache_write_tokens",
    "background_input_tokens",
    "background_output_tokens",
    "background_cached_tokens",
    "background_cache_write_tokens",
    "blocking_wait_input_tokens",
    "blocking_wait_output_tokens",
    "blocking_wait_reasoning_tokens",
    "blocking_wait_cached_tokens",
    "blocking_wait_cache_write_tokens",
    "cost_usd"
  ]];
  for (const group of report.groups) {
    rows.push([
      group.agent,
      group.feature,
      group.provider,
      group.configuredModel,
      group.actualModel,
      group.status,
      group.records,
      group.pricedRecords,
      group.toolUseRecords,
      group.unmeteredToolUseRecords,
      group.reasoningTokenRecords,
      group.duplicateUsageRecords,
      group.duplicatePricedRecords,
      group.replayedUsageRecords,
      group.backgroundRecords,
      group.blockingWaitRecords,
      group.blockingWaitCalls,
      group.emptyBlockingWaitCalls,
      group.blockingWaitRequestedMs,
      group.inputTokens,
      group.outputTokens,
      group.reasoningTokens,
      group.toolUsePromptTokens,
      group.cachedTokens,
      group.cacheWriteTokens,
      group.duplicateInputTokens,
      group.duplicateOutputTokens,
      group.duplicateReasoningTokens,
      group.duplicateToolUsePromptTokens,
      group.duplicateCachedTokens,
      group.duplicateCacheWriteTokens,
      group.duplicateCostUsd,
      group.replayedInputTokens,
      group.replayedOutputTokens,
      group.replayedReasoningTokens,
      group.replayedCachedTokens,
      group.replayedCacheWriteTokens,
      group.backgroundInputTokens,
      group.backgroundOutputTokens,
      group.backgroundCachedTokens,
      group.backgroundCacheWriteTokens,
      group.blockingWaitInputTokens,
      group.blockingWaitOutputTokens,
      group.blockingWaitReasoningTokens,
      group.blockingWaitCachedTokens,
      group.blockingWaitCacheWriteTokens,
      group.costUsd ?? ""
    ]);
  }
  return rows.map((row) => row.map(quote).join(",")).join("\n");
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderPaidReport(report) {
  setHidden("payment-panel", true);
  setHidden("paid-report", false);
  setText("paid-total-cost", money(report.summary.totalCostUsd));
  setText("paid-daily-rate", report.summary.dailyRunRateUsd === null
    ? t("Time range unavailable", "没有可用的时间范围")
    : t(`${money(report.summary.dailyRunRateUsd)} / day`, `每天 ${money(report.summary.dailyRunRateUsd)}`));
  const findings = document.getElementById("paid-findings");
  findings.replaceChildren(...report.findings.map((finding, index) => {
    const item = document.createElement("article");
    const heading = document.createElement("div");
    const badge = document.createElement("span");
    badge.className = `severity severity-${finding.severity}`;
    badge.textContent = finding.severity;
    const title = document.createElement("h3");
    title.textContent = `${index + 1}. ${finding.title}`;
    heading.append(badge, title);
    const evidence = document.createElement("p");
    evidence.textContent = t(
      `${number(finding.affectedRecords)} records; ${money(finding.costUsd)} in associated priced cost.`,
      `${number(finding.affectedRecords)} 条记录；相关已计价费用为 ${money(finding.costUsd)}。`
    );
    const action = document.createElement("p");
    action.textContent = finding.action;
    item.append(heading, evidence, action);
    return item;
  }));
  document.getElementById("download-markdown").onclick = () =>
    download("agent-cost-evidence-pack.md", reportMarkdown(report), "text/markdown;charset=utf-8");
  document.getElementById("download-csv").onclick = () =>
    download("agent-cost-evidence.csv", reportCsv(report), "text/csv;charset=utf-8");
}

async function fetchDelivery(token) {
  const response = await fetch("/api/delivery", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Could not retrieve the report.");
  if (payload.status === "paid" && payload.report?.kind === "agent_cost_audit") {
    renderPaidReport(payload.report);
    return true;
  }
  if (payload.status === "pending") {
    showPayment(payload, token);
    return false;
  }
  throw new Error(`This report is ${payload.status || "unavailable"}.`);
}

function recoveryToken() {
  const match = /^#cost-report=([a-f0-9]{64})$/.exec(window.location.hash);
  return match?.[1] || "";
}

function setRecoveryToken(token) {
  const url = new URL(window.location.href);
  url.hash = `cost-report=${token}`;
  history.replaceState(null, "", url);
}

async function copyText(value, button) {
  await navigator.clipboard.writeText(value);
  dispatchEngagement("payment_details_copied");
  const previous = button.textContent;
  button.textContent = t("Copied", "已复制");
  setTimeout(() => {
    button.textContent = previous;
  }, 1200);
}

function showPayment(session, token = session.token) {
  setHidden("payment-panel", false);
  setHidden("paid-report", true);
  setText("payment-amount", `${session.payment.amount} ${session.payment.token}`);
  setText(
    "payment-network",
    t(session.payment.network, session.payment.network === "Base Mainnet" ? "Base 主网" : session.payment.network)
  );
  setText("payment-address", session.payment.recipientAddress);
  const addressButton = document.getElementById("copy-address");
  addressButton.onclick = () => copyText(session.payment.recipientAddress, addressButton);
  const amountButton = document.getElementById("copy-amount");
  amountButton.onclick = () => copyText(session.payment.amount, amountButton);
  const walletButton = document.getElementById("wallet-payment");
  const walletAvailable = Boolean(window.ethereum?.request);
  walletButton.hidden = !walletAvailable;
  walletButton.dataset.token = token;
  walletButton._payment = session.payment;
  setText(
    "wallet-note",
    walletAvailable
      ? t(
          "The wallet will switch to Base and request an exact native USDC transfer.",
          "钱包将切换到 Base，并请求准确金额的原生 USDC 转账。"
        )
      : t(
          "No browser wallet detected. Pay from any wallet by using the address above.",
          "没有检测到浏览器钱包；可使用任意钱包向上方地址付款。"
        )
  );
  dispatchEngagement(
    walletAvailable ? "checkout_wallet_available" : "checkout_wallet_unavailable"
  );
  document.getElementById("confirm-payment").dataset.token = token;
  setRecoveryToken(token);
}

async function sendWalletPayment(payment) {
  const ethereum = window.ethereum;
  if (!ethereum?.request) throw new Error("No browser wallet is available.");
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: payment.chainIdHex }]
    });
  } catch (switchError) {
    if (Number(switchError?.code) !== 4902) throw switchError;
    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: payment.chainIdHex,
        chainName: payment.network,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: [payment.rpcUrl],
        blockExplorerUrls: [payment.explorerTxBaseUrl.replace(/\/tx\/$/, "")]
      }]
    });
  }
  const accounts = await ethereum.request({ method: "eth_requestAccounts" });
  const from = String(accounts?.[0] || "");
  if (!/^0x[a-f0-9]{40}$/i.test(from)) throw new Error("No wallet account was selected.");
  const hash = await ethereum.request({
    method: "eth_sendTransaction",
    params: [{
      from,
      to: payment.tokenAddress,
      data: encodeErc20Transfer(payment.recipientAddress, payment.amountMinor),
      value: "0x0"
    }]
  });
  if (!TRANSACTION_HASH_PATTERN.test(String(hash || ""))) {
    throw new Error("The wallet did not return a complete transaction hash.");
  }
  return hash;
}

async function confirmPayment(token, transactionHash) {
  const status = document.getElementById("payment-status");
  status.hidden = false;
  status.textContent = t("Checking the finalized Base transfer...", "正在检查 Base 转账的最终确认状态...");
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch("/api/payments/base-usdc/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, transactionHash })
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && response.status !== 202) {
      if (payload.delivery?.report?.kind === "agent_cost_audit") {
        renderPaidReport(payload.delivery.report);
      } else {
        await fetchDelivery(token);
      }
      return;
    }
    if (response.status !== 202) throw new Error(payload.error || "Payment verification failed.");
    status.textContent = t("Transfer found; waiting for Base finalized status...", "已找到转账，正在等待 Base 最终确认...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error(t(
    "The transfer is still pending finality. Keep this private report link and retry shortly.",
    "转账仍在等待最终确认。请保留当前私密报告链接，稍后重试。"
  ));
}

function initializeTool() {
  const form = document.getElementById("usage-form");
  const fileInput = document.getElementById("usage-file");
  const directoryInput = document.getElementById("codex-directory");
  const directoryControl = document.getElementById("codex-directory-control");
  const fileControl = document.getElementById("usage-file-control");
  const fileButtonLabel = document.getElementById("file-button-label");
  const directoryButtonLabel = document.getElementById("directory-button-label");
  const sessionControl = document.getElementById("codex-session-control");
  const sessionFilter = document.getElementById("codex-session-filter");
  const dropZone = document.getElementById("usage-drop-zone");
  const dropTitle = document.getElementById("drop-title");
  const dropSubtitle = document.getElementById("drop-subtitle");
  const sourceLocationLabel = document.getElementById("source-location-label");
  const sourceLocation = document.getElementById("source-location");
  const sourceLocationHint = document.getElementById("source-location-hint");
  const platformInputs = [...document.querySelectorAll('input[name="usage-platform"]')];
  const textarea = document.getElementById("usage-text");
  const error = document.getElementById("audit-error");
  const selected = document.getElementById("selected-file");
  const auditButton = form.querySelector('button[type="submit"]');
  const sampleButton = document.getElementById("sample-button");
  const quickExampleButton = document.getElementById("quick-example-button");
  const useOwnDataButton = document.getElementById("use-own-data-button");
  const startAuditButton = document.getElementById("start-audit-button");
  const checkoutButton = document.getElementById("checkout-button");
  let currentAudit = null;
  let currentAuditCanCheckout = false;
  let syntheticSampleText = "";
  let selectedFiles = [];
  const searchParams = new URLSearchParams(window.location.search);
  const auditSample = resolveAuditSample(searchParams.get("utm_campaign"));
  const requestedSession = searchParams.get("session") || "";
  const hasRequestedSession = /^[a-z0-9._-]{4,120}$/i.test(requestedSession);
  if (hasRequestedSession) {
    sessionFilter.value = requestedSession;
  }
  const initialPlatform = resolveInitialAuditPlatform(
    searchParams.get("platform"),
    hasRequestedSession
  );
  let currentPlatform = initialPlatform;

  const platformCopy = {
    codex: {
      title: t("2. Choose the Codex usage folder", "2. 选择 Codex 使用记录文件夹"),
      subtitle: t(
        "We find compatible records automatically. You do not need to open or understand them.",
        "系统会自动找出可用记录，不需要打开文件或看懂日志。"
      ),
      locationLabel: t("Folder to choose", "需要选择的文件夹"),
      location: "~/.codex/sessions",
      locationHint: t(
        "Mac: after the picker opens, press Cmd+Shift+G, paste ~/.codex/sessions, press Enter, then choose the folder. Windows: use %USERPROFILE%\\.codex\\sessions.",
        "Mac：选择器打开后按 Cmd+Shift+G，粘贴 ~/.codex/sessions，按回车，再选择文件夹。Windows：使用 %USERPROFILE%\\.codex\\sessions。"
      ),
      fileLabel: t("Choose individual files instead", "改为选择单个文件"),
      directoryLabel: t("Choose Codex usage folder", "选择 Codex 记录文件夹"),
      ownDataLabel: t("Choose my Codex records", "选择我的 Codex 记录")
    },
    "claude-code": {
      title: t("2. Choose the Claude Code usage folder", "2. 选择 Claude Code 使用记录文件夹"),
      subtitle: t(
        "We find compatible records automatically. You do not need to open or understand them.",
        "系统会自动找出可用记录，不需要打开文件或看懂日志。"
      ),
      locationLabel: t("Folder to choose", "需要选择的文件夹"),
      location: "~/.claude/projects",
      locationHint: t(
        "Mac: after the picker opens, press Cmd+Shift+G, paste ~/.claude/projects, press Enter, then choose the folder. Windows: use %USERPROFILE%\\.claude\\projects.",
        "Mac：选择器打开后按 Cmd+Shift+G，粘贴 ~/.claude/projects，按回车，再选择文件夹。Windows：使用 %USERPROFILE%\\.claude\\projects。"
      ),
      fileLabel: t("Choose individual files instead", "改为选择单个文件"),
      directoryLabel: t("Choose Claude Code usage folder", "选择 Claude Code 记录文件夹"),
      ownDataLabel: t("Choose my Claude Code records", "选择我的 Claude Code 记录")
    },
    opencode: {
      title: t("2. Export one OpenCode session, then choose the JSON file", "2. 导出一个 OpenCode 会话并选择 JSON 文件"),
      subtitle: t(
        "Run the command below once. OpenCode will ask which session to export.",
        "在终端运行一次下方命令，OpenCode 会让你选择要导出的会话。"
      ),
      locationLabel: t("Run in Terminal", "在终端运行"),
      location: "opencode export --sanitize > session.json",
      locationHint: t(
        "The --sanitize option redacts transcript, file, and path content while keeping cost and token evidence.",
        "--sanitize 会隐藏对话、文件与路径内容，只保留费用和 Token 证据。"
      ),
      fileLabel: t("Choose session.json", "选择 session.json"),
      directoryLabel: "",
      ownDataLabel: t("Choose my OpenCode export", "选择我的 OpenCode 导出文件")
    },
    openclaw: {
      title: t("2. Choose the affected OpenClaw session", "2. 选择出现异常的 OpenClaw 会话"),
      subtitle: t(
        "Pick the session from when the unexpected model or cost appeared.",
        "选择出现异常模型或费用时对应的会话。"
      ),
      locationLabel: t("File to choose", "需要选择的文件"),
      location: "session transcript (.jsonl)",
      locationHint: t(
        "The transcript is read on this device and is never uploaded.",
        "会话记录只在本机读取，不会上传。"
      ),
      fileLabel: t("Choose OpenClaw session", "选择 OpenClaw 会话"),
      directoryLabel: "",
      ownDataLabel: t("Choose my OpenClaw session", "选择我的 OpenClaw 会话")
    },
    gemini: {
      title: t("2. Choose your Gemini usage export", "2. 选择 Gemini 使用记录导出文件"),
      subtitle: t(
        "Pick the file downloaded from the Gemini billing or usage page.",
        "选择从 Gemini 费用或用量页面下载的文件。"
      ),
      locationLabel: t("File to choose", "需要选择的文件"),
      location: "usage export (.json or .csv)",
      locationHint: t(
        "The export is read on this device and is never uploaded.",
        "导出文件只在本机读取，不会上传。"
      ),
      fileLabel: t("Choose Gemini export", "选择 Gemini 导出文件"),
      directoryLabel: "",
      ownDataLabel: t("Choose my Gemini export", "选择我的 Gemini 导出文件")
    },
    other: {
      title: t("2. Choose your usage export", "2. 选择 AI 使用记录导出文件"),
      subtitle: t(
        "Pick the file downloaded from the AI provider or gateway.",
        "选择从 AI 服务商或网关下载的使用记录。"
      ),
      locationLabel: t("File to choose", "需要选择的文件"),
      location: "usage export (.json or .csv)",
      locationHint: t(
        "The export is read on this device and is never uploaded.",
        "导出文件只在本机读取，不会上传。"
      ),
      fileLabel: t("Choose JSON or CSV", "选择 JSON 或 CSV"),
      directoryLabel: "",
      ownDataLabel: t("Choose my usage export", "选择我的使用记录")
    }
  };

  const updateAuditButton = () => {
    const hasInput = selectedFiles.length > 0 || Boolean(textarea.value.trim());
    auditButton.disabled = !hasInput;
    auditButton.textContent = hasInput
      ? t("Find what used my credits", "查找异常消耗")
      : t("Choose usage history to continue", "选择使用记录后继续");
  };

  const resetFileSelection = (message = t("No usage history selected yet", "还没有选择使用记录")) => {
    selectedFiles = [];
    fileInput.value = "";
    directoryInput.value = "";
    selected.textContent = message;
    updateAuditButton();
  };

  const setFileSelection = (files) => {
    selectedFiles = Array.from(files || []);
    const totalBytes = selectedFiles.reduce((total, file) => total + Number(file.size || 0), 0);
    selected.textContent = selectedFiles.length === 1
      ? `${selectedFiles[0].name} · ${byteSize(totalBytes)}`
      : selectedFiles.length > 1
        ? t(
            `${number(selectedFiles.length)} files · ${byteSize(totalBytes)} combined`,
            `${number(selectedFiles.length)} 个文件 · 合计 ${byteSize(totalBytes)}`
          )
        : t("Nothing selected", "没有选择文件");
    if (selectedFiles.length) dispatchEngagement("audit_input_selected");
    updateAuditButton();
  };

  const setPlatform = (platform) => {
    currentPlatform = platform;
    const copy = platformCopy[platform] || platformCopy.other;
    dropTitle.textContent = copy.title;
    dropSubtitle.textContent = copy.subtitle;
    sourceLocationLabel.textContent = copy.locationLabel;
    sourceLocation.textContent = copy.location;
    sourceLocationHint.textContent = copy.locationHint;
    fileButtonLabel.textContent = copy.fileLabel;
    directoryButtonLabel.textContent = copy.directoryLabel;
    useOwnDataButton.textContent = copy.ownDataLabel;
    startAuditButton.textContent = copy.ownDataLabel;
    const supportsDirectory = usesDirectoryPicker(platform);
    directoryControl.hidden = !supportsDirectory;
    directoryControl.classList.toggle("primary-file-button", supportsDirectory);
    fileControl.classList.toggle("primary-file-button", !supportsDirectory);
    sessionControl.hidden = platform !== "codex";
    resetFileSelection();
    error.hidden = true;
  };

  const pickerInput = () => usesDirectoryPicker(currentPlatform)
    ? directoryInput
    : fileInput;

  const openCurrentPicker = () => {
    dispatchEngagement("audit_picker_opened");
    pickerInput().click();
  };

  fileInput.addEventListener("click", (event) => {
    if (event.isTrusted) dispatchEngagement("audit_picker_opened");
  });

  directoryInput.addEventListener("click", (event) => {
    if (event.isTrusted) dispatchEngagement("audit_picker_opened");
  });

  fileInput.addEventListener("change", () => {
    directoryInput.value = "";
    setFileSelection(fileInput.files);
  });

  textarea.addEventListener("input", () => {
    if (selectedFiles.length || textarea.value === syntheticSampleText) return;
    const hasPastedRecords = Boolean(textarea.value.trim());
    selected.textContent = hasPastedRecords
      ? t("Pasted records · stay in this browser", "已粘贴记录 · 仅在本机处理")
      : t("Nothing selected", "没有选择文件");
    if (hasPastedRecords) dispatchEngagement("audit_input_selected");
    updateAuditButton();
  });

  const selectDirectoryFiles = () => {
    fileInput.value = "";
    const isClaudeCode = currentPlatform === "claude-code";
    const hint = isClaudeCode ? "" : sessionFilter.value.trim();
    const selection = selectCodexRolloutFiles(directoryInput.files, {
      nameIncludes: hint
    });
    selectedFiles = selection.files;
    const skippedCount = Object.values(selection.skipped)
      .reduce((total, value) => total + value, 0);
    if (!selectedFiles.length) {
      selected.textContent = hint
        ? t("No rollout filename matched that session ID", "没有文件名匹配这个会话 ID")
        : t(
            `No compatible non-empty ${isClaudeCode ? "Claude Code session" : "Codex rollout"} files found`,
            `没有找到可用的${isClaudeCode ? " Claude Code 会话" : " Codex 记录"}文件`
          );
      error.textContent = hint
        ? t(
            "The selected folder does not contain a rollout whose path or filename includes that session ID.",
            "所选文件夹中没有路径或文件名包含这个会话 ID 的记录。"
          )
        : t(
            `Choose a ${isClaudeCode ? "Claude Code .claude/projects" : "Codex sessions"} folder containing non-empty .jsonl or .ndjson files.`,
            `请选择包含非空 .jsonl 或 .ndjson 文件的${isClaudeCode ? " Claude Code .claude/projects" : " Codex sessions"} 文件夹。`
          );
      error.hidden = false;
      updateAuditButton();
      return;
    }
    const matchText = hint
      ? t(
          `${number(selection.matchedFiles)} matching rollout${selection.matchedFiles === 1 ? "" : "s"} plus nearby files`,
          `${number(selection.matchedFiles)} 个匹配记录及其邻近文件`
        )
      : t(
          `${number(selectedFiles.length)} newest ${isClaudeCode ? "Claude Code session" : "Codex rollout"} files`,
          `已选择最新的 ${number(selectedFiles.length)} 个${isClaudeCode ? " Claude Code 会话" : " Codex 记录"}文件`
        );
    selected.textContent = `${matchText} · ${byteSize(selection.totalBytes)}${skippedCount ? t(` · ${number(skippedCount)} older, unsupported, empty, or large files skipped`, ` · 已跳过 ${number(skippedCount)} 个较旧、不支持、空白或过大的文件`) : ""}`;
    error.hidden = true;
    dispatchEngagement("audit_input_selected");
    updateAuditButton();
  };

  directoryInput.addEventListener("change", selectDirectoryFiles);
  sessionFilter.addEventListener("change", () => {
    if (directoryInput.files?.length) selectDirectoryFiles();
  });

  platformInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) setPlatform(input.value);
    });
  });

  const initialPlatformInput = platformInputs.find(
    (input) => input.value === initialPlatform
  );
  if (initialPlatformInput) initialPlatformInput.checked = true;
  setPlatform(initialPlatform);
  setText("example-title", auditSample.title);
  setText("example-detail", auditSample.detail);
  setText("example-note", auditSample.note);
  quickExampleButton.textContent = auditSample.button;
  sampleButton.textContent = auditSample.button;

  dropZone.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropZone.dataset.dragging = "true";
  });

  dropZone.addEventListener("dragleave", () => {
    delete dropZone.dataset.dragging;
  });

  dropZone.addEventListener("drop", (event) => {
    event.preventDefault();
    delete dropZone.dataset.dragging;
    fileInput.value = "";
    directoryInput.value = "";
    setFileSelection(event.dataTransfer?.files);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.hidden = true;
    const originalButtonText = auditButton.textContent;
    auditButton.disabled = true;
    auditButton.textContent = selectedFiles.length
      ? t("Scanning local files...", "正在扫描本机文件...")
      : t("Analyzing records...", "正在分析记录...");
    const source = (
      !selectedFiles.length && syntheticSampleText && textarea.value === syntheticSampleText
    ) ? "campaign_preview" : "user";
    const policy = resolveAuditRunPolicy(source);
    if (policy.trackJourney) dispatchEngagement("audit_started");
    try {
      const files = selectedFiles;
      if (files.length > MAX_SOURCE_FILES) {
        throw new Error(`Choose at most ${MAX_SOURCE_FILES} usage files at once.`);
      }
      const totalFileBytes = files.reduce((total, file) => total + file.size, 0);
      if (totalFileBytes > MAX_CODEX_STREAM_BYTES) {
        throw new Error("The combined local session streaming limit is 2 GB.");
      }
      currentAudit = files.length
        ? await parseCostUsageFiles(files)
        : parseCostUsageText(textarea.value);
      currentAuditCanCheckout = policy.allowCheckout;
      renderLocalAudit(currentAudit, policy);
    } catch (caught) {
      if (policy.trackJourney) dispatchEngagement("audit_failed");
      error.textContent = caught.message;
      error.hidden = false;
    } finally {
      auditButton.textContent = originalButtonText;
      updateAuditButton();
    }
  });

  const loadAuditSample = (source) => {
    const policy = resolveAuditRunPolicy(source);
    const samplePlatformInput = platformInputs.find(
      (input) => input.value === auditSample.platform
    );
    if (samplePlatformInput) samplePlatformInput.checked = true;
    setPlatform(auditSample.platform);
    syntheticSampleText = auditSample.records
      .map((record) => JSON.stringify(record))
      .join("\n");
    textarea.value = syntheticSampleText;
    resetFileSelection(
      source === "campaign_preview"
        ? t("Public incident example loaded · synthetic data", "已载入公开故障示例 · 模拟数据")
        : t("Example answer loaded · synthetic data", "已载入示例结果 · 模拟数据")
    );
    currentAudit = parseCostUsageText(syntheticSampleText);
    currentAuditCanCheckout = policy.allowCheckout;
    if (policy.trackSampleClick) dispatchEngagement("sample_clicked");
    renderLocalAudit(currentAudit, policy);
  };
  sampleButton.addEventListener("click", () => loadAuditSample("sample"));
  quickExampleButton.addEventListener("click", () => loadAuditSample("sample"));
  startAuditButton.addEventListener("click", (event) => {
    event.preventDefault();
    openCurrentPicker();
  });
  useOwnDataButton.addEventListener("click", () => {
    syntheticSampleText = "";
    textarea.value = "";
    currentAudit = null;
    currentAuditCanCheckout = false;
    resetAuditUi(document);
    resetFileSelection();
    error.hidden = true;
    openCurrentPicker();
  });

  document.getElementById("clear-button").addEventListener("click", () => {
    currentAudit = null;
    currentAuditCanCheckout = false;
    syntheticSampleText = "";
    textarea.value = "";
    resetFileSelection();
    sessionFilter.value = "";
    resetAuditUi(document);
    error.hidden = true;
    history.replaceState(null, "", buildClearedAuditLocation(window.location.href));
  });

  checkoutButton.addEventListener("click", async () => {
    if (!currentAudit || !currentAuditCanCheckout || checkoutButton.disabled) return;
    checkoutButton.disabled = true;
    const original = checkoutButton.textContent;
    checkoutButton.textContent = t("Creating private payment session...", "正在创建私密付款订单...");
    error.hidden = true;
    try {
      dispatchEngagement("cta_clicked");
      const audit = buildPrivateCheckoutAudit(currentAudit);
      const qa = new URLSearchParams(window.location.search).get("qa") === "1" ? "?qa=1" : "";
      const response = await fetch(`/api/agent-cost-audit-session${qa}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: isChinese() ? "zh" : "en", audit })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || t("Could not create the payment session.", "无法创建付款订单。"));
      showPayment(payload);
      document.getElementById("payment-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (caught) {
      error.textContent = caught.message;
      error.hidden = false;
    } finally {
      checkoutButton.disabled = false;
      checkoutButton.textContent = original;
    }
  });

  document.getElementById("wallet-payment").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const token = button.dataset.token;
    const payment = button._payment;
    const status = document.getElementById("payment-status");
    const original = button.textContent;
    try {
      if (!REPORT_TOKEN_PATTERN.test(token || "") || !payment) {
        throw new Error(t("Payment session is unavailable.", "付款订单不可用。"));
      }
      button.disabled = true;
      button.textContent = t("Waiting for wallet...", "正在等待钱包...");
      status.hidden = false;
      status.textContent = t("Confirm the Base USDC transfer in your wallet.", "请在钱包中确认 Base USDC 转账。");
      dispatchEngagement("wallet_payment_started");
      const transactionHash = await sendWalletPayment(payment);
      document.getElementById("transaction-hash").value = transactionHash;
      dispatchEngagement("transaction_hash_entered");
      dispatchEngagement("payment_confirmation_submitted");
      await confirmPayment(token, transactionHash);
    } catch (caught) {
      status.hidden = false;
      status.textContent = Number(caught?.code) === 4001
        ? t("Wallet action was cancelled. No payment was sent.", "钱包操作已取消，没有发出付款。")
        : caught.message;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  document.getElementById("transaction-hash").addEventListener("input", (event) => {
    if (TRANSACTION_HASH_PATTERN.test(event.currentTarget.value.trim())) {
      dispatchEngagement("transaction_hash_entered");
    }
  });

  document.getElementById("confirm-payment").addEventListener("click", async (event) => {
    const transactionHash = document.getElementById("transaction-hash").value.trim();
    const token = event.currentTarget.dataset.token;
    const status = document.getElementById("payment-status");
    try {
      if (!REPORT_TOKEN_PATTERN.test(token || "")) throw new Error(t("Payment session is unavailable.", "付款订单不可用。"));
      if (!TRANSACTION_HASH_PATTERN.test(transactionHash)) {
        throw new Error(t("Enter a complete 0x transaction hash.", "请输入完整的 0x 交易哈希。"));
      }
      event.currentTarget.disabled = true;
      dispatchEngagement("payment_confirmation_submitted");
      await confirmPayment(token, transactionHash);
    } catch (caught) {
      status.hidden = false;
      status.textContent = caught.message;
    } finally {
      event.currentTarget.disabled = false;
    }
  });

  const token = recoveryToken();
  if (token) {
    fetchDelivery(token).catch((caught) => {
      error.textContent = caught.message;
      error.hidden = false;
    });
  } else if (shouldAutoPreviewAuditSample(auditSample, {
    hasRequestedSession,
    hasRecoveryToken: false
  })) {
    loadAuditSample("campaign_preview");
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeTool, { once: true });
  } else {
    initializeTool();
  }
}
