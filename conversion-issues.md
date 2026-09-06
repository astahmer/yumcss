# Codemod conversion audit
Status: in progress  
Started: 2026-09-06  
Scope: every generated directional scenario in `packages/codemod/tests/routes` and every generated round-trip scenari...
This is a review ledger, not a snapshot approval list. A scenario is only marked
checked after its source uses a documented API, its configured and unconfigured
inputs are meaningful for that adapter, its result is classified correctly, and
the test has assertions for conversion, residuals, emitted API shape, and
configuration evidence where those concepts apply. A passing snapshot by itself
does not close an item.
## Inventory
The generated matrix currently contains 31 adapters, 930 directional files, and
930 round-trip files. Each directional file contains five scenarios; each
round-trip file contains four scenarios. The files are generated, but the
adapter-specific source catalog and the assertions remain part of the audit
surface.
| Source adapter | Directional routes | Round trips | Source API/config review | Status |
| --- | ---: | ---: | --- | --- |
| pandwind | 30 | 30 | pending | pending |
| panda | 30 | 30 | pending | pending |
| stylex | 30 | 30 | pending | pending |
| emotion | 30 | 30 | pending | pending |
| styled-components | 30 | 30 | pending | pending |
| vanilla-extract | 30 | 30 | pending | pending |
| stitches | 30 | 30 | pending | pending |
| linaria | 30 | 30 | pending | pending |
| jss | 30 | 30 | pending | pending |
| fela | 30 | 30 | pending | pending |
| goober | 30 | 30 | pending | pending |
| aphrodite | 30 | 30 | pending | pending |
... (98 lines truncated)
[full output: "$HOME/Library/Application Support/rtk/tee/1788716572_jj_file_show_-r__-_conversion-issues_md.log"]
