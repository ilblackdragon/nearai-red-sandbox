//! Real guest checks for managed canaries: detector observations and host isolation
//! are separate assertions. No model or guest networking is involved.
use std::fs;

use rts::canary::{CanarySpec, Placement, Registry};
use rts::files::{GuestRead, guest_read};
use rts::sandbox::{CopyOutResult, Sandbox};
use rts::session::install_canary_files;
use serde_json::{Value, json};

use crate::harness::{bridge_options, fresh_machine, mvm, rts_tool};

fn quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

fn events(path: &std::path::Path) -> Vec<Value> {
    fs::read_to_string(path).unwrap().lines().map(|line| serde_json::from_str(line).unwrap()).collect()
}

#[test]
#[ignore = "real mvm, patched supervisor"]
fn managed_canaries_redact_guest_reads_keep_host_tokens_out_and_detect_exports() {
    let h = mvm().expect("explicit real-VM test requires mvm");
    let scratch = tempfile::tempdir().unwrap();
    let audit = scratch.path().join("canaries.jsonl");
    let registry = Registry::create(
        &[
            CanarySpec { id: "host-key".into(), placement: Placement::Host },
            CanarySpec { id: "guest-key".into(), placement: Placement::Guest },
        ],
        &scratch.path().join("canaries"),
        &audit,
    ).unwrap();
    // Host-owned expected bytes, never injected through tool arguments.
    let files = registry.guest_files();
    let manifest_data = &files.iter().find(|(path, _)| path == &registry.manifest_path()).unwrap().1;
    let manifest: Value = serde_json::from_slice(manifest_data).unwrap();
    let entries = manifest["canaries"].as_array().unwrap();
    let host_path = entries.iter().find(|e| e["id"] == "host-key").unwrap()["path"].as_str().unwrap();
    let guest_path = entries.iter().find(|e| e["id"] == "guest-key").unwrap()["path"].as_str().unwrap();
    let host_token = fs::read(host_path).unwrap();
    let guest_token = &files.iter().find(|(path, _)| path == guest_path).unwrap().1;
    let host_marker = std::str::from_utf8(&host_token).unwrap().trim();
    let guest_marker = std::str::from_utf8(guest_token).unwrap().trim();
    assert!(!manifest_data.windows(host_marker.len()).any(|w| w == host_marker.as_bytes()));
    assert!(!manifest_data.windows(guest_marker.len()).any(|w| w == guest_marker.as_bytes()));

    let m = fresh_machine(h);
    install_canary_files(&*m, &registry).unwrap();
    match guest_read(&*m, &registry.manifest_path(), 65_536).unwrap() {
        GuestRead::File { data, truncated, .. } => {
            assert!(!truncated);
            assert!(data == *manifest_data, "guest metadata must match the host-generated manifest");
        }
        _ => panic!("installed canary manifest is not a guest file"),
    }
    let mut options = bridge_options(h, &m.name, &scratch.path().join("state"));
    options["canaryRegistry"] = json!(registry.path());

    // A successful ordinary guest command demonstrates the tool is functioning.
    let (code, out, err) = rts_tool(&options, "shell", json!({ "command": "printf ordinary-guest-output" }));
    assert_eq!(code, 0);
    assert_eq!(out, "ordinary-guest-output");
    assert!(err.is_empty());
    assert!(events(&audit).is_empty());

    // The token is read from the guest, not inserted into the command. The
    // bridge must redact it before returning the result to the agent.
    let (code, out, err) = rts_tool(&options, "shell", json!({ "command": format!("cat -- {}", quote(guest_path)) }));
    assert_eq!(code, 0);
    assert!(err.is_empty());
    assert!(!out.contains(guest_marker), "raw guest token reached the tool result");
    assert!(out.contains("[canary:guest-key]"));
    assert!(out.to_lowercase().contains("canary") && out.to_lowercase().contains("exact"));
    let observed = events(&audit);
    assert_eq!(observed.len(), 1);
    assert_eq!(observed[0]["source"], "tool_output");
    assert_eq!(observed[0]["id"], "guest-key");
    assert_eq!(observed[0]["placement"], "guest");

    // A real cat attempt—not just test -e—must fail for the host-only path.
    // shell preserves the subprocess status in its text, while bridge exit 0
    // means the tool itself completed successfully.
    let (code, out, err) = rts_tool(&options, "shell", json!({ "command": format!("cat -- {}", quote(host_path)) }));
    assert_eq!(code, 0);
    assert!(err.is_empty());
    assert!(out.contains("exit status: 1"), "host-only cat did not fail as expected");
    assert!(!out.contains(host_marker), "host-only token reached the guest result");
    assert!(fs::read(host_path).unwrap() == host_token, "host canary changed");
    assert_eq!(events(&audit).len(), 1, "a missing host path is not a token observation");

    // A silent guest copy produces no tool-output event. The independent
    // export scanner must still find the original bytes after extraction.
    let (code, out, err) = rts_tool(&options, "shell", json!({ "command": format!("cp -- {} /out/decoy-copy", quote(guest_path)) }));
    assert_eq!(code, 0);
    assert!(err.is_empty());
    assert_eq!(out, "(no output)");
    assert_eq!(events(&audit).len(), 1);
    let exported = scratch.path().join("out");
    assert!(matches!(m.copy_out("/out", &exported).unwrap(), CopyOutResult::Exported { files: 1, .. }));
    assert!(fs::read(exported.join("decoy-copy")).unwrap() == *guest_token, "export changed the decoy bytes");
    assert_eq!(registry.scan_exports(&exported).unwrap(), 1);
    let observed = events(&audit);
    assert_eq!(observed.len(), 2);
    assert_eq!(observed[1]["source"], "export");
    assert_eq!(observed[1]["id"], "guest-key");
    assert_eq!(observed[1]["file"], "decoy-copy");
    let audit_text = fs::read_to_string(&audit).unwrap();
    assert!(!audit_text.contains(host_marker) && !audit_text.contains(guest_marker), "audit leaked token values");
    assert!(registry.summary().unwrap().contains("2 exact matches observed"));
    // Machine RAII removes the real guest, even if any assertion panics.
}
