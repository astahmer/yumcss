import { useState, type ReactNode } from "react";
import { css as uiCss } from "../ui-css.ts";

type TableValue = string | number | null | undefined;

interface InspectorTableColumn<Row> {
	id: string;
	label: string;
	value: (row: Row) => TableValue;
	render?: (row: Row) => ReactNode;
}

interface InspectorTableFilter<Row> {
	id: string;
	label: string;
	value: (row: Row) => string | null;
	options?: readonly string[];
	optionLabels?: Readonly<Record<string, string>>;
	matches?: (row: Row, selected: string) => boolean;
}

export interface InspectorTableSort {
	columnId: string;
	direction: "ascending" | "descending";
}

export interface InspectorTableProps<Row> {
	id?: string;
	title: string;
	rows: readonly Row[];
	columns: readonly InspectorTableColumn<Row>[];
	rowKey: (row: Row) => string;
	filters: readonly InspectorTableFilter<Row>[];
	filterValues?: Readonly<Record<string, string>>;
	onFilterValuesChange?: (values: Record<string, string>) => void;
	searchValue?: string;
	onSearchValueChange?: (value: string) => void;
	onClearFilters?: () => void;
	defaultSort?: InspectorTableSort;
	defaultOpen?: boolean;
	tableClassName?: string;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const compare = (left: TableValue, right: TableValue): number => {
	if (typeof left === "number" && typeof right === "number") return left - right;
	return collator.compare(String(left ?? ""), String(right ?? ""));
};

export const InspectorTable = <Row,>(props: InspectorTableProps<Row>) => {
	const [internalSearchValue, setInternalSearchValue] = useState("");
	const [internalFilterValues, setInternalFilterValues] = useState<Record<string, string>>({});
	const filterValues = props.filterValues ?? internalFilterValues;
	const searchValue = props.searchValue ?? internalSearchValue;
	const [sort, setSort] = useState<InspectorTableSort | null>(props.defaultSort ?? null);
	const normalizedQuery = searchValue.trim().toLocaleLowerCase();
	const filterOptions = props.filters.map((filter) => ({
		filter,
		values:
			filter.options ??
			[
				...new Set(props.rows.map((row) => filter.value(row)).filter((value) => value !== null)),
			].toSorted((left, right) => collator.compare(left, right)),
	}));
	const updateFilterValues = (values: Record<string, string>): void => {
		if (props.filterValues === undefined) setInternalFilterValues(values);
		props.onFilterValuesChange?.(values);
	};
	const updateSearchValue = (value: string): void => {
		if (props.searchValue === undefined) setInternalSearchValue(value);
		props.onSearchValueChange?.(value);
	};
	const filteredRows = props.rows
		.map((row, index) => ({ row, index }))
		.filter(({ row }) => {
			const matchesQuery =
				normalizedQuery === "" ||
				props.columns.some((column) =>
					String(column.value(row) ?? "")
						.toLocaleLowerCase()
						.includes(normalizedQuery),
				);
			if (!matchesQuery) return false;
			return props.filters.every((filter) => {
				const selected = filterValues[filter.id];
				return (
					selected === undefined ||
					(selected !== "" && (filter.matches?.(row, selected) ?? filter.value(row) === selected))
				);
			});
		});
	const sortedRows =
		sort === null
			? filteredRows
			: filteredRows.toSorted((left, right) => {
					const column = props.columns.find((candidate) => candidate.id === sort.columnId);
					if (column === undefined) return left.index - right.index;
					const direction = sort.direction === "ascending" ? 1 : -1;
					return (
						compare(column.value(left.row), column.value(right.row)) * direction ||
						left.index - right.index
					);
				});
	const hasActiveControls = normalizedQuery !== "" || Object.values(filterValues).some(Boolean);

	return (
		<details
			id={props.id}
			className={uiCss.class({
				margin: "14px 0",

				"&[open] > summary": { borderRadius: "8px 8px 0 0" },
				"&[open] > summary::before": { content: "'▾'" },
			})}
			open={props.defaultOpen ?? props.rows.length <= 12}
		>
			<summary
				className={uiCss.class({
					display: "flex",
					alignItems: "center",
					gap: 10,
					cursor: "pointer",
					listStyle: "none",
					padding: "11px 14px",
					background: "var(--panel)",
					border: "1px solid var(--line)",
					borderRadius: 8,

					"&::-webkit-details-marker": { display: "none" },
					"&::before": { content: "'▸'", color: "var(--accent)", fontFamily: "var(--mono)" },
					"&:hover": { background: "var(--panel-hover)" },
				})}
			>
				<strong>{props.title}</strong>
				<span
					className={uiCss.class({
						marginLeft: "auto",
						color: "var(--muted)",
						fontSize: 12,
						whiteSpace: "nowrap",
					})}
				>
					{props.rows.length} rows
				</span>
			</summary>
			<div
				className={uiCss.class({
					display: "flex",
					alignItems: "end",
					flexWrap: "wrap",
					gap: 8,
					padding: "12px 14px",
					background: "var(--panel)",
					borderLeft: "1px solid var(--line)",
					borderRight: "1px solid var(--line)",
				})}
			>
				<label className={uiCss.class({ display: "grid", flex: "1 1 230px", minWidth: 180 })}>
					<span
						className={uiCss.class({
							position: "absolute",
							width: 1,
							height: 1,
							padding: 0,
							margin: -1,
							overflow: "hidden",
							clipPath: "inset(50%)",
							whiteSpace: "nowrap",
							border: 0,
						})}
					>
						Search {props.title}
					</span>
					<input
						className={uiCss.class({
							width: "100%",
							padding: "8px 13px",
							font: "inherit",
							background: "var(--panel)",
							color: "var(--text)",
							border: "1px solid var(--line)",
							borderRadius: 7,
							outline: "none",
							"&:focus": { borderColor: "var(--accent-dim)" },
						})}
						type="search"
						value={searchValue}
						placeholder={`Search ${props.title.toLocaleLowerCase()}…`}
						aria-label={`Search ${props.title}`}
						onChange={(event) => updateSearchValue(event.target.value)}
					/>
				</label>
				{filterOptions.map(({ filter, values }) => (
					<label
						key={filter.id}
						className={uiCss.class({
							display: "grid",
							gap: 4,
							minWidth: 125,
							color: "var(--muted)",
							fontSize: 11,

							"& select": {
								width: "100%",
								padding: "7px 9px",
								font: "inherit",
								fontSize: 12,
								color: "var(--text)",
								background: "var(--bg)",
								border: "1px solid var(--line)",
								borderRadius: 6,
							},
						})}
					>
						<span>{filter.label}</span>
						<select
							value={filterValues[filter.id] ?? ""}
							aria-label={`Filter ${props.title} by ${filter.label.toLocaleLowerCase()}`}
							onChange={(event) => {
								const next = { ...filterValues };
								if (event.target.value === "") delete next[filter.id];
								else next[filter.id] = event.target.value;
								updateFilterValues(next);
							}}
						>
							<option value="">All</option>
							{values.map((value) => (
								<option key={value} value={value}>
									{filter.optionLabels?.[value] ?? value}
								</option>
							))}
						</select>
					</label>
				))}
				{hasActiveControls && (
					<button
						type="button"
						className={uiCss.class({ padding: "6px 10px" })}
						onClick={() => {
							if (props.onClearFilters !== undefined) {
								props.onClearFilters();
								return;
							}
							updateSearchValue("");
							updateFilterValues({});
						}}
					>
						clear filters
					</button>
				)}
				<span
					className={uiCss.class({
						marginLeft: "auto",
						color: "var(--muted)",
						fontSize: 12,
						whiteSpace: "nowrap",
					})}
					role="status"
					aria-live="polite"
				>
					{sortedRows.length} of {props.rows.length} rows
				</span>
			</div>
			<div
				className={uiCss.class({
					overflowX: "auto",
					border: "1px solid var(--line)",
					borderTop: 0,
					borderRadius: "0 0 8px 8px",
					"& table": { border: 0, borderRadius: 0 },
				})}
			>
				<table aria-label={props.title} className={props.tableClassName}>
					<thead>
						<tr>
							{props.columns.map((column) => {
								const activeSort = sort?.columnId === column.id ? sort.direction : null;
								return (
									<th key={column.id} aria-sort={activeSort ?? "none"}>
										<button
											type="button"
											className={uiCss.class({
												all: "unset",
												cursor: "pointer",
												color: "inherit",
												font: "inherit",
												"&:hover": { color: "var(--text)" },
											})}
											onClick={() =>
												setSort((current) => {
													const direction =
														current?.columnId === column.id && current.direction === "ascending"
															? "descending"
															: "ascending";
													return { columnId: column.id, direction };
												})
											}
										>
											{column.label}
											<span
												aria-hidden="true"
												className={
													activeSort === null
														? uiCss.class({ marginLeft: 5, color: "var(--muted)", fontSize: 11 })
														: `${uiCss.class({ marginLeft: 5, color: "var(--muted)", fontSize: 11 })} ${uiCss.class({ color: "var(--accent)" })}`
												}
											>
												{activeSort === null ? "↕" : activeSort === "ascending" ? "↑" : "↓"}
											</span>
										</button>
									</th>
								);
							})}
						</tr>
					</thead>
					<tbody>
						{sortedRows.length === 0 ? (
							<tr>
								<td
									colSpan={props.columns.length}
									className={uiCss.class({
										padding: "16px 14px",
										color: "var(--muted)",
									})}
								>
									No matching rows.
								</td>
							</tr>
						) : (
							sortedRows.map(({ row }) => (
								<tr key={props.rowKey(row)}>
									{props.columns.map((column) => (
										<td key={column.id}>
											{column.render === undefined
												? (column.value(row) ?? "—")
												: column.render(row)}
										</td>
									))}
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>
		</details>
	);
};
