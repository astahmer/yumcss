/**
 * Minimal panda.config.ts FIXTURE for loadPandaTheme tests.
 *
 * Deliberately dependency-free (no @pandacss/dev) so the test is hermetic;
 * mirrors the website config's shape: theme.extend.{semanticTokens,textStyles}
 * with `{ value: ... }` leaves, DEFAULT collapsing and namespaced
 * textStyles (`panda.h4`).
 */
const semanticTokens = {
	colors: {
		bg: {
			DEFAULT: { value: { base: "{colors.white}", _dark: "{colors.dark}" } },
			subtle: { value: { base: "{colors.neutral.50}", _dark: "{colors.neutral.900}" } },
			muted: { value: { base: "{colors.neutral.100}", _dark: "{colors.neutral.800}" } },
		},
		fg: {
			DEFAULT: { value: { base: "{colors.neutral.900}", _dark: "{colors.neutral.50}" } },
			muted: { value: { base: "{colors.neutral.600}", _dark: "{colors.neutral.300}" } },
			headline: { value: { base: "{colors.black}", _dark: "{colors.yellow.300}" } },
		},
	},
};

const tokens = {
	fontSizes: {
		sm: { value: ".875rem" },
		lg: { value: "1.125rem" },
	},
	colors: {
		neutral: {
			100: { value: "#f5f5f5" },
			700: { value: "#404040" },
		},
	},
};

const textStyles = {
	panda: {
		h4: {
			value: { fontSize: "1.625rem", lineHeight: "1.2", letterSpacing: "tight" },
		},
	},
};

export default {
	theme: {
		extend: { semanticTokens, tokens, textStyles },
	},
};
