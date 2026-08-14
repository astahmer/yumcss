// Taken from https://github.com/chakra-ui/panda/blob/12c900ee1741fda4029e62134172673d412687bc/packages/shared/src/camelcase-property.ts

const regex = /-(\w|$)/g;

const callback = (_dashChar: string, char: string) => char.toUpperCase();

export const camelCaseProperty = ((property: string) => {
	if (property.startsWith("--")) return property;
	let str = property.toLowerCase();
	str = str.startsWith("-ms-") ? str.substring(1) : str;
	return str.replace(regex, callback);
}) as (property: string) => string;
