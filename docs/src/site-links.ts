const playgroundUrl = (import.meta.env.PUBLIC_PLAYGROUND_URL ?? "http://localhost:5173").replace(
	/\/+$/,
	"",
);

export const playgroundHref = (options: { path?: string; api?: "tw" | "css" | "dss" }) => {
	const search = options.api === undefined ? "" : `?api=${options.api}`;
	return `${playgroundUrl}${options.path ?? "/basics"}${search}`;
};
