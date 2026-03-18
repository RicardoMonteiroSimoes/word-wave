# Contributing

## Prerequisites

- Node.js 20+
- npm

## Setup

```sh
git clone https://github.com/RicardoMonteiroSimoes/word-wave.git
cd word-wave
npm install
```

## Development

### Demo

Run the interactive demo locally with hot reload:

```sh
npm run demo
```

This starts a Vite dev server at `http://localhost:5173` with the full-viewport wave animation and a controls panel for tweaking options in real time.

To preview the production build of the demo:

```sh
npm run demo:build
npm run demo:preview
```

### Building the library

```sh
npm run build
```

Compiles `src/` to `dist/` via TypeScript.

## Code quality

Run all checks at once:

```sh
npm run check
```

This runs the full pipeline in sequence:

| Step               | What it checks                                 |
| ------------------ | ---------------------------------------------- |
| `tsc --noEmit`     | Type checking                                  |
| `eslint`           | Linting (typescript-eslint strict + stylistic) |
| `prettier --check` | Formatting                                     |
| `knip`             | Unused exports, files, and dependencies        |
| `jscpd`            | Code duplication                               |
| `vitest run`       | Unit tests                                     |

### Individual commands

```sh
npm run lint          # lint src/ and demo/
npm run lint:fix      # lint with auto-fix
npm run format        # auto-format with prettier
npm run format:check  # check formatting without writing
npm run knip          # dead code and dependency audit
npm run duplication   # copy-paste detection
```

## Testing

```sh
npm test
```

Runs the vitest test suite. Tests live alongside source files as `*.test.ts` and are also included in `npm run check`.

## Benchmarking

### Computation benchmarks (CI)

Computation benchmarks run against `WordWaveEngine` with a mocked canvas surface (happy-dom) to measure JS frame cost. These run automatically on every PR and post a comparison against `main` as a PR comment.

```sh
npm run bench              # run benchmarks
npm run bench:save         # save results as a baseline
npm run bench:compare      # compare current results against the saved baseline
```

Before/after workflow for performance-sensitive changes:

```sh
npm run bench:save         # 1. save baseline on current code
# ... make changes ...
npm run bench:compare      # 2. compare — shows ops/sec diff per benchmark
```

### Browser benchmarks (local only)

Browser benchmarks run in a real Chromium instance via Playwright and exercise the full WebGL rendering pipeline, including GPU effects scaling. They require a GPU and are too slow for CI's software-rendered WebGL, so they are **not** run in the GitHub Actions workflow.

```sh
npm run bench:browser
```

If your PR changes rendering code or GPU effects, please run the browser benchmarks locally and paste the results in your PR description.

## AI-assisted contributions

AI-assisted pull requests are welcome. If you use AI tools (Claude, Copilot, ChatGPT, etc.) to help write your contribution, please:

1. **Disclose it** — state clearly in the PR description which parts were AI-assisted
2. **Review it yourself** — every line of AI-generated code must be reviewed and understood by a human before submitting
3. **Own it** — you are responsible for the correctness, security, and quality of the code regardless of how it was produced

PRs that appear to be unreviewed AI output (no human context, no understanding of the changes when asked) may be closed.

## Deployment

The demo site is deployed to GitHub Pages automatically when a GitHub release is published. No manual steps needed — the workflow at `.github/workflows/deploy-demo.yml` handles the build and deployment.
