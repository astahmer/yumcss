import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "../cx.ts";
import { tw } from "../tw.ts";
import { createRuntimeCss, createRuntimeDesignCss } from "pandwind/css/runtime";
import type { ClassNameStrategy } from "pandwind/css";
import {
	PlaygroundApi,
	type ExampleDef,
	type ExampleFile,
	type ExampleVariant,
} from "../lib/examples.ts";
import { evalPlayground, evalSiblingModule, type EvalInput } from "../lib/eval-playground.ts";
import { resolveDesignStyle } from "pandwind/design/resolve";
import { examplePreset } from "@pandwind/example-preset";
import { SANDBOX_MODULES } from "../lib/sandbox-modules.ts";
import {
	CLASS_NAME_ADAPTERS,
	ClassNameAdapterId,
	classNameAdapterById,
	type ClassNameAdapterDefinition,
} from "../lib/class-name-adapters.ts";
import { EditorPane } from "./EditorPane.tsx";
import { ResultsPane } from "./ResultsPane.tsx";
import { GhostButton, ResizableSplitter } from "./ui.tsx";
import { css as uiCss } from "../ui-css.ts";

const COMPACT_PLAYGROUND_QUERY = "(max-width: 900px)";
const PLAYGROUND_SPLITTER = uiCss.class({ flex: "1 1 0%", minHeight: "18rem" });
const COMPACT_PLAYGROUND_SPLITTER = uiCss.class({ flex: "1 1 0%", minHeight: "24rem" });

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

/** Component-like dynamics available inside evaluated code as `props`. */
const SANDBOX_PROPS = { active: true, tone: "red-600" };

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
	adapter: ClassNameAdapterDefinition,
): EvalInput["moduleBindings"] {
	if (variant.files.length <= 1) return undefined;
	const bindings: Record<string, Record<string, unknown>> = {};
	for (let index = 1; index < variant.files.length; index++) {
		const file: ExampleFile = variant.files[index]!;
		try {
			bindings["./" + file.name] = evalSiblingModule(
				makeInput(sources[index] ?? file.code, undefined, adapter.strategy ?? null),
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
	if (api !== PlaygroundApi.Tw && adapterId !== ClassNameAdapterId.Atomic) {
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
	const [classNameAdapterId, setClassNameAdapterId] = useState(initialAdapter.id);
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
	const [result, setResult] = useState(() =>
		evalPlayground(
			makeInput(
				files[0]!,
				evalSiblings(files, activeVariant, activeClassNameAdapter),
				activeClassNameAdapter.strategy ?? null,
			),
		),
	);
	const run = useCallback(
		(sources: readonly string[]) => {
			try {
				setResult(
					evalPlayground(
						makeInput(
							sources[0]!,
							evalSiblings(sources, activeVariant, activeClassNameAdapter),
							activeClassNameAdapter.strategy ?? null,
						),
					),
				);
			} catch (error) {
				setResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
			}
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
		[activeClassNameAdapter, activeVariant, props.def],
	);

	const selectApi = useCallback(
		(nextApi: ExampleVariant["api"]) => {
			const nextVariant = props.def.variants.find((variant) => variant.api === nextApi);
			if (nextVariant === undefined) return;
			const nextFiles = nextVariant.files.map((file) => file.code);
			setApi(nextVariant.api);
			setFiles(nextFiles);
			setActiveTab(0);
			setResult(
				evalPlayground(
					makeInput(
						nextFiles[0]!,
						evalSiblings(nextFiles, nextVariant, activeClassNameAdapter),
						activeClassNameAdapter.strategy ?? null,
					),
				),
			);
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
			setClassNameAdapterId(nextAdapter.id);
			setResult(
				evalPlayground(
					makeInput(
						files[0]!,
						evalSiblings(files, activeVariant, nextAdapter),
						nextAdapter.strategy ?? null,
					),
				),
			);
			history.replaceState(null, "", variantUrl(props.def, activeVariant.api, "", nextAdapter.id));
		},
		[activeVariant, files, props.def],
	);

	useEffect(() => {
		const syncVariant = () => {
			const nextVariant = variantFromUrl(props.def);
			const nextAdapter = adapterFromUrl();
			const nextFiles = nextVariant.files.map((file) => file.code);
			setApi(nextVariant.api);
			setClassNameAdapterId(nextAdapter.id);
			setFiles(nextFiles);
			setActiveTab(0);
			setResult(
				evalPlayground(
					makeInput(
						nextFiles[0]!,
						evalSiblings(nextFiles, nextVariant, nextAdapter),
						nextAdapter.strategy ?? null,
					),
				),
			);
		};
		window.addEventListener("popstate", syncVariant);
		return () => window.removeEventListener("popstate", syncVariant);
	}, [props.def]);

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
	const reset = useCallback(() => {
		window.clearTimeout(debounceRef.current);
		const restored = activeVariant.files.map((file) => file.code);
		setFiles(restored);
		run(restored);
	}, [activeVariant, run]);

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
								color: "#e4e4e7",
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
										color: "#52525b",
									})}
								>
									API
								</span>
								<select
									aria-label="Select Pandwind API"
									value={activeVariant.api}
									onChange={(event) => selectApi(event.target.value as ExampleVariant["api"])}
									className={uiCss.class({
										height: "24px",
										border: "1px solid rgba(255,255,255,0.1)",
										borderRadius: "5px",
										backgroundColor: "#16161b",
										padding: "0 6px",
										fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
										fontSize: "11px",
										color: "#a1a1aa",
										outline: "none",
										"&:focus": { borderColor: "rgba(251,146,60,0.6)", color: "#f4f4f5" },
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
										color: "#52525b",
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
										border: "1px solid rgba(255,255,255,0.1)",
										borderRadius: "5px",
										backgroundColor: "#16161b",
										padding: "0 6px",
										fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
										fontSize: "11px",
										color: "#a1a1aa",
										outline: "none",
										"&:focus": { borderColor: "rgba(251,146,60,0.6)", color: "#f4f4f5" },
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
							color: "#52525b",
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
								color: "#52525b",
							})}
						>
							tw() uses its generated Tailwind bridge
						</span>
					) : (
						<span
							className={uiCss.class({
								fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
								fontSize: "10px",
								color: "#52525b",
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
							className={`${uiCss.class({ border: "0", borderRadius: "6px", padding: "4px 10px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "12px", lineHeight: "20px", transition: "color 120ms, background-color 120ms" })} ${index === activeTab ? uiCss.class({ backgroundColor: "rgba(255,255,255,0.07)", color: "#f4f4f5" }) : uiCss.class({ color: "#71717a", "&:hover": { color: "#d4d4d8" } })}`}
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
						minSize: 25,
						content: (
							<EditorPane
								code={files[activeTab] ?? ""}
								onChange={onChange}
								onRun={() => run(files)}
								filePath={
									"file:///pandwind/playground/" +
									(activeVariant.files[activeTab]?.name ?? "Example.tsx")
								}
								className={uiCss.class({ height: "100%", minHeight: "0px" })}
							/>
						),
					},
					{
						id: "output",
						initialSize: 50,
						minSize: 25,
						content: <ResultsPane result={result} />,
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
	const createPlaygroundCss = (...args: Array<unknown>) =>
		createRuntimeCss(examplePreset, runtimeOptions(strategy, args[0]));
	return {
		code,
		tw: tw as unknown as (...args: Array<unknown>) => unknown,
		css: createRuntimeDesignCss(examplePreset, runtimeOptions(strategy)) as unknown as ((
			...args: Array<unknown>
		) => unknown) &
			Record<string, unknown>,
		cx: cx as unknown as (...inputs: Array<never>) => string,
		createCss: createPlaygroundCss,
		classNameStrategy: strategy,
		moduleBindings:
			moduleBindings === undefined ? SANDBOX_MODULES : { ...SANDBOX_MODULES, ...moduleBindings },
		props: SANDBOX_PROPS,
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
