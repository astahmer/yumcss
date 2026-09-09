// Taken from https://github.com/facebook/stylex/blob/f121e62491298210e655cb159ffd75a8d0535123/packages/shared/src/utils/property-priorities.js

/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow strict
 */

/**
 * Immutable CSS precedence data shared by build-time and runtime lowering.
 * Delimiter-packed strings keep the browser entry compact without changing
 * the complete property catalog used by cascade and merge conformance.
 */
const prioritySet = (value: string): Set<string> => new Set(value.split("|"));

const longHandPhysical = prioritySet(
	"border-top-color|border-top-style|border-top-width|border-bottom-color|border-bottom-style|border-bottom-width|" +
		"border-left-color|border-left-style|border-left-width|border-right-color|border-right-style|border-right-width|" +
		"border-top-left-radius|border-top-right-radius|border-bottom-left-radius|border-bottom-right-radius|height|width|" +
		"max-height|max-width|min-height|min-width|margin-top|margin-bottom|" +
		"margin-left|margin-right|overscroll-behavior-y|overscroll-behavior-x|padding-top|padding-bottom|" +
		"padding-left|padding-right|overflow-y|overflow-x|top|bottom|" +
		"left|right|scroll-margin-top|scroll-margin-bottom|scroll-margin-left|scroll-margin-right|" +
		"scroll-padding-top|scroll-padding-bottom|scroll-padding-left|scroll-padding-right",
);

const longHandLogical = prioritySet(
	"background-blend-mode|isolation|mix-blend-mode|animation-composition|animation-delay|animation-direction|" +
		"animation-duration|animation-fill-mode|animation-iteration-count|animation-name|animation-play-state|animation-range-end|" +
		"animation-range-start|animation-timing-function|animation-timeline|scroll-timeline-axis|scroll-timeline-name|timeline-scope|" +
		"view-timeline-axis|view-timeline-inset|view-timeline-name|background-attachment|background-clip|background-color|" +
		"background-image|background-origin|background-repeat|background-size|background-position-x|background-position-y|" +
		"border-block-color|border-block-style|border-block-width|border-block-start-color|border-block-start-style|border-block-start-width|" +
		"border-block-end-color|border-block-end-style|border-block-end-width|border-inline-start-color|border-inline-start-style|border-inline-start-width|" +
		"border-inline-end-color|border-inline-end-style|border-inline-end-width|border-image-outset|border-image-repeat|border-image-slice|" +
		"border-image-source|border-image-width|border-start-end-radius|border-start-start-radius|border-end-end-radius|border-end-start-radius|" +
		"box-shadow|accent-color|appearance|aspect-ratio|caret-color|caret-shape|" +
		"cursor|ime-mode|input-security|outline-color|outline-offset|outline-style|" +
		"outline-width|pointer-events|resize|text-overflow|user-select|grid-row-gap|" +
		"row-gap|grid-column-gap|column-gap|align-content|justify-content|align-items|" +
		"justify-items|align-self|justify-self|box-sizing|block-size|inline-size|" +
		"max-block-size|max-inline-size|min-block-size|min-inline-size|margin-block-start|margin-block-end|" +
		"margin-inline-start|margin-inline-end|margin-trim|overscroll-behavior-block|overscroll-behavior-inline|padding-block-start|" +
		"padding-block-end|padding-inline-start|padding-inline-end|visibility|color|color-scheme|" +
		"forced-color-adjust|opacity|print-color-adjust|column-count|column-width|column-fill|" +
		"column-span|column-rule-color|column-rule-style|column-rule-width|contain|contain-intrinsic-block-size|" +
		"contain-intrinsic-width|contain-intrinsic-height|contain-intrinsic-inline-size|container-name|container-type|content-visibility|" +
		"counter-increment|counter-reset|counter-set|display|flex-basis|flex-grow|" +
		"flex-shrink|flex-direction|flex-wrap|order|font-family|font-size|" +
		"font-stretch|font-style|font-weight|line-height|font-variant-alternates|font-variant-caps|" +
		"font-variant-east-asian|font-variant-emoji|font-variant-ligatures|font-variant-numeric|font-variant-position|font-feature-settings|" +
		"font-kerning|font-language-override|font-optical-sizing|font-palette|font-variation-settings|font-size-adjust|" +
		"font-smooth|font-synthesis-position|font-synthesis-small-caps|font-synthesis-style|font-synthesis-weight|line-height-step|" +
		"box-decoration-break|break-after|break-before|break-inside|orphans|widows|" +
		"content|quotes|grid-auto-flow|grid-auto-rows|grid-auto-columns|grid-template-columns|" +
		"grid-template-rows|grid-row-start|grid-row-end|grid-column-start|grid-column-end|align-tracks|" +
		"justify-tracks|masonry-auto-flow|image-orientation|image-rendering|image-resolution|object-fit|" +
		"object-position|initial-letter|initial-letter-align|list-style-image|list-style-position|list-style-type|" +
		"clip|clip-path|mask-clip|mask-composite|mask-image|mask-mode|" +
		"mask-origin|mask-position|mask-repeat|mask-size|mask-type|mask-border-mode|" +
		"mask-border-outset|mask-border-repeat|mask-border-slice|mask-border-source|mask-border-width|text-rendering|" +
		"offset-anchor|offset-distance|offset-path|offset-position|offset-rotate|-webkit-box-orient|" +
		"-webkit-line-clamp|overflow-block|overflow-inline|overflow-clip-margin|scroll-gutter|scroll-behavior|" +
		"page|page-break-after|page-break-before|page-break-inside|inset-block-start|inset-block-end|" +
		"inset-inline-start|inset-inline-end|clear|float|position|z-index|" +
		"ruby-align|ruby-merge|ruby-position|overflow-anchor|scroll-margin-block-start|scroll-margin-block-end|" +
		"scroll-margin-inline-start|scroll-margin-inline-end|scroll-padding-block-start|scroll-padding-block-end|scroll-padding-inline-start|scroll-padding-inline-end|" +
		"scroll-snap-align|scroll-snap-stop|scrollbar-color|scrollbar-width|shape-image-threshold|shape-margin|" +
		"shape-outside|azimuth|border-collapse|border-spacing|caption-side|empty-cells|" +
		"table-layout|vertical-align|text-decoration-color|text-decoration-line|text-decoration-skip|text-decoration-skip-ink|" +
		"text-decoration-style|text-decoration-thickness|text-emphasis-color|text-emphasis-position|text-emphasis-style|text-shadow|" +
		"text-underline-offset|text-underline-position|hanging-punctuation|hyphenate-character|hyphenate-limit-chars|hyphens|" +
		"letter-spacing|line-break|overflow-wrap|paint-order|tab-size|text-align|" +
		"text-align-last|text-indent|text-justify|text-size-adjust|text-transform|text-wrap|" +
		"white-space|white-space-collapse|word-break|word-spacing|word-wrap|backface-visibility|" +
		"perspective|perspective-origin|rotate|scale|transform|transform-box|" +
		"transform-origin|transform-style|translate|transition-delay|transition-duration|transition-property|" +
		"transition-timing-function|view-transition-name|will-change|direction|text-combine-upright|text-orientation|" +
		"unicode-bidi|writing-mode|backdrop-filter|filter|math-depth|math-shift|" +
		"math-style|touch-action",
);

const shorthandsOfLonghands = prioritySet(
	"animation-range|scroll-timeline|view-timeline|background-position|border-color|border-style|" +
		"border-width|border-block-start|border-top|border-block-end|border-bottom|border-inline-color|" +
		"border-inline-style|border-inline-width|border-inline-start|border-left|border-inline-end|border-right|" +
		"border-image|border-radius|caret|outline|grid-gap|gap|" +
		"place-content|place-items|place-self|margin-block|margin-inline|overscroll-behavior|" +
		"padding-block|padding-inline|columns|column-rule|contain-intrinsic-size|container|" +
		"flex|flex-flow|font-variant|grid-template-areas|grid-row|grid-column|" +
		"list-style|mask|mask-border|offset|overflow|inset-block|" +
		"inset-inline|scroll-margin-block|scroll-margin-inline|scroll-padding-block|scroll-padding-inline|scroll-snap-type|" +
		"text-decoration|text-emphasis|transition",
);

const shorthandsOfShorthands = prioritySet(
	"animation|background|border|border-block|border-inline|margin|" +
		"padding|font|grid|grid-template|grid-area|all|" +
		"inset|scroll-margin|scroll-padding",
);

type PseudoClassPriorities = {
	":is": 40;
	":where": 40;
	":not": 40;
	":has": 45;
	":dir": 50;
	":lang": 51;
	":first-child": 52;
	":first-of-type": 53;
	":last-child": 54;
	":last-of-type": 55;
	":only-child": 56;
	":only-of-type": 57;
	":nth-child": 60;
	":nth-last-child": 61;
	":nth-of-type": 62;
	":nth-last-of-type": 63; // 'nth-last-of-type' is the same priority as 'nth-of-type
	":empty": 70;
	":link": 80;
	":any-link": 81;
	":local-link": 82;
	":target-within": 83;
	":target": 84;
	":visited": 85;
	":enabled": 91;
	":disabled": 92;
	":required": 93;
	":optional": 94;
	":read-only": 95;
	":read-write": 96;
	":placeholder-shown": 97;
	":in-range": 98;
	":out-of-range": 99;
	":default": 100;
	":checked": 101;
	":indeterminate": 101;
	":blank": 102;
	":valid": 103;
	":invalid": 104;
	":user-invalid": 105;
	":autofill": 110;
	":picture-in-picture": 120;
	":modal": 121;
	":fullscreen": 122;
	":paused": 123;
	":playing": 124;
	":current": 125;
	":past": 126;
	":future": 127;
	":hover": 130;
	":focusWithin": 140;
	":focus": 150;
	":focusVisible": 160;
	":active": 170;
};

const PSEUDO_CLASS_PRIORITIES: PseudoClassPriorities = {
	":is": 40,
	":where": 40,
	":not": 40,
	":has": 45,
	":dir": 50,
	":lang": 51,
	":first-child": 52,
	":first-of-type": 53,
	":last-child": 54,
	":last-of-type": 55,
	":only-child": 56,
	":only-of-type": 57,

	":nth-child": 60,
	":nth-last-child": 61,
	":nth-of-type": 62,
	":nth-last-of-type": 63, // 'nth-last-of-type' is the same priority as 'nth-of-type
	":empty": 70,

	":link": 80,
	":any-link": 81,
	":local-link": 82,
	":target-within": 83,
	":target": 84,
	":visited": 85,

	":enabled": 91,
	":disabled": 92,
	":required": 93,
	":optional": 94,
	":read-only": 95,
	":read-write": 96,
	":placeholder-shown": 97,
	":in-range": 98,
	":out-of-range": 99,

	":default": 100,
	":checked": 101,
	":indeterminate": 101,
	":blank": 102,
	":valid": 103,
	":invalid": 104,
	":user-invalid": 105,

	":autofill": 110,

	":picture-in-picture": 120,
	":modal": 121,
	":fullscreen": 122,
	":paused": 123,
	":playing": 124,
	":current": 125,
	":past": 126,
	":future": 127,

	":hover": 130,
	":focusWithin": 140,
	":focus": 150,
	":focusVisible": 160,
	":active": 170,
};

type AtRulePriorities = {
	"@supports": 30;
	"@media": 200;
	"@container": 300;
};

const AT_RULE_PRIORITIES: AtRulePriorities = {
	"@supports": 30,
	"@media": 200,
	"@container": 300,
};

const PSEUDO_ELEMENT_PRIORITY: number = 5000;

export function getPropertyPriority(key: string): number {
	// Style objects use camelCase while CSS and this catalog use kebab-case.
	// Selectors and at-rules are condition identifiers, so they stay intact.
	const property =
		key.startsWith(":") || key.startsWith("@") || key.startsWith("--")
			? key
			: key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);

	if (property.startsWith("--")) {
		return 1;
	}

	if (property.startsWith("@supports")) {
		return AT_RULE_PRIORITIES["@supports"];
	}

	if (property.startsWith("@media")) {
		return AT_RULE_PRIORITIES["@media"];
	}

	if (property.startsWith("@container")) {
		return AT_RULE_PRIORITIES["@container"];
	}

	if (property.startsWith("::")) {
		return PSEUDO_ELEMENT_PRIORITY;
	}

	if (property.startsWith(":")) {
		const prop =
			property.startsWith(":") && property.includes("(")
				? property.slice(0, property.indexOf("("))
				: property;

		return PSEUDO_CLASS_PRIORITIES[prop as keyof PseudoClassPriorities] ?? 40;
	}

	if (longHandPhysical.has(property)) {
		return 4000;
	}
	if (longHandLogical.has(property)) {
		return 3000;
	}
	if (shorthandsOfLonghands.has(property)) {
		return 2000;
	}
	if (shorthandsOfShorthands.has(property)) {
		return 1000;
	}
	return 3000;
}
