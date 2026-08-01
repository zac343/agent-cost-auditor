# Agent Cost Auditor

A browser-local audit core for finding expensive AI-agent behavior in real usage exports.

Production tool: https://mailcheck.agentcartai.com/tools/agent-cost-auditor/

## What it detects

- replayed Codex rollout prefixes and blocking-poll usage
- Claude Code background or sidechain requests
- duplicate retries and recurring background spend
- provider switching and hidden model fallback
- explicit cache reads, low cache reuse, and missing cache evidence
- priced failed requests, unpriced usage, and reasoning-token reconciliation gaps
- OpenClaw transcripts, Gemini usage metadata, OpenRouter and Vercel AI Gateway exports

## Privacy model

Parsing and the free audit run in the browser. Raw logs, prompts, messages, API keys, wallet secrets, and credentials are not uploaded. The optional evidence-pack checkout sends only a bounded, aliased summary.

The source in `src/auditor.mjs` is the browser module used by the production tool. Review it before selecting any local file.

## Supported inputs

- Codex rollout JSONL/NDJSON, including multi-file sessions-folder scans
- Claude Code JSONL/NDJSON
- OpenClaw session transcripts
- Gemini usage metadata
- OpenRouter and Vercel AI Gateway generation exports
- generic JSON, JSONL, NDJSON, CSV, and TSV usage rows

Codex and Claude Code streams are handled locally up to 2 GB. Other combined inputs are limited to 10 MB by the production UI.

## Use the parser

The module is dependency-free ESM and guards DOM initialization, so exported parsing functions can be imported in Node or a browser:

```js
import { parseCostUsageText, buildAuditVerdict } from "./src/auditor.mjs";

const audit = parseCostUsageText(jsonlText, { platform: "codex" });
const verdict = buildAuditVerdict(audit);
console.log(verdict);
```

The production module also contains UI, checkout, and delivery integration. Import only the named functions you need.

## Verification

`SOURCE_SHA256` records the checksum of the mirrored module. The live script is:

```text
https://mailcheck.agentcartai.com/tools/agent-cost-auditor/auditor.mjs?v=17
```

## Limits

This tool reports evidence present in supplied usage records. A missing field is not proof of zero usage or zero cost. Provider invoices remain authoritative for billing, and findings should be validated against provider records before requesting a refund or changing production routing.

## License

MIT. See [LICENSE](LICENSE).
# agent-cost-auditor
Browser-local AI agent cost audit core. Detect duplicate retries, fallback storms, cache misses, and wasted paid requests without uploading raw logs.
