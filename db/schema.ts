import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
export const settings = sqliteTable("nl_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  version: integer("version").notNull().default(1),
});
export const members = sqliteTable(
  "nl_members",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id"),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    status: text("status").notNull().default("pending"),
    grants: text("grants").notNull().default("[]"),
    bundles: text("bundles").notNull().default("[]"),
    team: text("team").notNull().default(""),
    verified: integer("verified").notNull().default(0),
    version: integer("version").notNull().default(1),
    created: text("created").notNull(),
  },
  (t) => [
    uniqueIndex("nl_member_site").on(t.siteId),
    uniqueIndex("nl_member_phone").on(t.phone),
    uniqueIndex("nl_member_email").on(t.email),
  ],
);
export const bundles = sqliteTable("nl_bundles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  grants: text("grants").notNull(),
  version: integer("version").notNull().default(1),
});
export const projects = sqliteTable(
  "nl_projects",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    season: text("season").notNull().default(""),
    status: text("status").notNull().default("active"),
    start: text("start"),
    due: text("due"),
    budget: integer("budget").notNull().default(0),
    meta: text("meta").notNull().default("{}"),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    created: text("created").notNull(),
  },
  (t) => [check("nl_project_budget_nonnegative", sql`${t.budget}>=0`)],
);
export const tasks = sqliteTable(
  "nl_tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    assigneeId: text("assignee_id").references(() => members.id),
    start: text("start"),
    due: text("due"),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("todo"),
    parentId: text("parent_id"),
    meta: text("meta").notNull().default("{}"),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    created: text("created").notNull(),
    updated: text("updated").notNull(),
  },
  (t) => [
    index("nl_tasks_project_due").on(t.projectId, t.due),
    index("nl_tasks_assignee").on(t.assigneeId),
  ],
);
export const suppliers = sqliteTable("nl_suppliers", {
  id: text("id").primaryKey(),
  meta: text("meta").notNull().default("{}"),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  taxNumber: text("tax_number"),
  category: text("category").notNull().default(""),
  notes: text("notes").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  created: text("created").notNull(),
});
export const expenses = sqliteTable(
  "nl_expenses",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    supplierId: text("supplier_id").references(() => suppliers.id),
    title: text("title").notNull(),
    number: text("number"),
    category: text("category").notNull(),
    amount: integer("amount").notNull(),
    tax: integer("tax").notNull().default(0),
    date: text("date").notNull(),
    status: text("status").notNull().default("draft"),
    meta: text("meta").notNull().default("{}"),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    created: text("created").notNull(),
  },
  (t) => [
    index("nl_expenses_project").on(t.projectId),
    uniqueIndex("nl_expense_invoice_unique").on(
      t.projectId,
      t.supplierId,
      t.number,
    ),
    check("nl_expense_amount_positive", sql`${t.amount}>0`),
    check("nl_expense_tax_valid", sql`${t.tax}>=0 AND ${t.tax}<=${t.amount}`),
  ],
);
export const payments = sqliteTable(
  "nl_payments",
  {
    id: text("id").primaryKey(),
    expenseId: text("expense_id")
      .notNull()
      .references(() => expenses.id),
    amount: integer("amount").notNull(),
    date: text("date").notNull(),
    reference: text("reference").notNull().default(""),
    createdBy: text("created_by").notNull(),
    created: text("created").notNull(),
  },
  (t) => [
    index("nl_payments_expense").on(t.expenseId),
    check("nl_payment_positive", sql`${t.amount}>0`),
  ],
);
// Permanent allocator: numbers are never reused or reset at the start of a season.
export const assetNumbers = sqliteTable("nl_asset_numbers", {
  number: integer("number").primaryKey({ autoIncrement: true }),
  assetId: text("asset_id").notNull().unique(),
});
export const assets = sqliteTable(
  "nl_assets",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("quantity"),
    ownership: text("ownership").notNull().default("owned"),
    category: text("category").notNull().default(""),
    quantity: integer("quantity").notNull(),
    location: text("location").notNull().default(""),
    serial: text("serial"),
    condition: text("condition").notNull().default("ready"),
    meta: text("meta").notNull().default("{}"),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    created: text("created").notNull(),
  },
  (t) => [
    uniqueIndex("nl_asset_serial").on(t.serial),
    check("nl_asset_quantity_nonnegative", sql`${t.quantity}>=0`),
  ],
);
export const movements = sqliteTable(
  "nl_movements",
  {
    id: text("id").primaryKey(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    projectId: text("project_id").references(() => projects.id),
    memberId: text("member_id").references(() => members.id),
    meta: text("meta").notNull().default("{}"),
    type: text("type").notNull(),
    quantity: integer("quantity").notNull(),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").notNull(),
    created: text("created").notNull(),
  },
  (t) => [
    index("nl_movement_asset").on(t.assetId),
    check("nl_movement_positive", sql`${t.quantity}>0`),
  ],
);
export const files = sqliteTable(
  "nl_files",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    meta: text("meta").notNull().default("{}"),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    objectKey: text("object_key").notNull(),
    createdBy: text("created_by").notNull(),
    created: text("created").notNull(),
  },
  (t) => [index("nl_files_entity").on(t.entityType, t.entityId)],
);
export const comments = sqliteTable(
  "nl_comments",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id),
    meta: text("meta").notNull().default("{}"),
    body: text("body").notNull(),
    createdBy: text("created_by").notNull(),
    created: text("created").notNull(),
  },
  (t) => [index("nl_comments_task").on(t.taskId)],
);
export const guides = sqliteTable("nl_guides", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id),
  taskId: text("task_id").references(() => tasks.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  templateVersion: integer("template_version").notNull(),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  createdBy: text("created_by").notNull(),
  created: text("created").notNull(),
});
export const audit = sqliteTable(
  "nl_audit",
  {
    id: text("id").primaryKey(),
    actor: text("actor").notNull(),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    entityId: text("entity_id").notNull(),
    projectId: text("project_id"),
    detail: text("detail").notNull().default(""),
    created: text("created").notNull(),
  },
  (t) => [index("nl_audit_created").on(t.created)],
);
export const notifications = sqliteTable(
  "nl_notifications",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    resource: text("resource").notNull(),
    entityId: text("entity_id").notNull(),
    projectId: text("project_id"),
    channel: text("channel").notNull().default("in_app"),
    status: text("status").notNull().default("unread"),
    created: text("created").notNull(),
  },
  (t) => [index("nl_notifications_member").on(t.memberId, t.created)],
);
export const receipts = sqliteTable("nl_receipts", {
  id: text("id").primaryKey(),
  actor: text("actor").notNull(),
  hash: text("hash").notNull(),
  result: text("result").notNull(),
  created: text("created").notNull(),
});
export const guards = sqliteTable(
  "nl_guards",
  { id: text("id").primaryKey(), value: integer("value").notNull() },
  (t) => [check("nl_guard_changed", sql`${t.value}=1`)],
);

export const committees = sqliteTable(
  "nl_committees",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    config: text("config").notNull().default("{}"),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    managerId: text("manager_id").references(() => members.id),
    members: text("members").notNull().default("[]"),
    statuses: text("statuses").notNull(),
    version: integer("version").notNull().default(1),
    createdBy: text("created_by").notNull(),
    created: text("created").notNull(),
  },
  (t) => [index("nl_committees_project").on(t.projectId)],
);

export const advances = sqliteTable(
  "nl_advances",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    assigneeId: text("assignee_id")
      .notNull()
      .references(() => members.id),
    meta: text("meta").notNull().default("{}"),
    title: text("title").notNull(),
    createdBy: text("created_by").notNull(),
    created: text("created").notNull(),
  },
  (t) => [index("nl_advances_project").on(t.projectId)],
);
export const advanceEntries = sqliteTable(
  "nl_advance_entries",
  {
    id: text("id").primaryKey(),
    advanceId: text("advance_id")
      .notNull()
      .references(() => advances.id),
    meta: text("meta").notNull().default("{}"),
    type: text("type").notNull(),
    amount: integer("amount").notNull(),
    date: text("date").notNull(),
    paymentId: text("payment_id").references(() => payments.id),
    reference: text("reference").notNull().default(""),
    createdBy: text("created_by").notNull(),
    created: text("created").notNull(),
  },
  (t) => [
    index("nl_advance_entries_advance").on(t.advanceId),
    uniqueIndex("nl_advance_payment").on(t.paymentId),
    check("nl_advance_entry_positive", sql`${t.amount}>0`),
  ],
);

export const agentTurns = sqliteTable(
  "nl_agent_turns",
  {
    id: text("id").primaryKey(),
    memberId: text("member_id").notNull(),
    context: text("context").notNull().default("{}"),
    message: text("message").notNull(),
    reply: text("reply").notNull(),
    proposal: text("proposal").notNull().default("{}"),
    tokens: integer("tokens").notNull().default(0),
    created: text("created").notNull(),
  },
  (t) => [index("nl_agent_member").on(t.memberId, t.created)],
);
export const otpChallenges = sqliteTable(
  "nl_otp",
  {
    id: text("id").primaryKey(),
    siteId: text("site_id").notNull(),
    phone: text("phone").notNull(),
    hash: text("hash").notNull(),
    expires: integer("expires").notNull(),
    attempts: integer("attempts").notNull().default(0),
    used: integer("used").notNull().default(0),
    status: text("status").notNull().default("sending"),
    created: integer("created").notNull(),
  },
  (t) => [index("nl_otp_identity").on(t.siteId, t.created)],
);
export const contactPreferences = sqliteTable("nl_contact_preferences", {
  memberId: text("member_id").primaryKey(),
  whatsapp: integer("whatsapp").notNull().default(0),
  consentAt: text("consent_at"),
});
export const deliveryJobs = sqliteTable(
  "nl_delivery_jobs",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id"),
    status: text("status").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAt: integer("next_at").notNull().default(0),
    error: text("error").notNull().default(""),
    updated: text("updated").notNull(),
  },
  (t) => [uniqueIndex("nl_delivery_provider").on(t.providerId)],
);
export const integrationLimits = sqliteTable("nl_integration_limits", {
  key: text("key").primaryKey(),
  hits: integer("hits").notNull().default(0),
  expires: integer("expires").notNull(),
});
