#!/usr/bin/env node
// CLI entry for arca-mcp-recorder. Usage:
//   arca-mcp-recorder --wrap <command> [args...]
//
// Environment variables:
//   ARCA_RECORDER_URL   where to POST events (default: production)
//   ARCA_CHAIN_ID       required. Stable per-session / per-agent identifier.
//   ARCA_ACTOR          default: ARCA_CHAIN_ID
//   ARCA_CAPTURE_METHODS  comma-separated JSON-RPC methods to capture
//                       (default: tools/call,resources/read,sampling/createMessage)
//   ARCA_DEBUG=1        verbose stderr logging

import { runProxy } from "./proxy.js";
import type { RecorderConfig } from "./types.js";

const argv = process.argv.slice(2);

function die(msg: string, code = 2): never {
  console.error(`arca-mcp-recorder: ${msg}`);
  console.error(
    "usage: arca-mcp-recorder --wrap <command> [args...]\n" +
      "       (set ARCA_CHAIN_ID; see package README for all env vars)",
  );
  process.exit(code);
}

const wrapIdx = argv.indexOf("--wrap");
if (wrapIdx === -1) die("missing --wrap flag");
if (wrapIdx === argv.length - 1) die("no command after --wrap");

const command = argv[wrapIdx + 1]!;
const commandArgs = argv.slice(wrapIdx + 2);

const chainId = process.env.ARCA_CHAIN_ID;
if (!chainId) die("ARCA_CHAIN_ID env var is required");

const cfg: RecorderConfig = {
  recorderUrl:
    process.env.ARCA_RECORDER_URL ??
    "https://arca-recorder.goldencalf.workers.dev",
  chainId,
  actor: process.env.ARCA_ACTOR ?? chainId,
  captureMethods: new Set(
    (
      process.env.ARCA_CAPTURE_METHODS ??
      "tools/call,resources/read,sampling/createMessage"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ),
  logDebug: process.env.ARCA_DEBUG === "1",
};

if (cfg.logDebug) {
  console.error(`[arca] wrapping: ${command} ${commandArgs.join(" ")}`);
  console.error(
    `[arca] recorder=${cfg.recorderUrl} chain=${cfg.chainId} actor=${cfg.actor} capture=[${[...cfg.captureMethods].join(",")}]`,
  );
}

runProxy(cfg, command, commandArgs);
