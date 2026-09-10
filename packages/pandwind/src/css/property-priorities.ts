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
	if (shorthandsOfLonghands.has(property)) {
		return 2000;
	}
	if (shorthandsOfShorthands.has(property)) {
		return 1000;
	}
	return 3000;
}
