"use client";

import { useState, type ReactNode } from "react";
import type {
  FormDefinition,
  FormField,
} from "@/modules/forms/definition";
import { visibleFieldIdsForDefinition } from "@/modules/forms/visibility";

export function FormRenderer({
  definition,
  action,
}: {
  definition: FormDefinition;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  const record = (fieldId: string, value: unknown) => {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
  };
  const visibleFieldIds = visibleFieldIdsForDefinition(
    definition,
    answers,
  );

  return (
    <form action={action}>
      {definition.intro ? <p>{definition.intro}</p> : null}

      {definition.sections.map((section) => (
        <section key={section.id}>
          <h2>{section.title}</h2>
          {section.description ? <p>{section.description}</p> : null}

          {section.fields.map((field) =>
            visibleFieldIds.has(field.id) ? (
              <FormFieldControl
                key={field.id}
                field={field}
                onValueChange={(value) => record(field.id, value)}
              />
            ) : null,
          )}
        </section>
      ))}

      <button type="submit">{definition.submitLabel}</button>
    </form>
  );
}

function FormFieldControl({
  field,
  onValueChange,
}: {
  field: FormField;
  onValueChange: (value: unknown) => void;
}) {
  const help = field.helpText ? <small>{field.helpText}</small> : null;
  const required = field.required;

  switch (field.type) {
    case "long_text":
      return (
        <label>
          {field.label}
          <textarea
            name={field.id}
            placeholder={field.placeholder}
            required={required}
            minLength={field.validation?.minLength}
            maxLength={field.validation?.maxLength}
            onChange={(event) => onValueChange(event.currentTarget.value)}
          />
          {help}
        </label>
      );

    case "email":
    case "phone":
    case "date":
    case "number":
    case "short_text": {
      const type =
        field.type === "short_text"
          ? "text"
          : field.type === "phone"
            ? "tel"
            : field.type;

      return (
        <label>
          {field.label}
          <input
            name={field.id}
            type={type}
            placeholder={field.placeholder}
            required={required}
            minLength={field.validation?.minLength}
            maxLength={field.validation?.maxLength}
            min={field.validation?.min}
            max={field.validation?.max}
            pattern={field.validation?.pattern}
            onChange={(event) =>
              onValueChange(
                field.type === "number"
                  ? event.currentTarget.value === ""
                    ? undefined
                    : Number(event.currentTarget.value)
                  : event.currentTarget.value,
              )
            }
          />
          {help}
        </label>
      );
    }

    case "boolean":
      return (
        <label>
          <input
            name={field.id}
            type="checkbox"
            value="true"
            onChange={(event) => onValueChange(event.currentTarget.checked)}
          />
          {field.label}
          {help}
        </label>
      );

    case "attestation":
      return (
        <label>
          <input
            name={field.id}
            type="checkbox"
            value="true"
            required={required}
            onChange={(event) => onValueChange(event.currentTarget.checked)}
          />
          {field.attestationText ?? field.label}
          {help}
        </label>
      );

    case "select":
      return (
        <label>
          {field.label}
          <select
            name={field.id}
            required={required}
            defaultValue=""
            onChange={(event) => onValueChange(event.currentTarget.value)}
          >
            <option value="" disabled={required}>
              Select an option
            </option>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {help}
        </label>
      );

    case "multiselect":
      return (
        <fieldset>
          <legend>{field.label}</legend>
          {(field.options ?? []).map((option) => (
            <label key={option.value}>
              <input
                name={field.id}
                type="checkbox"
                value={option.value}
                onChange={(event) => {
                  const form = event.currentTarget.form;
                  if (!form) return;
                  const values = new FormData(form)
                    .getAll(field.id)
                    .filter((value): value is string => typeof value === "string");
                  onValueChange(values);
                }}
              />
              {option.label}
            </label>
          ))}
          {help}
        </fieldset>
      );

    case "address":
      return (
        <AddressFieldControl
          field={field}
          required={required}
          help={help}
          onValueChange={onValueChange}
        />
      );

    case "file":
      return (
        <fieldset>
          <legend>{field.label}</legend>
          <input type="file" disabled multiple={(field.maxFiles ?? 1) > 1} />
          <small>
            The document subsystem supports immutable submission attachments, but
            the generic anonymous browser renderer does not enable binary upload by
            default. Deployments may connect a vetted public-upload transport to the
            submission attachment service.
          </small>
          {help}
        </fieldset>
      );
  }
}

function addressLabel(
  part: "line1" | "line2" | "city" | "region" | "postalCode" | "country",
) {
  const labels = {
    line1: "Address line 1",
    line2: "Address line 2",
    city: "City",
    region: "State / region",
    postalCode: "Postal code",
    country: "Country",
  };
  return labels[part];
}

function AddressFieldControl({
  field,
  required,
  help,
  onValueChange,
}: {
  field: FormField;
  required: boolean;
  help: ReactNode;
  onValueChange: (value: unknown) => void;
}) {
  const [address, setAddress] = useState<Record<string, string>>({});

  const updatePart = (part: string, value: string) => {
    const next = { ...address, [part]: value };
    setAddress(next);
    onValueChange(next);
  };

  return (
    <fieldset>
      <legend>{field.label}</legend>
      {(["line1", "line2", "city", "region", "postalCode", "country"] as const).map(
        (part) => (
          <label key={part}>
            {addressLabel(part)}
            <input
              name={`${field.id}.${part}`}
              required={
                required &&
                ["line1", "city", "region", "postalCode", "country"].includes(part)
              }
              onChange={(event) =>
                updatePart(part, event.currentTarget.value)
              }
            />
          </label>
        ),
      )}
      {help}
    </fieldset>
  );
}
