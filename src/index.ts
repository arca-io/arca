import { Hono } from "hono";

type Env = {
  ISSUER: string;
  KEY_ID: string;
  ANCHOR_CONTRACT: string;
  ANCHOR_NETWORK: string;
  RECORDER_PRIVATE_KEY?: string;
  ANCHORER_PRIVATE_KEY?: string;
};

const app = new Hono<{ Bindings: Env }>();

// Service manifest. Discovery-friendly; machine-readable.
app.get("/", (c) =>
  c.json({
    service: "arca",
    description:
      "Third-party execution recorder for AI agents. Hash-chained, Merkle-anchored, independently verifiable receipts of every tool call. VOLT-conformant, content-optional, open-verifier.",
    status: "phase 1 scaffold; recorder core shipping in phase 2",
    repo: "https://github.com/arca-io/arca",
    architecture_doc: "https://github.com/arca-io/arca/blob/main/ARCHITECTURE.md",
    endpoints_planned: [
      "POST /events — submit a signed, hash-chained event",
      "GET /events/:chain_id/:seq — fetch a stored event",
      "GET /chains/:chain_id/head — current head of a chain",
      "GET /epoch/:id/proof/:seq — Merkle inclusion proof",
      "GET /.well-known/arca-public-key — issuer public key for verification",
    ],
    issuer: c.env.ISSUER,
    key_id: c.env.KEY_ID,
    anchor_network: c.env.ANCHOR_NETWORK,
  }),
);

// Placeholder for the public key endpoint. Phase 2 will populate once the
// signing key material is in Worker secrets.
app.get("/.well-known/arca-public-key", (c) =>
  c.json({
    issuer: c.env.ISSUER,
    key_id: c.env.KEY_ID,
    algorithm: "Ed25519",
    status: "pending — phase 2 scaffold populates this",
  }),
);

export default app;
