# Comment-retention audit: `konouuqm` to current tip

Status: complete — 2026-08-28

## Scope and decision rule

This audit reviews every substantive descendant of `konouuqm` through the
current tip (`@`). The empty tip is an intentional working-copy revision and
is not counted as implementation history.

Comments were retained when they explain a non-obvious semantic invariant,
algorithm boundary, safety constraint, or extension contract. Comments were
removed when they described code that moved to a new owner, duplicated a
nearby contract, recorded temporary migration history, or only narrated
obvious syntax. Rephrasing was preferred over restoring historical wording.

## Result

- 41 substantive descendant revisions reviewed.
- 29 revisions changed comment lines; 12 had no comment-line changes.
- The large deletions in the decomposition revisions were mostly ownership
  moves, not information loss.
- Durable explanations were restored at their final owners in the focused
  revision that accompanies this audit:
  - `cx-static-evaluator.ts` and `cx-call-rewriter.ts`: conservative static
    evaluation, TDZ/shadowing safety, partial-fold semantics, and runtime
    fallback.
  - `var-compiler.ts`: inline-value versus generated-CSS invariants and
    condition-variable fallback behavior.
  - `runtime-sheet-contracts.ts` and `runtime-sheet-serializer.ts`: semantic
    rule IR, flat fast-path lowering, SSR/hydration boundary, wrapper order,
    and stable identity versus ordering priority.
  - CSS extraction ports: one shared AST, provenance, and untouched dynamic
    fallback.
  - token and budget contracts: adapter ownership and the distinction between
    source candidates and compiled-artifact evidence.

## Revision-by-revision inventory

The following is the complete reviewed chain, newest first. The per-revision
comment diff was checked even when the revision was ultimately classified as
code-only or as a move of documentation to a new owner.

| Revision       | Description                                                                         |
| -------------- | ----------------------------------------------------------------------------------- |
| `f1d44b046332` | chore(codemod): normalize migration evidence                                        |
| `fe7fb2b2fd1f` | fix(codemod): preserve clean host attribute output                                  |
| `1c5378e69d03` | test(codemod): record canonical CSS parity evidence                                 |
| `9b75a21b0328` | test(codemod): document host adapter acceptance corpus                              |
| `9a9e3148b8b4` | feat(codemod): add component-library host adapters                                  |
| `85085051a9b5` | docs(codemod): document complete pivot adapter coverage                             |
| `35f49326f475` | test(codemod): prove benchmark corpus and API routes                                |
| `75312f6d2ac1` | feat(codemod): add benchmark CSS-in-JS adapters                                     |
| `e8d64b108630` | feat(interoperability): add versioned project metadata boundary                     |
| `bdba7c5db2c4` | refactor(architecture): remove dead façades and finish public boundaries            |
| `e2c2e3681f0d` | refactor(analyze): compose residual and CSS budget policies                         |
| `d751004ca7f3` | chore: verify architecture refactor completion                                      |
| `ef3be5ed6549` | refactor(pandwind): close scanner, codegen, and extraction boundaries               |
| `9081f0d01d3e` | refactor(vite): route shared CSS service through extraction ports                   |
| `f899902241c5` | fix(architecture): close refactor audit and scanner boundaries                      |
| `c92f763e0823` | refactor(architecture): finalize policy boundaries and cleanup                      |
| `828e67eb673b` | refactor(codemod): compose token format adapters                                    |
| `75ff58f84ce2` | refactor(tw-css): split codegen and stylesheet policies                             |
| `95a9328af4b2` | refactor(vite): isolate css extraction and cx compiler policies                     |
| `4c7ba942dd9e` | refactor(architecture): finish interface-first decomposition and document contracts |
| `64c0b74aa2c9` | refactor(analysis): split reporting and budget use cases                            |
| `7524a29b3e7d` | refactor(css): separate stylesheet lowering policies                                |
| `8720a1698762` | refactor(tw): stage design-system code generation                                   |
| `d19a06a26a6d` | refactor(architecture): complete composed port boundaries                           |
| `c36c5acaf8d3` | refactor(css): scope variable encoding behind VarCompiler                           |
| `0edea332d73a` | refactor(vite): isolate literal style compilation from engine wiring                |
| `0d9df413596a` | refactor(vite): isolate CSS source workspace and cache                              |
| `7086411bede5` | refactor(tw): compose theme generation through bridge port                          |
| `e0f1aaf3d17b` | refactor(css): isolate condition parsing and rule serialization                     |
| `8f3556e6ff33` | refactor(analyze): compose fold analysis through use-case ports                     |
| `8f22fc403456` | refactor(vite): compose CSS extraction through shared source service                |
| `543896ffd20d` | refactor(vite): isolate cx evaluation policy                                        |
| `8ac01d42c132` | refactor(analyze): extract reusable CSS artifact shape analyzer                     |
| `99990d958914` | refactor(vite): inject module graph ports for constant propagation                  |
| `cc10bfdd2277` | refactor(design): resolve modules through an adapter registry                       |
| `c678afbbf29d` | refactor(codemod): compose token conversion through format adapters                 |
| `568225714b54` | refactor(tw): separate design-system artifact writing                               |
| `a5c8b667d75d` | refactor(css): separate runtime artifacts serialization and sinks                   |
| `d79c4af5e52e` | refactor(architecture): expose lowering and validator plugin contracts              |
| `087e2b1a1723` | refactor(architecture): compose host and scanner plugins                            |
| `3013ddf6bf7e` | refactor(backends): compose typed backend plugins and split object surfaces         |

## Intentionally not restored

The old module-section banners, migration-history notes, repeated type-field
descriptions, obvious “this function does X” comments, and comments attached
to helpers whose implementation moved intact were intentionally omitted. The
new contracts and owner modules are the source of truth; restoring those
comments would recreate the noise that motivated the cleanup.
