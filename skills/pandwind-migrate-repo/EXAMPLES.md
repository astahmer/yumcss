# Migration examples

## Basic static component

Source:

```tsx
const Card = styled.div`
	color: #3182ce;
	padding: 1rem;
`;
```

Target shape:

```tsx
const Card = (props: React.ComponentProps<"div">) => (
	<div {...props} className={cx(css.class({ color: "$blue-500", pad: "4" }), props.className)} />
);
```

The adapter may generate a more compact wrapper, but it must preserve
`className`, forwarded props, selector behavior, and the source's host type.

## Dynamic value without runtime stylesheet injection

Source:

```tsx
const Badge = styled.span<{ $color: string }>`
	color: ${({ $color }) => $color};
	border-radius: 9999px;
`;
```

Target shape:

```tsx
const Badge = ({ $color, className, ...props }) => {
	const dynamic = css.vars({ color: $color });
	return (
		<span
			{...props}
			className={cx(css.class({ borderRadius: "full" }), dynamic.class, className)}
			style={dynamic.style}
		/>
	);
};
```

The rule shape is static; only the value rides an inline custom property. Do
not create a runtime style sheet for this case.

## Genuine fallback

Source:

```tsx
const Icon = styled(ExternalComponent)`
	${runtimeMixin};
	${OtherComponent}:hover & {
		color: red;
	}
`;
```

This requires either a framework-aware component-selector/host rewrite or an
explicit runtime fallback. The report must identify the residuals and explain
why static extraction would change behavior. Never emit only the `color: red`
declaration and silently discard the mixin or selector.

## Verification commands

```sh
pnpm codemod 'src/**/*.{ts,tsx}' --to=keep --report --meta=src/generated
pnpm codemod 'src/**/*.{ts,tsx}' --from=styled-components --to=pandwind --diff --meta=src/generated
pnpm typecheck
pnpm lint
pnpm test:all
pnpm build
```

For a real website, add a pinned baseline and candidate server to the browser
matrix. Assert route status, rendered errors, console errors, hydration,
computed style/geometry, screenshot diff, canonical CSS, SSR output, and byte
delta. Store the report beside the migration plan.
