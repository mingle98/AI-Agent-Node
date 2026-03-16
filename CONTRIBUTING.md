# Contributing

Thanks for taking the time to contribute!

## Development Setup

- Node.js: see `package.json#engines`
- Package manager: Yarn (v1)

Install dependencies:

```bash
yarn install
```

Run tests:

```bash
yarn test
```

Run server locally:

```bash
yarn dev:server
```

## Pull Request Guidelines

- Keep PRs focused and small.
- Update or add tests when changing behavior.
- Make sure `yarn test` passes.
- If you add a new tool/skill:
  - Register it in `tools/index.js` or `skills/index.js`.
  - Add/adjust tests under `test/`.
  - Update documentation (README / docs).

## Coding Style

- This repo uses native ESM (`"type": "module"`).
- Prefer small functions and clear naming.
- Avoid breaking API response formats unless documented.

## Reporting Issues

When filing a bug report, please include:

- Node.js version
- OS
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs (please remove secrets)
