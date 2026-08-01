import assert from "node:assert/strict";
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
