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

### Individual commands

```sh
npm run lint          # lint src/ and demo/
npm run lint:fix      # lint with auto-fix
npm run format        # auto-format with prettier
npm run format:check  # check formatting without writing
npm run knip          # dead code and dependency audit
npm run duplication   # copy-paste detection
```

## Deployment

The demo site is deployed to GitHub Pages automatically when a GitHub release is published. No manual steps needed — the workflow at `.github/workflows/deploy-demo.yml` handles the build and deployment.
