import { useState } from "react";
import { PageDef, AppConfig } from "../config/types";
import { getComponent } from "./ComponentRegistry";
import { getRuntimeData, createRuntimeRecord, deleteRuntimeRecord } from "../api-client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getEntityByName } from "../config/parser";

interface PageRendererProps {
  page: PageDef;
  config: AppConfig;
  appSlug: string;
}

interface PageComponentProps {
  component: PageDef["components"][number];
  config: AppConfig;
  appSlug: string;
}

function PageComponentRenderer({ component, config, appSlug }: PageComponentProps) {
  const queryClient = useQueryClient();
  const entityName = component.entity ?? "";
  const entity = entityName ? getEntityByName(config, entityName) : null;
  const queryKey = ["runtime", appSlug, entityName];
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);

  const runtimeQuery = useQuery({
    queryKey,
    queryFn: () => getRuntimeData(appSlug, entityName),
    enabled: Boolean(entityName),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const rows = Array.isArray(runtimeQuery.data) ? runtimeQuery.data : [];

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => deleteRuntimeRecord(appSlug, entityName, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) =>
      createRuntimeRecord(appSlug, entityName, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  try {
    const Component = getComponent(component.type);

    if (component.type === "table") {
      const fields = component.fields && component.fields.length > 0
        ? component.fields
        : entity
        ? entity.fields.map((field) => field.name)
        : [];

      const FormComponent = getComponent("form");

      return (
        <div className="space-y-4">
          <Component
            entity={entityName}
            fields={fields}
            data={rows}
            isLoading={runtimeQuery.isLoading}
            title={component.title}
            onDelete={entityName ? (id: string) => deleteMutation.mutate(id) : undefined}
            onEdit={(row: Record<string, unknown>) => setEditingRow(row)}
          />

          {editingRow && entity ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-3 text-lg font-semibold text-slate-900">Edit {entity.name}</h3>
              <FormComponent
                entity={entity}
                initialData={editingRow}
                onSubmit={() => setEditingRow(null)}
                isLoading={false}
                title={`Edit ${entity.name}`}
              />
            </div>
          ) : null}
        </div>
      );
    }

    if (component.type === "form") {
      if (!entity) {
        return (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Entity not found: {entityName}
          </div>
        );
      }

      return (
        <Component
          entity={entity}
          onSubmit={async (data: Record<string, unknown>) => {
            await createMutation.mutateAsync(data);
          }}
          isLoading={createMutation.isPending}
          title={component.title ?? `Create ${entity.name}`}
        />
      );
    }

    if (component.type === "stat-card") {
      return (
        <Component
          title={component.title ?? entityName}
          value={rows.length}
          isLoading={runtimeQuery.isLoading}
        />
      );
    }

    return <Component />;
  } catch (error) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        Component failed to render: {component.type}
      </div>
    );
  }
}

export default function PageRenderer({ page, config, appSlug }: PageRendererProps) {
  return (
    <div className="space-y-6">
      {page.components.map((component, index) => (
        <div key={`${component.type}-${component.entity ?? "unknown"}-${index}`}>
          <PageComponentRenderer component={component} config={config} appSlug={appSlug} />
        </div>
      ))}
    </div>
  );
}
