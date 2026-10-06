import type { FieldCondition, FormField } from "./definition";

export type AnswerMap = Record<string, unknown>;

export function isFieldVisible(
  field: Pick<FormField, "condition">,
  answers: AnswerMap,
): boolean {
  if (!field.condition) return true;
  return evaluateCondition(field.condition, answers);
}

export function evaluateCondition(
  condition: FieldCondition,
  answers: AnswerMap,
): boolean {
  const answer = answers[condition.fieldId];

  switch (condition.operator) {
    case "exists":
      return hasMeaningfulValue(answer);
    case "equals":
      return answer === condition.value;
    case "not_equals":
      return answer !== condition.value;
    case "includes":
      return Array.isArray(answer)
        ? answer.includes(condition.value)
        : typeof answer === "string" && condition.value !== undefined
          ? answer.includes(String(condition.value))
          : false;
  }
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
