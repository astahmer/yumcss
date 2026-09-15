# Publishable Pandwind design-system artifact

Status: in progress

## Context

Pandwind component libraries currently share source files or ask the consuming
application to scan the library's source through its own `pandwindCssVite`
instance. Panda's publishable build-info workflow demonstrates a better
package boundary: a library can publish the result of extraction and a
consumer can register that artifact without parsing the library source again.

Pandwind already has a versioned `pandwind.interop/1` artifact, but that file
is migration and Tailwind metadata. It is not a stable CSS-rule exchange
format and must not become a bag for unrelated build output.

The user-facing authoring API remains frozen. This feature is a build/tooling
contract for component and design-system packages, not another styling API.

## Goal

Let a Pandwind component or design-system package publish a versioned,
self-contained build artifact containing its extracted rules and the metadata
needed for a consuming Pandwind build to validate and reuse those rules without
scanning the package source.

## What

- Add a `pandwind.lib/1` artifact contract owned by the Pandwind package.
- Add `pandwind-codemod lib build` to scan a package's source with its preset,
  compile its static CSS calls, and write `pandwind.lib.json`.
- Let `pandwindCssVite` consume explicitly registered package specifiers or
  artifact paths through a Vite resolver.
- Validate schema, content integrity, preset/configuration compatibility, and
  class-output compatibility before merging external rules.
- Keep normal source extraction as the fallback when no artifact is supplied.
- Document producer and consumer workflows in the component-library and
  tooling guides.
- Add focused contract, CLI, Vite, and fail-closed tests.

## Why

The package boundary is the important part of Panda's `lib` idea, not its
generated `styled-system` surface. Publishing extracted rules reduces consumer
source scanning, makes library output independently cacheable, and gives
Pandwind a compatibility checkpoint for changes to conditions, properties,
tokens, class strategies, cascade behavior, or compiler lowering.

## How

### Artifact model

The JSON artifact is deterministic and portable:

```text
pandwind.lib/1
  producer identity and artifact content hash
  preset compatibility fingerprint
  compiler and class-output compatibility
  source file fingerprints and extraction summary
  used token declarations
  ordered atomic rules and variable-carrier rules
```

Rules retain stable identities and priorities so a consumer can deduplicate
them and render them together with its local sheet. The artifact contains CSS
output, not a second runtime implementation and not a generated component
authoring API.

### Producer

`pandwind-codemod lib build` accepts a root, source globs, preset module/export,
CSS import matchers, output path, namespace, and cascade mode. It uses the
shared source workspace, CSS extraction service, and stylesheet compiler. It
records source hashes and writes only the generated artifact path, refusing to
overwrite an unrelated file.

The first implementation supports the default Pandwind stylesheet strategy.
External compiler strategies are not serialized as if their output were
portable; they require an explicit compatible strategy contract in a later
revision.

### Consumer

`pandwindCssVite` receives an explicit list of library specifiers or artifact
files. The Vite composition root resolves package exports and reads JSON
artifacts before serving the virtual stylesheet. The core consumes already
validated rule entries and does not traverse library source files.

An artifact with an unsupported schema, invalid structure, mismatched content
hash, or incompatible preset/compiler fingerprint fails closed with an
actionable diagnostic. An absent artifact is different: ordinary source
extraction remains available for local development and legacy component
library setups.

### Compatibility boundary

The compatibility fingerprint covers the serialized preset semantics, Pandwind
compiler contract, namespace, cascade mode, and class-output strategy. A
consumer cannot silently reuse rules generated under a different token map,
condition map, property vocabulary, class strategy, or cascade policy.

### Package distribution

The artifact has a conventional `pandwind.lib.json` filename. Package authors
may expose it through their package exports and consumers register the package
specifier explicitly. Automatic dependency scanning is out of scope for this
first slice because it would make ownership and invalidation implicit.

## What this does not allow

- It does not add shorthands or a default utility vocabulary.
- It does not generate or require Panda-style `styled-system` packages.
- It does not add recipes, patterns, JSX factories, or component APIs.
- It does not replace authored CSS with a static-CSS-only distribution mode.
- It does not bypass preset compatibility checks.
- It does not make arbitrary package source scanning disappear when no valid
  artifact is registered.
- It does not silently merge stale, corrupt, or incompatible artifacts.

## Architecture boundaries

- `pandwind/src/vite/lib-artifact.ts` owns the versioned contract,
  canonicalization, fingerprints, validation, and rule-entry types.
- `pandwind/src/vite/css-core.ts` owns merging validated entries into the
  generated sheet; it does not resolve package names.
- `pandwind/src/vite/css.ts` owns the Vite resolver and package-facing options.
- `pandwind-codemod/src/lib/` owns source scanning, artifact construction, and
  CLI parsing/writing.
- Package resolution is an injectable Vite boundary; the core remains
  bundler-agnostic and testable with already-loaded artifacts.
- The existing Tailwind `pandwind.interop/1` and generated-manifest contracts
  remain separate.

## Implementation steps

1. Add the artifact contract, stable serialization, compatibility fingerprint,
   content hash, and structural validation.
2. Add a codemod library builder using the shared CSS extraction and stylesheet
   paths, plus deterministic source provenance.
3. Add `lib build` parsing, safe output writing, package exports, and CLI tests.
4. Add validated external-rule inputs to the CSS extraction core and Vite
   package/artifact resolution.
5. Add Vite integration tests proving source-free consumption, deduplication,
   incompatibility failures, and malformed-artifact failures.
6. Update component-library/tooling/architecture documentation and add the
   artifact to generated-artifact ownership guidance.
7. Run focused package tests, typechecks, formatting, and the relevant existing
   suite; report unrelated baseline failures separately.

## Acceptance criteria

- [ ] A library can build a deterministic `pandwind.lib.json` from real
      `css()`/`css.class()` source and a preset.
- [ ] The artifact contains rules, used tokens, source fingerprints, and a
      compatibility fingerprint.
- [ ] A consumer can register the artifact by package specifier or file and
      gets the same CSS without scanning the library source.
- [ ] Duplicate rules are emitted once.
- [ ] Schema, hash, preset, compiler, namespace, and cascade mismatches fail
      closed with actionable diagnostics.
- [ ] Missing registration preserves the existing source-extraction behavior.
- [ ] No authoring API or excluded Panda surface is introduced.
- [ ] Docs show producer and consumer examples and explain the compatibility
      contract.

## Decisions log

- Use a new `pandwind.lib/1` schema rather than extending the Tailwind-focused
  `pandwind.interop/1` artifact.
- Call the command `pandwind-codemod lib build` to make the package/build nature
  explicit without copying Panda's generated-system layout.
- Require explicit consumer registration in the first version; automatic
  package discovery can be evaluated after the artifact contract proves useful.
- Fail closed for invalid or incompatible artifacts; retain ordinary source
  extraction only when no artifact is configured.
- Keep this feature build/tooling-only and preserve the frozen runtime API.
