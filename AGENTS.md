# Agent conventions

## Tooling

- Do not use `chrome-devtools-mcp` (the `chrome-devtools_*` browser tools) in this repository.
- Do not use PowerShell for any replacement/editing operations (e.g. `-replace`, `Set-Content`, redirects). Use the Edit/Write tools instead; PowerShell encoding can corrupt files.

## Working style

- If a requirement is ambiguous or you are unsure, ask the user before implementing. Do not guess.
- Unless the user explicitly asks, do not run `tsc`, `oxlint`, `build`, or similar check/build commands.
