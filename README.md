# Agent Cost Auditor

Find the AI session, retry, fallback, cache miss, or failed request that consumed your budget. The free audit reads your usage records locally and does not upload prompts, messages, or credentials.

## Fastest path

Open the [browser tool](https://mailcheck.agentcartai.com/tools/agent-cost-auditor/?utm_source=github&utm_medium=repository&utm_campaign=agent-cost-auditor), choose the AI system that lost budget, and use its automatic local command or select an export. The result identifies the highest-cost run and the recorded reason before any checkout.

No account or API key is required. Codex and Claude Code users can choose their local sessions folder directly; OpenCode, OpenClaw, Gemini, OpenRouter, Vercel AI Gateway, and generic JSON/JSONL/CSV exports are also supported.

## Run locally now

No checkout, account, API key, or package-registry publish is required. Node.js 20 or newer can run the repository directly through GitHub:

Automatically find the standard local records for Codex, Claude Code, or OpenClaw:

```bash
npm exec --yes --package=github:zac343/agent-cost-auditor#v0.5.3 -- agent-cost-audit --auto codex
npm exec --yes --package=github:zac343/agent-cost-auditor#v0.5.3 -- agent-cost-audit --auto claude-code
npm exec --yes --package=github:zac343/agent-cost-auditor#v0.5.3 -- agent-cost-audit --auto openclaw
```

Or audit an explicit export or directory:

```bash
npm exec --yes --package=github:zac343/agent-cost-auditor#v0.5.3 -- agent-cost-audit ./usage.jsonl
```

Audit the newest compatible Codex rollouts in a sessions directory, optionally centered on one session ID or filename:

```bash
npm exec --yes --package=github:zac343/agent-cost-auditor#v0.5.3 -- agent-cost-audit ~/.codex/sessions --session SESSION_ID
```

Piped JSON, JSONL, or CSV is also accepted:

```bash
cat usage.json | npm exec --yes --package=github:zac343/agent-cost-auditor#v0.5.3 -- agent-cost-audit --format json -
```

OpenCode can create a transcript-redacted session export while preserving its recorded cost and token fields:

```bash
opencode export --sanitize > session.json
npm exec --yes --package=github:zac343/agent-cost-auditor#v0.5.3 -- agent-cost-audit session.json
```

Add `--json` for a machine-readable audit and verdict. The CLI performs no network requests and prints the production evidence-pack URL only as an optional next step.

## What it detects

- replayed Codex rollout prefixes and blocking-poll usage
- Claude Code background or sidechain requests
- OpenCode session, model, outcome, recorded cost, and token breakdowns
- duplicate retries and recurring background spend
- provider switching and hidden model fallback
- explicit cache reads, low cache reuse, and missing cache evidence
- priced failed requests, unpriced usage, and reasoning-token reconciliation gaps
- OpenClaw transcripts, Gemini usage metadata, OpenRouter and Vercel AI Gateway exports

## Privacy model

Parsing and the free audit run in the browser. Raw logs, prompts, messages, API keys, wallet secrets, and credentials are not uploaded. The optional evidence-pack checkout sends only a bounded, aliased summary.

The source in `src/auditor.mjs` is the browser module used by the production tool. Its localization and clipboard dependencies are in `src/locale.mjs` and `src/clipboard.mjs`. Review them before selecting any local file.

## Supported inputs

- Codex rollout JSONL/NDJSON, including multi-file sessions-folder scans
- Claude Code JSONL/NDJSON
- OpenCode `export --sanitize` session JSON
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

## CLI options

```text
agent-cost-audit --auto <codex|claude-code|openclaw>
agent-cost-audit [options] <file-or-directory...>

--auto <app>     Find that app's standard local usage directory automatically
--session <id>   Center a directory scan on a Codex session ID or filename
--format <type>  Set piped input to json, jsonl, or csv
--json           Print the complete local audit and verdict as JSON
--help           Show command help
--version        Show the package version
```

Directory discovery reads only `.jsonl` and `.ndjson` files, follows no symlinks, and selects at most 200 files within the same 2 GB local streaming boundary as the production tool. Piped and other non-streaming exports retain the 10 MB limit.

## Verification

`SOURCE_SHA256` records the checksum of the mirrored module. The live script is:

```text
https://mailcheck.agentcartai.com/tools/agent-cost-auditor/auditor.mjs?v=39
```

## Limits

This tool reports evidence present in supplied usage records. A missing field is not proof of zero usage or zero cost. Provider invoices remain authoritative for billing, and findings should be validated against provider records before requesting a refund or changing production routing.

## License

MIT. See [LICENSE](LICENSE).
