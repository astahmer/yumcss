export interface ExampleFile {
	/** Tab label; mirrors the filename the example would live in. */
	name: string;
	/** Full file content, imports included — pasteable into a real project. */
	code: string;
}

export interface ExampleDef {
	/** Route path for this example. */
	path: string;
	/** Nav + heading label. */
	title: string;
	/** One-liner shown under the title. */
	blurb: string;
	/**
	 * Scenario group shown in the nav. "core" examples are the happy paths;
	 * "limits" examples document what pandwind genuinely cannot handle.
	 */
	group: "core" | "limits";
	/**
	 * Optional note about what the example demonstrates or where it hits a
	 * documented limit — rendered above the editor.
	 */
	note?: string;
	/** One or more files; the first is evaluated, the rest are tabs. */
	files: readonly ExampleFile[];
}

/** Convenience constructor for the single-file majority. */
export function oneFile(name: string, code: string): readonly ExampleFile[] {
	return [{ name, code }];
}
