import type { FormDefinition } from "./definition";

export const starterFormDefinition: FormDefinition = {
  schemaVersion: 1,
  intro: "Complete the fields below. Required fields are marked by the browser.",
  submitLabel: "Submit",
  confirmationMessage: "Your submission has been received.",
  sections: [
    {
      id: "contact",
      title: "Contact information",
      description: "Basic information for this intake.",
      fields: [
        {
          id: "email",
          type: "email",
          label: "Email address",
          required: true,
        },
        {
          id: "description",
          type: "long_text",
          label: "Description",
          required: true,
          validation: {
            minLength: 20,
            maxLength: 5000,
          },
        },
        {
          id: "urgent",
          type: "boolean",
          label: "Does this require urgent review?",
          required: false,
        },
        {
          id: "urgent_reason",
          type: "long_text",
          label: "Explain why urgent review is needed",
          required: true,
          condition: {
            fieldId: "urgent",
            operator: "equals",
            value: true,
          },
        },
      ],
    },
  ],
};
