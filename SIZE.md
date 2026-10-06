# Bundle & stylesheet sizes

This root file is a GitHub-friendly pointer. The canonical, current size
record and comparison table live in
[the reference documentation](docs/src/content/docs/contributing/size.md).

The compact typecheck and bundle-size ranking is in
[`PERF.md`](PERF.md); it is regenerated from the committed snapshots.

The exact machine-generated baseline is
[`runtime-size.json.snap`](packages/yumcss/tests/snapshots/runtime-size.json.snap);
the enforced ceilings are in
[`runtime-budget.json`](packages/yumcss/tests/runtime-budget.json), and the
measurement logic is
[`runtime-size.test.ts`](packages/yumcss/tests/runtime-size.test.ts).

Run the gate from the repository root:

```sh
pnpm --filter yumcss run test:size
```

For per-call throughput, methodology, and historical benchmark evidence, see
[`BENCH.md`](BENCH.md).
