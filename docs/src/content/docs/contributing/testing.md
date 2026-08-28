---
title: Testing pandwind
description: Run the unit, integration, browser, native, terminal, and coverage checks.
sidebar:
  order: 2
---

Pandwind is tested at several boundaries. A unit test proves a local policy; an
integration test proves package wiring; an end-to-end fixture proves observable
output in a real host. Run the broadest applicable check before changing a
compiler, adapter, backend, or generated artifact.

## The commands

From the repository root:

```sh
pnpm test:all
pnpm test:coverage
pnpm typecheck
pnpm lint
pnpm format
pnpm knip
```

`test:all` runs every workspace test serially. Serial execution is deliberate:
browser servers, generated artifacts, PTYs, and native fixtures should not
compete for the same ports or terminal state.

`test:coverage` runs V8 coverage for the three core packages and fails when a
package falls below its checked-in threshold. Coverage directories are local
artifacts and are ignored by Git.

## What each layer covers

### Unit and type tests

`packages/pandwind/tests` covers `tw()`, `css()`, `cx()`, design resolution,
tokens, conditions, recipes, CSS ordering, runtime sheets, SSR, object
backends, host adapters, codegen, and type-level contracts. The codemod and
analyzer packages have analogous unit/fixture suites.

Run a focused package or file while developing:

```sh
pnpm --dir packages/pandwind test
pnpm --dir packages/codemod test
pnpm --dir packages/analyze test
pnpm --dir packages/pandwind exec vitest run tests/css-output.test.ts
```

### Integration tests

Integration tests build or execute real package boundaries: Vite and unplugin
transforms, generated Tailwind consumers, codemod CLI reports, analyzer
collection, inspector gathering, and playground evaluation. These tests catch
source-loader and module-resolution failures that isolated unit tests miss.

### End-to-end tests

The recursive test command includes:

- CSS/browser hydration and computed-style checks;
- React Native example output and interaction;
- OpenTUI headless rendering plus PTY boot/teardown;
- showcase web/native/TUI parity; and
- inspector/playground host applications.

When changing a host adapter or backend, run the matching example directly as
well as `pnpm test:all`.

## Coverage interpretation

Current measured package baselines are:

| Package            | Statements | Branches | Functions |  Lines |
| ------------------ | ---------: | -------: | --------: | -----: |
| `pandwind`         |     86.83% |   74.59% |    85.60% | 89.28% |
| `pandwind-codemod` |     76.82% |   64.51% |    86.17% | 79.90% |
| `pandwind-analyze` |     74.07% |   61.79% |    75.89% | 75.18% |

These are regression floors, not a claim that every branch is equally
valuable. CLI process entrypoints, source-language edge adapters, generated
writers, and environment-specific artifact inspection may have lower local
coverage because they are exercised by integration or browser fixtures.

When coverage reveals a gap, classify it first:

1. add a focused unit test for a deterministic policy;
2. add an integration fixture for package/build wiring;
3. add a browser/native/PTY fixture for observable host behavior; or
4. document an intentional environment boundary and keep a smoke test.

Do not lower a threshold to hide a missing semantic test. Update
`plans/017-test-coverage.md` when a claim-level test is added or its proof
shape changes.
