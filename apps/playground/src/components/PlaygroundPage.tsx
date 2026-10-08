import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "../cx.ts";
import { tw } from "../tw.ts";
import { createRuntimeCss, createRuntimeDesignCss } from "yumcss/css/runtime";
import type { ClassNameStrategy } from "yumcss/css";
import {
	PlaygroundApi,
	type ExampleDef,
	type ExampleFile,
	type ExampleVariant,
} from "../lib/examples.ts";
import { applyPreviewControls, initialPreviewControlValues } from "../lib/preview-controls.ts";
import type { EditorTypeLibrary } from "../lib/editor-types.ts";
import {
	evalPlayground,
	evalSiblingModule,
	type EvalInput,
	type PlaygroundResult,
} from "../lib/eval-playground.ts";
import { resolveDesignStyle } from "yumcss/design/resolve";
import { examplePreset } from "@yumcss/example-preset";
import { SANDBOX_MODULES } from "../lib/sandbox-modules.ts";
import {
	CLASS_NAME_ADAPTERS,
	classNameAdapterById,
	type ClassNameAdapterDefinition,
	previewEngineRegistry,
} from "../lib/class-name-adapters.ts";
import { EditorPane } from "./EditorPane.tsx";
import { ResultsPane } from "./ResultsPane.tsx";
import { GhostButton, ResizableSplitter } from "./ui.tsx";
import { css as uiCss } from "../ui-css.ts";

import { PreviewEngineId, PreviewExecution, type PreviewEngine } from "../lib/preview-engine.ts";

const COMPACT_PLAYGROUND_QUERY = "(max-width: 900px)";
const PLAYGROUND_SPLITTER = uiCss.class({ flex: "1 1 0%" });
const COMPACT_PLAYGROUND_SPLITTER = uiCss.class({ flex: "1 1 0%" });

function useCompactPlayground(): boolean {
	const [compact, setCompact] = useState(
		() => typeof window !== "undefined" && window.matchMedia(COMPACT_PLAYGROUND_QUERY).matches,
	);
	useEffect(() => {
		const media = window.matchMedia(COMPACT_PLAYGROUND_QUERY);
		const sync = () => setCompact(media.matches);
		sync();
		media.addEventListener("change", sync);
		return () => media.removeEventListener("change", sync);
	}, []);
	return compact;
}

function encodeCode(code: string): string {
	return btoa(String.fromCharCode(...new TextEncoder().encode(code)));
}

function decodeCode(encoded: string): string | null {
	try {
		return new TextDecoder().decode(Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)));
	} catch {
		return null;
	}
}

/**
 * Evaluate every sibling tab in module mode; their exported bindings become
 * the `./name` import surface the entry tab resolves against — the same
 * module graph a real bundler would see.
 */
function evalSiblings(
	sources: readonly string[],
	variant: ExampleVariant,
	strategy: ClassNameStrategy | null,
): EvalInput["moduleBindings"] {
	if (variant.files.length <= 1) return undefined;
	const bindings: Record<string, Record<string, unknown>> = {};
	for (let index = 1; index < variant.files.length; index++) {
		const file: ExampleFile = variant.files[index]!;
		try {
			bindings["./" + file.name] = evalSiblingModule(
				makeInput(sources[index] ?? file.code, undefined, strategy),
			);
		} catch (error) {
			throw new Error(file.name + ": " + (error instanceof Error ? error.message : String(error)), {
				cause: error,
			});
		}
	}
	return bindings;
}

function variantFromUrl(def: ExampleDef): ExampleVariant {
	const requested = new URLSearchParams(window.location.search).get("api");
	return def.variants.find((variant) => variant.api === requested) ?? def.variants[0]!;
}

function adapterFromUrl(): ClassNameAdapterDefinition {
	return classNameAdapterById(new URLSearchParams(window.location.search).get("adapter"));
}

function variantUrl(
	def: ExampleDef,
	api: ExampleVariant["api"],
	hash: string,
	adapterId: ClassNameAdapterDefinition["id"],
): string {
	const params = new URLSearchParams();
	if (def.variants.length > 1) params.set("api", api);
	if (api !== PlaygroundApi.Tw && adapterId !== PreviewEngineId.Atomic) {
		params.set("adapter", adapterId);
	}
	const search = params.toString();
	return window.location.pathname + (search === "" ? "" : `?${search}`) + hash;
}

export function PlaygroundPage(props: { def: ExampleDef }) {
	const compact = useCompactPlayground();
	const initialVariant = variantFromUrl(props.def);
	const initialAdapter = adapterFromUrl();
	const [api, setApi] = useState<ExampleVariant["api"]>(initialVariant.api);
	const activeVariant = props.def.variants.find((variant) => variant.api === api) ?? initialVariant;
	const [classNameAdapterId, setPreviewEngineId] = useState(initialAdapter.id);
	const activeClassNameAdapter = classNameAdapterById(classNameAdapterId);
	const [files, setFiles] = useState<readonly string[]>(() => {
		const hash = window.location.hash.slice(1);
		if (hash !== "") {
			const decoded = decodeCode(hash);
			if (decoded !== null && decoded.trim() !== "") {
				return [decoded, ...activeVariant.files.slice(1).map((file) => file.code)];
			}
		}
		return activeVariant.files.map((file) => file.code);
	});
	const [activeTab, setActiveTab] = useState(0);
	const [previewControlValues, setPreviewControlValues] = useState(() =>
		initialPreviewControlValues(props.def.preview.controls),
	);
	const [evaluation, setEvaluation] = useState<PlaygroundResult | undefined>();
	const execution = useRef(new PreviewExecution());
	const evaluate = useCallback(
		(sources: readonly string[]) => {
			setEvaluation(undefined);
			void execution.current.run(
				(signal) =>
					evaluatePlayground(
						sources,
						activeVariant,
						previewEngineRegistry.resolve(
							activeVariant.api === PlaygroundApi.Tw
								? PreviewEngineId.Tailwind
								: activeClassNameAdapter.id,
						),
						props.def.preview.controls,
						previewControlValues,
						signal,
					),
				setEvaluation,
			);
		},
		[activeClassNameAdapter.id, activeVariant, previewControlValues, props.def.preview.controls],
	);
	useEffect(() => {
		setPreviewControlValues(initialPreviewControlValues(props.def.preview.controls));
	}, [props.def.path]);
	useEffect(() => {
		evaluate(files);
		return () => execution.current.cancel();
	}, [evaluate]);
	useEffect(() => () => execution.current.cancel(), []);
	const run = useCallback(
		(sources: readonly string[]) => {
			evaluate(sources);
			const hash =
				sources[0]!.trim() === activeVariant.files[0]!.code.trim()
					? ""
					: "#" + encodeCode(sources[0]!);
			history.replaceState(
				null,
				"",
				variantUrl(props.def, activeVariant.api, hash, activeClassNameAdapter.id),
			);
		},
		[activeClassNameAdapter, activeVariant, evaluate, props.def],
	);

	const selectApi = useCallback(
		(nextApi: ExampleVariant["api"]) => {
			const nextVariant = props.def.variants.find((variant) => variant.api === nextApi);
			if (nextVariant === undefined) return;
			const nextFiles = nextVariant.files.map((file) => file.code);
			setApi(nextVariant.api);
			setFiles(nextFiles);
			setActiveTab(0);
			history.replaceState(
				null,
				"",
				variantUrl(props.def, nextVariant.api, "", activeClassNameAdapter.id),
			);
		},
		[activeClassNameAdapter, props.def],
	);

	const selectClassNameAdapter = useCallback(
		(nextId: string) => {
			const nextAdapter = classNameAdapterById(nextId);
			setPreviewEngineId(nextAdapter.id);
			history.replaceState(null, "", variantUrl(props.def, activeVariant.api, "", nextAdapter.id));
		},
		[activeVariant, props.def],
	);

	useEffect(() => {
		const syncVariant = () => {
			const nextVariant = variantFromUrl(props.def);
			const nextAdapter = adapterFromUrl();
			const nextFiles = nextVariant.files.map((file) => file.code);
			setApi(nextVariant.api);
			setPreviewEngineId(nextAdapter.id);
			setFiles(nextFiles);
			setActiveTab(0);
		};
		window.addEventListener("popstate", syncVariant);
		return () => window.removeEventListener("popstate", syncVariant);
	}, [previewControlValues, props.def]);

	// Live evaluation: re-run shortly after every edit; ⌘↵ runs immediately.
	// The debounced run reads the latest state through the setter so edits on
	// another tab between keystrokes are never lost.
	const onChange = useCallback(
		(source: string) => {
			setFiles((current) => current.map((code, index) => (index === activeTab ? source : code)));
			window.clearTimeout(debounceRef.current);
			debounceRef.current = window.setTimeout(() => {
				setFiles((latest) => {
					run(latest);
					return latest;
				});
			}, 300);
		},
		[activeTab, run],
	);

	useEffect(() => {
		const handler = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key === "Enter") run(files);
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [files, run]);

	// Flush a pending debounced run on unmount only — clearing on every
	// re-render would cancel the run scheduled by the last keystroke.
	const debounceRef = useRef<number>(0);
	useEffect(() => () => window.clearTimeout(debounceRef.current), []);

	const dirty = files.some(
		(code, index) => code.trim() !== (activeVariant.files[index]?.code ?? "").trim(),
	);
	const editorFileLibraries: readonly EditorTypeLibrary[] = activeVariant.files
		.map((file, index) => ({
			filePath: `file:///yumcss/playground/${file.name}`,
			content: files[index] ?? file.code,
		}))
		.filter((_, index) => index !== activeTab);
	const reset = useCallback(() => {
		window.clearTimeout(debounceRef.current);
		const restored = activeVariant.files.map((file) => file.code);
		setFiles(restored);
		run(restored);
	}, [activeVariant, run]);
	const onPreviewControlChange = useCallback((id: string, value: string) => {
		setPreviewControlValues((current) =>
			current[id] === value ? current : { ...current, [id]: value },
		);
	}, []);

	return (
		<div
			className={uiCss.class({
				display: "flex",
				height: "100%",
				minHeight: "0px",
				flexDirection: "column",
				gap: "12px",
				padding: "16px",
			})}
		>
			<div
				className={uiCss.class({
					display: "flex",
					minHeight: "24px",
					flexShrink: "0",
					alignItems: "center",
					justifyContent: "space-between",
					gap: "12px",
				})}
			>
				<div
					className={uiCss.class({
						display: "flex",
						minWidth: "0px",
						flexWrap: "wrap",
						alignItems: "center",
						gap: "8px 12px",
					})}
				>
					<div
						className={uiCss.class({
							display: "flex",
							flexWrap: "wrap",
							alignItems: "center",
							gap: "8px",
						})}
					>
						<h1
							className={uiCss.class({
								margin: "0",
								fontSize: "13px",
								fontWeight: "500",
								color: "textStrong",
							})}
						>
							{props.def.title}
						</h1>
						{props.def.variants.length > 1 && (
							<label className={uiCss.class({ display: "flex", alignItems: "center", gap: "5px" })}>
								<span
									className={uiCss.class({
										fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
										fontSize: "10px",
										textTransform: "uppercase",
										letterSpacing: "0.08em",
										color: "textFaint",
									})}
								>
									API
								</span>
								<select
									aria-label="Select YumCSS API"
									value={activeVariant.api}
									onChange={(event) => selectApi(event.target.value as ExampleVariant["api"])}
									className={uiCss.class({
										height: "24px",
										border: "strong",
										borderRadius: "5px",
										backgroundColor: "control",
										padding: "0 6px",
										fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
										fontSize: "11px",
										color: "textSoft",
										outline: "none",
										"&:focus": { borderColor: "accent", color: "textStrong" },
									})}
								>
									{props.def.variants.map((variant) => (
										<option key={variant.api} value={variant.api}>
											{variant.label}
										</option>
									))}
								</select>
							</label>
						)}
						{activeVariant.api !== PlaygroundApi.Tw && (
							<label className={uiCss.class({ display: "flex", alignItems: "center", gap: "5px" })}>
								<span
									className={uiCss.class({
										fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
										fontSize: "10px",
										textTransform: "uppercase",
										letterSpacing: "0.08em",
										color: "textFaint",
									})}
								>
									ADAPTER
								</span>
								<select
									aria-label="Select class name adapter"
									value={activeClassNameAdapter.id}
									onChange={(event) => selectClassNameAdapter(event.target.value)}
									className={uiCss.class({
										height: "24px",
										maxWidth: "220px",
										border: "strong",
										borderRadius: "5px",
										backgroundColor: "control",
										padding: "0 6px",
										fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
										fontSize: "11px",
										color: "textSoft",
										outline: "none",
										"&:focus": { borderColor: "accent", color: "textStrong" },
									})}
								>
									{CLASS_NAME_ADAPTERS.map((adapter) => (
										<option key={adapter.id} value={adapter.id}>
											{adapter.label}
										</option>
									))}
								</select>
							</label>
						)}
					</div>
					<p
						className={uiCss.class({
							display: "none",
							margin: "0",
							fontSize: "12px",
							color: "textFaint",
							"@media (min-width: 768px)": { display: "block" },
						})}
					>
						{props.def.blurb}
					</p>
					{activeVariant.api === PlaygroundApi.Tw ? (
						<span
							className={uiCss.class({
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "10px",
								color: "textFaint",
							})}
						>
							tw() uses its generated Tailwind bridge
						</span>
					) : (
						<span
							className={uiCss.class({
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "10px",
								color: "textFaint",
							})}
						>
							{activeClassNameAdapter.description}
						</span>
					)}
				</div>
				{dirty && (
					<GhostButton onClick={reset} title="Restore the example code">
						reset
					</GhostButton>
				)}
			</div>
			{activeVariant.files.length > 1 && (
				<div
					className={uiCss.class({
						display: "flex",
						height: "28px",
						flexShrink: "0",
						alignItems: "center",
						gap: "4px",
						overflowX: "auto",
					})}
					role="tablist"
				>
					{activeVariant.files.map((file, index) => (
						<button
							key={file.name}
							type="button"
							role="tab"
							aria-selected={index === activeTab}
							onClick={() => setActiveTab(index)}
							className={`${uiCss.class({ border: "0", borderRadius: "6px", backgroundColor: "control", padding: "4px 10px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px", lineHeight: "20px", transition: "color 120ms, background-color 120ms" })} ${index === activeTab ? uiCss.class({ backgroundColor: "controlSelected", color: "textStrong" }) : uiCss.class({ color: "textSoft", "&:hover": { backgroundColor: "controlHover", color: "textStrong" } })}`}
						>
							{file.name}
						</button>
					))}
				</div>
			)}
			<ResizableSplitter
				orientation={compact ? "vertical" : "horizontal"}
				className={compact ? COMPACT_PLAYGROUND_SPLITTER : PLAYGROUND_SPLITTER}
				panels={[
					{
						id: "editor",
						initialSize: 50,
						content: (
							<EditorPane
								code={files[activeTab] ?? ""}
								onChange={onChange}
								onRun={() => run(files)}
								filePath={
									"file:///yumcss/playground/" +
									(activeVariant.files[activeTab]?.name ?? "Example.tsx")
								}
								fileLibraries={editorFileLibraries}
								className={uiCss.class({ height: "100%", minHeight: "0px" })}
							/>
						),
					},
					{
						id: "output",
						initialSize: 50,
						content: (
							<ResultsPane
								result={evaluation}
								preview={props.def.preview}
								previewControlValues={previewControlValues}
								onPreviewControlChange={onPreviewControlChange}
							/>
						),
					},
				]}
			/>
		</div>
	);
}

function runtimeOptions(
	strategy: ClassNameStrategy | null,
	options: unknown = {},
): Parameters<typeof createRuntimeCss>[1] {
	const authoredOptions =
		options !== null && typeof options === "object" ? (options as Record<string, unknown>) : {};
	const authoredSheetOptions =
		authoredOptions.sheetOptions !== null && typeof authoredOptions.sheetOptions === "object"
			? (authoredOptions.sheetOptions as Record<string, unknown>)
			: {};
	return {
		...authoredOptions,
		className: strategy ?? undefined,
		sheetOptions: { ...authoredSheetOptions, autoMount: false },
	} as Parameters<typeof createRuntimeCss>[1];
}

function makeInput(
	code: string,
	moduleBindings?: EvalInput["moduleBindings"],
	strategy: ClassNameStrategy | null = null,
): EvalInput {
	const createPlaygroundCss = (presetOrOptions: unknown = {}, options: unknown = {}) =>
		createRuntimeCss(
			examplePreset,
			runtimeOptions(strategy, presetOrOptions === examplePreset ? options : presetOrOptions),
		);
	return {
		code,
		tw,
		css: createRuntimeDesignCss(examplePreset, runtimeOptions(strategy)),
		cx,
		createCss: createPlaygroundCss,
		createUnsafeCss: (options: unknown = {}) =>
			createRuntimeCss(examplePreset, runtimeOptions(strategy, options)),
		classNameStrategy: strategy,
		moduleBindings:
			moduleBindings === undefined ? SANDBOX_MODULES : { ...SANDBOX_MODULES, ...moduleBindings },
		resolveCss: (style: Record<string, unknown>) => {
			const resolved = resolveDesignStyle(style, examplePreset.tokens);
			const out: Record<string, string> = {};
			for (const [prop, value] of Object.entries(resolved)) {
				out[String(prop)] = String(value);
			}
			return out;
		},
	};
}

async function evaluatePlayground(
	sources: readonly string[],
	variant: ExampleVariant,
	engine: PreviewEngine,
	controls: ExampleDef["preview"]["controls"],
	controlValues: Readonly<Record<string, string>>,
	signal: AbortSignal,
): Promise<PlaygroundResult> {
	const session = await engine.createSession(signal);
	signal.throwIfAborted();
	const source = applyPreviewControls(sources[0]!, controls, controlValues);
	const result = evalPlayground(
		makeInput(source, evalSiblings(sources, variant, session.strategy), session.strategy),
	);
	if (!result.ok) return result;
	const generated = await session.compile(result);
	signal.throwIfAborted();
	return {
		...result,
		sheets:
			session.strategy === null || session.strategy.sheetBacked === true
				? result.sheets
				: [
						...result.sheets,
						{
							strategy: generated.engine,
							css: generated.css,
							tokens: "",
							rules:
								generated.css === "" ? [] : [{ id: engine.id, css: generated.css, priority: 0 }],
						},
					],
		execution: {
			...result.execution,
			verified: [...result.execution.verified, "engine-css"],
			note: `${generated.engine} ${generated.version} executed in the browser. Preview uses its emitted stylesheet without declaration overrides.`,
		},
	};
}
