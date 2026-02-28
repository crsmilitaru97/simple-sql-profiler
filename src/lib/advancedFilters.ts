import type { QueryEvent } from "./types.ts";

export type AdvancedFilterFieldType = "string" | "number" | "datetime";

export type AdvancedFilterOperator =
  | "contains"
  | "not_contains"
  | "equals"
  | "not_equals"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

export interface AdvancedFilterColumn {
  key: keyof QueryEvent;
  label: string;
  type: AdvancedFilterFieldType;
}

export interface AdvancedFilterCondition {
  id: string;
  column: keyof QueryEvent;
  operator: AdvancedFilterOperator;
  value: string;
}

export interface AdvancedFilterOperatorOption {
  value: AdvancedFilterOperator;
  label: string;
}

const STRING_OPERATOR_OPTIONS: AdvancedFilterOperatorOption[] = [
  { value: "contains", label: "contains" },
  { value: "not_contains", label: "does not contain" },
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
];

const COMPARABLE_OPERATOR_OPTIONS: AdvancedFilterOperatorOption[] = [
  { value: "equals", label: "equals" },
  { value: "not_equals", label: "does not equal" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "greater or equal" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "less or equal" },
];

export const ADVANCED_FILTER_COLUMNS: AdvancedFilterColumn[] = [
  { key: "event_name", label: "Type", type: "string" },
  { key: "start_time", label: "Start time", type: "datetime" },
  { key: "session_id", label: "Session", type: "number" },
  { key: "database_name", label: "Database", type: "string" },
  { key: "sql_text", label: "SQL text", type: "string" },
  { key: "current_statement", label: "Current statement", type: "string" },
  { key: "elapsed_time", label: "Duration (ms)", type: "number" },
  { key: "cpu_time", label: "CPU (ms)", type: "number" },
  { key: "logical_reads", label: "Logical reads", type: "number" },
  { key: "physical_reads", label: "Physical reads", type: "number" },
  { key: "writes", label: "Writes", type: "number" },
  { key: "row_count", label: "Row count", type: "number" },
  { key: "login_name", label: "Login", type: "string" },
  { key: "host_name", label: "Host", type: "string" },
  { key: "program_name", label: "Program", type: "string" },
  { key: "captured_at", label: "Captured at", type: "datetime" },
];

const COLUMN_BY_KEY: Record<keyof QueryEvent, AdvancedFilterColumn> =
  ADVANCED_FILTER_COLUMNS.reduce(
    (acc, column) => {
      acc[column.key] = column;
      return acc;
    },
    {} as Record<keyof QueryEvent, AdvancedFilterColumn>,
  );

export function getColumnDefinition(column: keyof QueryEvent): AdvancedFilterColumn {
  return COLUMN_BY_KEY[column] ?? {
    key: column,
    label: String(column),
    type: "string",
  };
}

export function getOperatorOptions(type: AdvancedFilterFieldType): AdvancedFilterOperatorOption[] {
  return type === "string" ? STRING_OPERATOR_OPTIONS : COMPARABLE_OPERATOR_OPTIONS;
}

export function getDefaultOperatorForType(type: AdvancedFilterFieldType): AdvancedFilterOperator {
  return type === "string" ? "contains" : "equals";
}

export function isOperatorSupported(
  type: AdvancedFilterFieldType,
  operator: AdvancedFilterOperator,
): boolean {
  return getOperatorOptions(type).some((option) => option.value === operator);
}

export function createFilterCondition(
  column: keyof QueryEvent = "sql_text",
): AdvancedFilterCondition {
  const columnType = getColumnDefinition(column).type;
  return {
    id: createFilterId(),
    column,
    operator: getDefaultOperatorForType(columnType),
    value: "",
  };
}

export function normalizeFilters(filters: AdvancedFilterCondition[]): AdvancedFilterCondition[] {
  return filters
    .map((filter) => ({ ...filter, value: filter.value.trim() }))
    .filter((filter) => filter.value.length > 0);
}

export function evaluateFilter(query: QueryEvent, filter: AdvancedFilterCondition): boolean {
  const column = getColumnDefinition(filter.column);
  const rawValue = query[filter.column];

  if (column.type === "number") {
    return compareNumbers(
      typeof rawValue === "number" ? rawValue : Number(rawValue),
      Number(filter.value),
      filter.operator,
    );
  }

  if (column.type === "datetime") {
    return compareNumbers(
      getDateTimestamp(rawValue),
      getDateTimestamp(filter.value),
      filter.operator,
    );
  }

  return compareStrings(String(rawValue ?? ""), filter.value, filter.operator);
}

function compareStrings(
  leftInput: string,
  rightInput: string,
  operator: AdvancedFilterOperator,
): boolean {
  const left = leftInput.toLowerCase();
  const right = rightInput.toLowerCase();

  switch (operator) {
    case "contains":
      return left.includes(right);
    case "not_contains":
      return !left.includes(right);
    case "equals":
      return left === right;
    case "not_equals":
      return left !== right;
    case "starts_with":
      return left.startsWith(right);
    case "ends_with":
      return left.endsWith(right);
    default:
      return false;
  }
}

function compareNumbers(
  left: number,
  right: number,
  operator: AdvancedFilterOperator,
): boolean {
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return false;
  }

  switch (operator) {
    case "equals":
      return left === right;
    case "not_equals":
      return left !== right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    default:
      return false;
  }
}

function getDateTimestamp(value: unknown): number {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return Number.NaN;
  }

  const exact = Date.parse(value);
  if (!Number.isNaN(exact)) {
    return exact;
  }

  const normalized = Date.parse(value.replace(" ", "T"));
  if (!Number.isNaN(normalized)) {
    return normalized;
  }

  return Number.NaN;
}

function createFilterId(): string {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
