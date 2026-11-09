# @arca-io/verify

Standalone offline verifier for Arca receipts. Checks hash-chain integrity, Merkle inclusion, and signature validity — all without contacting Arca's servers.

> **Status:** scaffold only; implementation lands in Phase 4.

## Install (when published)

```bash
npm install @arca-io/verify
```

## Usage (planned API)

```ts
import { verify } from "@arca-io/verify";

const bundle = {
  envelope: /* the Arca event envelope */,
  prev_envelope: /* optional; needed to verify chain link */,
  inclusion_proof: /* Merkle siblings for this epoch */,
  epoch_anchor_tx: /* Base tx hash where the Merkle root was anchored */,
};

const result = await verify(bundle, {
  base_rpc: "https://mainnet.base.org",
  // Arca public key fetched from /.well-known/arca-public-key or passed inline
});

if (result.valid) {
  // All five checks passed:
  //   1. anchor tx exists on Base, Merkle root extracted
  //   2. envelope hash + inclusion proof reproduce the root
  //   3. envelope.chain.prev_hash matches hash of prev_envelope
  //   4. recorder signature verifies under Arca's published key
  //   5. (optional) actor signature verifies under actor's claimed key
}
```

## Design

- Zero runtime dependencies beyond Node's `crypto`
- All verification is local; the only network call is reading the Base anchor tx
- Reference implementation in both TypeScript (`@arca-io/verify`) and Python (`arca-verify`)

See the main [Arca ARCHITECTURE.md](../../ARCHITECTURE.md) for the full protocol.

## License

MIT
