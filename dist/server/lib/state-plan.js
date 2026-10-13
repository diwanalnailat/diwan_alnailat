// Read dependencies for each screen. Authorization is still checked per record.
const plans = {
  overview: ["tasks", "expenses", "assets", "people", "pendingMembers"],
  services: [],
  decisions: ["tasks", "expenses", "people", "pendingMembers"],
  calendar: ["tasks", "expenses", "people"],
  projects: ["tasks"],
  committees: ["tasks", "people"],
  tasks: ["tasks", "people"],
  task_approvals: [],
  expenses: ["expenses", "people"],
  advances: ["advances", "people"],
  assets: ["assets"],
  field: ["assets"],
  suppliers: ["suppliers", "expenses"],
  media: ["suppliers"],
  documents: ["guides", "files", "tasks", "people"],
  users: ["members", "people"],
  permissions: ["members"],
  audit: ["audit"],
  settings: [],
  join_requests: [],
  join_policy: [],
  heritage_results: [],
  heritage: [],
  profile: ["tasks", "expenses", "advances", "people"],
  reports: ["tasks", "expenses", "advances", "assets", "suppliers", "people"],
  task_detail: ["tasks", "people", "files", "guides"],
  expense_detail: [
    "expenses",
    "tasks",
    "advances",
    "suppliers",
    "people",
    "files",
  ],
  advance_detail: ["advances", "expenses", "people", "files"],
  asset_detail: ["assets", "suppliers", "people", "files"],
  supplier_detail: ["suppliers", "expenses", "files"],
  committee_detail: ["tasks", "people", "members"],
  notifications: ["notifications"],
  search: ["tasks", "expenses", "advances", "assets", "suppliers", "guides"],
};
export function statePlan(view, include = "", dashboardRole = "admin") {
  if (!view) return { has: () => true, views: ["full"] };
  const views = [...new Set([view, ...include.split(",").filter(Boolean)])];
  if (views.length > 4 || views.some((name) => !Object.hasOwn(plans, name)))
    throw Object.assign(new Error("القسم المطلوب غير متاح"), { status: 400 });
  const reads = new Set(
    views.flatMap((name) => {
      if (name === "overview" && dashboardRole === "member")
        return ["tasks", "expenses", "advances", "people"];
      if (name === "overview" && dashboardRole === "supervisor")
        return ["tasks", "expenses", "people"];
      return plans[name];
    }),
  );
  if (reads.has("expenses")) reads.add("payments");
  if (reads.has("assets")) reads.add("movements");
  if (reads.has("advances")) reads.add("entries");
  return { has: (name) => reads.has(name), views };
}
