#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import {
  buildAuditVerdict,
  parseCostUsageFiles,
  parseCostUsageText,
  selectCodexRolloutFiles
} from "../src/auditor.mjs";

const MAX_STDIN_BYTES = 10 * 1024 * 1024;
const MAX_DISCOVERED_FILES = 10_000;
const EVIDENCE_PACK_URL = "https://mailcheck.agentcartai.com/tools/agent-cost-auditor/"
  + "?utm_source=github&utm_medium=cli&utm_campaign=agent-cost-auditor";
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8")
);

function helpText() {
  return `Agent Cost Auditor ${packageJson.version}

Usage:
  agent-cost-audit [options] <file-or-directory...>
  cat usage.jsonl | agent-cost-audit [--format jsonl] -

Options:
  --session <id>   Center a directory scan on a Codex session ID or filename
  --format <type>  Set piped input to json, jsonl, or csv
  --json           Print the complete local audit and verdict as JSON
  --help           Show this help
  --version        Show the package version

All parsing stays in this process. The CLI performs no network requests.`;
}

function parseArguments(argv) {
  const options = {
    format: null,
    help: false,
    json: false,
    session: "",
    version: false,
    inputs: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (argument === "--version" || argument === "-v") {
      options.version = true;
      continue;
    }
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--session" || argument === "--format") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;
      if (argument === "--session") options.session = value.trim();
      if (argument === "--format") options.format = value.toLowerCase();
      continue;
    }
    if (argument.startsWith("-") && argument !== "-") {
      throw new Error(`Unknown option: ${argument}`);
    }
    options.inputs.push(argument);
  }

  if (options.format && !["json", "jsonl", "csv"].includes(options.format)) {
    throw new Error("--format must be json, jsonl, or csv.");
  }
  return options;
}

function nodeFile(filePath, fileStat, root = null) {
  const relativePath = root ? path.relative(root, filePath) : path.basename(filePath);
  return {
    name: path.basename(filePath),
    size: fileStat.size,
    lastModified: fileStat.mtimeMs,
    webkitRelativePath: relativePath,
    text: () => readFile(filePath, "utf8"),
    stream: () => Readable.toWeb(createReadStream(filePath))
  };
}

async function discoverDirectory(root) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }
      if (!entry.isFile() || !/\.(?:jsonl|ndjson)$/i.test(entry.name)) continue;
      files.push(nodeFile(entryPath, await stat(entryPath), root));
      if (files.length > MAX_DISCOVERED_FILES) {
        throw new Error(
          `Directory discovery exceeds ${MAX_DISCOVERED_FILES.toLocaleString()} compatible files.`
        );
      }
    }
  }
  return files;
}

async function resolveFiles(inputs, session) {
  const explicit = [];
  const discovered = [];
  for (const input of inputs) {
    const resolved = path.resolve(input);
    const inputStat = await lstat(resolved).catch((error) => {
      if (error?.code === "ENOENT") throw new Error(`Input does not exist: ${input}`);
      throw error;
    });
    if (inputStat.isSymbolicLink()) {
      throw new Error(`Symbolic-link inputs are not accepted: ${input}`);
    }
    if (inputStat.isDirectory()) {
      discovered.push(...await discoverDirectory(resolved));
      continue;
    }
    if (!inputStat.isFile()) throw new Error(`Input is not a file or directory: ${input}`);
    explicit.push(nodeFile(resolved, inputStat));
  }

  if (!discovered.length) return explicit;
  const selection = selectCodexRolloutFiles(discovered, { nameIncludes: session });
  if (session && !selection.files.length) {
    throw new Error(`No compatible session file contains: ${session}`);
  }
  if (!selection.files.length) {
    throw new Error("No compatible JSONL or NDJSON session files were found.");
  }
  return [...explicit, ...selection.files];
}

async function readStdin() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.byteLength;
    if (bytes > MAX_STDIN_BYTES) {
      throw new Error("Piped input exceeds the 10 MB local limit.");
    }
    chunks.push(buffer);
  }
  if (!bytes) throw new Error("Piped input is empty.");
  return Buffer.concat(chunks).toString("utf8");
}

function money(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  });
}

function percent(value) {
  return value == null ? "not observed" : `${Math.round(value * 100)}%`;
}

function humanOutput(audit, verdict) {
  const summary = audit.summary;
  return [
    "Agent Cost Auditor",
    `Verdict              ${verdict.title}`,
    `Records              ${audit.recordCount.toLocaleString()}`,
    `Priced cost          $${money(summary.totalCostUsd)}`,
    `Priced failed spend  $${money(summary.failedCostUsd)}`,
    `Fallback records     ${summary.fallbackRecords.toLocaleString()}`,
    `Replayed records     ${summary.replayedUsageRecords.toLocaleString()}`,
    `Background records   ${summary.backgroundRecords.toLocaleString()}`,
    `Unmetered tool use   ${summary.unmeteredToolUseRecords.toLocaleString()}`,
    `Observed cache read  ${percent(summary.cacheReadRatio)}`,
    "",
    verdict.detail,
    "",
    "No usage data was uploaded. This CLI made no network requests.",
    `Optional private evidence pack: ${EVIDENCE_PACK_URL}`
  ].join("\n");
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${helpText()}\n`);
    return;
  }
  if (options.version) {
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }

  const stdinRequested = options.inputs.includes("-") || (
    options.inputs.length === 0 && !process.stdin.isTTY
  );
  if (stdinRequested && options.inputs.some((input) => input !== "-")) {
    throw new Error("Piped input cannot be combined with file or directory inputs.");
  }
  if (!stdinRequested && !options.inputs.length) {
    throw new Error(`Choose a file or directory.\n\n${helpText()}`);
  }
  if (options.format && !stdinRequested) {
    throw new Error("--format is available only for piped input.");
  }
  if (options.session && stdinRequested) {
    throw new Error("--session requires a sessions directory.");
  }

  const audit = stdinRequested
    ? parseCostUsageText(await readStdin(), {
      fileName: options.format ? `stdin.${options.format}` : "",
      format: options.format || undefined
    })
    : await parseCostUsageFiles(await resolveFiles(options.inputs, options.session));
  const verdict = buildAuditVerdict(audit);
  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      audit,
      verdict,
      privacy: {
        networkRequestsMade: false,
        usageDataUploaded: false
      },
      evidencePackUrl: EVIDENCE_PACK_URL
    }, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${humanOutput(audit, verdict)}\n`);
}

main().catch((error) => {
  process.stderr.write(`agent-cost-audit: ${error?.message || error}\n`);
  process.exitCode = 1;
});
