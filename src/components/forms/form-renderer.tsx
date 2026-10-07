"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  FormDefinition,
  FormField,
} from "@/modules/forms/definition";
import {
  initialPublicFormActionState,
  type PublicFormActionState,
} from "@/modules/forms/public-action-state";
import { visibleFieldIdsForDefinition } from "@/modules/forms/visibility";

export function FormRenderer({
  definition,
  action,
}: {
  definition: FormDefinition;
  action: (
    previousState: PublicFormActionState,
    formData: FormData,
  ) => Promise<PublicFormActionState>;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [state, formAction, pending] = useActionState(
    action,
    initialPublicFormActionState,
  );
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const record = (fieldId: string, value: unknown) => {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
  };
  const visibleFieldIds = visibleFieldIdsForDefinition(
    definition,
    answers,
  );
  const errorsByField = new Map(
    state.errors.map((error) => [error.fieldId, error.message]),
  );

  useEffect(() => {
    if (state.status === "validation_error") {
      errorSummaryRef.current?.focus();
    }
  }, [state]);

  if (state.status === "submitted") {
    return (
      <section role="status" aria-live="polite">
        <h2>Submission received</h2>
        {definition.confirmationMessage ? (
          <p>{definition.confirmationMessage}</p>
        ) : (
          <p>Your submission has been recorded.</p>
        )}
        {state.confirmationCode ? (
          <p>
            Tracking code: <strong>{state.confirmationCode}</strong>
          </p>
        ) : null}
        {state.participantPortal ? (
          <>
            <h3>Participant portal access</h3>
            <p>
              Save both values below. The access secret is shown only in
              this immediate submission result and cannot be recovered
              from the receipt code.
            </p>
            <p>
              Tracking code:{" "}
              <code>{state.participantPortal.trackingCode}</code>
            </p>
            <p>
              Access secret:{" "}
              <code>{state.participantPortal.accessSecret}</code>
            </p>
            <p>
              <a href={state.participantPortal.loginPath}>
                Open participant portal
              </a>
            </p>
          </>
        ) : null}
      </section>
    );
  }


  return (
    <form action={formAction} encType="multipart/form-data">
      {definition.intro ? <p>{definition.intro}</p> : null}
      <p className="hint">
        Fields marked <span aria-hidden="true">*</span> are required.
      </p>

      {state.status === "validation_error" && state.errors.length ? (
        <div
          className="error-summary"
          role="alert"
          tabIndex={-1}
          ref={errorSummaryRef}
          aria-labelledby="form-error-heading"
        >
          <h2 id="form-error-heading">Check your answers</h2>
          <p>
            Correct the following {state.errors.length === 1 ? "item" : "items"} and
            submit the form again.
          </p>
          <ul>
            {state.errors.map((error, index) => (
              <li key={`${error.fieldId}-${index}`}>
                <a href={`#field-${error.fieldId}`}>{error.message}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {definition.sections.map((section) => (
        <section key={section.id} aria-labelledby={`section-${section.id}`}>
          <h2 id={`section-${section.id}`}>{section.title}</h2>
          {section.description ? <p>{section.description}</p> : null}

          {section.fields.map((field) =>
            visibleFieldIds.has(field.id) ? (
              <FormFieldControl
                key={field.id}
                field={field}
                value={answers[field.id]}
                error={errorsByField.get(field.id)}
                onValueChange={(value) => record(field.id, value)}
              />
            ) : null,
          )}
        </section>
      ))}

      <button type="submit" disabled={pending} aria-disabled={pending}>
        {pending ? "Submitting…" : definition.submitLabel}
      </button>
      <span className="sr-only" aria-live="polite">
        {pending ? "Form submission in progress." : ""}
      </span>
    </form>
  );
}

function RequiredIndicator({ required }: { required: boolean }) {
  if (!required) return null;
  return (
    <>
      <span className="required-marker" aria-hidden="true">
        {" "}*
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

function descriptionIds(
  field: FormField,
  error?: string,
) {
  return [
    field.helpText ? `help-${field.id}` : null,
    error ? `error-${field.id}` : null,
  ]
    .filter(Boolean)
    .join(" ") || undefined;
}

function FieldMessages({
  field,
  error,
}: {
  field: FormField;
  error?: string;
}) {
  return (
    <>
      {field.helpText ? (
        <small id={`help-${field.id}`} className="help-text">
          {field.helpText}
        </small>
      ) : null}
      {error ? (
        <span id={`error-${field.id}`} className="field-error">
          {error}
        </span>
      ) : null}
    </>
  );
}

function FormFieldControl({
  field,
  value,
  error,
  onValueChange,
}: {
  field: FormField;
  value?: unknown;
  error?: string;
  onValueChange: (value: unknown) => void;
}) {
  const required = field.required;
  const controlId = `field-${field.id}`;
  const describedBy = descriptionIds(field, error);

  switch (field.type) {
    case "long_text":
      return (
        <div>
          <label htmlFor={controlId}>
            {field.label}
            <RequiredIndicator required={required} />
          </label>
          <textarea
            id={controlId}
            name={field.id}
            placeholder={field.placeholder}
            required={required}
            minLength={field.validation?.minLength}
            maxLength={field.validation?.maxLength}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            value={typeof value === "string" ? value : ""}
            onChange={(event) => onValueChange(event.currentTarget.value)}
          />
          <FieldMessages field={field} error={error} />
        </div>
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
        <div>
          <label htmlFor={controlId}>
            {field.label}
            <RequiredIndicator required={required} />
          </label>
          <input
            id={controlId}
            name={field.id}
            type={type}
            placeholder={field.placeholder}
            required={required}
            minLength={field.validation?.minLength}
            maxLength={field.validation?.maxLength}
            min={field.validation?.min}
            max={field.validation?.max}
            pattern={field.validation?.pattern}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            value={
              field.type === "number"
                ? typeof value === "number"
                  ? value
                  : ""
                : typeof value === "string"
                  ? value
                  : ""
            }
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
          <FieldMessages field={field} error={error} />
        </div>
      );
    }

    case "boolean":
      return (
        <div>
          <label htmlFor={controlId}>
            <input
              id={controlId}
              name={field.id}
              type="checkbox"
              value="true"
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              checked={value === true}
              onChange={(event) => onValueChange(event.currentTarget.checked)}
            />
            {field.label}
            <RequiredIndicator required={required} />
          </label>
          <FieldMessages field={field} error={error} />
        </div>
      );

    case "attestation":
      return (
        <div>
          <label htmlFor={controlId}>
            <input
              id={controlId}
              name={field.id}
              type="checkbox"
              value="true"
              required={required}
              aria-invalid={error ? true : undefined}
              aria-describedby={describedBy}
              checked={value === true}
              onChange={(event) => onValueChange(event.currentTarget.checked)}
            />
            {field.attestationText ?? field.label}
            <RequiredIndicator required={required} />
          </label>
          <FieldMessages field={field} error={error} />
        </div>
      );

    case "select":
      return (
        <div>
          <label htmlFor={controlId}>
            {field.label}
            <RequiredIndicator required={required} />
          </label>
          <select
            id={controlId}
            name={field.id}
            required={required}
            value={typeof value === "string" ? value : ""}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
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
          <FieldMessages field={field} error={error} />
        </div>
      );

    case "multiselect":
      return (
        <fieldset
          id={controlId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          tabIndex={-1}
        >
          <legend>
            {field.label}
            <RequiredIndicator required={required} />
          </legend>
          {(field.options ?? []).map((option) => (
            <label key={option.value}>
              <input
                name={field.id}
                type="checkbox"
                value={option.value}
                checked={
                  Array.isArray(value) &&
                  value.includes(option.value)
                }
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
          <FieldMessages field={field} error={error} />
        </fieldset>
      );

    case "address":
      return (
        <AddressFieldControl
          field={field}
          required={required}
          value={value}
          error={error}
          onValueChange={onValueChange}
        />
      );

    case "file": {
      const publicUploadEnabled = Boolean(field.publicUpload);
      return (
        <fieldset
          id={controlId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          tabIndex={-1}
        >
          <legend>
            {field.label}
            <RequiredIndicator required={required} />
          </legend>
          <input
            name={field.id}
            type="file"
            disabled={!publicUploadEnabled}
            required={required && publicUploadEnabled}
            multiple={(field.maxFiles ?? 1) > 1}
            accept={field.acceptedMimeTypes?.join(",")}
            onChange={(event) =>
              onValueChange(
                Array.from(event.currentTarget.files ?? []).map(
                  (file) => file.name,
                ),
              )
            }
          />
          <small>
            {publicUploadEnabled
              ? "Uploaded files are quarantined and cannot be used as trusted evidence until malware scanning records a clean result."
              : "Secure attachment upload is not enabled for this field."}
          </small>
          <FieldMessages field={field} error={error} />
        </fieldset>
      );
    }
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
  value,
  error,
  onValueChange,
}: {
  field: FormField;
  required: boolean;
  value?: unknown;
  error?: string;
  onValueChange: (value: unknown) => void;
}) {
  const [address, setAddress] = useState<Record<string, string>>(
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, string>)
      : {},
  );
  const controlId = `field-${field.id}`;
  const describedBy = descriptionIds(field, error);

  const updatePart = (part: string, value: string) => {
    const next = { ...address, [part]: value };
    setAddress(next);
    onValueChange(next);
  };

  return (
    <fieldset
      id={controlId}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      tabIndex={-1}
    >
      <legend>
        {field.label}
        <RequiredIndicator required={required} />
      </legend>
      {(["line1", "line2", "city", "region", "postalCode", "country"] as const).map(
        (part) => {
          const inputId = `${controlId}-${part}`;
          return (
            <div key={part}>
              <label htmlFor={inputId}>
                {addressLabel(part)}
                <RequiredIndicator
                  required={
                    required &&
                    ["line1", "city", "region", "postalCode", "country"].includes(
                      part,
                    )
                  }
                />
              </label>
              <input
                id={inputId}
                name={`${field.id}.${part}`}
                required={
                  required &&
                  ["line1", "city", "region", "postalCode", "country"].includes(
                    part,
                  )
                }
                value={address[part] ?? ""}
                onChange={(event) =>
                  updatePart(part, event.currentTarget.value)
                }
              />
            </div>
          );
        },
      )}
      <FieldMessages field={field} error={error} />
    </fieldset>
  );
}
