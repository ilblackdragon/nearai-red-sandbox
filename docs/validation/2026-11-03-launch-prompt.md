# Initial CLI prompt validation

Validated on Apple-silicon macOS with OpenCode 2.2.2. This change adds
`rts launch --prompt TEXT` and `--prompt-file PATH`; no release was published.

## Automated checks

- The initial CLI acceptance regression failed on the old parser, then passed.
- 517 Rust tests passed (484 library, 28 CLI, 5 harness); 35 tests were ignored.
- Clippy passed for all targets with warnings denied.
- 139 Bun tests passed, including initial-task handoff and release packaging.
- Rust tests covered exact UTF-8/newline preservation, exclusive and launch-only
  options, bounded input, missing/invalid files, FIFO rejection, NUL/blank text,
  private atomic payload publication, acknowledgement validation, and a real
  child process whose missing plugin handshake never received a prompt payload.
- TUI helper tests covered no submission before publication, one submission
  across concurrent loads/reloads, exact message data, private acknowledgements,
  malformed input, and sanitized errors without automatic retries.

Rust used `RUSTFLAGS="-D warnings" CARGO_INCREMENTAL=0` and the same GNU
coreutils/tar PATH as the macOS release workflow. Process-group tests ran with
host subprocess permissions.

## Live session

Session `232d5d2e177e` launched with `--prompt-file` and no keyboard/UI prompt
injection. The launcher received the acknowledgement for OpenCode session
`ses_e5bc76015ffe86A3g7dDi5a92U`; the private prompt payload was removed after
consumption. The agent wrote `/out/cli-prompt-smoke.txt` and remained in the
interactive UI. After normal teardown, the exported file was exactly the
17 bytes `CLI_PROMPT_OK_λ` followed by one newline, and the VM was removed.

The smoke used an explicitly authorized external-provider configuration
pointing at the already-running local IronWire/attested-forwarder endpoint.
The new session was correctly recorded as externally configured/unattested;
this validates task delivery and tool execution, not a new attestation flow.
The endpoint's existing credentials were not copied into the new session.

Local evidence:

- `/private/tmp/rts-cli-prompt-smoke/session.json`
- `/private/tmp/rts-cli-prompt-smoke/prompt.txt`
- `/private/tmp/rts-cli-prompt-smoke/sessions/232d5d2e177e/launcher.log`
- `/private/tmp/rts-cli-prompt-smoke/sessions/232d5d2e177e/out/cli-prompt-smoke.txt`
- `/private/tmp/launch-prompt-rust-tests.log`
- `/private/tmp/launch-prompt-clippy.log`
- `/private/tmp/launch-prompt-bun-final.log`

The three SDK integration details found during review (client namespace,
create response shape, and model reference key) were corrected before this
live validation. Initial prompt submission preserves the existing nonce gate;
it deliberately does not forward OpenCode's native `--prompt` argument, which
could auto-submit before the launcher has authenticated the sandbox plugin.
