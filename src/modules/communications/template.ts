const placeholderPattern = /{{\s*([a-z0-9_]+)\s*}}/gi;

export const communicationTemplateVariables = [
  "case_number",
  "case_title",
  "case_status",
  "case_type",
] as const;

export type CommunicationTemplateVariable =
  (typeof communicationTemplateVariables)[number];

export type CommunicationTemplateValues = Record<
  CommunicationTemplateVariable,
  string
>;

export function renderCommunicationTemplate(
  input: string,
  values: CommunicationTemplateValues,
): string {
  const allowed = new Set<string>(communicationTemplateVariables);

  return input.replace(
    placeholderPattern,
    (_match, key: string) => {
      if (!allowed.has(key)) {
        throw new Error(
          `Unsupported communication template placeholder: ${key}`,
        );
      }
      return values[key as CommunicationTemplateVariable];
    },
  );
}

export function validateCommunicationTemplate(input: string) {
  for (const match of input.matchAll(placeholderPattern)) {
    const key = match[1];
    if (
      !(communicationTemplateVariables as readonly string[]).includes(
        key,
      )
    ) {
      throw new Error(
        `Unsupported communication template placeholder: ${key}`,
      );
    }
  }
}
