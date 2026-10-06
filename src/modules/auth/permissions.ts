export const corePermissions = [
  "organization:view",
  "organization:manage",
  "membership:view",
  "membership:manage",
  "office:view",
  "office:manage",
  "role:view",
  "role:manage",
  "invitation:manage",
  "form:view",
  "form:manage",
  "submission:view",
  "case:create",
  "case:view",
  "case:assign",
  "case:update",
  "case:close",
  "case:appeal",
  "document:upload",
  "document:view_private",
  "note:create_internal",
  "audit:view",
] as const;

export type CorePermission = (typeof corePermissions)[number];
export type Permission = CorePermission | (string & {});

export interface RoleTemplate {
  key: string;
  name: string;
  description: string;
  permissions: readonly CorePermission[];
}

export const defaultRoleTemplates: readonly RoleTemplate[] = [
  {
    key: "administrator",
    name: "Administrator",
    description: "Full organization administration and operational access.",
    permissions: corePermissions,
  },
  {
    key: "supervisor",
    name: "Supervisor",
    description: "Operational supervision without organization security administration.",
    permissions: [
      "organization:view",
      "membership:view",
      "office:view",
      "role:view",
      "form:view",
      "submission:view",
      "case:create",
      "case:view",
      "case:assign",
      "case:update",
      "case:close",
      "case:appeal",
      "document:upload",
      "document:view_private",
      "note:create_internal",
      "audit:view",
    ],
  },
  {
    key: "case_worker",
    name: "Case Worker",
    description: "Standard case-processing access.",
    permissions: [
      "organization:view",
      "office:view",
      "form:view",
      "submission:view",
      "case:create",
      "case:view",
      "case:update",
      "document:upload",
      "document:view_private",
      "note:create_internal",
    ],
  },
  {
    key: "intake_reviewer",
    name: "Intake Reviewer",
    description: "Intake and preliminary review access.",
    permissions: [
      "organization:view",
      "office:view",
      "form:view",
      "submission:view",
      "case:create",
      "case:view",
      "case:update",
      "document:upload",
      "document:view_private",
    ],
  },
  {
    key: "reviewer",
    name: "Reviewer",
    description: "Independent review and appeal access.",
    permissions: [
      "organization:view",
      "office:view",
      "form:view",
      "submission:view",
      "case:view",
      "case:appeal",
      "document:view_private",
      "audit:view",
    ],
  },
  {
    key: "auditor",
    name: "Auditor",
    description: "Read-only oversight and audit access.",
    permissions: [
      "organization:view",
      "membership:view",
      "office:view",
      "role:view",
      "form:view",
      "submission:view",
      "case:view",
      "document:view_private",
      "audit:view",
    ],
  },
  {
    key: "submitter",
    name: "Submitter",
    description: "External participant access to permitted submission workflows.",
    permissions: ["case:create"],
  },
];
