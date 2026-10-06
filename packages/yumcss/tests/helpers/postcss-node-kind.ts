/** PostCSS's node type strings are not exported as runtime constants. */
export const PostCssNodeKind = {
	Root: "root",
	Rule: "rule",
	AtRule: "atrule",
} as const;
