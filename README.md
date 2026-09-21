# hermit

A nu shell for Clawd.

Gives Claude a nushell tool beside Bash. nu pipelines carry tables, records, and lists, so JSON, CSV, HTTP responses, and process lists reach Claude as data it can filter with `where` and `get`, not text to pick apart with jq, awk, and sed.

The tool behaves like Bash wherever it can:

- **Permission**: every call goes through the session's own permission flow: rules, the dialog, and auto mode's classifier. To allow them all, add `mcp__hermit__nu` to `permissions.allow`.
- **Working directory**: each call starts where Bash is. A script can `cd` anywhere, and the change ends with the call.
- **Output**: stdout and stderr together, and a failure leads with its exit code. Claude Code saves an oversized result to a file and shows a preview.
- **Timeout**: 2 minutes by default, up to 10.

Each call is a fresh `nu --no-config-file`, so variables and definitions don't carry over either. The final value comes back as NUON, nu's own literal syntax, which is smaller than a table and keeps exact sizes and full dates. The tool description is a short primer for a model that already knows some nu; it's in [register.ts](plugin/hooks/register.ts).

## Install

You need `nu` on your `PATH` (tested with 0.115), a recent Claude Code, and `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`.

```sh
claude plugin marketplace add jackboykin/hermit
claude plugin install hermit@hermit
```

## Limits

- The permission check covers the whole script, so a rule can't allow some commands inside it and not others.
- Esc might not stop a running script. It runs until it exits or reaches its timeout.
- Nothing outlives the call, so `job spawn` can't keep a server running. For that, use Bash's `run_in_background`.
