import type { FormDefinition } from "@/modules/forms/definition";
import { fieldsInDefinition } from "@/modules/forms/definition";
import type { AnswerMap } from "@/modules/forms/visibility";

export interface SplitProtectedAnswers {
  ordinaryAnswers: AnswerMap;
  compartments: Map<string, AnswerMap>;
}

export function splitProtectedAnswers(
  definition: FormDefinition,
  answers: AnswerMap,
): SplitProtectedAnswers {
  const protectionByField = new Map(
    fieldsInDefinition(definition)
      .filter((field) => field.protection)
      .map((field) => [field.id, field.protection!.compartment] as const),
  );

  const ordinaryAnswers: AnswerMap = {};
  const compartments = new Map<string, AnswerMap>();

  for (const [fieldId, value] of Object.entries(answers)) {
    const compartment = protectionByField.get(fieldId);
    if (!compartment) {
      ordinaryAnswers[fieldId] = value;
      continue;
    }

    const payload = compartments.get(compartment) ?? {};
    payload[fieldId] = value;
    compartments.set(compartment, payload);
  }

  return { ordinaryAnswers, compartments };
}
