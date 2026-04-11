---
name: check
description: Run all CI checks (typecheck, lint, format, knip, duplication, tests) and auto-fix formatting/lint issues. Use before committing or when a PR is failing.
allowed-tools: Bash(npm run format), Bash(npm run lint:fix), Bash(npm run check)
---

# CI checks and auto-fix

Run the full CI check suite. Auto-fix what you can, report what you can't.

## Steps

1. !`npm run format`
2. !`npm run lint:fix`
3. !`npm run check`

Fix any issues that arise.
