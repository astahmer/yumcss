/** Tailwind variant probing policy. */
export function detectVariantJoin(
	system: { candidatesToCss: (candidates: string[]) => (string | null)[] },
	variant: { name: string; values: string[] },
): ":" | "-" | "" {
	const util = "bg-red-500";

	const probes: Array<[":" | "-" | "", string]> = [[":", `${variant.name}:${util}`]];

	const dashSamples = [...new Set(["hover", ...variant.values, "[x]"])]
		.filter((sample): sample is string => Boolean(sample))
		.slice(0, 4);
	for (const sample of dashSamples) {
		probes.push(["-", `${variant.name}-${sample}:${util}`]);
	}

	const emptySamples = [...new Set(variant.values)].filter(Boolean).slice(0, 2);
	for (const sample of emptySamples) {
		probes.push(["", `${variant.name}${sample}:${util}`]);
	}

	for (const [join, candidate] of probes) {
		if (system.candidatesToCss([candidate])[0] !== null) return join;
	}
	return ":";
}


