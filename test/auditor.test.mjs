import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildAuditVerdict,
  buildFreeSupportSummary,
  parseCostUsageText
} from "../src/auditor.mjs";
import { writeClipboardText } from "../src/clipboard.mjs";

test("copies through a local selection when an embedded browser denies Clipboard API", async () => {
  let appended = null;
  let removed = false;
  const textarea = {
    value: "",
    style: {},
    setAttribute() {},
    select() {},
    setSelectionRange() {},
    remove() { removed = true; }
  };
  const documentRef = {
    body: { appendChild(node) { appended = node; } },
    createElement() { return textarea; },
    execCommand(command) {
      return command === "copy" && appended?.value === "safe summary";
    }
  };

  const route = await writeClipboardText("safe summary", {
    clipboard: { writeText: async () => { throw new Error("denied"); } },
    documentRef
  });

  assert.equal(route, "selection");
  assert.equal(removed, true);
});

test("flags priced failed work without requiring a browser", () => {
  const audit = parseCostUsageText(JSON.stringify({
    provider: "openai",
    model: "gpt-5-mini",
    status: "failed",
    usage: {
      input_tokens: 1000,
      output_tokens: 10
    },
    cost_usd: 0.01
  }));

  assert.equal(audit.summary.failedOrCancelledRecords, 1);
  assert.equal(audit.summary.failedCostUsd, 0.01);
  assert.match(buildAuditVerdict(audit).title, /Failed work/);
});

test("builds a locally shareable free summary without raw record content", () => {
  const audit = parseCostUsageText(JSON.stringify({
    provider: "openai",
    model: "private-model-name",
    agent_id: "private-agent-name",
    feature: "private-feature-name",
    status: "failed",
    usage: { input_tokens: 1000, output_tokens: 10 },
    cost_usd: 0.01,
    message: "PRIVATE MESSAGE"
  }));
  const summary = buildFreeSupportSummary(audit);

  assert.match(summary, /AI usage incident summary/);
  assert.match(summary, /Evidence: 1 records checked/);
  assert.match(summary, /\$0\.0100 failed-call cost/);
  assert.match(summary, /Privacy: generated locally/);
  assert.doesNotMatch(summary, /private-agent-name|private-feature-name|private-model-name|PRIVATE MESSAGE/);
});

test("parses an OpenCode sanitized export without double-counting its session total", () => {
  const audit = parseCostUsageText(JSON.stringify({
    info: {
      id: "ses_private",
      cost: 0.25,
      tokens: {
        input: 50,
        output: 20,
        reasoning: 5,
        cache: { read: 100, write: 10 }
      },
      model: { providerID: "openrouter", id: "claude-sonnet-4" },
      time: { created: 1785517200000, updated: 1785517260000 }
    },
    messages: [{
      info: {
        id: "msg_assistant",
        role: "assistant",
        providerID: "openrouter",
        modelID: "claude-sonnet-4",
        cost: 0.25,
        tokens: {
          input: 50,
          output: 20,
          reasoning: 5,
          cache: { read: 100, write: 10 }
        },
        time: { created: 1785517201000, completed: 1785517260000 },
        finish: "stop"
      },
      parts: [{ type: "text", text: "PRIVATE CONTENT" }]
    }]
  }));

  assert.equal(audit.recordCount, 1);
  assert.equal(audit.summary.totalCostUsd, 0.25);
  assert.equal(audit.summary.inputTokens, 160);
  assert.equal(audit.summary.cachedTokens, 100);
  assert.equal(JSON.stringify(audit).includes("PRIVATE CONTENT"), false);
});

test("prices independent Anthropic cache counters without charging writes twice", () => {
  const audit = parseCostUsageText(JSON.stringify([{
    model: "claude-opus",
    usage: {
      input_tokens: 10,
      output_tokens: 2,
      cache_read_input_tokens: 20,
      cache_creation_input_tokens: 30
    },
    input_rate_per_million: 1,
    output_rate_per_million: 10,
    cached_rate_per_million: 0.1,
    cache_write_rate_per_million: 2
  }]), { format: "json" });

  assert.equal(audit.summary.inputTokens, 60);
  assert.equal(audit.summary.cachedTokens, 20);
  assert.equal(audit.summary.cacheWriteTokens, 30);
  assert.equal(audit.summary.totalCostUsd, 0.000092);
});

test("parses AI SDK 7 nested reasoning and cache token details", () => {
  const audit = parseCostUsageText(JSON.stringify([{
    provider: "wafer-ai",
    model: "zai/glm-5.2-fast",
    status: "succeeded",
    usage: {
      inputTokens: 2_000,
      inputTokenDetails: {
        noCacheTokens: 1_000,
        cacheReadTokens: 900,
        cacheWriteTokens: 100
      },
      outputTokens: 500,
      outputTokenDetails: {
        textTokens: 300,
        reasoningTokens: 200
      }
    }
  }]), { format: "json" });

  assert.equal(audit.summary.inputTokens, 2_000);
  assert.equal(audit.summary.outputTokens, 500);
  assert.equal(audit.summary.reasoningTokens, 200);
  assert.equal(audit.summary.cachedTokens, 900);
  assert.equal(audit.summary.cacheWriteTokens, 100);
});

const cliPath = new URL("../bin/agent-cost-audit.mjs", import.meta.url);
const failedUsage = JSON.stringify({
  provider: "openai",
  model: "gpt-5-mini",
  status: "failed",
  usage: {
    input_tokens: 1000,
    output_tokens: 10
  },
  cost_usd: 0.01
});

test("ships a public executable package instead of a private library-only artifact", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8")
  );

  assert.equal(packageJson.private, undefined);
  assert.equal(packageJson.bin["agent-cost-audit"], "./bin/agent-cost-audit.mjs");
  assert.match(packageJson.homepage, /^https:\/\/mailcheck\.agentcartai\.com\//);
});

test("runs a file audit as a real CLI process and returns structured evidence", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-cost-auditor-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = path.join(directory, "usage.json");
  await writeFile(fixture, failedUsage, "utf8");

  const result = spawnSync(process.execPath, [cliPath.pathname, "--json", fixture], {
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  const output = JSON.parse(result.stdout);
  assert.equal(output.audit.summary.failedOrCancelledRecords, 1);
  assert.equal(output.audit.summary.failedCostUsd, 0.01);
  assert.match(output.verdict.title, /Failed work/);
  assert.equal(output.privacy.networkRequestsMade, false);
});

test("accepts bounded stdin and prints a useful human verdict", () => {
  const result = spawnSync(
    process.execPath,
    [cliPath.pathname, "--format", "json", "-"],
    { encoding: "utf8", input: failedUsage }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Failed work still consumed recorded usage/);
  assert.match(result.stdout, /Priced failed spend\s+\$0\.0100/);
  assert.match(result.stdout, /No usage data was uploaded/);
});

test("discovers a requested Codex rollout inside a sessions directory", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "agent-cost-auditor-sessions-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const nested = path.join(directory, "2026", "08", "01");
  await mkdir(nested, { recursive: true });
  const fixture = path.join(nested, "rollout-SESSION-123.jsonl");
  await writeFile(fixture, [
    {
      timestamp: "2026-08-01T00:00:00Z",
      type: "session_meta",
      payload: {
        id: "SESSION-123",
        timestamp: "2026-08-01T00:00:00Z",
        model_provider: "openai"
      }
    },
    {
      timestamp: "2026-08-01T00:00:00Z",
      type: "turn_context",
      payload: { model: "gpt-5" }
    },
    {
      timestamp: "2026-08-01T00:00:01Z",
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          last_token_usage: {
            input_tokens: 1000,
            cached_input_tokens: 200,
            output_tokens: 50,
            reasoning_output_tokens: 10,
            total_tokens: 1050
          }
        }
      }
    }
  ].map((record) => JSON.stringify(record)).join("\n"), "utf8");

  const result = spawnSync(
    process.execPath,
    [cliPath.pathname, "--json", "--session", "SESSION-123", directory],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.audit.sourceFormat, "jsonl");
  assert.equal(output.audit.recordCount, 1);
  assert.equal(output.audit.summary.inputTokens, 1000);
  assert.equal(output.audit.summary.cachedTokens, 200);
});

test("auto-discovers the standard Codex, Claude Code, and OpenClaw directories", async (t) => {
  const home = await mkdtemp(path.join(os.tmpdir(), "agent-cost-auditor-home-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const fixtures = [
    ["codex", path.join(home, ".codex", "sessions", "2026", "08", "02", "rollout.jsonl")],
    ["claude-code", path.join(home, ".claude", "projects", "project", "session.jsonl")],
    ["openclaw", path.join(home, ".openclaw", "agents", "main", "sessions", "session.jsonl")]
  ];

  for (const [, fixture] of fixtures) {
    await mkdir(path.dirname(fixture), { recursive: true });
    await writeFile(fixture, failedUsage, "utf8");
  }

  for (const [platform] of fixtures) {
    const result = spawnSync(
      process.execPath,
      [cliPath.pathname, "--json", "--auto", platform],
      {
        encoding: "utf8",
        env: { ...process.env, HOME: home }
      }
    );
    assert.equal(result.status, 0, `${platform}: ${result.stderr}`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.audit.summary.failedOrCancelledRecords, 1, platform);
    assert.equal(output.audit.summary.failedCostUsd, 0.01, platform);
  }
});

test("auto-discovery rejects unsupported apps and incompatible argument combinations", () => {
  const unsupported = spawnSync(
    process.execPath,
    [cliPath.pathname, "--auto", "gemini"],
    { encoding: "utf8" }
  );
  assert.notEqual(unsupported.status, 0);
  assert.match(unsupported.stderr, /--auto must be codex, claude-code, or openclaw/);

  const combined = spawnSync(
    process.execPath,
    [cliPath.pathname, "--auto", "codex", "usage.jsonl"],
    { encoding: "utf8" }
  );
  assert.notEqual(combined.status, 0);
  assert.match(combined.stderr, /--auto cannot be combined/);

  const wrongSessionPlatform = spawnSync(
    process.execPath,
    [cliPath.pathname, "--auto", "openclaw", "--session", "abc123"],
    { encoding: "utf8" }
  );
  assert.notEqual(wrongSessionPlatform.status, 0);
  assert.match(wrongSessionPlatform.stderr, /--session can be combined only with --auto codex/);
});

test("fails closed on unsupported options", () => {
  const result = spawnSync(process.execPath, [cliPath.pathname, "--upload"], {
    encoding: "utf8"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown option: --upload/);
});
