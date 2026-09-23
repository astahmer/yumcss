import { useState, type ReactNode } from "react";
import { ui } from "../ui-css.ts";

type TableValue = string | number | null | undefined;

export interface InspectorTableColumn<Row> {
	id: string;
	label: string;
	value: (row: Row) => TableValue;
	render?: (row: Row) => ReactNode;
}

export interface InspectorTableFilter<Row> {
	id: string;
	label: string;
	value: (row: Row) => string | null;
}

export interface InspectorTableSort {
	columnId: string;
	direction: "ascending" | "descending";
}

export interface InspectorTableProps<Row> {
	title: string;
	rows: readonly Row[];
	columns: readonly InspectorTableColumn<Row>[];
	rowKey: (row: Row) => string;
	filters: readonly InspectorTableFilter<Row>[];
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
	const [query, setQuery] = useState("");
	const [filterValues, setFilterValues] = useState<Record<string, string>>({});
	const [sort, setSort] = useState<InspectorTableSort | null>(props.defaultSort ?? null);
	const normalizedQuery = query.trim().toLocaleLowerCase();
	const filterOptions = props.filters.map((filter) => ({
		filter,
		values: [
			...new Set(props.rows.map((row) => filter.value(row)).filter((value) => value !== null)),
		].toSorted((left, right) => collator.compare(left, right)),
	}));
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
				return selected === undefined || filter.value(row) === selected;
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
		<details className={ui.tableDetails} open={props.defaultOpen ?? props.rows.length <= 12}>
			<summary className={ui.tableSummary}>
				<strong>{props.title}</strong>
				<span className={ui.tableCount}>{props.rows.length} rows</span>
			</summary>
			<div className={ui.tableTools}>
				<label className={ui.tableSearch}>
					<span className={ui.srOnly}>Search {props.title}</span>
					<input
						className={ui.search}
						type="search"
						value={query}
						placeholder={`Search ${props.title.toLocaleLowerCase()}…`}
						aria-label={`Search ${props.title}`}
						onChange={(event) => setQuery(event.target.value)}
					/>
				</label>
				{filterOptions.map(({ filter, values }) => (
					<label key={filter.id} className={ui.tableFilter}>
						<span>{filter.label}</span>
						<select
							value={filterValues[filter.id] ?? ""}
							aria-label={`Filter ${props.title} by ${filter.label.toLocaleLowerCase()}`}
							onChange={(event) =>
								setFilterValues((current) => ({
									...current,
									[filter.id]: event.target.value,
								}))
							}
						>
							<option value="">All</option>
							{values.map((value) => (
								<option key={value} value={value}>
									{value}
								</option>
							))}
						</select>
					</label>
				))}
				{hasActiveControls && (
					<button
						type="button"
						className={ui.searchClear}
						onClick={() => {
							setQuery("");
							setFilterValues({});
						}}
					>
						clear filters
					</button>
				)}
				<span className={ui.tableCount} role="status" aria-live="polite">
					{sortedRows.length} of {props.rows.length} rows
				</span>
			</div>
			<div className={ui.tableScroller}>
				<table aria-label={props.title} className={props.tableClassName}>
					<thead>
						<tr>
							{props.columns.map((column) => {
								const activeSort = sort?.columnId === column.id ? sort.direction : null;
								return (
									<th key={column.id} aria-sort={activeSort ?? "none"}>
										<button
											type="button"
											className={ui.sortButton}
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
														? ui.sortIndicator
														: `${ui.sortIndicator} ${ui.sortIndicatorActive}`
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
								<td colSpan={props.columns.length} className={ui.tableEmpty}>
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
