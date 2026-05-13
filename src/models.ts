/**
 * Types and field-mapping helpers that mirror the Python `models.py`. The
 * Cyberday API returns rows with both fixed fields and dynamic
 * `text___system-template-*` keys, so `System` allows arbitrary extra keys.
 */

export interface SystemRef {
  id: number;
  title: string;
}

export interface AssignedUser {
  id?: number | null;
  name?: string | null;
  email?: string | null;
  [key: string]: unknown;
}

export interface WorkflowStatus {
  title?: string | null;
  type?: string | null;
  color?: string | null;
  [key: string]: unknown;
}

export interface ChildStats {
  total?: number | null;
  done?: number | null;
  active?: number | null;
  [key: string]: unknown;
}

export interface System {
  id: number;
  title?: string | null;
  description?: string | null;
  assigned_user?: AssignedUser | null;
  workflow_status?: WorkflowStatus | null;
  child_stats?: ChildStats | null;
  cia_importance?: string | null;
  importance?: number | null;
  created?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  next_review_date?: string | null;
  review_interval?: number | null;
  is_draft?: boolean | null;
  goals?: string[] | null;
  week_num?: string | null;
  [key: string]: unknown;
}

/**
 * snake_case argument name → Cyberday's hyphenated body key. Kept in sync
 * with `ADVANCED_FIELD_MAP` in the Python implementation.
 */
export const ADVANCED_FIELD_MAP = {
  nickname: "additional-name",
  owner: "additional-owner",
  administrator: "additional-admin",
  cost_center: "additional-cost",
  linked_systems: "additional-linksystems",
  purpose: "units-purpose",
  linked_providers: "processors-block",
  partner_resp_text: "processors-resptext",
} as const satisfies Record<string, string>;

export type AdvancedField = keyof typeof ADVANCED_FIELD_MAP;

export interface AdvancedSystemInput {
  nickname?: string;
  owner?: string;
  administrator?: string;
  cost_center?: string;
  linked_systems?: string[];
  purpose?: string;
  linked_providers?: string[];
  partner_resp_text?: string;
}

/**
 * Translate the tool's typed input into the wire body Cyberday expects.
 * Skips fields whose value is `undefined` so callers only send what they have.
 */
export function buildAdvancedBody(
  title: string,
  input: AdvancedSystemInput,
): Record<string, unknown> {
  const body: Record<string, unknown> = { title };
  for (const [pyName, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    const apiKey = ADVANCED_FIELD_MAP[pyName as AdvancedField];
    if (!apiKey) {
      throw new Error(`Unknown advanced field: ${pyName}`);
    }
    body[apiKey] = value;
  }
  return body;
}
