import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildAuditVerdict,
  parseCostUsageText
} from "../src/auditor.mjs";

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

test("fails closed on unsupported options", () => {
  const result = spawnSync(process.execPath, [cliPath.pathname, "--upload"], {
    encoding: "utf8"
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unknown option: --upload/);
});
