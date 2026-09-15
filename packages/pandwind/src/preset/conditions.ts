/**
 * Default selector and media-condition map used by {@link pandwindPreset}.
 *
 * Its keys are the nested condition names accepted by preset-aware styles;
 * copy or extend the map when defining an application preset.
 *
 * @category presets
 * @since 0.1.0
 */
export const presetConditions = {
	//   base: {},
	_hover: "&:is(:hover, [data-hover])",
	_focus: "&:is(:focus, [data-focus])",
	_focusWithin: "&:focus-within",
	_focusVisible: "&:is(:focus-visible, [data-focus-visible])",
	_disabled: "&:is(:disabled, [disabled], [data-disabled])",
	_active: "&:is(:active, [data-active])",
	_visited: "&:visited",
	_target: "&:target",
	_readOnly: "&:is(:read-only, [data-read-only])",
	_readWrite: "&:read-write",
	_empty: "&:is(:empty, [data-empty])",
	_checked: '&:is(:checked, [data-checked], [aria-checked=true], [data-state="checked"])',
	_enabled: "&:enabled",
	_expanded: '&:is([aria-expanded=true], [data-expanded], [data-state="expanded"])',
	_highlighted: "&[data-highlighted]",

	_before: "&::before",
	_after: "&::after",
	_firstLetter: "&::first-letter",
	_firstLine: "&::first-line",
	_marker: "&::marker",
	_selection: "&::selection",
	_file: "&::file-selector-button",
	_backdrop: "&::backdrop",

	_first: "&:first-child",
	_last: "&:last-child",
	_only: "&:only-child",
	_even: "&:nth-child(even)",
	_odd: "&:nth-child(odd)",

	_firstOfType: "&:first-of-type",
	_lastOfType: "&:last-of-type",
	_onlyOfType: "&:only-of-type",

	_peerFocus: ".peer:is(:focus, [data-focus]) ~ &",
	_peerHover: ".peer:is(:hover, [data-hover]) ~ &",
	_peerActive: ".peer:is(:active, [data-active]) ~ &",
	_peerFocusWithin: ".peer:focus-within ~ &",
	_peerFocusVisible: ".peer:is(:focus-visible, [data-focus-visible]) ~ &",
	_peerDisabled: ".peer:is(:disabled, [disabled], [data-disabled]) ~ &",
	_peerChecked:
		'.peer:is(:checked, [data-checked], [aria-checked=true], [data-state="checked"]) ~ &',
	_peerInvalid: ".peer:is(:invalid, [data-invalid], [aria-invalid=true]) ~ &",
	_peerExpanded: '.peer:is([aria-expanded=true], [data-expanded], [data-state="expanded"]) ~ &',
	_peerPlaceholderShown: ".peer:placeholder-shown ~ &",

	_groupFocus: ".group:is(:focus, [data-focus]) &",
	_groupHover: ".group:is(:hover, [data-hover]) &",
	_groupActive: ".group:is(:active, [data-active]) &",
	_groupFocusWithin: ".group:focus-within &",
	_groupFocusVisible: ".group:is(:focus-visible, [data-focus-visible]) &",
	_groupDisabled: ".group:is(:disabled, [disabled], [data-disabled]) &",
	_groupChecked:
		'.group:is(:checked, [data-checked], [aria-checked=true], [data-state="checked"]) &',
	_groupExpanded: '.group:is([aria-expanded=true], [data-expanded], [data-state="expanded"]) &',
	_groupInvalid: ".group:invalid &",

	_indeterminate:
		'&:is(:indeterminate, [data-indeterminate], [aria-checked=mixed], [data-state="indeterminate"])',
	_required: "&:is(:required, [data-required], [aria-required=true])",
	_valid: "&:is(:valid, [data-valid])",
	_invalid: "&:is(:invalid, [data-invalid])",
	_autofill: "&:autofill",
	_inRange: "&:in-range",
	_outOfRange: "&:out-of-range",
	_placeholder: "&::placeholder, &[data-placeholder]",
	_placeholderShown: "&:is(:placeholder-shown, [data-placeholder-shown])",
	_pressed: "&:is([aria-pressed=true], [data-pressed])",
	_selected: "&:is([aria-selected=true], [data-selected])",

	_default: "&:default",
	_optional: "&:optional",
	_open: '&:is([open], [data-open], [data-state="open"])',
	_closed: '&:is([closed], [data-closed], [data-state="closed"])',
	_fullscreen: "&:fullscreen",
	_loading: "&:is([data-loading], [aria-busy=true])",

	_currentPage: "&[aria-current=page]",
	_currentStep: "&[aria-current=step]",

	_motionReduce: "@media (prefers-reduced-motion: reduce)",
	_motionSafe: "@media (prefers-reduced-motion: no-preference)",
	_print: "@media print",
	_landscape: "@media (orientation: landscape)",
	_portrait: "@media (orientation: portrait)",

	_dark: ".dark &",
	_light: ".light &",
	_osDark: "@media (prefers-color-scheme: dark)",
	_osLight: "@media (prefers-color-scheme: light)",

	_highContrast: "@media (forced-colors: active)",
	_lessContrast: "@media (prefers-contrast: less)",
	_moreContrast: "@media (prefers-contrast: more)",

	_ltr: "[dir=ltr] &",
	_rtl: "[dir=rtl] &",

	_scrollbar: "&::-webkit-scrollbar",
	_scrollbarThumb: "&::-webkit-scrollbar-thumb",
	_scrollbarTrack: "&::-webkit-scrollbar-track",

	_horizontal: "&[data-orientation=horizontal]",
	_vertical: "&[data-orientation=vertical]",

	_starting: "@starting-style",
};

/** The inferred condition-key type of {@link presetConditions}. */
export type PresetConditions = typeof presetConditions;
