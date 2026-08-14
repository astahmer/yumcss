import type { StandardProperties } from "csstype";
import { definePreset } from "../types/define-preset.ts";
import { presetConditions } from "./conditions.ts";
import { presetProperties } from "./properties.ts";

export const pandwindPreset = definePreset(
	{
		config: {} as StandardProperties,
		tokens: {},
	},
	{
		strict: true,
		conditions: presetConditions,
		properties: presetProperties,
	},
);

export type PandwindPreset = typeof pandwindPreset;
