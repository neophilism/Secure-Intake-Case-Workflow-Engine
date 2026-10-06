import type {
  RoutingCondition,
  RoutingRuleDefinition,
} from "./definition";

export interface RoutingCaseContext {
  caseType: string;
  priority: string;
  status: string;
  tags: readonly string[];
  submissionAnswers?: Record<string, unknown> | null;
}

export function routingRuleMatches(
  definition: RoutingRuleDefinition,
  context: RoutingCaseContext,
): boolean {
  const results = definition.conditions.map((condition) =>
    conditionMatches(condition, context),
  );

  return definition.match === "all"
    ? results.every(Boolean)
    : results.some(Boolean);
}

function conditionMatches(
  condition: RoutingCondition,
  context: RoutingCaseContext,
): boolean {
  switch (condition.field) {
    case "case_type":
      return compareScalar(
        context.caseType,
        condition.operator,
        condition.value,
      );
    case "priority":
      return compareScalar(
        context.priority,
        condition.operator,
        condition.value,
      );
    case "status":
      return compareScalar(
        context.status,
        condition.operator,
        condition.value,
      );
    case "tag": {
      const normalized = condition.value.trim().toLowerCase();
      const included = context.tags.some(
        (tag) => tag.toLowerCase() === normalized,
      );
      return condition.operator === "includes"
        ? included
        : !included;
    }
    case "submission": {
      const answer = context.submissionAnswers?.[condition.fieldId];
      return compareSubmission(
        answer,
        condition.operator,
        condition.value,
      );
    }
  }
}

function compareScalar(
  actual: string,
  operator: "equals" | "not_equals" | "in",
  expected: string | string[],
) {
  if (operator === "in") {
    return Array.isArray(expected)
      ? expected.includes(actual)
      : actual === expected;
  }

  const equals = Array.isArray(expected)
    ? expected.includes(actual)
    : actual === expected;

  return operator === "equals" ? equals : !equals;
}

function compareSubmission(
  actual: unknown,
  operator: "equals" | "not_equals" | "includes" | "exists" | "in",
  expected: unknown,
): boolean {
  if (operator === "exists") {
    return hasMeaningfulValue(actual);
  }

  if (operator === "includes") {
    if (Array.isArray(actual)) {
      return actual.some((value) => value === expected);
    }
    if (typeof actual === "string" && expected !== undefined) {
      return actual.includes(String(expected));
    }
    return false;
  }

  if (operator === "in") {
    return Array.isArray(expected)
      ? expected.some((value) => value === actual)
      : actual === expected;
  }

  const equals = actual === expected;
  return operator === "equals" ? equals : !equals;
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
