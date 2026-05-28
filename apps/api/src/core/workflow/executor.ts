import { WorkflowAction, WorkflowDef } from "../config/types";
import { evaluateCondition } from "./conditions";
import prisma from "../db/prisma";

type TriggerData = Record<string, unknown>;

type FetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

type FetchFn = (input: string, init?: FetchInit) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

const fetchFn = (globalThis as any).fetch as FetchFn | undefined;

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function serializeSqlValue(value: unknown): string {
  if (value === null) {
    return "NULL";
  }

  if (typeof value === "string") {
    return `'${escapeSqlString(value)}'`;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }

  return `'${escapeSqlString(JSON.stringify(value))}'`;
}

async function executeAction(
  workflow: WorkflowDef,
  action: WorkflowAction,
  triggerData: TriggerData,
  userId?: string,
): Promise<void> {
  switch (action.type) {
    case "send_notification": {
      const title = typeof action.config.title === "string" ? action.config.title : undefined;
      const message = typeof action.config.message === "string" ? action.config.message : undefined;

      if (!title || !message) {
        throw new Error("send_notification action requires config.title and config.message");
      }

      await prisma.notification.create({
        data: {
          title,
          message,
          ...(userId ? { userId } : {}),
        } as any,
      });
      return;
    }

    case "webhook": {
      const url = typeof action.config.url === "string" ? action.config.url : undefined;
      if (!url) {
        throw new Error("webhook action requires config.url");
      }

      if (!fetchFn) {
        throw new Error("Fetch API is not available in this runtime");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetchFn(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(triggerData),
          signal: controller.signal,
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`Webhook request failed with status ${response.status}: ${body}`);
        }
      } finally {
        clearTimeout(timeout);
      }

      return;
    }

    case "db_write": {
      const table = typeof action.config.table === "string" ? action.config.table.trim() : undefined;
      const data = action.config.data;

      if (!table || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
        throw new Error("db_write action requires a valid config.table");
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("db_write action requires config.data to be an object");
      }

      const columns = Object.keys(data);
      if (columns.length === 0) {
        throw new Error("db_write action requires config.data to contain at least one field");
      }

      const columnList = columns.map((column) => {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
          throw new Error(`Invalid column name in db_write config.data: ${column}`);
        }
        return `"${column}"`;
      });

      const valueList = columns.map((column) => serializeSqlValue((data as Record<string, unknown>)[column]));
      const query = `INSERT INTO "${table}" (${columnList.join(", ")}) VALUES (${valueList.join(", ")})`;

      await prisma.$executeRawUnsafe(query);
      return;
    }

    case "send_email": {
      const recipient =
        typeof action.config.to === "string"
          ? action.config.to
          : typeof action.config.email === "string"
          ? action.config.email
          : undefined;
      const subject = typeof action.config.subject === "string" ? action.config.subject : undefined;

      console.log(
        `[Workflow] Email action - would send to: ${recipient ?? "unknown"} subject: ${subject ?? "(none)"}`,
      );

      // TODO: Integrate SMTP/email provider and send the actual email here.
      return;
    }

    default:
      throw new Error(`Unsupported workflow action type: ${action.type}`);
  }
}

export async function executeWorkflow(
  workflow: WorkflowDef,
  triggerData: TriggerData,
  userId?: string,
): Promise<void> {
  if (workflow.condition) {
    let conditionResult = false;

    try {
      conditionResult = evaluateCondition(workflow.condition, triggerData);
    } catch (error) {
      console.error(`[Workflow] Condition evaluation failed for "${workflow.name}":`, error);
      return;
    }

    if (!conditionResult) {
      return;
    }
  }

  for (const action of workflow.actions) {
    try {
      await executeAction(workflow, action, triggerData, userId);
    } catch (error) {
      console.error(
        `[Workflow] Action failed for workflow "${workflow.name}" action type="${action.type}":`,
        error,
      );
    }
  }
}

export async function executeWorkflowsForEvent(
  workflows: WorkflowDef[],
  trigger: string,
  entity: string,
  data: TriggerData,
  userId?: string,
): Promise<void> {
  const matchingWorkflows = workflows.filter(
    (workflow) => workflow.trigger === trigger && workflow.entity === entity,
  );

  for (const workflow of matchingWorkflows) {
    await executeWorkflow(workflow, data, userId);
  }
}
