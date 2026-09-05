import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "../cx.ts";
import { tw } from "../tw.ts";
import { createCss } from "pandwind/css";
import { type ExampleDef, type ExampleFile, type ExampleVariant } from "../lib/examples.ts";
import { evalPlayground, evalSiblingModule, type EvalInput } from "../lib/eval-playground.ts";
import { resolveDesignStyle } from "pandwind/design/resolve";
import { css as designCss } from "../css.ts";
import { examplePreset } from "pandwind/preset";
import { SANDBOX_MODULES } from "../lib/sandbox-modules.ts";
import { EditorPane } from "./EditorPane.tsx";
import { ResultsPane } from "./ResultsPane.tsx";
import { GhostButton } from "./ui.tsx";
import { css as uiCss } from "../ui-css.ts";

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
): EvalInput["moduleBindings"] {
	if (variant.files.length <= 1) return undefined;
	const bindings: Record<string, Record<string, unknown>> = {};
	for (let index = 1; index < variant.files.length; index++) {
		const file: ExampleFile = variant.files[index]!;
		try {
			bindings["./" + file.name] = evalSiblingModule(makeInput(sources[index] ?? file.code));
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

function variantUrl(def: ExampleDef, api: string, hash: string): string {
	const search = def.variants.length > 1 ? `?api=${encodeURIComponent(api)}` : "";
	return window.location.pathname + search + hash;
}

export function PlaygroundPage(props: { def: ExampleDef }) {
	const initialVariant = variantFromUrl(props.def);
	const [api, setApi] = useState<ExampleVariant["api"]>(initialVariant.api);
	const activeVariant = props.def.variants.find((variant) => variant.api === api) ?? initialVariant;
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
		evalPlayground(makeInput(files[0]!, evalSiblings(files, activeVariant))),
	);
	const run = useCallback(
		(sources: readonly string[]) => {
			try {
				setResult(evalPlayground(makeInput(sources[0]!, evalSiblings(sources, activeVariant))));
			} catch (error) {
				setResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
			}
			const hash =
				sources[0]!.trim() === activeVariant.files[0]!.code.trim()
					? ""
					: "#" + encodeCode(sources[0]!);
			history.replaceState(null, "", variantUrl(props.def, activeVariant.api, hash));
		},
		[activeVariant, props.def],
	);

	const selectApi = useCallback(
		(nextApi: ExampleVariant["api"]) => {
			const nextVariant = props.def.variants.find((variant) => variant.api === nextApi);
			if (nextVariant === undefined) return;
			const nextFiles = nextVariant.files.map((file) => file.code);
			setApi(nextVariant.api);
			setFiles(nextFiles);
			setActiveTab(0);
			setResult(evalPlayground(makeInput(nextFiles[0]!, evalSiblings(nextFiles, nextVariant))));
			history.replaceState(null, "", variantUrl(props.def, nextVariant.api, ""));
		},
		[props.def],
	);

	useEffect(() => {
		const syncVariant = () => {
			const nextVariant = variantFromUrl(props.def);
			const nextFiles = nextVariant.files.map((file) => file.code);
			setApi(nextVariant.api);
			setFiles(nextFiles);
			setActiveTab(0);
			setResult(evalPlayground(makeInput(nextFiles[0]!, evalSiblings(nextFiles, nextVariant))));
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
					height: "24px",
					flexShrink: "0",
					alignItems: "center",
					justifyContent: "space-between",
				})}
			>
				<div className={uiCss.class({ display: "flex", alignItems: "baseline", gap: "12px" })}>
					<div className={uiCss.class({ display: "flex", alignItems: "center", gap: "8px" })}>
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
			<div
				className={uiCss.class({
					display: "grid",
					minHeight: "0px",
					flex: "1 1 0%",
					gridTemplateColumns: "1fr",
					gap: "12px",
					"@media (min-width: 1024px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
				})}
			>
				<EditorPane
					code={files[activeTab] ?? ""}
					onChange={onChange}
					onRun={() => run(files)}
					filePath={
						"file:///pandwind/playground/" + (activeVariant.files[activeTab]?.name ?? "Example.tsx")
					}
					className={uiCss.class({ minHeight: "18rem" })}
				/>
				<ResultsPane result={result} />
			</div>
		</div>
	);
}

function makeInput(code: string, moduleBindings?: EvalInput["moduleBindings"]): EvalInput {
	return {
		code,
		tw: tw as unknown as (...args: Array<unknown>) => unknown,
		css: designCss as unknown as ((...args: Array<unknown>) => unknown) & Record<string, unknown>,
		cx: cx as unknown as (...inputs: Array<never>) => string,
		createCss: createCss as unknown as (...args: Array<unknown>) => unknown,
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
