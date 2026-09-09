/**
 * PostHog.com -> Pandwind migration corpus.
 *
 * The PostHog checkout is a read-only Git reference. This runner materializes
 * disposable Gatsby applications from the pinned checkout and applies one
 * static-first Pandwind lane at a time. Tokens that cannot be proven against
 * the generated Pandwind bridge remain in the original class list and become
 * explicit residuals; the runner never silently drops a Tailwind utility.
 */
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { loadMetaFromSources, type PandwindMeta } from "pandwind-codemod/migration/meta";
import { mapClassList } from "pandwind-codemod/migration/map";
import { CodemodAdapterId, SwapSourceId } from "pandwind-codemod/swap";
import { SOURCE_SCANNER_SERVICE } from "pandwind/source";
import { createReferenceWorkspace } from "../reference-workspace.ts";
import {
	discoverProjectFiles,
	migrateRegisteredFile,
	type CorpusTransformResult,
} from "../registered-adapter-migration.ts";

const execFileAsync = promisify(execFile);

export enum PostHogDocsLane {
	Tw = "tw",
	CssClass = "css-class",
	DesignCss = "design-css",
}

export interface PostHogDocsMigrationOptions {
	readonly referenceRoot?: string;
	readonly outputRoot?: string;
}

export interface PostHogDocsMigrationReport {
	readonly lane: PostHogDocsLane;
	readonly referenceCommit: string;
	readonly sourceFiles: number;
	readonly changedFiles: number;
	readonly convertedCallSites: number;
	readonly residualCount: number;
	readonly residuals: readonly { file: string; token: string; reason: string }[];
	readonly sourceBytes: number;
	readonly outputBytes: number;
	readonly outputByteDelta: number;
	readonly mappedTokens: number;
}

const repositoryRoot = resolve(import.meta.dirname, "../..");
const defaultReferenceRoot = createReferenceWorkspace().path("posthog-com");
const metadataRoot = resolve(repositoryRoot, "examples/example/src");

async function sourceFiles(root: string): Promise<string[]> {
	const files: string[] = [];
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) await visit(absolute);
			else if (SOURCE_SCANNER_SERVICE.isScriptFile(entry.name)) files.push(absolute);
		}
	};
	await visit(root);
	return files.toSorted();
}

function metadata(): PandwindMeta {
	return loadMetaFromSources({
		typesDtsPath: join(metadataRoot, "types.d.ts"),
		twTsPath: join(metadataRoot, "tw.ts"),
		bridgePath: join(metadataRoot, "bridge.ts"),
		interopPath: join(metadataRoot, "pandwind.interop.json"),
	});
}

async function transformLane(
	lane: PostHogDocsLane,
	source: string,
	file: string,
	meta: PandwindMeta,
	root: string,
	files: readonly string[],
): Promise<CorpusTransformResult> {
	const dialect =
		lane === PostHogDocsLane.Tw
			? SwapSourceId.Tw
			: lane === PostHogDocsLane.CssClass
				? SwapSourceId.Css
				: SwapSourceId.Dss;
	return migrateRegisteredFile({
		source,
		file,
		root,
		files,
		meta,
		from: CodemodAdapterId.Tailwind,
		to: `${CodemodAdapterId.Pandwind}:${dialect}`,
		project:
			lane === PostHogDocsLane.Tw
				? { twModule: "proof/pandwind/tw", cxModule: "proof/pandwind/cx" }
				: lane === PostHogDocsLane.CssClass
					? { cssModule: "proof/pandwind/css" }
					: { dssModule: "proof/pandwind/dcss" },
	});
}

function supportFiles(lane: PostHogDocsLane): Record<string, string> {
	const twSource = readFileSyncSafe(join(metadataRoot, "tw.ts"));
	const typesSource = readFileSyncSafe(join(metadataRoot, "types.d.ts"));
	const bridgeSource = readFileSyncSafe(join(metadataRoot, "bridge.ts"));
	const twWrapper = [
		'import { createTw, type TwOptions } from "pandwind/tw";',
		'import type { WindVariants } from "./types";',
		'import { __pandwindConfig as generatedConfig } from "./tw.generated";',
		"",
		"// Preserve authored utility order during source migration; the source",
		"// class list, rather than a merge policy, owns cascade semantics.",
		"export const __pandwindConfig: TwOptions = { variants: generatedConfig.variants };",
		"export const tw = createTw<WindVariants>(__pandwindConfig);",
		"",
	].join("\n");
	const cxSource =
		'import { createCx } from "pandwind/cx";\nimport { __pandwindConfig } from "./tw";\n\nexport const cx = createCx(__pandwindConfig);\n';
	const base: Record<string, string> = {
		"proof/pandwind/tw.generated.ts": twSource,
		"proof/pandwind/tw.ts": twWrapper,
		"proof/pandwind/types.d.ts": typesSource,
		"proof/pandwind/bridge.ts": bridgeSource,
	};
	base["proof/pandwind/cx.ts"] = cxSource;
	if (lane === PostHogDocsLane.CssClass) {
		base["proof/pandwind/css.ts"] =
			'import { createCss } from "pandwind/css";\nimport { examplePreset } from "@pandwind/example-preset";\nimport { twAdapter } from "./bridge";\n\nexport const css = createCss(examplePreset, { className: twAdapter });\n';
	}
	if (lane === PostHogDocsLane.DesignCss) {
		base["proof/pandwind/dcss.ts"] =
			'import { createDesignCss } from "pandwind/design";\nimport type { CssFn } from "pandwind/css";\nimport { examplePreset } from "@pandwind/example-preset";\nimport { twAdapter } from "./bridge";\n\nexport const dcss = createDesignCss(examplePreset, { className: twAdapter }) as unknown as CssFn;\n';
	}
	return base;
}

function readFileSyncSafe(path: string): string {
	// This runner only reads checked-in generated artifacts from the Pandwind
	// repository; keeping the helper local avoids exposing a second file API.
	return readFileSync(path, "utf8");
}

async function materialize(
	referenceRoot: string,
	outputRoot: string,
	lane: PostHogDocsLane,
	changed: ReadonlyMap<string, string>,
	mappedTokens: ReadonlySet<string>,
): Promise<void> {
	await rm(outputRoot, { recursive: true, force: true });
	await copyReference(referenceRoot, outputRoot);
	await prepareExternalComponentStubs(outputRoot);
	await prepareOfflineProofBuild(outputRoot);

	for (const [file, code] of changed) {
		const target = join(outputRoot, file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, code);
	}
	for (const [file, code] of Object.entries(supportFiles(lane))) {
		const target = join(outputRoot, file);
		await mkdir(dirname(target), { recursive: true });
		await writeFile(target, code);
	}

	const packageFile = join(outputRoot, "package.json");
	const packageJson = JSON.parse(await readFile(packageFile, "utf8")) as {
		dependencies?: Record<string, string>;
	};
	packageJson.dependencies = {
		...packageJson.dependencies,
		pandwind: `file:${join(repositoryRoot, "packages/pandwind")}`,
	};
	await writeFile(packageFile, `${JSON.stringify(packageJson, null, 4)}\n`);

	// Keep the original utility vocabulary visible to Tailwind's scanner after
	// className literals have been replaced by runtime API calls. A generated
	// source module preserves the compiler's normal content ordering and avoids
	// the larger, less faithful CSS produced by appending a broad safelist.
	await mkdir(join(outputRoot, "src/pandwind"), { recursive: true });
	await writeFile(
		join(outputRoot, "src/pandwind/source-tokens.ts"),
		`export const posthogSourceTokens = ${JSON.stringify([...mappedTokens].toSorted().join(" "))};\n`,
	);
}

async function copyReference(referenceRoot: string, outputRoot: string): Promise<void> {
	await cp(referenceRoot, outputRoot, {
		recursive: true,
		filter: (source) =>
			!source.endsWith("/.git") &&
			!source.includes("/.git/") &&
			!source.includes("/node_modules/") &&
			!source.includes("/.cache/"),
	});
}

async function prepareExternalComponentStubs(outputRoot: string): Promise<void> {
	const sourceRoots = [join(outputRoot, "contents/docs"), join(outputRoot, "src")];
	const modules = new Map<string, Set<string>>();
	const visit = async (directory: string): Promise<void> => {
		for (const entry of await readdir(directory, { withFileTypes: true })) {
			const absolute = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(absolute);
				continue;
			}
			if (
				!SOURCE_SCANNER_SERVICE.isScriptFile(entry.name) &&
				!entry.name.endsWith(".md") &&
				!entry.name.endsWith(".mdx")
			)
				continue;
			const source = await readFile(absolute, "utf8");
			for (const match of source.matchAll(
				/import\s+(?:type\s+)?(?:(?:([A-Za-z_$][\w$]*)\s*,\s*)?(\{(?:(?!\bimport\s)[\s\S])*?\}|\*\s+as\s+[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*))\s+from\s+["']onboarding\/([^"']+)["']/g,
			)) {
				const defaultBinding = match[1]?.trim();
				const bindings = match[2]?.trim() ?? "";
				const moduleName = match[3];
				if (!moduleName) continue;
				const names = modules.get(moduleName) ?? new Set<string>();
				if (defaultBinding) names.add(defaultBinding);
				if (bindings.startsWith("{")) {
					const importedNames = bindings
						.slice(1, -1)
						.replace(/\/\*[\s\S]*?\*\//g, "")
						.replace(/\/\/[^\n]*/g, "");
					for (const binding of importedNames.split(",")) {
						const name =
							binding
								.trim()
								.replace(/^type\s+/, "")
								.split(/\s+as\s+/)[0] ?? "";
						if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
					}
				} else if (bindings.startsWith("* as ")) {
					// A namespace binding is a local object name, not an export
					// required from the stub module.
				} else if (/^[A-Za-z_$][\w$]*/.test(bindings)) {
					names.add(bindings.match(/^[A-Za-z_$][\w$]*/)?.[0] ?? "default");
				}
				modules.set(moduleName, names);
			}
		}
	};
	for (const sourceRoot of sourceRoots) await visit(sourceRoot);

	await writeFile(
		join(outputRoot, "src/data/mcp-tools.json"),
		JSON.stringify({ categories: null, byName: null, execCommands: null, error: true }, null, 2),
	);
	await writeFile(
		join(outputRoot, "src/data/scout-skills.json"),
		JSON.stringify({ skills: null, error: true }, null, 2),
	);

	for (const [moduleName, names] of modules) {
		const modulePath = join(outputRoot, "src/proof-onboarding", moduleName);
		const target = /\.[cm]?[jt]sx?$/.test(modulePath) ? modulePath : `${modulePath}.tsx`;
		await mkdir(dirname(target), { recursive: true });
		const exports = [...names]
			.filter((name) => /^[A-Za-z_$][\w$]*$/.test(name))
			.map((name) => `export const ${name} = Placeholder;`)
			.join("\n");
		await writeFile(
			target,
			[
				'import * as React from "react";',
				'const Placeholder = (props: any) => React.createElement("span", props, props.children);',
				exports,
				"export default Placeholder;",
				"",
			].join("\n"),
		);
	}

	const gatsbyNodePath = join(outputRoot, "gatsby-node.ts");
	const gatsbyNode = await readFile(gatsbyNodePath, "utf8");
	const onboardingAlias =
		/onboarding:\s*path\.resolve\(\s*__dirname,\s*['"]\.cache['"],\s*['"]gatsby-source-git['"],\s*['"]posthog-main-repo['"],\s*['"]docs['"],\s*['"]onboarding['"]\s*\)/;
	if (!onboardingAlias.test(gatsbyNode)) {
		throw new Error("PostHog corpus changed: onboarding alias marker is missing");
	}
	await writeFile(
		gatsbyNodePath,
		gatsbyNode.replace(
			onboardingAlias,
			"onboarding: path.resolve(__dirname, 'src', 'proof-onboarding')",
		),
	);
}

/**
 * Make the disposable corpus build deterministic. PostHog's production Gatsby
 * graph includes remote CMS, API, Git, billing, and commerce sources. Those
 * integrations are intentionally outside a style migration, so a parity run
 * must run the same local-content build for the untouched baseline and every
 * lane instead of depending on whichever services happen to be reachable.
 */
async function prepareOfflineProofBuild(outputRoot: string): Promise<void> {
	const sourceNodesPath = join(outputRoot, "gatsby/sourceNodes.ts");
	const sourceNodes = await readFile(sourceNodesPath, "utf8");
	const sourceNodesMarker =
		"export const sourceNodes: GatsbyNode['sourceNodes'] = async ({ actions, createContentDigest, createNodeId }) => {";
	if (!sourceNodes.includes(sourceNodesMarker)) {
		throw new Error("PostHog corpus changed: sourceNodes hook marker is missing");
	}
	await writeFile(
		sourceNodesPath,
		sourceNodes.replace(
			sourceNodesMarker,
			[
				sourceNodesMarker,
				'\tif (process.env.GATSBY_MIGRATION_OFFLINE === "true") {',
				"\t\tconst productTypes = [",
				"\t\t\t`product_analytics`, `session_replay`, `feature_flags`, `surveys`,",
				"\t\t\t`data_warehouse`, `realtime_destinations`, `error_tracking`, `cdp`,",
				"\t\t\t`web_analytics`, `experiments`, `posthog_ai`, `ai_observability`,",
				"\t\t\t`logs`, `workflows`, `inbox`, `posthog_desktop`, `endpoints`, `replay_vision`,",
				"\t\t\t`platform_and_support`,",
				"\t\t]",
				"\t\tconst data = {",
				"\t\t\tproducts: productTypes.map((type) => ({",
				"\t\t\t\ttype,",
				"\t\t\t\tname: type,",
				"\t\t\t\tunit: `event`,",
				"\t\t\t\taddons: [],",
				"\t\t\t\tplans: [{ unit: `month`, tiers: [{ flat_amount_usd: `0`, unit_amount_usd: `0`, up_to: 1000 }, { flat_amount_usd: `0`, unit_amount_usd: `10`, up_to: 100000 }] }],",
				"\t\t\t})),",
				"\t\t}",
				"\t\tactions.createNode({",
				"\t\t\tid: createNodeId(`posting-product-data`),",
				"\t\t\tparent: null,",
				"\t\t\tchildren: [],",
				"\t\t\tinternal: { type: `ProductData`, contentDigest: createContentDigest(data) },",
				"\t\t\t...data,",
				"\t\t})",
				"\t\treturn",
				"\t}",
			].join("\n"),
		),
	);

	const onPreBootstrapPath = join(outputRoot, "gatsby/onPreBootstrap.ts");
	const onPreBootstrap = await readFile(onPreBootstrapPath, "utf8");
	const onPreBootstrapMarker =
		"export const onPreBootstrap: GatsbyNode['onPreBootstrap'] = async ({ cache }) => {";
	if (!onPreBootstrap.includes(onPreBootstrapMarker)) {
		throw new Error("PostHog corpus changed: onPreBootstrap hook marker is missing");
	}
	await writeFile(
		onPreBootstrapPath,
		onPreBootstrap.replace(
			onPreBootstrapMarker,
			[onPreBootstrapMarker, '\tif (process.env.GATSBY_MIGRATION_OFFLINE === "true") return;'].join(
				"\n",
			),
		),
	);

	const onCreateNodePath = join(outputRoot, "gatsby/onCreateNode.ts");
	const onCreateNode = await readFile(onCreateNodePath, "utf8");
	const templateListMarker = "async function getTemplateList() {";
	if (!onCreateNode.includes(templateListMarker)) {
		throw new Error("PostHog corpus changed: template enrichment marker is missing");
	}
	await writeFile(
		onCreateNodePath,
		onCreateNode.replace(
			templateListMarker,
			[
				templateListMarker,
				'\tif (process.env.GATSBY_MIGRATION_OFFLINE === "true") return [];',
			].join("\n"),
		),
	);

	const squeakSourcePath = join(outputRoot, "plugins/gatsby-source-squeak/gatsby-node.ts");
	const squeakSource = await readFile(squeakSourcePath, "utf8");
	const squeakSourceMarker =
		"export const sourceNodes: GatsbyNode['sourceNodes'] = async (\n    { actions, createContentDigest, createNodeId, cache },\n    pluginOptions\n) => {";
	if (!squeakSource.includes(squeakSourceMarker)) {
		throw new Error("PostHog corpus changed: Squeak source hook marker is missing");
	}
	await writeFile(
		squeakSourcePath,
		squeakSource.replace(
			squeakSourceMarker,
			[squeakSourceMarker, '\tif (process.env.GATSBY_MIGRATION_OFFLINE === "true") return;'].join(
				"\n",
			),
		),
	);

	const schemaPath = join(outputRoot, "gatsby/createSchemaCustomization.ts");
	const schema = await readFile(schemaPath, "utf8");
	const schemaMarker = "    const { createTypes } = actions";
	if (!schema.includes(schemaMarker)) {
		throw new Error("PostHog corpus changed: schema customization marker is missing");
	}
	const offlineTypes = [
		"        type OfflineSqueakRelationAttributes { name: String slug: String label: String }",
		"        type OfflineSqueakRelationData { id: ID attributes: OfflineSqueakRelationAttributes }",
		"        type OfflineSqueakRelations { data: [OfflineSqueakRelationData] }",
		"        type OfflineSqueakQuote { id: ID quote: String }",
		"        extend type SqueakProfile {",
		"            companyRole: String",
		"            country: String",
		"            location: String",
		"            startDate: Date",
		"            pineappleOnPizza: Boolean",
		"            biography: String",
		"            pronouns: String",
		"            github: String",
		"            leadTeams: OfflineSqueakRelations",
		"            teams: OfflineSqueakRelations",
		"            quotes: [OfflineSqueakQuote]",
		"        }",
		"        extend type SqueakTeam { slug: String leadProfiles: OfflineSqueakRelations }",
		"        type OfflineRoadmapCta { label: String url: String }",
		"        type OfflineRoadmapLikesData { id: ID }",
		"        type OfflineRoadmapLikes { data: [OfflineRoadmapLikesData] }",
		"        extend type SqueakRoadmap { complete: Boolean createdAt: Date cta: OfflineRoadmapCta likes: OfflineRoadmapLikes }",
		"        type OfflineRoadmapProfileAvatarAttributes { url: String }",
		"        type OfflineRoadmapProfileAvatarData { attributes: OfflineRoadmapProfileAvatarAttributes }",
		"        type OfflineRoadmapProfileAvatar { data: OfflineRoadmapProfileAvatarData }",
		"        type OfflineRoadmapProfileTeamAttributes { name: String miniCrest: OfflineRoadmapProfileAvatar }",
		"        type OfflineRoadmapProfileTeamData { attributes: OfflineRoadmapProfileTeamAttributes }",
		"        type OfflineRoadmapProfileTeams { data: [OfflineRoadmapProfileTeamData] }",
		"        type OfflineRoadmapProfileAttributes { firstName: String lastName: String companyRole: String country: String location: String startDate: Date color: String avatar: OfflineRoadmapProfileAvatar teams: OfflineRoadmapProfileTeams }",
		"        type OfflineRoadmapProfileData { id: ID attributes: OfflineRoadmapProfileAttributes }",
		"        type OfflineRoadmapProfiles { data: [OfflineRoadmapProfileData] }",
		"        type OfflineRoadmapMediaDataAttributes { url: String }",
		"        type OfflineRoadmapMediaData { attributes: OfflineRoadmapMediaDataAttributes }",
		"        type OfflineRoadmapMedia { data: OfflineRoadmapMediaData gatsbyImageData: JSON }",
		"        type OfflineRoadmapTopic { data: OfflineSqueakRelationData }",
		"        extend type Roadmap { strapiID: Int title: String description: String complete: Boolean date: Date @dateformat cta: OfflineRoadmapCta media: OfflineRoadmapMedia profiles: OfflineRoadmapProfiles teams: OfflineRoadmapProfileTeams topic: OfflineRoadmapTopic }",
		"        extend type SqueakTopic { topics: [SqueakTopic] }",
		"        extend type ApiEndpoint { components: String nextURL: String previousURL: String }",
		"        extend type Frontmatter { platformLabel: String }",
		"        type OfflineFileFields { slug: String title: String html: String locations: [String] gitLogLatestDate(formatString: String): Date }",
		"        extend type File { fields: OfflineFileFields }",
		"        enum GatsbyImagePlaceholder { NONE DOMINANT_COLOR TRACED_SVG BLURRED }",
		"        type OfflineImageData { src: String }",
		"        extend type MdxFrontmatterFeaturedImageChildImageSharp { gatsbyImageData(width: Int, height: Int, placeholder: GatsbyImagePlaceholder): JSON }",
		"        extend type MdxFrontmatterImagesChildImageSharp { gatsbyImageData(width: Int, height: Int, placeholder: GatsbyImagePlaceholder): JSON }",
		"        extend type MdxFrontmatterThumbnailChildImageSharp { gatsbyImageData(width: Int, height: Int, placeholder: GatsbyImagePlaceholder): JSON }",
		"        extend type SqueakRoadmapMedia { gatsbyImageData: JSON }",
		"        extend type SqueakTeamMiniCrest { gatsbyImageData(width: Int, height: Int, placeholder: GatsbyImagePlaceholder): JSON }",
		"        type OfflineProductFeature { key: String name: String description: String category: String limit: String note: String entitlement_only: Boolean is_plan_default: Boolean unit: String }",
		"        type OfflineProductTier { current_amount_usd: String current_usage: Float flat_amount_usd: String unit_amount_usd: String up_to: Float }",
		"        type OfflineProductPlan { description: String docs_url: String image_url: String name: String plan_key: String product_key: String unit: String flat_rate: String unit_amount_usd: String free_allocation: String included_if: String contact_support: Boolean features: [OfflineProductFeature] tiers: [OfflineProductTier] }",
		"        type OfflineProductAddon { contact_support: Boolean description: String docs_url: String image_url: String icon_key: String inclusion_only: Boolean name: String type: String unit: String legacy_product: String features: [OfflineProductFeature] plans: [OfflineProductPlan] }",
		"        type OfflineProduct { description: String docs_url: String image_url: String icon_key: String inclusion_only: Boolean contact_support: Boolean name: String type: String unit: String usage_key: String legacy_product: String addons: [OfflineProductAddon] plans: [OfflineProductPlan] }",
		"        type ProductData implements Node { products: [OfflineProduct] }",
		"        type Reward implements Node { handle: String title: String description: String price: Float image: String merchStoreHandle: String discountAmount: Float }",
		"        type AchievementIconAttributes { url: String }",
		"        type AchievementIconData { attributes: AchievementIconAttributes }",
		"        type AchievementIcon { data: AchievementIconData }",
		"        type OfflineAchievementRelationData { id: ID }",
		"        type OfflineAchievementRelation { data: OfflineAchievementRelationData }",
		"        type Achievement implements Node { strapiID: Int title: String points: Int description: String icon: AchievementIcon achievement_group: OfflineAchievementRelation }",
		"        type OfflineAchievementGroupDataAttributes { title: String points: Int description: String icon: AchievementIcon }",
		"        type OfflineAchievementGroupData { id: ID attributes: OfflineAchievementGroupDataAttributes }",
		"        type OfflineAchievementGroupAchievements { data: [OfflineAchievementGroupData] }",
		"        extend type AchievementGroup { achievements: OfflineAchievementGroupAchievements }",
		"        extend type Achievement { Title: String tiered: Boolean achievements: OfflineAchievementGroupAchievements }",
	].join("\n");
	const schemaPatch = [
		schemaMarker,
		"",
		"    if (process.env.GATSBY_MIGRATION_OFFLINE === 'true') {",
		"        createTypes(`",
		offlineTypes,
		"        `)",
		"    }",
	].join("\n");
	await writeFile(schemaPath, schema.replace(schemaMarker, schemaPatch));

	const configPath = join(outputRoot, "gatsby-config.js");
	const config = await readFile(configPath, "utf8");
	const configMarker = "module.exports = {";
	if (!config.includes(configMarker) || !/\n}\s*$/.test(config)) {
		throw new Error("PostHog corpus changed: Gatsby config shape is unsupported");
	}
	const offlineConfig = [
		"",
		'if (process.env.GATSBY_MIGRATION_OFFLINE === "true") {',
		"    const offlinePlugins = new Set([",
		'        "gatsby-source-ashby",',
		'        "gatsby-mapbox-locations",',
		'        "gatsby-source-git-metadata",',
		'        "gatsby-source-git",',
		'        "gatsby-plugin-image",',
		'        "gatsby-plugin-manifest",',
		"    ])",
		"    gatsbyConfig.plugins = gatsbyConfig.plugins.filter((plugin) => {",
		'        const name = typeof plugin === "string" ? plugin : plugin.resolve',
		'        return !offlinePlugins.has(name) && !String(name).includes("gatsby-transformer-cloudinary")',
		"    })",
		"}",
		"",
		"module.exports = gatsbyConfig",
		"",
	].join("\n");
	await writeFile(
		configPath,
		config
			.replace(configMarker, "const gatsbyConfig = {")
			.replace(/\n}\s*$/, `\n}\n${offlineConfig}`),
	);
}

export class PostHogDocsMigration {
	static readonly lanes: readonly PostHogDocsLane[] = [
		PostHogDocsLane.Tw,
		PostHogDocsLane.CssClass,
		PostHogDocsLane.DesignCss,
	];

	static async run(
		lane: PostHogDocsLane,
		options: PostHogDocsMigrationOptions = {},
	): Promise<PostHogDocsMigrationReport> {
		const referenceRoot = resolve(options.referenceRoot ?? defaultReferenceRoot);
		const referenceCommit = (
			await execFileAsync("git", ["-C", referenceRoot, "rev-parse", "HEAD"], { encoding: "utf8" })
		).stdout.trim();
		const meta = metadata();
		const root = join(referenceRoot, "src");
		const files = await sourceFiles(root);
		const projectFiles = await discoverProjectFiles(referenceRoot);
		const outputRoot = resolve(options.outputRoot ?? join(referenceRoot, ".pandwind-output"));
		const changed = new Map<string, string>();
		const residuals: Array<PostHogDocsMigrationReport["residuals"][number]> = [];
		const mappedTokens = new Set<string>();
		let sourceFilesCount = 0;
		let changedFiles = 0;
		let convertedCallSites = 0;
		let sourceBytes = 0;
		let outputBytes = 0;

		for (const absolute of files) {
			const source = await readFile(absolute, "utf8");
			if (!source.includes("className=")) continue;
			const file = relative(referenceRoot, absolute).replaceAll("\\", "/");
			const result = await transformLane(lane, source, file, meta, referenceRoot, projectFiles);
			if (!result.changed && result.unmappedTokens.length === 0) continue;
			sourceFilesCount++;
			if (result.changed) changedFiles++;
			convertedCallSites += result.converted;
			residuals.push(...result.unmappedTokens);
			sourceBytes += Buffer.byteLength(source);
			outputBytes += Buffer.byteLength(result.code);
			changed.set(file, result.code);

			for (const match of source.matchAll(
				/\bclassName\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*"([^"]*)"\s*\})/g,
			)) {
				const classString = match[1] ?? match[2] ?? match[3] ?? "";
				for (const token of mapClassList(classString, meta).mapped) mappedTokens.add(token.raw);
			}
		}

		if (options.outputRoot !== undefined) {
			await materialize(referenceRoot, outputRoot, lane, changed, mappedTokens);
		}

		return {
			lane,
			referenceCommit,
			sourceFiles: sourceFilesCount,
			changedFiles,
			convertedCallSites,
			residualCount: residuals.length,
			residuals,
			sourceBytes,
			outputBytes,
			outputByteDelta: outputBytes - sourceBytes,
			mappedTokens: mappedTokens.size,
		};
	}

	/**
	 * Materialize the untouched checkout used as the browser/CSS baseline.
	 * Keeping this beside the lane materializer prevents parity runs from
	 * accidentally comparing a lane with a manually edited or stale baseline.
	 */
	static async materializeBaseline(
		options: Pick<PostHogDocsMigrationOptions, "referenceRoot" | "outputRoot"> = {},
	): Promise<{ referenceCommit: string; outputRoot: string }> {
		const referenceRoot = resolve(options.referenceRoot ?? defaultReferenceRoot);
		const outputRoot = resolve(options.outputRoot ?? join(referenceRoot, ".pandwind-baseline"));
		const referenceCommit = (
			await execFileAsync("git", ["-C", referenceRoot, "rev-parse", "HEAD"], { encoding: "utf8" })
		).stdout.trim();
		await rm(outputRoot, { recursive: true, force: true });
		await copyReference(referenceRoot, outputRoot);
		await prepareExternalComponentStubs(outputRoot);
		await prepareOfflineProofBuild(outputRoot);
		return { referenceCommit, outputRoot };
	}
}
