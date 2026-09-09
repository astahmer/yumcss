/**
 * Plain Tailwind usage — straight className strings, untouched.
 */
export function TailwindApp() {
	return (
		<section className="mx-auto max-w-md space-y-6 rounded-xl bg-white p-6 shadow-lg ring-1 ring-gray-900/5">
			<h1 className="text-2xl font-bold text-gray-900">pandwind</h1>
			<p className="text-sm leading-6 text-gray-600">
				This card uses plain Tailwind classes. The one below it uses the same classes via the typed{" "}
				<code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-sky-700">tw()</code>{" "}
				function.
			</p>
			<button
				type="button"
				className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
			>
				Plain button
			</button>
		</section>
	);
}
