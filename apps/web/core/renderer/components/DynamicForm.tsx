import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { EntityDef, FieldDef } from "../../config/types";

type FormState = Record<string, unknown>;

type FormErrors = Record<string, string>;

interface DynamicFormProps {
  entity: EntityDef;
  onSubmit: (data: Record<string, unknown>) => void;
  isLoading?: boolean;
  initialData?: Record<string, unknown>;
  title?: string;
}

function getFieldLabel(name: string): string {
  return name
    .replace(/([A-Z])/g, " $1")
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());
}

function getInitialValue(field: FieldDef, initialData?: Record<string, unknown>): unknown {
  if (!initialData) {
    return field.type === "boolean" ? false : "";
  }

  const raw = initialData[field.name];

  if (raw === undefined || raw === null) {
    return field.type === "boolean" ? false : "";
  }

  if (field.type === "date" && typeof raw === "string") {
    return raw;
  }

  if (field.type === "number" && typeof raw === "number") {
    return raw;
  }

  if (field.type === "boolean" && typeof raw === "boolean") {
    return raw;
  }

  return String(raw);
}

export default function DynamicForm({
  entity,
  onSubmit,
  isLoading = false,
  initialData,
  title,
}: DynamicFormProps) {
  const [formState, setFormState] = useState<FormState>(() => {
    const state: FormState = {};
    entity.fields.forEach((field) => {
      if (field.type === "relation") {
        return;
      }
      state[field.name] = getInitialValue(field, initialData);
    });
    return state;
  });

  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!initialData) {
      return;
    }

    const state: FormState = {};
    entity.fields.forEach((field) => {
      if (field.type === "relation") {
        return;
      }

      state[field.name] = getInitialValue(field, initialData);
    });

    setFormState(state);
  }, [entity.fields, initialData]);

  function validate(): boolean {
    const nextErrors: FormErrors = {};

    entity.fields.forEach((field) => {
      if (field.type === "relation") {
        return;
      }

      if (!field.required) {
        return;
      }

      const value = formState[field.name];
      const isEmptyString = typeof value === "string" && value.trim() === "";
      const isEmptyValue = value === undefined || value === null || isEmptyString;

      if (field.type === "boolean") {
        if (value === undefined || value === null) {
          nextErrors[field.name] = "This field is required.";
        }
        return;
      }

      if (isEmptyValue) {
        nextErrors[field.name] = "This field is required.";
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleChange(field: FieldDef, value: unknown) {
    setFormState((previous) => ({
      ...previous,
      [field.name]: value,
    }));

    setErrors((previous) => ({
      ...previous,
      [field.name]: "",
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    onSubmit(formState);
  }

  const isEditMode = Boolean(initialData);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      {title ? <h2 className="mb-4 text-xl font-semibold text-slate-900">{title}</h2> : null}

      <form onSubmit={handleSubmit} className="space-y-6">
        {entity.fields.map((field) => {
          if (field.type === "relation") {
            return null;
          }

          const value = formState[field.name];
          const error = errors[field.name];
          const label = getFieldLabel(field.name);
          const requiredMark = field.required ? " *" : "";

          const inputProps = {
            id: field.name,
            name: field.name,
            value: field.type === "boolean" ? undefined : value as string | number,
            onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
              if (field.type === "number") {
                const parsed = event.target.value === "" ? "" : Number(event.target.value);
                handleChange(field, Number.isNaN(parsed) ? event.target.value : parsed);
                return;
              }

              if (field.type === "boolean") {
                return;
              }

              handleChange(field, event.target.value);
            },
            className:
              "w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200",
          };

          return (
            <div key={field.name} className="space-y-2">
              <label htmlFor={field.name} className="block text-sm font-medium text-slate-700">
                {label}
                {requiredMark}
              </label>

              {field.type === "text" ? (
                <textarea
                  {...inputProps}
                  rows={4}
                  className="min-h-28 w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              ) : field.type === "boolean" ? (
                <div className="flex items-center gap-2">
                  <input
                    id={field.name}
                    name={field.name}
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) => handleChange(field, event.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-slate-600 focus:ring-slate-500"
                  />
                  <span className="text-sm text-slate-700">{label}</span>
                </div>
              ) : (
                <input
                  {...inputProps}
                  type={
                    field.type === "email"
                      ? "email"
                      : field.type === "password"
                      ? "password"
                      : field.type === "number"
                      ? "number"
                      : field.type === "date"
                      ? "date"
                      : "text"
                  }
                />
              )}

              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
            </div>
          );
        })}

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              {isEditMode ? "Updating..." : "Creating..."}
            </span>
          ) : isEditMode ? (
            "Update"
          ) : (
            "Create"
          )}
        </button>
      </form>
    </div>
  );
}
