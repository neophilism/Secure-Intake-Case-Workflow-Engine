import { z } from "zod";

const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_-]*$/, "Use lowercase identifiers with letters, numbers, underscores, or hyphens.");

export const fieldTypeSchema = z.enum([
  "short_text",
  "long_text",
  "email",
  "phone",
  "date",
  "number",
  "boolean",
  "select",
  "multiselect",
  "address",
  "attestation",
  "file",
]);

export type FieldType = z.infer<typeof fieldTypeSchema>;

export const optionSchema = z.object({
  value: z.string().min(1).max(200),
  label: z.string().min(1).max(300),
});

export const conditionSchema = z.object({
  fieldId: identifier,
  operator: z.enum(["equals", "not_equals", "includes", "exists"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export type FieldCondition = z.infer<typeof conditionSchema>;

export const fieldValidationSchema = z.object({
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  pattern: z.string().max(500).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const formFieldSchema = z
  .object({
    id: identifier,
    type: fieldTypeSchema,
    label: z.string().min(1).max(500),
    helpText: z.string().max(2000).optional(),
    placeholder: z.string().max(500).optional(),
    required: z.boolean().default(false),
    options: z.array(optionSchema).max(200).optional(),
    validation: fieldValidationSchema.optional(),
    condition: conditionSchema.optional(),
    attestationText: z.string().max(5000).optional(),
    acceptedMimeTypes: z.array(z.string().min(1).max(200)).max(100).optional(),
    maxFiles: z.number().int().positive().max(50).optional(),
  })
  .superRefine((field, ctx) => {
    if (
      (field.type === "select" || field.type === "multiselect") &&
      (!field.options || field.options.length === 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Select fields require at least one option.",
        path: ["options"],
      });
    }

    if (field.type === "attestation" && !field.attestationText) {
      ctx.addIssue({
        code: "custom",
        message: "Attestation fields require attestationText.",
        path: ["attestationText"],
      });
    }

    if (
      field.validation?.minLength !== undefined &&
      field.validation?.maxLength !== undefined &&
      field.validation.minLength > field.validation.maxLength
    ) {
      ctx.addIssue({
        code: "custom",
        message: "minLength cannot exceed maxLength.",
        path: ["validation"],
      });
    }

    if (
      field.validation?.min !== undefined &&
      field.validation?.max !== undefined &&
      field.validation.min > field.validation.max
    ) {
      ctx.addIssue({
        code: "custom",
        message: "min cannot exceed max.",
        path: ["validation"],
      });
    }

    if (field.validation?.pattern) {
      try {
        new RegExp(field.validation.pattern);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Validation pattern must be a valid regular expression.",
          path: ["validation", "pattern"],
        });
      }
    }
  });

export type FormField = z.infer<typeof formFieldSchema>;

export const formSectionSchema = z.object({
  id: identifier,
  title: z.string().min(1).max(500),
  description: z.string().max(4000).optional(),
  fields: z.array(formFieldSchema).min(1).max(200),
});

export type FormSection = z.infer<typeof formSectionSchema>;

export const formDefinitionSchema = z
  .object({
    schemaVersion: z.literal(1),
    intro: z.string().max(10000).optional(),
    submitLabel: z.string().min(1).max(100).default("Submit"),
    confirmationMessage: z.string().max(5000).optional(),
    sections: z.array(formSectionSchema).min(1).max(100),
  })
  .superRefine((definition, ctx) => {
    const sectionIds = new Set<string>();
    const fieldIds = new Set<string>();
    const fieldOrder = new Map<string, number>();
    let nextFieldIndex = 0;

    definition.sections.forEach((section, sectionIndex) => {
      if (sectionIds.has(section.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate section id: ${section.id}`,
          path: ["sections", sectionIndex, "id"],
        });
      }
      sectionIds.add(section.id);

      section.fields.forEach((field, fieldIndex) => {
        if (fieldIds.has(field.id)) {
          ctx.addIssue({
            code: "custom",
            message: `Duplicate field id: ${field.id}`,
            path: ["sections", sectionIndex, "fields", fieldIndex, "id"],
          });
        }
        fieldIds.add(field.id);
        fieldOrder.set(field.id, nextFieldIndex++);
      });
    });

    definition.sections.forEach((section, sectionIndex) => {
      section.fields.forEach((field, fieldIndex) => {
        if (!field.condition) return;

        if (!fieldIds.has(field.condition.fieldId)) {
          ctx.addIssue({
            code: "custom",
            message: `Condition references unknown field: ${field.condition.fieldId}`,
            path: ["sections", sectionIndex, "fields", fieldIndex, "condition"],
          });
        }

        const controllerIndex = fieldOrder.get(field.condition.fieldId);
        const dependentIndex = fieldOrder.get(field.id);

        if (
          controllerIndex !== undefined &&
          dependentIndex !== undefined &&
          controllerIndex >= dependentIndex
        ) {
          ctx.addIssue({
            code: "custom",
            message: "Conditions may reference only fields that appear earlier in the form.",
            path: ["sections", sectionIndex, "fields", fieldIndex, "condition"],
          });
        }
      });
    });
  });

export type FormDefinition = z.infer<typeof formDefinitionSchema>;

export function parseFormDefinition(input: unknown): FormDefinition {
  return formDefinitionSchema.parse(input);
}

export function fieldsInDefinition(
  definition: FormDefinition,
): FormField[] {
  return definition.sections.flatMap((section) => section.fields);
}
