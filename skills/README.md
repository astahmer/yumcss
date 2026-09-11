# Pandwind agent skills

This directory contains the repository's Codex skills for Pandwind work:

- `pandwind` — typed styling, presets, codegen, and build integration.
- `pandwind-codemod` — focused source migrations and codemod tooling.
- `pandwind-migrate-repo` — repository-scale migration planning and proof.

Each skill is a distributable folder. `SKILL.md` contains the core instructions,
`agents/openai.yaml` provides Codex UI metadata, and any `references/` directory
contains optional progressive-disclosure material. Copy an individual folder
into the host's skills directory when installing it outside this repository.

The skills are agent instructions, not runtime package files. They should not be
added to an application's dependency graph or published as part of the
`pandwind` JavaScript package.

When working from this repository, the paths in each skill's “Useful docs” list
resolve to the checked-in source and documentation. The migration skill keeps
its detailed workflow examples inside its own folder so that it remains useful
when distributed on its own.
