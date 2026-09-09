import type { PropsWithChildren } from "react";
import { useState } from "react";
import { cx } from "../cx";
import { tw } from "../tw";

type ExampleFrameProps = PropsWithChildren<{
	fileName: string;
	source: string;
	fullWidth?: boolean;
}>;

/** Wrap an example with a closed-by-default, copyable view of its real source file. */
export function ExampleFrame({ fileName, source, fullWidth, children }: ExampleFrameProps) {
	const [copied, setCopied] = useState(false);
	const copySource = async () => {
		if (typeof navigator === "undefined" || navigator.clipboard === undefined) return;
		try {
			await navigator.clipboard.writeText(source);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1200);
		} catch {
			setCopied(false);
		}
	};

	return (
		<div
			className={cx(
				tw({ flex: "col", gap: "2", minW: "0" }),
				fullWidth ? tw({ colSpan: "full" }) : undefined,
			)}
		>
			{children}
			<div
				className={tw({ rounded: "lg", border: "1", borderColor: "gray-200", bg: "white", p: "2" })}
			>
				<div className={tw({ flex: "row", items: "center", gap: "2" })}>
					<details className={tw({ minW: "0", grow: "1" })}>
						<summary
							className={tw({
								cursor: "pointer",
								textSize: "sm",
								font: "semibold",
								textColor: "gray-700",
							})}
						>
							View source{" "}
							<code className={tw({ font: "normal", textColor: "sky-700" })}>{fileName}</code>
						</summary>
						<pre
							className={tw({
								mt: "2",
								maxH: "96",
								overflow: "auto",
								rounded: "md",
								bg: "gray-950",
								p: "3",
								textSize: "xs",
								textColor: "gray-200",
							})}
						>
							<code>{source}</code>
						</pre>
					</details>
					<button
						type="button"
						onClick={copySource}
						className={tw({
							shrink: "0",
							rounded: "md",
							border: "1",
							borderColor: "gray-300",
							bg: "white",
							px: "2",
							py: "1",
							textSize: "xs",
							font: "medium",
							textColor: "gray-700",
						})}
					>
						{copied ? "Copied" : "Copy source"}
					</button>
				</div>
			</div>
		</div>
	);
}
