# Native canaries implementation plan

Goal: ship the approved managed-canary design in docs/superpowers/specs/2026-11-03-native-canaries.md.
Architecture: host registry + guest decoy/manifest installation, Rust tool-result observation, safe export scanning, session summary.
Tech stack: existing Rust and TypeScript code; no added dependencies or guest packages.

- [x] Core: src/canary.rs, validation, private generation/storage, exact matching/redaction, JSONL observations, bounded symlink-safe export scanning. Write failing tests then implement.
- [x] Bridge: src/bridge.rs optional registry, pre-execution availability check, scan successful and failed returned text, visible notices; test fail-closed behavior.
- [x] Session/config: src/config.rs and src/session.rs opt-in specs, guest install after input copy, metadata context, audit summary after export, cleanup even on monitoring failure. Test disabled compatibility and lifecycle.
- [x] Docs: describe config, token lifecycle, observable event semantics and detection limits.
- [x] Validation: full unit/CLI/Bun suites, focused live VM tests and real agent run, independent review; address findings and create a draft PR with exact evidence.

Review focus: no host value copied into guest/config/prompts; no overwrite through malicious paths; incomplete monitoring not reported as clean; no raw tokens in tool notices/audit; export scans handle binary/chunk boundaries and hostile filesystem entries. Consistent cargo env RUSTFLAGS="-D warnings" CARGO_INCREMENTAL=0.

Completed: 479 library + 24 CLI + 5 harness + 135 Bun tests, Clippy, and 30 real containment tests passed. Live attested OpenCode session bd19c86c7617 verified immediate notice, export observation, private token cleanup and VM removal. Independent review setup/cleanup reporting findings fixed with red-to-green regressions. See docs/validation/2026-11-03-native-canaries.md.
