import { createRealRepositoryCorpus } from "pandwind-codemod/swap/corpus";

export interface PinnedReferenceRepository {
	readonly id: string;
	readonly repository: string;
	readonly commit: string;
}

const additionalReferences: readonly PinnedReferenceRepository[] = [
	{
		id: "tailwindcss.com",
		repository: "https://github.com/tailwindlabs/tailwindcss.com",
		commit: "bd868a314bd05ca78acd047e3da289274dd6ccd7",
	},
	{
		id: "shadcn-ui",
		repository: "https://github.com/shadcn-ui/ui",
		commit: "683a5a9b370acdb7785a0529434e6a3b8c7e0441",
	},
	{
		id: "chakra-ui",
		repository: "https://github.com/chakra-ui/chakra-ui",
		commit: "7aca83e44de50f501d8274a55c331cb8fb06e4fa",
	},
	{
		id: "styled-components-website",
		repository: "https://github.com/styled-components/styled-components-website",
		commit: "c03d2925ab44f447b385d2f463fe971de2e15c7c",
	},
	{
		id: "effect-ts-website",
		repository: "https://github.com/Effect-TS/website",
		commit: "366419b44eb2bd353cbe3d3e41fa4e8c735e63ee",
	},
	{
		id: "posthog-com",
		repository: "https://github.com/PostHog/posthog.com",
		commit: "8a1619a0f2ec72d7d2d560d4fb5c9eca551b04ff",
	},
	{
		id: "astryx",
		repository: "https://github.com/facebook/astryx",
		commit: "8359f1a3601766e3a96ae0805e9487ac3dc17754",
	},
	{
		id: "stylex",
		repository: "https://github.com/facebook/stylex",
		commit: "5f7acaa4b332e2cf8352e95e5bc83efd70904fd4",
	},
	{
		id: "emotion-clean",
		repository: "https://github.com/emotion-js/emotion",
		commit: "b882bcba85132554992e4bd49e94c95939bbf810",
	},
	{
		id: "tamagui",
		repository: "https://github.com/tamagui/tamagui",
		commit: "25d97e1ab6bc5d09e83c7776f61d6b0852048678",
	},
	{
		id: "css-modules",
		repository: "https://github.com/css-modules/css-modules",
		commit: "c7bf6c02472fdce4dd8e569abc10d2aeb234e1c2",
	},
	{
		id: "sass",
		repository: "https://github.com/sass/sass",
		commit: "d6abf810240b13edbd3832058aa5b0d62cb18e75",
	},
	{
		id: "less",
		repository: "https://github.com/less/less.js",
		commit: "713331655e437401dfea6cd233893a69762734e1",
	},
	{
		id: "bootstrap",
		repository: "https://github.com/twbs/bootstrap",
		commit: "12cb8b902d175a0d612f1280f58b386a09921a16",
	},
	{
		id: "vanilla-extract",
		repository: "https://github.com/vanilla-extract-css/vanilla-extract",
		commit: "881c256a867f55386f96a7fe95068300bac720e6",
	},
];

/** One deterministic catalog drives cloning and pin auditing. */
export function createPinnedReferenceRepositoryCatalog(): readonly PinnedReferenceRepository[] {
	const entries = [
		...createRealRepositoryCorpus().references.map(({ clone: id, repository, commit }) => ({
			id,
			repository,
			commit,
		})),
		...additionalReferences,
	];
	const seen = new Set<string>();
	return entries.filter((entry) => {
		if (seen.has(entry.id)) return false;
		seen.add(entry.id);
		return true;
	});
}
