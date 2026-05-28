import React from "react";
import DataTable from "./components/DataTable";
import DynamicForm from "./components/DynamicForm";
import StatCard from "./components/StatCard";
import { ComponentType } from "../config/types";

const ChartPlaceholder: React.ComponentType = () => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
    Chart component — coming soon
  </div>
);

const DetailViewPlaceholder: React.ComponentType = () => (
  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
    Detail view — coming soon
  </div>
);

export const COMPONENT_REGISTRY: Record<ComponentType, React.ComponentType<any>> = {
  "table": DataTable,
  "form": DynamicForm,
  "stat-card": StatCard,
  "chart": ChartPlaceholder,
  "detail-view": DetailViewPlaceholder,
};

export function getComponent(type: string): React.ComponentType<any> {
  const component = COMPONENT_REGISTRY[type as ComponentType];
  if (component) {
    return component;
  }

  return () => (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      Unknown component type: {type}
    </div>
  );
}
