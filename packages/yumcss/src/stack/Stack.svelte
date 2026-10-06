<script lang="ts">
	import { stackClasses, type StackProps } from "yumcss/stack";

	export let direction: StackProps["direction"] = undefined;
	export let gap: StackProps["gap"] = undefined;
	export let padding: StackProps["padding"] = undefined;
	export let align: StackProps["align"] = undefined;
	export let justify: StackProps["justify"] = undefined;

	$: mappedClass = stackClasses({ direction, gap, padding, align, justify });
	$: extraClass = typeof $$restProps.class === "string" ? $$restProps.class : undefined;
	$: mergedClass = extraClass === undefined ? mappedClass : `${mappedClass} ${extraClass}`;
</script>

<div {...$$restProps} class={mergedClass}>
	<slot />
</div>
