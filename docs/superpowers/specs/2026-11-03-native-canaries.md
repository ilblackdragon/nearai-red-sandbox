# Native managed canaries

Approved scope: managed host-only canaries and guest decoys, with agent-visible exact-match detection events and a session summary. The user requested implementation after the design discussion.

`canaries` is an optional session-config array of `{ "id": "review-credential", "placement": "guest" }` or placement `host`. IDs are unique, bounded safe identifiers; at most 16 entries. No user-supplied real token values. Each session generates independent CSPRNG tokens. Host-only files and the value-bearing registry stay in private host runtime storage; guest decoys and a value-free manifest use a fresh managed guest directory. The manifest lists IDs, placements and paths, including host paths but never host values. Do not alter submitted inputs or overwrite operator files.

The trusted Rust tool bridge scans bounded returned text (including errors), records exact-token observations and redacts matching tokens before passing output to OpenCode. Notices tell the agent that synthetic token contents appeared in returned output, not that external exfiltration occurred. A host-side JSONL audit contains IDs, placement and observation metadata, never tokens or surrounding output. Failure to load the registry or persist a tool observation refuses the result. Missing or failed coverage must not look clean.

After safe output extraction, scan regular exported files for exact byte matches, including binary data and matches spanning buffer boundaries. Preserve exported files as evidence. Reject symlinks and special files during host scanning. Teardown logs and a JSON summary report observations and whether export scanning completed. Export failures remain explicit and cleanup still happens.

Alternatives considered: full guest access monitoring and external callback tokens. Both deferred; this first version scans observable outputs, works without guest network, and does not observe suppressed reads, encoded/partial copies, network payloads or bytes outside tool capture limits. Guest-controlled reports are not trusted alerts. No-match is not proof of no access.

Validation: meaningful unit tests for configuration, separation, redaction and durable evidence; session integration tests for setup/teardown and failures; existing Rust/Bun suites; real microVM host-isolation/guest-token/export checks; live OpenCode agent notice when available.
