# Managed synthetic canaries

Use canaries to investigate whether untrusted code collects a planted decoy, or whether a host-only synthetic marker appears in guest results. Opt in per session:

```json
{
  "inputsDir": "./inputs",
  "canaries": [
    { "id": "review-credential", "placement": "guest" },
    { "id": "host-boundary", "placement": "host" }
  ]
}
```

Launch normally with `rts launch --config session.json --no-network`. No guest packages or network connection are needed for canary detection. Sessions without `canaries` keep the existing behavior.

## What the agent gets

The launcher creates fresh random token values and tells the agent where to read a value-free guest manifest. It lists each ID, placement and path. Guest decoys live in a new managed directory under `/tmp/rts/canaries-<random>/`; host-only token files stay outside the VM. Inputs are not modified and existing files are not replaced. For a first investigation, ask:

> Read the managed canary manifest. Inspect the submitted reproduction code before running it. If the reproduction collects a canary, distinguish the legitimate reproduction from unrelated collection. Save your evidence under /out. Treat canary notices as exact output observations, not proof of external exfiltration.

A helper can take a decoy path as an argument, making the same fixture usable across sessions. A separate controlled read is useful for verifying detection but is not malicious behavior by itself.

When a token appears in returned tool text, the Rust bridge records the observation, replaces the value with `[canary:ID]`, and appends an `rts canary observation` notice. The agent and operator can see the notice in the tool result. Errors are scanned too. A failed read of a missing host path does not produce a token event: verify that failure and the host file separately.

## Evidence

The session directory retains:

- `canaries.jsonl`: one event per matched canary per returned channel or exported file, including ID, placement and source. No token values or surrounding output are included.
- `canary-summary.json`: coverage status, export observation count and overall observation summary.
- `launcher.log`: final canary summary and any incomplete-scan diagnostics.

`source: "tool_output"` records the tool name, returned channel and `canonicalInputSha256`. That hash uses Rust's normalized JSON serialization; it is not the insertion-ordered input hash from `tools.jsonl`. Shell stdout and stderr are merged by the existing shell tool, so the event's channel describes the returned bridge channel, not necessarily the original subprocess stream.

`source: "export"` records the relative file name. Export scanning runs after OpenCode exits and safe archive extraction completes, so those events are for the operator's final review; they are not live agent notifications. Exported files retain their original bytes, including synthetic token values. Review them as untrusted evidence before sharing.

The registry and host-only token files use private host storage and are removed during normal teardown after scanning. The value-free manifest still contains now-expired host paths. An abrupt process/host termination can leave private runtime files; never infer cleanup from a missing summary. Audit events remain with the session records.

## Failure behavior and limits

A configured registry that cannot be loaded prevents tool execution. An observation that cannot be persisted withholds the result and disables further tool execution. Incomplete monitoring or export scanning makes the summary incomplete and causes a nonzero launcher exit; it never means “no access.” Cleanup is still attempted.

Matching covers exact token bytes in captured tool text and regular exported file contents, including binary files and matches crossing read-buffer boundaries. It does not trace every file read, examine network traffic, or detect encoded, split, partial, suppressed or capture-truncated token contents. Tokens printed intentionally trigger the same observation as unexpected collection. Guest-written text can imitate a notice; the host-managed audit is the record to review.

An observation establishes that those bytes appeared in the observed output. It does not by itself prove a file read, a sandbox escape or external exfiltration. No match is not proof that no access occurred.

At most 16 canaries are allowed. IDs are unique, 1–64 lowercase ASCII letters, digits, dashes or underscores, beginning with a letter or digit. Arbitrary paths, real credential values and external callback URLs are not accepted. Export scans are bounded to 256 MiB, 10,000 entries and 128 directory levels; links and special files are refused and reported as incomplete coverage.
