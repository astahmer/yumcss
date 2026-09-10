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
// Only the exceptional precedence bands need data. All other normal CSS
// properties intentionally use the 3000 fallback, so a logical-longhand
// catalog would add bytes without changing the result.
const LONG_HAND_PHYSICAL =
	/^(?:border-(?:top|bottom|left|right)-(?:color|style|width)|border-(?:top|bottom)-(?:left|right)-radius|(?:max-|min-)?(?:height|width)|(?:margin|padding|scroll-(?:margin|padding))-(?:top|bottom|left|right)|overscroll-behavior-[xy]|overflow-[xy]|(?:top|bottom|left|right))$/;
const SHORTHANDS_OF_LONGHANDS =
	/^(?:animation-range|scroll-timeline|view-timeline|background-position|border-(?:color|style|width|block-start|top|block-end|bottom|inline-color|inline-style|inline-width|inline-start|left|inline-end|right|image|radius)|caret|outline|grid-gap|gap|place-(?:content|items|self)|margin-(?:block|inline)|overscroll-behavior|padding-(?:block|inline)|columns|column-rule|contain-intrinsic-size|container|flex(?:-flow)?|font-variant|grid-template-areas|grid-(?:row|column)|list-style|mask(?:-border)?|offset|overflow|inset-(?:block|inline)|scroll-(?:margin|padding)-(?:block|inline)|scroll-snap-type|text-(?:decoration|emphasis)|transition)$/;
const SHORTHANDS_OF_SHORTHANDS =
	/^(?:animation|background|border(?:-(?:block|inline))?|margin|padding|font|grid(?:-template)?|grid-area|all|inset|scroll-(?:margin|padding))$/;

type PseudoClassPriorities = {
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
		return 30;
	}

	if (property.startsWith("@media")) {
		return 200;
	}

	if (property.startsWith("@container")) {
		return 300;
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

	if (LONG_HAND_PHYSICAL.test(property)) {
		return 4000;
	}
	if (SHORTHANDS_OF_LONGHANDS.test(property)) {
		return 2000;
	}
	if (SHORTHANDS_OF_SHORTHANDS.test(property)) {
		return 1000;
	}
	return 3000;
}
