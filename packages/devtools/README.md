# pandwind-devtools

Use the DevTools dock when you are asking “why did this style produce this
CSS?” It keeps the answer next to the running Vite app: source transforms,
tokens, generated rules, diagnostics, and migration previews.

It is development-only and read-only. Add it to a Vite config:

```ts
import { DevTools } from "@vitejs/devtools";
import { pandwindDevtools } from "pandwind-devtools";

export default {
	plugins: [DevTools(), pandwindDevtools()],
};
```

`pandwind-devtools` adds one Vite DevTools dock for inspecting the evidence produced by Pandwind's existing compiler, scanner, analyzer, and migration services.

Install the Vite DevTools host and add both plugins to a development Vite config:

```ts
import { DevTools } from "@vitejs/devtools";
import { pandwindDevtools } from "pandwind-devtools";

export default {
	plugins: [DevTools(), pandwindDevtools()],
};
```

The plugin is serve-only. It records source transforms, scanner diagnostics, generated interop tokens, migration previews, and inspectable `StyleProgram` values in a process-local evidence store. It does not add a production runtime event bus or rewrite application modules.

The dock contains six surfaces:

- **Inspector**: use the `Inspect styles` host action and click an element in the running app.
- **Style graph**: see source-to-program edges and expand the raw IR when needed.
- **Tokens**: inspect resolved variables from `pandwind.interop.json`.
- **Migration**: preview registered routes through the existing `pandwind-codemod` service; previews never write files.
- **Diagnostics**: review scanner warnings and migration residual counts.
- **Performance**: inspect source size, transform timings, and HMR events.

The migration panel deliberately starts as read-only. Applying changes remains the responsibility of the existing codemod CLI and MCP approval flow.
