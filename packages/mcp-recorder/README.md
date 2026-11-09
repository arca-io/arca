# @arca-io/mcp-recorder

Zero-code MCP interceptor that captures every tool call, resource read, and sampling call made by an agent — and emits signed, hash-chained events to the Arca recorder.

> **Status:** scaffold only; implementation lands in Phase 5. Likely a fork/extension of [mcp-audit-proxy](https://github.com/) or similar.

## Install (when published)

```bash
npm install -g @arca-io/mcp-recorder
```

## Usage for Claude Desktop (planned)

In `claude_desktop_config.json`, wrap your existing MCP servers:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "arca-mcp-recorder",
      "args": ["--wrap", "npx", "-y", "@modelcontextprotocol/server-filesystem", "/Users/me/Documents"],
      "env": {
        "ARCA_RECORDER_URL": "https://arca-recorder.goldencalf.workers.dev",
        "ARCA_CHAIN_ID": "claude-desktop-me",
        "ARCA_ACTOR_KEY": "optional-ed25519-seed"
      }
    }
  }
}
```

Every `tools/call`, `resources/read`, and `sampling/createMessage` is intercepted; the arguments are hashed (never sent raw), the event is signed with your optional actor key and the Arca recorder key, and the receipt is stored in the hash chain.

## Why this matters

Without an interceptor, the agent reports on itself. Self-reporting is falsifiable. With Arca's interceptor, the recorder is third-party: the agent cannot forge records of calls it didn't make or hide calls it did make, because the record is produced by a process it does not control.

See the main [Arca ARCHITECTURE.md](../../ARCHITECTURE.md) for the full protocol.

## License

MIT
