import { Hono } from "hono";
import { envelopeHash, signingInput } from "./chain.js";
import { importRecorderKey, b64encode, signEd25519 } from "./crypto.js";
import { ACTIVE_KEY_ID, KEY_RING, activeKey } from "./keys.js";
import type {
  ChainHead,
  Envelope,
  SubmissionReceipt,
  UnsignedSubmission,
} from "./types.js";

type Env = {
  ISSUER: string;
  KEY_ID: string;
  ANCHOR_CONTRACT: string;
  ANCHOR_NETWORK: string;
  RECORDER_PRIVATE_KEY?: string;
  DB?: {
    prepare(query: string): {
      bind(
        ...args: unknown[]
      ): {
        all(): Promise<{ results: Array<Record<string, unknown>> }>;
        first(): Promise<Record<string, unknown> | null>;
        run(): Promise<{ meta: { last_row_id: number } }>;
      };
    };
  };
};

const app = new Hono<{ Bindings: Env }>();

const ONE_DAY_CACHE = "public, max-age=86400, s-maxage=86400";

app.get("/", (c) =>
  c.json({
    service: "arca",
    description:
      "Third-party execution recorder for AI agents. Hash-chained, Merkle-anchored (phase 3), independently verifiable receipts.",
    status: "phase 2 — recorder core live, Merkle anchoring in phase 3",
    repo: "https://github.com/arca-io/arca",
    architecture_doc: "https://github.com/arca-io/arca/blob/main/ARCHITECTURE.md",
    endpoints: [
      "POST /events — submit a signed envelope; recorder co-signs and chains it",
      "GET /events/:chain_id/:seq — fetch stored envelope",
      "GET /chains/:chain_id/head — current head of a chain",
      "GET /.well-known/arca-public-key — issuer public keys for verification",
    ],
    issuer: c.env.ISSUER,
    key_id: c.env.KEY_ID,
    anchor_network: c.env.ANCHOR_NETWORK,
  }),
);

app.get("/.well-known/arca-public-key", (c) => {
  c.header("Cache-Control", ONE_DAY_CACHE);
  return c.json({
    issuer: c.env.ISSUER,
    active_key_id: ACTIVE_KEY_ID,
    keys: KEY_RING,
    verification_note:
      "The recorder signature covers the canonical JSON (RFC 8785) of {v, event, chain}. Base64-decode the signature and verify with the public key whose active window covers envelope.event.ts.",
    verifier_lib: "https://www.npmjs.com/package/@arca-io/verify (phase 4)",
  });
});

// Basic shape validation. Returns null on error message if valid.
function validateSubmission(x: unknown): string | null {
  if (!x || typeof x !== "object") return "body must be a JSON object";
  const o = x as Record<string, unknown>;
  if (o.v !== "arca/1") return "v must be 'arca/1'";
  if (!o.event || typeof o.event !== "object") return "event required";
  if (!o.chain || typeof o.chain !== "object") return "chain required";
  if (!o.signatures || typeof o.signatures !== "object")
    return "signatures required";
  const ev = o.event as Record<string, unknown>;
  for (const k of [
    "intent",
    "actor",
    "tool",
    "inputs_hash",
    "result",
    "ts",
  ]) {
    if (typeof ev[k] !== "string") return `event.${k} must be a string`;
  }
  if (!["ok", "error", "timeout", "cancelled"].includes(ev.result as string))
    return "event.result must be ok|error|timeout|cancelled";
  if (
    ev.outputs_hash !== null &&
    typeof ev.outputs_hash !== "string"
  )
    return "event.outputs_hash must be string or null";
  if (ev.authority !== null && typeof ev.authority !== "string")
    return "event.authority must be string or null";
  const ch = o.chain as Record<string, unknown>;
  if (typeof ch.chain_id !== "string") return "chain.chain_id must be a string";
  if (typeof ch.seq !== "number" || !Number.isInteger(ch.seq) || ch.seq < 0)
    return "chain.seq must be a non-negative integer";
  if (ch.prev_hash !== null && typeof ch.prev_hash !== "string")
    return "chain.prev_hash must be a string or null";
  return null;
}

app.post("/events", async (c) => {
  if (!c.env.DB)
    return c.json({ error: "DB binding missing on this Worker" }, 500);
  if (!c.env.RECORDER_PRIVATE_KEY)
    return c.json({ error: "recorder key missing" }, 500);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const err = validateSubmission(body);
  if (err) return c.json({ error: err }, 400);

  const submission = body as UnsignedSubmission;
  const { chain_id, seq, prev_hash } = submission.chain;

  // Check chain head. seq must equal head_seq+1 (or be 0 if no head).
  const head = await c.env.DB.prepare(
    "SELECT head_seq, head_hash FROM chains WHERE chain_id = ?",
  )
    .bind(chain_id)
    .first();

  if (!head) {
    if (seq !== 0)
      return c.json({ error: `chain ${chain_id} has no head; seq must be 0` }, 409);
    if (prev_hash !== null)
      return c.json({ error: "seq=0 must have prev_hash=null" }, 400);
  } else {
    const expectedSeq = (head.head_seq as number) + 1;
    if (seq !== expectedSeq)
      return c.json(
        {
          error: `seq must be ${expectedSeq} (current head is ${head.head_seq})`,
          current_head_seq: head.head_seq,
          current_head_hash: head.head_hash,
        },
        409,
      );
    if (prev_hash !== head.head_hash)
      return c.json(
        {
          error: "prev_hash does not match current chain head",
          expected_prev_hash: head.head_hash,
        },
        409,
      );
  }

  // Sign the envelope (minus signatures) with the recorder key.
  const unsignedCore = {
    v: submission.v,
    event: submission.event,
    chain: submission.chain,
  };
  const sigKey = await importRecorderKey(c.env.RECORDER_PRIVATE_KEY);
  const sigBytes = await signEd25519(sigKey, signingInput(unsignedCore));
  const recorderSig = b64encode(sigBytes);

  const envelope: Envelope = {
    ...unsignedCore,
    signatures: {
      actor: submission.signatures.actor ?? null,
      recorder: recorderSig,
    },
  };
  const env_hash = await envelopeHash(unsignedCore);

  const nowSec = Math.floor(Date.now() / 1000);
  let tsSec = Math.floor(new Date(submission.event.ts).getTime() / 1000);
  if (!Number.isFinite(tsSec)) tsSec = nowSec;

  // Persist event + update chain head. D1 doesn't support real transactions
  // yet in Workers; the uniqueness constraint on (chain_id, seq) prevents
  // double-insert, and we update chains after the insert succeeds.
  try {
    await c.env.DB.prepare(
      `INSERT INTO events
        (chain_id, seq, envelope_json, envelope_hash, prev_hash, actor, tool, result, ts, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        chain_id,
        seq,
        JSON.stringify(envelope),
        env_hash,
        prev_hash,
        submission.event.actor,
        submission.event.tool,
        submission.event.result,
        tsSec,
        nowSec,
      )
      .run();
  } catch (e) {
    return c.json(
      {
        error: `insert failed (chain head may have moved): ${(e as Error).message}`,
      },
      409,
    );
  }

  await c.env.DB.prepare(
    `INSERT INTO chains (chain_id, head_seq, head_hash, created_at, updated_at, event_count)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(chain_id) DO UPDATE SET
       head_seq = excluded.head_seq,
       head_hash = excluded.head_hash,
       updated_at = excluded.updated_at,
       event_count = chains.event_count + 1`,
  )
    .bind(chain_id, seq, env_hash, nowSec, nowSec)
    .run();

  const receipt: SubmissionReceipt = {
    ok: true,
    chain_id,
    seq,
    envelope_hash: env_hash,
    envelope,
  };
  return c.json(receipt, 201);
});

app.get("/chains/:chain_id/head", async (c) => {
  if (!c.env.DB) return c.json({ error: "DB binding missing" }, 500);
  const chain_id = c.req.param("chain_id");
  const row = await c.env.DB.prepare(
    "SELECT head_seq, head_hash, event_count, created_at, updated_at FROM chains WHERE chain_id = ?",
  )
    .bind(chain_id)
    .first();
  if (!row) return c.json({ chain_id, head: null }, 404);
  const head: ChainHead = {
    chain_id,
    head_seq: row.head_seq as number,
    head_hash: row.head_hash as string,
    event_count: row.event_count as number,
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  };
  return c.json(head);
});

app.get("/events/:chain_id/:seq", async (c) => {
  if (!c.env.DB) return c.json({ error: "DB binding missing" }, 500);
  const chain_id = c.req.param("chain_id");
  const seqStr = c.req.param("seq");
  const seq = Number.parseInt(seqStr, 10);
  if (!Number.isInteger(seq) || seq < 0)
    return c.json({ error: "seq must be a non-negative integer" }, 400);

  const row = await c.env.DB.prepare(
    "SELECT envelope_json, envelope_hash, epoch_id, epoch_leaf_idx FROM events WHERE chain_id = ? AND seq = ?",
  )
    .bind(chain_id, seq)
    .first();
  if (!row) return c.json({ error: "not found" }, 404);
  return c.json({
    envelope: JSON.parse(row.envelope_json as string),
    envelope_hash: row.envelope_hash,
    epoch_id: row.epoch_id,
    epoch_leaf_idx: row.epoch_leaf_idx,
    inclusion_proof: null, // populated in phase 3
  });
});

export default app;
