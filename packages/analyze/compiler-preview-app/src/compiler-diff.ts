import { parseDiffFromFile, type FileDiffMetadata } from "@pierre/diffs";

interface CompilerDiffInput {
	readonly file: string;
	readonly source: string;
	readonly code: string;
}

export const createCompilerDiff = ({ file, source, code }: CompilerDiffInput): FileDiffMetadata =>
	parseDiffFromFile({ name: file, contents: source }, { name: file, contents: code });
