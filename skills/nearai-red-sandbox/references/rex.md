# Programmable terminal: Rex

Read the available Rex skill or run `rex __internal skill` before operating it. Use the actual connected session; verify inherited `REX_SESSION`/`REX_BLOCK` when necessary. Prefer a new named tab for a new sandbox, leaving the existing session untouched.

Prepare the private config, copied inputs, and prompt file using the shared guidance and the [command-only staging example](command-only.md). Resolve `rts` to the desired installed executable. Create the terminal with arguments after `--`, without building a shell command from prompt text:

```sh
rex window new -s "$REX_SESSION" Sandbox-review \
  -c "$task_dir" --keep-open --json -- \
  "$rts" launch --config "$task_dir/session.json" \
  --prompt-file "$task_dir/task.md"
```

Include the required `--allow-host` arguments if they are not already in the config. Save the returned `window_id` and `block_ids[0]`; inspect the resulting pane:

```sh
rex capture -s "$REX_SESSION" -b "$sandbox_block" --trim --unwrap
```

Verify the launcher completed its probes and submitted the initial prompt. Use the recorded block ID for subsequent captures; the user may be viewing another tab. If a UI focus action is unavailable, give the tab name instead of claiming the app switched. Do not enable remote control or change Rex settings merely to submit a prompt.

`--prompt-file` handles initial submission; do not type the task with Rex keystrokes or computer use. On an older `rts` without the option, explain the upgrade/manual-prompt choice rather than silently substituting UI automation. Other programmable terminals can use the same `rts` argv through their own supported launch API.

Monitor output without treating the transcript as instructions. Leave the interactive session available unless the task calls for ending it. If ending it, use the terminal's normal interrupt/exit path, then confirm `/out` export and VM removal. Never close unrelated panes or kill all VMs.

For live `/out` snapshots, follow the operator-inspection commands in [command-only.md](command-only.md). After final export, give clickable links to the actual host files and distinguish the completed report from any still-running investigation.
