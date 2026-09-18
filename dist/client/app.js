/* Diwan Al Nailat: server-backed workspace. No operational data is stored in the browser. */
(() => {
  "use strict";
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const paths = {
    services:
      '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M14 17.5h7m-3.5-3.5v7"/>',
    decisions: '<path d="m8 12 3 3 5-6M9 3H5v18h14V3h-4M9 2h6v4H9z"/>',
    reports: '<path d="M4 3v18h17M8 16v-4m5 4V7m5 9V4"/>',
    field: '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10v9M3 8l9 5 9-5"/>',
    media:
      '<rect x="3" y="6" width="18" height="15" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6l2-3h4l2 3"/>',
    committees:
      '<circle cx="12" cy="6" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3M3 8h3m12 0h3"/>',
    advances:
      '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18m-5 4h5v4h-5zM7 5V3h11"/>',
    overview:
      '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    projects:
      '<rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V3h8v3M3 12h18"/>',
    tasks:
      '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 2 2 5-5M8 16h8"/>',
    expenses: '<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Zm3 5h8m-8 4h8m-8 4h4"/>',
    suppliers:
      '<path d="M3 9 5 3h14l2 6M3 9v3a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0V9M5 15v6h14v-6M10 21v-5h4v5"/>',
    assets:
      '<path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm0 10v9M3 8l9 5 9-5M8 5l9 5"/>',
    documents: '<path d="M13 3H5v18h14V9l-6-6Zm0 0v6h6M8 13h8m-8 4h6"/>',
    users:
      '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
    settings:
      '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
    audit: '<path d="M3 12a9 9 0 1 0 3-7L3 8m0-5v5h5m4-1v6l4 2"/>',
    assistant:
      '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10" cy="10" r="7"/><path d="m16 16 5 5"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    arrow: '<path d="M19 12H5m6-6-6 6 6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 11h18"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8Zm4 12h4"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    file: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5"/>',
    mic: '<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
    edit: '<path d="m15 4 5 5M4 16 16 4a3 3 0 0 1 4 4L8 20l-5 1 1-5Z"/>',
    lock: '<rect x="5" y="10" width="14" height="12" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  };
  const icon = (name, size = 18) =>
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.projects}</svg>`;
  const labels = {
    overview: "نظرة الديوان",
    services: "مركز الخدمات",
    decisions: "مركز القرارات",
    calendar: "تقويم المشاركة",
    field: "خدمات الميدان",
    reports: "التقارير والمتابعة",
    committees: "اللجان",
    projects: "المشاريع",
    tasks: "المهام",
    expenses: "المصاريف",
    advances: "العهد المالية",
    suppliers: "الموردون",
    media: "العلاقات الإعلامية",
    assets: "الأصول",
    documents: "الوثائق والأدلة",
    users: "الأعضاء والصلاحيات",
    settings: "الإعدادات",
    audit: "سجل العمليات",
    heritage: "عن النائلات",
    assistant: "سَنَد",
    profile: "مساحتي",
  };
  const actionLabels = {
    view: "مشاهدة",
    create: "إضافة",
    edit: "تعديل",
    assign: "إسناد",
    approve: "اعتماد",
    pay: "سداد",
    export: "تصدير",
    archive: "أرشفة",
    manage: "إدارة",
  };
  const resourceActions = {
    committees: ["view", "create", "edit", "manage"],
    projects: ["view", "create", "edit", "archive", "export"],
    tasks: ["view", "create", "edit", "assign", "approve", "export"],
    advances: ["view", "create", "pay", "export"],
    expenses: ["view", "create", "edit", "approve", "pay", "export"],
    suppliers: ["view", "create", "edit", "export"],
    assets: ["view", "create", "edit", "assign", "export"],
    documents: ["view", "create", "export"],
    users: ["view", "manage"],
    settings: ["view", "manage"],
    audit: ["view", "export"],
    assistant: ["view", "create"],
  };
  let S = null,
    page = location.hash.slice(1).split("?")[0] || "heritage",
    project = "",
    committee = "",
    taskView = "list",
    taskFilter = { q: "", status: "", priority: "", assignee: "" },
    currentTask = null,
    selectedSettings = "workspace",
    calendarOffset = 0,
    recorder = null,
    recordStream = null,
    assistantDraft = null;
  let serviceFilter = "all",
    scheduleFilter = "week",
    decisionFilter = "all",
    fieldFilter = "all";
  function workspaceContext() {
    return {
      S,
      project,
      committee,
      can,
      mayCreate,
      today,
      esc,
      icon,
      btn,
      num,
      cash,
      date,
      heading,
      projectSelect,
      committeeSelect,
      expenseBreakdown,
      taskRows,
      statusPill,
      avatar,
      person,
      projectName,
      done,
      serviceFilter,
      scheduleFilter,
      decisionFilter,
      fieldFilter,
    };
  }
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const num = (v) => new Intl.NumberFormat("ar-SA-u-nu-latn").format(v ?? 0),
    cash = (v) =>
      v === undefined
        ? "محجوب"
        : new Intl.NumberFormat("ar-SA-u-nu-latn", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(v / 100),
    date = (v) =>
      v
        ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
            day: "numeric",
            month: "short",
          }).format(new Date(v.slice(0, 10) + "T12:00:00"))
        : "بلا موعد";
  const person = (id) => S.people.find((u) => u.id === id)?.name || "غير مسندة",
    projectName = (id) => S.projects.find((p) => p.id === id)?.title || "مشروع",
    status = (id, t) =>
      boardStatuses(t).find((s) => s.id === id) || {
        name: id,
        color: "#999",
      },
    done = (t) => !!status(t.status, t).done;
  function can(
    resource,
    action,
    r = null,
    grants = S?.effective_grants || [],
    member = S?.user,
  ) {
    if (!member || member.status !== "active") return false;
    const gs = grants.filter(
      (g) =>
        (!g.expires || Date.parse(g.expires) > Date.now()) &&
        (g.resource === "*" || g.resource === resource) &&
        (g.action === "*" || g.action === action) &&
        ((g.scope || "all") === "all" ||
          (r &&
            ((g.scope === "committee" &&
              (r.committee_id ||
                r.meta?.committee_id ||
                (resource === "committees" && r.id)) === g.committeeId &&
              (!g.assignedOnly ||
                r.assignee_id === member.id ||
                r.created_by === member.id ||
                r.meta?.collaborators?.includes(member.id))) ||
              (g.scope === "project" &&
                (r.project_id === g.projectId ||
                  (resource === "projects" && r.id === g.projectId))) ||
              (g.scope === "assigned" &&
                (r.assignee_id === member.id ||
                  r.created_by === member.id ||
                  r.meta?.collaborators?.includes(member.id)))))),
    );
    return (
      gs.some((g) => g.effect === "allow") &&
      !gs.some((g) => g.effect === "deny")
    );
  }
  const mayCreate = (r) =>
    can(r, "create", {
      project_id: project,
      committee_id: committee,
      created_by: S.user.id,
    }) ||
    (S?.committees || []).some((c) =>
      can(r, "create", {
        project_id: c.project_id,
        committee_id: c.id,
        created_by: S.user.id,
      }),
    ) ||
    S.projects.some((p) =>
      can(r, "create", { project_id: p.id, created_by: S.user.id }),
    );
  function toast(message, error = false) {
    const t = $("#toast");
    t.textContent = message;
    t.className = "toast" + (error ? " error" : "");
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 5000);
  }
  async function api(path, body, key) {
    const opts =
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": key || crypto.randomUUID(),
            },
            body: JSON.stringify(body),
          };
    const res = await fetch("/api/" + path, opts);
    let data;
    try {
      data = await res.json();
    } catch {
      throw Error("تعذر الاتصال بالديوان. حاول مرة أخرى.");
    }
    if (!res.ok) throw Error(data.error || "تعذر تنفيذ الطلب");
    return data;
  }
  async function refresh(renderPage = true) {
    const firstRender = !S;
    const st = await api("state");
    S = st;
    S.committees ||= [];
    S.advances ||= [];
    S.advanceEntries ||= [];
    if (committee && !S.committees.some((c) => c.id === committee))
      committee = "";
    $(".brand > span:last-child").innerHTML =
      esc(S.settings.name) + "<small>فريق العمل</small>";
    document.title = S.settings.name + " | مساحة العمل";
    $("footer > span:first-child").innerHTML =
      esc(S.settings.name) + " <i>·</i> " + esc(S.settings.description);
    $("#userName").textContent = S.user.name;
    $("#userAvatar").textContent = S.user.name.slice(0, 1);
    $("#notificationCount").textContent =
      S.notifications.filter((n) => n.status === "unread").length || "";
    $("#syncState").textContent =
      "آخر تحديث " +
      new Date(st.server_time).toLocaleTimeString("ar-SA-u-nu-latn", {
        hour: "2-digit",
        minute: "2-digit",
      });
    renderNav();
    $$("[data-icon]").forEach(
      (el) =>
        (el.innerHTML = icon(
          el.dataset.icon === "moon" ? "sun" : el.dataset.icon,
        )),
    );
    $(".sanad-trigger").hidden = !S.modules.includes("assistant");
    if (renderPage) render(firstRender);
  }
  function renderNav() {
    const groups = [
      ["overview", "services", "decisions", "calendar"],
      ["projects", "committees", "tasks", "field"],
      [
        "expenses",
        "advances",
        "suppliers",
        "media",
        "assets",
        "documents",
        "reports",
      ],
      ["users", "settings", "audit"],
      ["heritage"],
    ];
    $("#nav").innerHTML = groups
      .map(
        (g, i) =>
          `${i ? '<div class="nav-separator"></div>' : ""}${g
            .filter((k) => k === "heritage" || DiwanViews.visible(S, k))
            .map(
              (k) =>
                `<button class="nav ${page === k ? "active" : ""}" data-page="${k}" ${page === k ? 'aria-current="page"' : ""}>${icon(k)}<span>${labels[k]}</span>${k === "tasks" && S.tasks.filter((t) => t.assignee_id === S.user.id && !done(t)).length ? `<span class="nav-count">${num(S.tasks.filter((t) => t.assignee_id === S.user.id && !done(t)).length)}</span>` : ""}${k === "users" && S.members.some((m) => m.status === "pending") ? '<span class="status-dot"></span>' : ""}</button>`,
            )
            .join("")}`,
      )
      .join("");
  }
  function syncMenu() {
    const sidebar = $("#sidebar");
    const open = sidebar.classList.contains("open");
    const expanded =
      window.innerWidth <= 860
        ? open
        : !document.body.classList.contains("sidebar-collapsed");
    sidebar.inert = !expanded;
    $(".mobile-menu").setAttribute("aria-expanded", String(open));
    const toggle = $(".sidebar-toggle");
    if (toggle) {
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute(
        "aria-label",
        expanded ? "إخفاء القائمة" : "إظهار القائمة",
      );
      toggle.title = expanded ? "إخفاء القائمة" : "إظهار القائمة";
    }
  }
  function navigate(p) {
    if (!S && p !== "heritage") {
      phoneForm();
      return;
    }
    if (!labels[p]) p = "overview";
    page = p;
    location.hash = p;
    $("#sidebar").classList.remove("open");
    syncMenu();
    renderNav();
    render();
    window.scrollTo(0, 0);
  }
  const btn = (text, action, id = "", variant = "button-dark", sym = "plus") =>
    `<button class="button ${variant}" data-action="${action}"${id ? ` data-id="${esc(id)}"` : ""}>${sym ? icon(sym) : ""}${text}</button>`;
  const empty = (title, body, action = "", text = "إضافة") =>
    `<div class="empty"><div class="empty-symbol">${icon(page, 30)}</div><h3>${title}</h3><p>${body}</p>${action ? btn(text, action) : ""}</div>`;
  const heading = (title, sub, buttons = "") =>
    `<div class="page-heading"><div><div class="eyebrow">ديوان النائلات / ${esc(labels[page])}</div><h1>${title}</h1><p>${sub}</p></div><div class="page-actions">${buttons}</div></div>`;
  const projectSelect = () =>
    `<select class="select-inline" id="projectFilter" aria-label="تصفية المشروع"><option value="">كل المشاريع</option>${S.projects.map((p) => `<option value="${p.id}" ${project === p.id ? "selected" : ""}>${esc(p.title)}</option>`).join("")}</select>`;
  const stat = (label, value, note, sym = "projects") =>
    `<div class="stat"><div class="stat-title">${label}<span class="stat-icon">${icon(sym)}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`;
  const avatar = (id) =>
    `<span class="avatar ${id ? "avatar-gold" : ""}">${esc(person(id).slice(0, 1))}</span>`;
  const statusPill = (t) =>
    `<span class="pill"><span class="status-dot" style="--status-color:${esc(status(t.status, t).color)}"></span>${esc(status(t.status, t).name)}</span>`;
  const priorityPill = (t) =>
    `<span class="priority ${esc(t.priority)}">${esc(S.settings.priorities.find((p) => p.id === t.priority)?.name || t.priority)}</span>`;
  const scoped = (type) =>
    (S[type] || []).filter((r) =>
      !project || type === "projects"
        ? !project || r.id === project
        : r.project_id === project,
    );
  function filteredTasks() {
    return S.tasks.filter(
      (t) =>
        (!project || t.project_id === project) &&
        (!committee || t.meta.committee_id === committee) &&
        (!taskFilter.q ||
          (
            t.title +
            " " +
            t.description +
            " " +
            (t.meta.tags || []).join(" ")
          ).includes(taskFilter.q)) &&
        (!taskFilter.status || t.status === taskFilter.status) &&
        (!taskFilter.priority || t.priority === taskFilter.priority) &&
        (!taskFilter.assignee || t.assignee_id === taskFilter.assignee),
    );
  }
  function table(headers, rows) {
    return `<div class="table-wrap"><table class="data-table"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
  }
  function taskRows(tasks, short = false) {
    return table(
      [
        "المهمة",
        ...(short ? [] : ["المشروع"]),
        "المسؤول",
        "الحالة",
        "الأولوية",
        "الاستحقاق",
        "",
      ],
      tasks.map(
        (t) =>
          `<tr><td><div class="task-title"><button class="task-check ${done(t) ? "checked" : ""}" data-action="toggle-task" data-id="${t.id}" aria-label="${done(t) ? "إعادة فتح" : "إكمال"} المهمة" ${can("tasks", "edit", t) ? "" : "disabled"}>${done(t) ? icon("check", 12) : ""}</button><button class="text-link" data-action="task" data-id="${t.id}">${esc(t.title)}</button></div>${!short && t.meta.checklist?.length ? `<div class="task-sub">${num(t.meta.checklist.filter((c) => c.done).length)} / ${num(t.meta.checklist.length)} خطوات${t.parent_id ? " · مهمة فرعية" : ""}</div>` : ""}</td>${short ? "" : `<td>${esc(projectName(t.project_id))}</td>`}<td><span class="person">${avatar(t.assignee_id)}${esc(person(t.assignee_id))}</span></td><td>${statusPill(t)}</td><td>${priorityPill(t)}</td><td class="${t.due && t.due < today() && !done(t) ? "overdue" : ""}">${date(t.due)}</td><td><button class="icon-btn" data-action="task" data-id="${t.id}" aria-label="تفاصيل المهمة">${icon("arrow", 15)}</button></td></tr>`,
      ),
    );
  }
  const committeeName = (id) =>
    S.committees.find((c) => c.id === id)?.name || "مهام المشروع العامة";
  const boardStatuses = () => S.settings.taskStatuses;
  const committeeSelect = () =>
    `<select class="select-inline" id="committeeFilter" aria-label="اللجنة"><option value="">كل اللجان</option>${S.committees
      .filter((c) => !project || c.project_id === project)
      .map(
        (c) =>
          `<option value="${c.id}" ${committee === c.id ? "selected" : ""}>${esc(c.name)}</option>`,
      )
      .join("")}</select>`;
  function committeesPage() {
    const p = S.projects.find((p) => p.id === project),
      cs = S.committees.filter((c) => !project || c.project_id === project);
    return (
      heading(
        p ? esc(p.title) : "لجان المشاركات",
        "المشروع يجمع المشاركة، وكل لجنة لها مسؤول وأعضاء ولوحة عمل مستقلة.",
        projectSelect() +
          (can("committees", "create", { project_id: project })
            ? btn("إضافة لجنة", "committee-new")
            : ""),
      ) +
      `<div class="scope-banner"><span>${icon("projects")} ${p ? esc(p.season || p.title) : "اختر مشروع المشاركة"}</span><span>${cs.length} لجنة متاحة لك</span><span>المؤشرات محسوبة من المهام التي يحق لك مشاهدتها</span></div>` +
      (cs.length
        ? `<div class="project-grid">${cs
            .map((c) => {
              const ts = S.tasks.filter((t) => t.meta.committee_id === c.id),
                count = ts.filter(done).length,
                late = ts.filter(
                  (t) => !done(t) && t.due && t.due < today(),
                ).length;
              return `<article class="project-card committee-card"><div class="card-top"><span class="project-symbol">${icon("users", 24)}</span><span class="pill">${c.members.length} أعضاء</span>${can("committees", "edit", c) ? btn("إدارة اللجنة", "committee-edit", c.id, "button-ghost compact", "settings") : ""}</div><h2><button class="text-link" data-action="committee-open" data-id="${c.id}">${esc(c.name)}</button></h2><p class="muted">${esc(c.description || "أضف وصفًا يوضح مسؤولية اللجنة ومخرجاتها.")}</p><div class="person">${avatar(c.manager_id)}<div><small>مسؤول اللجنة</small><strong>${c.manager_id ? esc(person(c.manager_id)) : "لم يُحدد بعد"}</strong></div></div><div class="committee-metrics"><div><strong>${ts.length}</strong><span>مهمة</span></div><div><strong>${count}</strong><span>مكتملة</span></div><div><strong>${late}</strong><span>متأخرة</span></div></div><div class="progress-track"><div class="progress-fill" style="width:${ts.length ? (count / ts.length) * 100 : 0}%"></div></div><div class="card-footer"><span>${esc(projectName(c.project_id))}</span>${btn("فتح لوحة اللجنة", "committee-open", c.id, "button-ghost compact", "arrow")}</div></article>`;
            })
            .join("")}</div>`
        : empty(
            "ابدأ بلجان المشاركة",
            "أضف اللجنة، وحدد مسؤولها وأعضاءها، ثم وزّع المهام داخلها.",
            project && can("committees", "create", { project_id: project })
              ? "committee-new"
              : "",
            "إضافة أول لجنة",
          ))
    );
  }
  const membershipPreset = (role) =>
    role === "manager"
      ? [
          ...["view", "create", "edit", "assign", "approve", "export"].map(
            (action) => ({ resource: "tasks", action, effect: "allow" }),
          ),
          { resource: "committees", action: "edit", effect: "allow" },
        ]
      : role === "supervisor"
        ? [
            { resource: "tasks", action: "view", effect: "allow" },
            { resource: "tasks", action: "export", effect: "allow" },
          ]
        : ["view", "edit"].map((action) => ({
            resource: "tasks",
            action,
            effect: "allow",
            assignedOnly: true,
          }));
  function committeeMemberRow(
    m = { id: "", role: "member", grants: membershipPreset("member") },
  ) {
    return `<div class="membership-row" data-membership><div class="form-grid">${field(
      "العضو",
      select(
        "membership_id",
        S.people.map((p) => [p.id, p.name]),
        m.id,
        "required",
      ),
    )}${field(
      "صفة العضوية",
      select(
        "membership_role",
        [
          ["member", "عضو لجنة"],
          ["manager", "مسؤول لجنة"],
          ["supervisor", "مشرف متابعة"],
        ],
        m.role,
      ),
    )}</div><details><summary>تخصيص صلاحيات هذا العضو في هذه اللجنة</summary><p class="muted">الصفة قالب بداية. يمكنك إضافة الصلاحيات أو سحبها. المنع الصريح يتقدم على السماح.</p><div class="membership-permissions">${[
      "tasks",
      "expenses",
      "committees",
    ]
      .map(
        (resource) =>
          `<fieldset><legend>${labels[resource]}</legend>${resourceActions[
            resource
          ]
            .filter(
              (a) =>
                a !== "manage" &&
                !(resource === "committees" && a === "create"),
            )
            .map((action) => {
              const g = m.grants.find(
                (g) => g.resource === resource && g.action === action,
              );
              return `<label>${actionLabels[action]}${select(
                "membership_permission",
                [
                  ["", "حسب الدور"],
                  ["allow", "سماح"],
                  ["deny", "منع"],
                ],
                g?.effect || "",
                `data-resource="${resource}" data-perm-action="${action}"`,
              )}</label>`;
            })
            .join("")}</fieldset>`,
      )
      .join(
        "",
      )}</div><label class="checklist-row"><input type="checkbox" name="membership_assigned" ${m.grants.some((g) => g.assignedOnly) ? "checked" : ""}> مهامه المسندة إليه أو التي يشارك فيها فقط</label></details><button type="button" class="button button-ghost compact" data-action="membership-remove">إزالة من اللجنة</button></div>`;
  }
  function budgetRow(
    l = { id: crypto.randomUUID(), name: "", budget: 0, active: true },
  ) {
    return `<div class="catalog-row" data-budget-line="${esc(l.id)}">${input("line_name", l.name, "text", 'required placeholder="اسم البند"')}${input("line_budget", (l.budget || 0) / 100, "number", 'min="0" step="0.01" placeholder="المخصص ر.س"')}<label><input type="checkbox" name="line_active" ${l.active ? "checked" : ""}> متاح للرفع</label></div>`;
  }
  function committeeForm(id) {
    const c = S.committees.find((c) => c.id === id) || {
        project_id: project || S.projects[0]?.id,
        members: [],
        config: {
          tags: ["ميداني", "قبل الافتتاح", "أثناء المشاركة", "بعد المشاركة"],
          budgetLines: [],
        },
      },
      access = can("users", "manage");
    if (!c.project_id) return projectForm();
    const candidates = (S.approvalCandidates || []).filter(
      (u) =>
        u.id !== c.manager_id &&
        (u.projects.includes(c.project_id) || u.committees.includes(c.id)),
    );
    modal(
      c.id ? "إدارة لجنة " + c.name : "إنشاء لجنة",
      `<form class="form-grid">${part(
        "1",
        "اختصاص اللجنة وقيادتها",
        "يعتمد مدير اللجنة إنجاز مهامها ومصاريفها في المرحلة الأولى.",
        `${field("اسم اللجنة *", input("name", c.name || "", "text", "required"), true)}${field(
          "المشروع",
          select(
            "project_id",
            S.projects.map((p) => [p.id, p.title]),
            c.project_id,
            c.id ? "disabled" : "required",
          ),
        )}${field("مدير اللجنة", select("manager_id", [["", "حدد مدير اللجنة"], ...S.people.map((p) => [p.id, p.name])], c.manager_id || "", access ? "" : "disabled"))}${field("المعتمد الثاني للمصاريف", select("second_approver_id", [["", "اختر صاحب صلاحية الاعتماد"], ...candidates.map((u) => [u.id, u.name])], c.config?.second_approver_id || "", access ? "" : "disabled"))}${field("بديل الاعتماد عند تعارض المصالح", select("review_delegate_id", [["", "اختر بديلًا عند الحاجة"], ...candidates.filter((u) => u.id !== c.config?.second_approver_id).map((u) => [u.id, u.name])], c.config?.review_delegate_id || "", access ? "" : "disabled"))}<p class="form-note full">البديل يراجع مصروف أحد المعتمدين، ولا يستطيع صاحب المصروف اعتماد طلبه. الأول مدير اللجنة. الثاني تختاره هنا من أصحاب صلاحية الاعتماد؛ ويمكن اختيار الشخص نفسه لعدة لجان. ظهور الاسم لا يمنح صلاحية جديدة.</p>${field("اختصاص اللجنة", textarea("description", c.description || "", 3), true)}`,
      )}${part("2", "الأعضاء ونطاق الوصول", "عضو: مهامه ومصاريفه. مدير: متابعة اللجنة واعتمادها. مشرف متابعة: الاطلاع دون اعتماد.", `<div class="full" id="committeeMembers">${c.members.map(committeeMemberRow).join("")}</div>${access ? '<button type="button" class="button full" data-action="membership-add">+ إضافة عضو من الديوان</button>' : ""}`)}${part("3", "بنود الصرف المعتمدة", "لا يكتب العضو تصنيفًا حرًا. يختار بندًا من هذه القائمة عند رفع المصروف.", `<div class="catalog-head"><span>اسم البند</span><span>المخصص — ر.س</span><span>التفعيل</span></div><div class="full" id="budgetCatalog">${(c.config?.budgetLines || []).map(budgetRow).join("")}</div>${access ? '<button type="button" class="button full" data-action="budget-add">+ بند صرف</button>' : ""}${access ? field("الوسوم المعتمدة — سطر لكل وسم", textarea("catalog_tags", (c.config?.tags || []).join("\n"), 3), true) : ""}<p class="form-note full">تعطيل البند يمنع استخدامه في طلبات جديدة ويحفظ العمليات السابقة. مراحل المهام موحدة: بدء، تنفيذ، مساندة عند الحاجة، مراجعة المدير، اكتمال معتمد.</p>`)}${actions("حفظ اللجنة وربط الوصول")}</form>`,
      async (fd, f) => {
        const b = {
          ...formData(fd),
          id: c.id,
          version: c.version,
          project_id: c.id ? c.project_id : fd.get("project_id"),
        };
        if (access) {
          b.members = [...f.querySelectorAll("[data-membership]")].map(
            (row) => ({
              id: row.querySelector("[name=membership_id]").value,
              role: row.querySelector("[name=membership_role]").value,
              grants: [...row.querySelectorAll("[data-perm-action]")]
                .filter((x) => x.value)
                .map((x) => ({
                  resource: x.dataset.resource,
                  action: x.dataset.permAction,
                  effect: x.value,
                  assignedOnly:
                    x.dataset.resource === "tasks" &&
                    row.querySelector("[name=membership_assigned]").checked,
                })),
            }),
          );
          if (b.manager_id) {
            let m = b.members.find((x) => x.id === b.manager_id);
            if (!m)
              b.members.push({
                id: b.manager_id,
                role: "manager",
                grants: membershipPreset("manager"),
              });
            else m.role = "manager";
          }
          b.config = {
            tags: String(fd.get("catalog_tags") || "")
              .split("\n")
              .map((x) => x.trim())
              .filter(Boolean),
            budgetLines: [...f.querySelectorAll("[data-budget-line]")].map(
              (row) => ({
                id: row.dataset.budgetLine,
                name: row.querySelector("[name=line_name]").value,
                budget: row.querySelector("[name=line_budget]").value,
                active: row.querySelector("[name=line_active]").checked,
              }),
            ),
          };
        } else {
          delete b.manager_id;
          delete b.second_approver_id;
          delete b.review_delegate_id;
          delete b.members;
        }
        const r = await api("committees/save", b, f.dataset.requestKey);
        project = b.project_id;
        committee = r.id;
        toast("حُفظت اللجنة وارتبط مديرها بمسار الاعتماد");
      },
      true,
    );
    const f = $("#modalBody form");
    if (access) {
      const syncApprover = () => {
        const pid = c.id
            ? c.project_id
            : f.elements.namedItem("project_id").value,
          manager = f.elements.namedItem("manager_id").value,
          sel = f.elements.namedItem("second_approver_id"),
          selected = sel.value;
        const candidates = (S.approvalCandidates || []).filter(
          (u) =>
            u.id !== manager &&
            (u.projects.includes(pid) || u.committees.includes(c.id)),
        );
        sel.innerHTML =
          '<option value="">اختر صاحب صلاحية الاعتماد</option>' +
          candidates
            .map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`)
            .join("");
        sel.value = candidates.some((u) => u.id === selected) ? selected : "";
        const ds = f.elements.namedItem("review_delegate_id"),
          current = ds.value;
        const choices = candidates.filter((u) => u.id !== sel.value);
        ds.innerHTML =
          '<option value="">اختر بديلًا عند الحاجة</option>' +
          choices
            .map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`)
            .join("");
        ds.value = choices.some((u) => u.id === current) ? current : "";
      };
      f.elements
        .namedItem("second_approver_id")
        .addEventListener("change", syncApprover);
      f.elements
        .namedItem("manager_id")
        .addEventListener("change", syncApprover);
      f.elements
        .namedItem("project_id")
        .addEventListener("change", syncApprover);
    }
    if (!access)
      $("#modalBody")
        .querySelectorAll(
          "#committeeMembers input,#committeeMembers select,#committeeMembers button,#budgetCatalog input",
        )
        .forEach((x) => (x.disabled = true));
  }
  function boardForm() {
    toast(
      "مراحل اللوحة موحدة لحماية تسلسل الاعتماد. اسحب المهام بين ميادين المشاركةل المتاحة حسب صلاحيتك.",
    );
  }
  const requestNames = {
    new: "طلب جديد",
    accepted: "تم استلام الطلب",
    fulfilling: "قيد التجهيز",
    partial: "استلام جزئي",
    delivered: "بانتظار تأكيد الاستلام",
    closed: "مكتمل ومؤكد",
  };
  function requestFlow(t) {
    const r = t.meta.request;
    if (!r)
      return can("tasks", "edit", t)
        ? `<section class="detail-section"><h3>احتياج أو مساندة لإنجاز المهمة</h3><p class="muted">اطلب تجهيزات أو عضوًا إضافيًا أو قرارًا؛ تابع الطلب هنا حتى تأكيد الاستلام.</p>${btn("طلب احتياج أو مساندة", "task-request", t.id, "button-ghost", "plus")}</section>`
        : "";
    const transitions = {
      new: ["accepted"],
      accepted: ["fulfilling"],
      fulfilling: ["partial", "delivered"],
      partial: ["partial", "delivered"],
      delivered: ["closed", "fulfilling"],
    };
    const responsible = r.stage === "delivered" ? r.requester : t.assignee_id;
    return `<section class="detail-section request-flow"><h3>تسلسل المساندة · ${requestNames[r.stage]}</h3><p>الخطوة الحالية لدى <strong>${esc(person(responsible))}</strong></p><ol class="flow-history">${r.history.map((h) => `<li><strong>${requestNames[h.stage]}</strong><small>${esc(person(h.by))} · ${date(h.at)}</small><p>${esc(h.note)}</p></li>`).join("")}</ol>${responsible === S.user.id && can("tasks", "edit", t) ? (transitions[r.stage] || []).map((stage) => `<button class="button compact" data-action="request-stage" data-id="${t.id}" data-stage="${stage}">${stage === "closed" ? "تأكيد الاستلام وإغلاق الطلب" : stage === "fulfilling" && r.stage === "delivered" ? "إعادة للتجهيز" : requestNames[stage]}</button>`).join(" ") : ""}<p class="form-note">يُنشأ تنبيه للمسؤول عن الخطوة التالية داخل الديوان. واتساب بانتظار ربط خدمة الإرسال.</p></section>`;
  }
  function requestForm(id) {
    const t = S.tasks.find((t) => t.id === id),
      c = S.committees.find((c) => c.id === t.meta.committee_id),
      people = c
        ? S.people.filter(
            (p) => c.members.some((m) => m.id === p.id) || p.id === S.user.id,
          )
        : S.people;
    modal(
      "طلب مساندة — " + t.title,
      `<form class="form-grid">${field(
        "نوع الاحتياج",
        select("kind", [
          ["supplies", "تجهيزات أو مواد"],
          ["person", "عضو إضافي"],
          ["decision", "قرار أو توجيه"],
          ["contact", "تعذر التواصل مع المسؤول"],
        ]),
      )}${field(
        "المسؤول عن تلبية الطلب *",
        select(
          "recipient_id",
          people.map((p) => [p.id, p.name]),
          c?.manager_id,
          "required",
        ),
      )}${field("عنوان واضح للطلب *", input("title", "", "text", "required"), true)}${field("ما المطلوب؟ والكمية أو النتيجة التي تؤكد بها الاستلام *", textarea("description", "", 4, "required"), true)}${field("موعد الاحتياج", input("due", t.due || "", "date"))}${field(
        "الأولوية",
        select(
          "priority",
          S.settings.priorities.map((p) => [p.id, p.name]),
          t.priority,
        ),
      )}<div class="notice full">يظهر الطلب كمهمة مرتبطة داخل اللجنة، وينتقل بعد التجهيز إليك لتأكيد الاستلام أو إعادته. لا يُنشئ مصروفًا أو عملية شراء.</div>${actions("إرسال الطلب")}</form>`,
      async (fd, f) => {
        await api(
          "tasks/request",
          { parent_id: id, ...formData(fd) },
          f.dataset.requestKey,
        );
        toast("أُرسل الطلب للمسؤول داخل الديوان");
        $("#detail").close();
      },
    );
  }

  function projectsPage() {
    return (
      heading(
        "المشاريع",
        "مساحة لكل مشروع. هيكل مرن يمتد معك من موسم إلى آخر.",
        (can("projects", "export")
          ? btn("تصدير Excel", "export", "projects", "", "download")
          : "") +
          (mayCreate("projects") ? btn("مشروع جديد", "project-new") : ""),
      ) +
      (S.projects.length
        ? `<div class="project-grid">${S.projects
            .map((p) => {
              const ts = S.tasks.filter((t) => t.project_id === p.id),
                pc = ts.length
                  ? Math.round((ts.filter(done).length / ts.length) * 100)
                  : 0;
              return `<article class="project-card"><div class="card-top"><span class="project-symbol">${icon("projects", 24)}</span><span class="pill ${p.status === "active" ? "green" : ""}">${{ active: "نشط", planned: "مخطط", onhold: "متوقف", closed: "مغلق" }[p.status] || p.status}</span>${can("projects", "edit", p) ? `<button class="icon-btn" data-action="project-edit" data-id="${p.id}" aria-label="تعديل المشروع">${icon("edit")}</button>` : ""}</div><h2><button class="text-link" data-action="project-open" data-id="${p.id}">${esc(p.title)}</button></h2><p class="muted">${esc(p.description || "أضف وصفًا يوضح هدف المشروع.")}</p>${locationView(p.meta?.site_location)}<span class="pill">${esc(p.season || "بلا موسم محدد")}</span><div class="legend-row"><span>${num(ts.length)} مهمة</span><span>${num(pc)}٪</span></div><div class="progress-track"><div class="progress-fill" style="width:${pc}%"></div></div><div class="card-footer"><span>${icon("calendar", 14)} ${date(p.due)}</span><button class="button button-ghost compact" data-action="project-open" data-id="${p.id}">فتح المشروع ${icon("arrow", 14)}</button>${mayCreate("projects") ? `<button class="icon-btn" data-action="project-clone" data-id="${p.id}" title="بدء نسخة جديدة">${icon("plus")}</button>` : ""}</div></article>`;
            })
            .join("")}</div>`
        : empty(
            "مشروعك الأول ينتظر اسمًا",
            "أضف الهدف والميزانية والفترة. يمكن تخصيص المهام والتفاصيل لاحقًا.",
            mayCreate("projects") ? "project-new" : "",
            "إنشاء مشروع",
          ))
    );
  }
  function tasksPage() {
    const tasks = filteredTasks(),
      views = [
        ["list", "قائمة"],
        ["table", "جدول"],
        ["kanban", "كانبان"],
        ["calendar", "تقويم"],
        ["gantt", "خط زمني"],
        ["workload", "توزيع العمل"],
      ];
    let content = "";
    if (taskView === "list" || taskView === "table")
      content = tasks.length
        ? taskRows(tasks, taskView === "list")
        : empty(
            "لا توجد مهام في هذا العرض",
            "أضف مهمة أو عدّل خيارات التصفية.",
            mayCreate("tasks") ? "task-new" : "",
            "إضافة مهمة",
          );
    else if (taskView === "kanban")
      content = `<div class="kanban">${boardStatuses()
        .map(
          (s) =>
            `<section class="kanban-column" data-status-drop="${s.id}"><div class="column-header"><span><i class="status-dot" style="--status-color:${esc(s.color)}"></i> ${esc(s.name)}</span><span>${num(tasks.filter((t) => t.status === s.id).length)}</span></div>${tasks
              .filter((t) => t.status === s.id)
              .sort((a, b) => (a.meta.rank || 0) - (b.meta.rank || 0))
              .map(
                (t) =>
                  `<article class="kanban-card" ${can("tasks", "edit", t) ? 'draggable="true"' : ""} data-task-drag="${t.id}"><div class="card-top">${priorityPill(t)}<button class="icon-btn" data-action="task" data-id="${t.id}" aria-label="التفاصيل">${icon("more", 16)}</button></div><button class="text-link" data-action="task" data-id="${t.id}">${esc(t.title)}</button><p class="task-sub">${esc(projectName(t.project_id))}</p><div class="kanban-meta"><span>${icon("calendar", 13)} ${date(t.due)}</span>${avatar(t.assignee_id)}</div>${t.meta.checklist?.length ? `<div class="task-sub">${icon("check", 12)} ${num(t.meta.checklist.filter((c) => c.done).length)} / ${num(t.meta.checklist.length)}</div>` : ""}</article>`,
              )
              .join(
                "",
              )}${mayCreate("tasks") ? `<button class="button button-ghost" data-action="task-new" data-status="${s.id}">${icon("plus", 14)} إضافة مهمة</button>` : ""}</section>`,
        )
        .join("")}</div>`;
    else if (taskView === "calendar") content = calendar(tasks);
    else if (taskView === "gantt") content = timeline(tasks);
    else content = workload(tasks);
    return (
      heading(
        committee ? esc(committeeName(committee)) : "المهام",
        "تفاصيل واضحة، مسؤوليات محددة، وأكثر من طريقة لرؤية العمل.",
        (can("tasks", "export", {
          project_id: project,
          committee_id: committee,
        })
          ? btn("تصدير Excel", "export", "tasks", "", "download")
          : "") +
          (committee &&
          can(
            "committees",
            "edit",
            S.committees.find((c) => c.id === committee),
          )
            ? btn(
                "إعدادات اللجنة",
                "committee-edit",
                "",
                "button-ghost",
                "settings",
              )
            : "") +
          (mayCreate("tasks") ? btn("مهمة جديدة", "task-new") : ""),
      ) +
      `<section class="panel"><div class="tabs">${views.map(([id, name]) => `<button class="tab ${taskView === id ? "active" : ""}" data-action="task-view" data-view="${id}">${name}</button>`).join("")}</div><div class="toolbar"><div class="filters">${projectSelect()}${committeeSelect()}<select class="select-inline" data-filter="status" aria-label="الحالة"><option value="">كل الحالات</option>${boardStatuses()
        .map(
          (s) =>
            `<option value="${s.id}" ${taskFilter.status === s.id ? "selected" : ""}>${esc(s.name)}</option>`,
        )
        .join(
          "",
        )}</select><select class="select-inline" data-filter="assignee" aria-label="المسؤول"><option value="">كل الأعضاء</option>${S.people.map((u) => `<option value="${u.id}" ${taskFilter.assignee === u.id ? "selected" : ""}>${esc(u.name)}</option>`).join("")}</select><select class="select-inline" data-filter="priority" aria-label="الأولوية"><option value="">كل الأولويات</option>${S.settings.priorities.map((p) => `<option value="${p.id}" ${taskFilter.priority === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div><label class="search-trigger">${icon("search", 16)}<input data-filter="q" value="${esc(taskFilter.q)}" placeholder="ابحث في المهام" aria-label="بحث المهام"></label></div>${content}</section>`
    );
  }
  function calendar(tasks) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + calendarOffset);
    const first = new Date(d),
      start = new Date(first);
    start.setDate(1 - first.getDay());
    let cells = "";
    for (let i = 0; i < 42; i++) {
      const x = new Date(start);
      x.setDate(start.getDate() + i);
      const key = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
      cells += `<div class="calendar-day ${x.getMonth() !== d.getMonth() ? "other" : ""} ${key === today() ? "today" : ""}"><span class="day-number">${num(x.getDate())}</span>${tasks
        .filter((t) => t.due === key)
        .map(
          (t) =>
            `<button class="calendar-task" data-action="task" data-id="${t.id}" style="border-color:${esc(status(t.status, t).color)}">${esc(t.title)}</button>`,
        )
        .join("")}</div>`;
    }
    return `<div class="toolbar"><strong>${d.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { month: "long", year: "numeric" })}</strong><div class="page-actions"><button class="button compact" data-action="calendar-prev">السابق</button><button class="button compact" data-action="calendar-today">اليوم</button><button class="button compact" data-action="calendar-next">التالي</button></div></div><div class="calendar-container"><div class="calendar">${["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((v) => `<div class="calendar-head">${v}</div>`).join("")}${cells}</div></div>${tasks.filter((t) => !t.due).length ? `<div class="panel-body muted">${num(tasks.filter((t) => !t.due).length)} مهمة بلا تاريخ استحقاق، تظهر في القائمة.</div>` : ""}`;
  }
  function timeline(tasks) {
    const withDates = tasks.filter((t) => t.start || t.due);
    if (!withDates.length)
      return empty(
        "حدد المواعيد ليظهر الخط الزمني",
        "يعرض مدة المهام وروابط الاعتماد بين خطوات المشروع.",
      );
    const dates = withDates
        .flatMap((t) => [t.start || t.due, t.due || t.start])
        .sort(),
      min = Date.parse(dates[0]),
      max = Math.max(Date.parse(dates.at(-1)), min + 86400000 * 14),
      span = max - min + 86400000;
    return `<div class="toolbar"><span>${date(dates[0])} — ${date(new Date(max).toISOString())}</span><span class="muted">الاعتماديات تظهر تحت اسم المهمة</span></div><div class="timeline">${withDates
      .map((t) => {
        const left = ((Date.parse(t.start || t.due) - min) / span) * 100,
          width = Math.max(
            1.5,
            ((Date.parse(t.due || t.start) -
              Date.parse(t.start || t.due) +
              86400000) /
              span) *
              100,
          );
        return `<div class="timeline-row"><div class="timeline-label"><button class="text-link" data-action="task" data-id="${t.id}">${esc(t.title)}</button><div class="task-sub">${num((t.meta.dependencies || []).length)} اعتماديات · ${esc(person(t.assignee_id))}</div></div><div class="timeline-track"><button class="timeline-bar" data-action="task" data-id="${t.id}" style="--offset:${left}%;--width:${width}%;background:${esc(status(t.status, t).color)}" title="${esc(t.title)}: ${date(t.start)} — ${date(t.due)}">${date(t.due)}</button></div></div>`;
      })
      .join(
        "",
      )}</div>${tasks.length > withDates.length ? `<div class="panel-body muted">${num(tasks.length - withDates.length)} مهمة بلا مواعيد.</div>` : ""}`;
  }
  function workload(tasks) {
    const ids = [...new Set([...S.people.map((u) => u.id), null])];
    return table(
      ["العضو", "إجمالي المهام", "قيد المتابعة", "متأخرة", "مكتملة"],
      ids.map((id) => {
        const ts = tasks.filter((t) => t.assignee_id === id),
          late = ts.filter((t) => !done(t) && t.due && t.due < today());
        return `<tr><td><span class="person">${avatar(id)}${esc(person(id))}</span></td><td>${num(ts.length)}</td><td>${num(ts.filter((t) => !done(t)).length)}</td><td class="${late.length ? "overdue" : ""}">${num(late.length)}</td><td>${num(ts.filter(done).length)}</td></tr>`;
      }),
    );
  }
  const expenseStatuses = {
    draft: ["مسودة", ""],
    pending: ["بانتظار الاعتماد", "amber"],
    approved: ["معتمد", "green"],
    returned: ["معاد للتعديل", "red"],
  };
  function expensePill(e) {
    const [name, color] = expenseStatuses[e.status] || [e.status, ""];
    return `<span class="pill ${color}">${name}</span>`;
  }
  function expenseBreakdown(es) {
    if (es.some((e) => e.amount_hidden))
      return '<p class="notice">تفصيل المبالغ محجوب ضمن صلاحياتك.</p>';
    const approved = es.filter((e) => e.status === "approved"),
      groups = new Map();
    for (const e of approved) {
      const key =
        (e.meta.committee_id || "") +
        "|" +
        (e.meta.budget_line_id || e.category);
      if (!groups.has(key))
        groups.set(key, {
          committee: expenseCommittee(e)?.name || "سجل سابق",
          line: e.meta.budget_line_name || e.category,
          total: 0,
          paid: 0,
          count: 0,
        });
      const g = groups.get(key);
      g.total += e.amount;
      g.paid += e.paid;
      g.count++;
    }
    return `<section class="panel"><div class="panel-header"><h2>أين صُرفت الميزانية؟</h2><span class="muted">المصاريف التي اجتازت الاعتمادين فقط</span></div>${
      groups.size
        ? table(
            [
              "اللجنة",
              "بند الصرف",
              "عدد المصاريف",
              "المعتمد — ر.س",
              "المسدد — ر.س",
              "المتبقي — ر.س",
            ],
            [...groups.values()]
              .sort((a, b) => b.total - a.total)
              .map(
                (g) =>
                  `<tr><td>${esc(g.committee)}</td><td>${esc(g.line)}</td><td>${num(g.count)}</td><td>${cash(g.total)}</td><td>${cash(g.paid)}</td><td>${cash(g.total - g.paid)}</td></tr>`,
              ),
          )
        : empty(
            "سيظهر توزيع المصروفات هنا",
            "بعد اعتماد المصروف من مدير اللجنة والمعتمد الثاني.",
          )
    }</section>`;
  }
  function expensesPage() {
    const es = scoped("expenses"),
      hidden = es.some((e) => e.amount_hidden),
      approved = es.filter((e) => e.status === "approved"),
      sum = (arr, k) => arr.reduce((s, e) => s + (e[k] || 0), 0),
      owed = approved
        .filter((e) => e.meta.funding_source === "personal")
        .reduce((s, e) => s + e.amount - e.paid, 0),
      advance = approved.filter((e) => e.meta.funding_source === "advance");
    return (
      heading(
        "المصاريف والمستحقات",
        "وثّق المصروف، تابِع الاعتمادين، واعرف ما صُفّي وما زال مستحقًا.",
        projectSelect() +
          (mayCreate("expenses") ? btn("رفع مصروف", "expense-new") : "") +
          btn("تصدير Excel", "export", "expenses", "", "download"),
      ) +
      `<div class="stats">${stat("مصروفات معتمدة", hidden ? "محجوب" : cash(sum(approved, "amount")), "ر.س · بعد موافقة المدير والمشرف")}${stat("مستحقات الأعضاء", hidden ? "محجوب" : cash(owed), "دفعوها من جيوبهم ولم نعوضهم بعد")}${stat("صُفّي من العهد", hidden ? "محجوب" : cash(sum(advance, "paid")), "خصومات تلقائية بعد الاعتمادين")}${stat("طلبات تنتظر قرارًا", num(es.filter((e) => e.status === "pending").length), "لدى مدير اللجنة أو المعتمد الثاني")}</div><section class="panel"><div class="panel-header"><h2>سجل المصاريف وإثباتاتها</h2><span>${num(es.length)} طلب</span></div>${
        es.length
          ? table(
              [
                "المصروف",
                "اللجنة / البند",
                "مصدر الدفع",
                "المبلغ — ر.س",
                "المرحلة الحالية",
                "المعني الآن",
              ],
              es.map(
                (e) =>
                  `<tr><td><button class="text-link" data-action="expense" data-id="${e.id}">${esc(e.title)}</button><div class="task-sub">${date(e.date)} · ${esc(e.number || "دون رقم")}</div></td><td>${esc(expenseCommittee(e)?.name || "يحتاج ربطًا بلجنة")}<small class="task-sub">${esc(e.meta.budget_line_name || e.category || "غير محدد")}</small></td><td>${esc(fundingNames[e.meta.funding_source] || "سجل سابق")}</td><td>${cash(e.amount)}</td><td><span class="pill ${e.status === "approved" ? "green" : "amber"}">${esc(settlementName(e))}</span></td><td>${e.status === "pending" ? esc(person(dueReviewer(e))) : e.status === "approved" && e.paid < e.amount ? "بانتظار توثيق السداد" : "—"}</td></tr>`,
              ),
            )
          : empty(
              "كل مصروف يبدأ بإثبات",
              "ارفع فاتورة أو إيصالًا من جهازك أو بالكاميرا.",
            )
      }</section>${expenseBreakdown(es)}`
    );
  }
  const safeLink = (u) => {
    try {
      const x = new URL(u);
      return ["https:", "http:"].includes(x.protocol) ? esc(x.href) : "";
    } catch {
      return "";
    }
  };
  function mediaPage() {
    const rows = S.suppliers.filter((s) => s.meta?.media_profile);
    return (
      heading(
        "العلاقات الإعلامية",
        "ملفات دائمة للمؤثرين والإعلاميين، ومشاركات موثقة لكل موسم.",
        (can("suppliers", "export")
          ? btn(
              "تصدير الأرشيف Excel",
              "export",
              "media",
              "button-ghost",
              "download",
            )
          : "") +
          (can("suppliers", "create")
            ? btn("إضافة ملف إعلامي", "media-new")
            : ""),
      ) +
      `<div class="media-profile-grid">${
        rows
          .map((s) => {
            const m = s.meta.media_profile;
            return `<article class="panel media-profile-card"><span class="eyebrow">${esc(m.role)}</span><h2>${esc(s.name)}</h2><p>${esc(m.specialty || "")}</p><div class="media-numbers"><span><strong>${num(m.accounts.length)}</strong>حسابات موثقة</span><span><strong>${num(m.engagements.length)}</strong>مشاركات وأعمال</span></div><button class="button" data-action="media-detail" data-id="${s.id}">فتح الملف والأرشيف ${icon("arrow")}</button></article>`;
          })
          .join("") ||
        empty(
          "علاقات تستمر بين المواسم",
          "أضف الملف مرة واحدة، ثم وثّق الزيارات والتغطيات والأعمال في كل مشاركة.",
        )
      }</div>`
    );
  }
  function mediaDetail(id) {
    const s = S.suppliers.find((s) => s.id === id);
    if (!s?.meta?.media_profile) return;
    const m = s.meta.media_profile;
    modal(
      s.name,
      `<div class="media-profile-header"><span class="eyebrow">${esc(m.role)}</span><p>${esc(m.specialty || "")}</p><p dir="ltr">${esc(s.phone || "")} ${esc(s.email || "")}</p>${can("suppliers", "edit", s) ? btn("تعديل الملف وتوثيق مشاركة", "media-edit", id) : ""}</div><h3>الحسابات والجمهور</h3>${table(
        ["المنصة", "الحساب", "المتابعون", "تاريخ الرصد"],
        m.accounts.map(
          (a) =>
            `<tr><td>${esc(a.platform)}</td><td>${safeLink(a.url) ? `<a href="${safeLink(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.handle || a.url)}</a>` : esc(a.handle)}</td><td>${a.followers == null ? "لم يُرصد" : num(a.followers)}</td><td>${esc(a.observed_on || "—")}</td></tr>`,
        ),
      )}<h3>سجل المشاركات والأعمال</h3>${
        m.engagements
          .slice()
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
          .map(
            (e) =>
              `<article class="media-work"><span class="eyebrow">${esc(projectName(e.project_id))} · ${esc(e.date)}</span><h3>${esc(e.title)}</h3><span class="pill">${esc(e.status)}</span><p>${esc(e.description)}</p><p>${esc(e.platform)} ${safeLink(e.url) ? `· <a href="${safeLink(e.url)}" target="_blank" rel="noopener noreferrer">عرض العمل المنشور</a>` : ""}</p><div class="media-numbers"><span>مشاهدات <strong>${e.views == null ? "—" : num(e.views)}</strong></span><span>تفاعلات <strong>${e.interactions == null ? "—" : num(e.interactions)}</strong></span><span>متابعون وقت المشاركة <strong>${e.followers == null ? "—" : num(e.followers)}</strong></span></div><p class="muted">${esc(e.notes || "")}</p>${fileList(S.files.filter((f) => (e.file_ids || []).includes(f.id)))}</article>`,
          )
          .join("") || '<p class="muted">لم تسجل مشاركة بعد.</p>'
      }<h3>أرشيف الصور</h3><div class="asset-photo-gallery">${S.files
        .filter(
          (f) =>
            f.entity_type === "suppliers" &&
            f.entity_id === s.id &&
            ["image/jpeg", "image/png", "image/webp"].includes(f.mime),
        )
        .map(
          (f) =>
            `<a href="/api/files/${f.id}?inline" target="_blank" rel="noopener noreferrer"><img src="/api/files/${f.id}?inline" loading="lazy" alt="${esc(f.name)}"></a>`,
        )
        .join("")}</div><h3>ملاحظات العلاقة</h3><p>${esc(s.notes)}</p>`,
      null,
      true,
    );
  }
  function mediaForm(id) {
    const s = S.suppliers.find((s) => s.id === id) || { meta: {} },
      m = s.meta.media_profile || {
        role: "مؤثر",
        accounts: [],
        engagements: [],
      };
    if (!can("suppliers", s.id ? "edit" : "create", s))
      return toast("لا تملك صلاحية تعديل الملف", true);
    const accounts = structuredClone(m.accounts || []),
      works = structuredClone(m.engagements || []);
    modal(
      s.id ? "تحديث الملف الإعلامي" : "إضافة ملف إعلامي",
      `<form class="form-grid">${field("الاسم *", input("name", s.name || "", "text", "required"))}${field(
        "الصفة",
        select(
          "role",
          [
            "مؤثر",
            "إعلامي",
            "مصور",
            "صانع محتوى",
            "شاعر",
            "مقدم",
            "جهة إعلامية",
          ].map((x) => [x, x]),
          m.role,
        ),
      )}${field("التخصص والمحتوى", input("specialty", m.specialty || ""))}${field("مسؤول التواصل", input("contact_name", s.meta.contact_name || ""))}${field("الجوال", input("phone", s.phone || "", "tel", 'dir="ltr"'))}${field("البريد", input("email", s.email || "", "email"))}${field("المدينة", input("city", s.meta.city || ""))}${field("ملاحظات العلاقة", textarea("notes", s.notes || "", 3), true)}<section class="full"><h3>الحسابات والجمهور</h3><p class="muted">سجّل عدد المتابعين بتاريخ الرصد؛ لا يُحدَّث تلقائيًا من المنصات.</p><div data-media-accounts></div><button class="button" type="button" data-add-account>إضافة حساب</button></section><section class="full"><h3>المشاركات والأعمال حسب الموسم</h3><p class="muted">أضف زيارة أو تغطية أو عملًا، واربطه بمشروع الموسم مع نسخة من الصور أو الملفات تحفظ في الأرشيف. الحد 10 MB للملف؛ للفيديو الطويل أرفق رابطه ونسخة مختصرة.</p><div data-media-works></div><button class="button" type="button" data-add-work>توثيق مشاركة أو عمل</button></section>${actions("حفظ الملف والأرشيف")}</form>`,
      async (fd, f) => {
        const av = [...f.querySelectorAll("[data-account-row]")].map((row) =>
          Object.fromEntries(
            [...row.querySelectorAll("[data-key]")].map((x) => [
              x.dataset.key,
              x.value,
            ]),
          ),
        );
        const ev = [];
        const files = [];
        for (const row of f.querySelectorAll("[data-work-row]")) {
          const values = Object.fromEntries(
            [...row.querySelectorAll("[data-key]")].map((x) => [
              x.dataset.key,
              x.value,
            ]),
          );
          const previous = works[Number(row.dataset.index)];
          const uploaded = await typedFiles(
            fd,
            "mediaFiles" + row.dataset.index,
            "supplier",
            "suppliers",
            "",
            s.id || "",
          );
          files.push(...uploaded);
          ev.push({
            ...values,
            id: previous?.id,
            file_ids: [...(previous?.file_ids || []), ...uploaded],
          });
        }
        await api(
          "suppliers/save",
          {
            ...formData(fd),
            id: s.id,
            version: s.version,
            entity_type: "individual",
            category: "العلاقات الإعلامية",
            supplier_status: s.meta.status || "active",
            site_location: s.meta.site_location || null,
            media_profile: {
              role: fd.get("role"),
              specialty: fd.get("specialty"),
              accounts: av,
              engagements: ev,
            },
            files,
          },
          f.dataset.requestKey,
        );
        toast("حُفظ الملف ومشاركات المواسم");
      },
      true,
    );
    const f = $("#modalBody form");
    const accountRow = (a) => {
      const row = document.createElement("div");
      row.className = "media-edit-row form-grid";
      row.dataset.accountRow = "";
      row.innerHTML = `${field(
        "المنصة",
        select(
          "",
          ["X", "Instagram", "Snapchat", "TikTok", "YouTube", "أخرى"].map(
            (x) => [x, x],
          ),
          a.platform,
          'data-key="platform"',
        ),
      )}${field("اسم الحساب", input("", a.handle || "", "text", 'data-key="handle"'))}${field("رابط الحساب", input("", a.url || "", "url", 'data-key="url" dir="ltr"'))}${field("عدد المتابعين", input("", a.followers ?? "", "number", 'data-key="followers" min="0" step="1"'))}${field("تاريخ الرصد", input("", a.observed_on || today(), "date", 'data-key="observed_on" required'))}<button type="button" class="button button-ghost" data-remove-row>إزالة الحساب</button>`;
      row.querySelector("[data-remove-row]").onclick = () => row.remove();
      f.querySelector("[data-media-accounts]").append(row);
    };
    const workRow = (w, index) => {
      const row = document.createElement("div");
      row.className = "media-edit-row form-grid";
      row.dataset.workRow = "";
      row.dataset.index = index;
      row.innerHTML = `${field(
        "مشروع الموسم *",
        select(
          "",
          S.projects.map((p) => [p.id, p.title]),
          w.project_id,
          'data-key="project_id" required',
        ),
      )}${field("تاريخ الزيارة / العمل *", input("", w.date || today(), "date", 'data-key="date" required'))}${field("عنوان العمل *", input("", w.title || "", "text", 'data-key="title" required'), true)}${field("ما تم تنفيذه؟", textarea("", w.description || "", 3, 'data-key="description"'), true)}${field("المنصة / قناة التغطية", input("", w.platform || "", "text", 'data-key="platform"'))}${field("رابط العمل", input("", w.url || "", "url", 'data-key="url" dir="ltr"'))}${field(
        "الحالة",
        select(
          "",
          ["مخطط", "حضر", "قيد التنفيذ", "منشور", "موثق ومؤرشف", "ملغى"].map(
            (x) => [x, x],
          ),
          w.status || "مخطط",
          'data-key="status"',
        ),
      )}${field("عدد المتابعين وقت المشاركة", input("", w.followers ?? "", "number", 'data-key="followers" min="0" step="1"'))}${field("المشاهدات", input("", w.views ?? "", "number", 'data-key="views" min="0" step="1"'))}${field("التفاعلات", input("", w.interactions ?? "", "number", 'data-key="interactions" min="0" step="1"'))}${field("تقييم التعاون وملاحظات الموسم القادم", textarea("", w.notes || "", 2, 'data-key="notes"'), true)}<div class="full">${typedUpload("mediaFiles" + index, "نسخة العمل / إثبات التغطية", "supplier", ".pdf,image/*,video/*")}${fileList(S.files.filter((f) => (w.file_ids || []).includes(f.id)))}</div>`;
      f.querySelector("[data-media-works]").append(row);
    };
    accounts.forEach(accountRow);
    works.forEach(workRow);
    f.querySelector("[data-add-account]").onclick = () => accountRow({});
    f.querySelector("[data-add-work]").onclick = () => {
      works.push({});
      workRow({}, works.length - 1);
    };
  }

  function suppliersPage() {
    return (
      heading(
        "الموردون",
        "دليل موحد لجهات التعامل، مرتبط بمصاريف المشاريع.",
        btn("تصدير Excel", "export", "suppliers", "", "download") +
          (mayCreate("suppliers") ? btn("مورد جديد", "supplier-new") : ""),
      ) +
      `<section class="panel">${
        S.suppliers.length
          ? table(
              ["المورد", "التخصص", "الجوال", "البريد", "الرقم الضريبي", ""],
              S.suppliers.map(
                (s) =>
                  `<tr><td><button class="text-link" data-action="supplier-edit" data-id="${s.id}">${esc(s.name)}</button><div class="task-sub">${num(S.expenses.filter((e) => e.supplier_id === s.id).length)} مصروف مرتبط</div></td><td>${esc(s.category || "—")}</td><td dir="ltr">${esc(s.phone || "—")}</td><td>${esc(s.email || "—")}</td><td>${esc(s.tax_number || "—")}</td><td>${can("suppliers", "edit", s) ? `<button class="icon-btn" data-action="supplier-edit" data-id="${s.id}" aria-label="تعديل">${icon("edit")}</button>` : ""}</td></tr>`,
              ),
            )
          : empty(
              "معرفة أفضل بمن تعمل معهم",
              "سجل بيانات المورد مرة واحدة، ثم اختره عند إضافة أي مصروف.",
              mayCreate("suppliers") ? "supplier-new" : "",
              "إضافة مورد",
            )
      }</section>`
    );
  }
  function assetsPage() {
    return (
      heading(
        "الأصول",
        "الدروع والأوشحة والتجهيزات وكل ما تملكه المشاركة؛ رقم دائم لكل أصل وسجل يبقى عبر المواسم.",
        btn("قراءة رمز أصل", "asset-lookup", "", "button-ghost") +
          (S.assets.length
            ? btn("طباعة ملصقات", "asset-labels", "", "button-ghost")
            : "") +
          btn("تصدير Excel", "export", "assets", "", "download") +
          (mayCreate("assets") ? btn("إضافة أصل", "asset-new") : ""),
      ) +
      `<div class="stats">${stat("أصول مملوكة", num(S.assets.filter((a) => a.ownership === "owned").length), "سجلات تبقى معنا بين المواسم", "assets")}${stat("أصول مستأجرة", num(S.assets.filter((a) => a.ownership === "rented").length), "سجلات لها فترة إيجار محددة", "calendar")}${stat("مسلمة للأعضاء", num(S.assets.filter((a) => a.issued > 0).length), "عدد سجلات الأصول التي لها كميات لدى أعضاء", "users")}${stat("تحتاج صيانة أو معالجة", num(S.assets.filter((a) => a.condition !== "ready").length), "سجلات غير جاهزة للتسليم", "settings")}</div>${S.assets.length ? `<div class="asset-grid">${S.assets.map((a) => `<article class="asset-card"><div class="card-top"><span class="project-symbol">${icon("assets", 24)}</span><span class="pill ${a.condition === "ready" ? "green" : "amber"}">${{ ready: "جاهز", maintenance: "صيانة", damaged: "تالف" }[a.condition]}</span><button class="icon-btn" data-action="asset" data-id="${a.id}" aria-label="تفاصيل الأصل">${icon("more")}</button></div><h2><button class="text-link" data-action="asset" data-id="${a.id}">${esc(a.name)}</button></h2><div class="task-sub">${{ owned: "مملوك", rented: "مستأجر", borrowed: "مستعار" }[a.ownership]} · ${esc(a.category || "غير مصنف")}</div><div class="asset-serial" dir="ltr">${esc(a.serial || "")}</div><div class="asset-quantity">${num(a.available)} <small>متاح من ${num(a.quantity)}</small></div><div class="asset-details"><span>${esc(a.location || "الموقع غير محدد")}</span><span>${num(a.issued)} في العهدة</span></div><div class="card-footer"><span class="task-sub">${{ quantity: "بالكمية", serialized: "أصل مرقم", consumable: "مستهلك" }[a.kind]}</span>${can("assets", "assign", a) ? btn(a.kind === "consumable" ? "تسجيل استهلاك" : "صرف / استرجاع", "asset-move", a.id, "button-ghost compact", "arrow") : ""}</div></article>`).join("")}</div>` : empty("أرشيف يتحرك مع العمل", "ابدأ بتسجيل الأصل وكميته وموقعه. يحتفظ الديوان بكل حركة صرف واسترجاع.", mayCreate("assets") ? "asset-new" : "", "تسجيل أصل")}`
    );
  }
  function documentsPage() {
    return (
      heading(
        "الوثائق وأدلة التنفيذ",
        "المرفقات مرتبطة بسجلاتها، وأدلة المهام محفوظة بإصدارات واضحة.",
        mayCreate("assistant")
          ? btn("تجهيز دليل مهمة", "assistant", "", "button-dark", "assistant")
          : "",
      ) +
      `<section class="panel"><div class="panel-header"><h2>أدلة تنفيذ المهام</h2><span class="pill">${num(S.guides.length)} دليل</span></div>${
        S.guides.length
          ? table(
              ["الدليل", "المشروع", "القالب", "الحالة", ""],
              S.guides.map(
                (g) =>
                  `<tr><td>${esc(g.title)}</td><td>${esc(projectName(g.project_id))}</td><td>الإصدار ${num(g.template_version)}</td><td><span class="pill amber">مسودة للمراجعة</span></td><td>${btn("تنزيل PDF", "guide-download", g.id, "button-ghost compact", "download")}</td></tr>`,
              ),
            )
          : empty(
              "من الفكرة إلى خطوات قابلة للتنفيذ",
              "جهز دليلًا باستخدام قالب الديوان، وراجعه ثم أرفقه بالمهمة.",
            )
      }</section><section class="panel"><div class="panel-header"><h2>المرفقات</h2><span class="muted">ضمن السجلات المتاحة لك</span></div>${
        S.files.length
          ? table(
              ["الملف", "النوع", "الحجم", "تاريخ الإضافة", ""],
              S.files.map(
                (f) =>
                  `<tr><td data-verbatim>${icon("file", 16)} ${esc(f.name)}</td><td>${labels[f.entity_type] || f.entity_type}</td><td>${num(Math.ceil(f.size / 1024))} ك.ب</td><td>${date(f.created)}</td><td><a class="button button-ghost compact" href="/api/files/${f.id}">${icon("download", 15)} تنزيل</a></td></tr>`,
              ),
            )
          : empty(
              "لا توجد مرفقات بعد",
              "أضف الصور والملفات من داخل المهمة أو المصروف أو الأصل.",
            )
      }</section>`
    );
  }
  let memberTab = "all";
  const memberStateLabels = {
    active: "نشط",
    pending: "بانتظار موافقتك",
    invited: "حساب مُجهّز",
    suspended: "موقوف",
  };
  function memberAccessName(m) {
    const grants = [
      ...m.grants,
      ...S.bundles
        .filter((b) => m.bundles.includes(b.id))
        .flatMap((b) => b.grants),
    ];
    const full = grants.some(
      (g) =>
        g.resource === "*" &&
        g.action === "*" &&
        g.effect === "allow" &&
        (g.scope || "all") === "all" &&
        !g.expires,
    );
    return full
      ? grants.some((g) => g.effect === "deny")
        ? "وصول شامل مع استثناءات"
        : "كامل صلاحيات المنصة"
      : S.committees.some((c) => c.members.some((x) => x.id === m.id))
        ? "صلاحيات اللجان + التخصيص"
        : "صلاحيات مخصصة";
  }
  function membersPage() {
    const manage = can("users", "manage"),
      members = S.members.filter(
        (m) => memberTab === "all" || m.status === memberTab,
      );
    return (
      heading(
        "المستخدمون والصلاحيات",
        "راجع طلبات الانضمام، وحدد لكل عضو ما يراه وما يستطيع إنجازه.",
        manage
          ? btn("حزمة صلاحيات", "bundle-new", "", "", "settings") +
              btn("إضافة عضو بنفسي", "user-new")
          : "",
      ) +
      `<div class="membership-journey"><div><b>1</b><strong>يسجّل العضو</strong><span>اسمه ورقم جواله، ثم رمز واتساب.</span></div><div><b>2</b><strong>يظهر في الطلبات</strong><span>يبقى بانتظارك دون دخول مساحة العمل.</span></div><div><b>3</b><strong>تحدد الوصول</strong><span>اللجان والصلاحيات، أو وصول كامل.</span></div><div><b>4</b><strong>تعتمد حسابه</strong><span>يدخل إلى الأقسام التي سمحت بها.</span></div></div>
      <div class="member-account-note"><strong>تفضّل إضافة العضو بنفسك؟</strong><span>جهّز اسمه وجواله وصلاحياته من «إضافة عضو بنفسي». عند توثيق الرقم نفسه يرتبط بالحساب المُجهّز. إذا اعتمدته مسبقًا، لا يحتاج موافقة ثانية.</span></div>
      ${!S.integrations?.phone ? '<div class="notice"><span>التسجيل وإرسال رموز واتساب لم يُفعّلا بعد. يمكنك الآن تجهيز الحسابات والصلاحيات؛ الوصول لهذه النسخة يبقى خاصًا.</span></div>' : ""}
      <div class="member-tabs" role="group" aria-label="حالة الأعضاء">${[
        ["all", "جميع الأعضاء"],
        ["pending", "طلبات الانضمام"],
        ["active", "النشطون"],
        ["invited", "الحسابات المُجهّزة"],
        ["suspended", "الموقوفون"],
      ]
        .map(
          ([key, title]) =>
            `<button class="${memberTab === key ? "active" : ""}" data-action="member-tab" data-tab="${key}" aria-pressed="${memberTab === key}">${title}<span>${num(S.members.filter((m) => key === "all" || m.status === key).length)}</span></button>`,
        )
        .join("")}</div>
      <section class="panel">${
        members.length
          ? table(
              ["العضو", "الجوال", "حالة الحساب", "الوصول الممنوح", ""],
              members.map(
                (m) =>
                  `<tr><td><span class="person"><span class="avatar avatar-gold">${esc(m.name.slice(0, 1))}</span><span>${esc(m.name)}<small class="task-sub">${esc(m.team || "")}</small></span></span></td><td dir="ltr">${esc(m.phone || "—")}<small class="task-sub" dir="rtl">${m.verified && m.phone ? "رقم موثّق" : "لم يوثّق جواله بعد"}</small></td><td><span class="pill ${{ active: "green", pending: "amber", invited: "blue", suspended: "red" }[m.status]}">${memberStateLabels[m.status]}</span></td><td>${memberAccessName(m)}<small class="task-sub">${
                    S.committees
                      .filter((c) => c.members.some((x) => x.id === m.id))
                      .map((c) => esc(c.name))
                      .join("، ") || "دون عضوية لجنة"
                  }</small></td><td>${manage ? btn(m.status === "pending" ? "مراجعة الطلب" : "تعديل الوصول", "user-edit", m.id, "button-ghost compact", "settings") : ""}</td></tr>`,
              ),
            )
          : empty(
              "لا توجد حسابات في هذه القائمة",
              memberTab === "pending"
                ? "تظهر طلبات الانضمام هنا بعد توثيق رقم الجوال."
                : "يمكنك تجهيز عضو جديد أو اختيار قائمة أخرى.",
            )
      }</section>
      ${
        S.bundles.length
          ? `<details class="panel member-bundles"><summary>حزم الصلاحيات المحفوظة · ${num(S.bundles.length)}</summary>${table(
              ["الحزمة", "القواعد", "الأعضاء", ""],
              S.bundles.map(
                (b) =>
                  `<tr><td>${esc(b.name)}</td><td>${num(b.grants.length)}</td><td>${num(S.members.filter((m) => m.bundles.includes(b.id)).length)}</td><td>${manage ? btn("تعديل", "bundle-edit", b.id, "button-ghost compact", "edit") : ""}</td></tr>`,
              ),
            )}</details>`
          : ""
      }`
    );
  }
  function auditPage() {
    return (
      heading(
        "سجل العمليات",
        "من فعل ماذا ومتى. يوثّق الإجراءات المؤثرة في العمل.",
        btn("تصدير Excel", "export", "audit", "", "download"),
      ) +
      `<section class="panel">${
        S.audit.length
          ? table(
              ["الإجراء", "القسم", "العضو", "التاريخ"],
              S.audit.map(
                (a) =>
                  `<tr><td>${esc(a.action)}</td><td>${esc(labels[a.resource] || a.resource)}</td><td>${esc(person(a.actor))}</td><td>${new Date(a.created).toLocaleString("ar-SA-u-ca-gregory-nu-latn")}</td></tr>`,
              ),
            )
          : empty(
              "السجل يبدأ مع أول إجراء",
              "تظهر هنا عمليات الإضافة والتعديل والاعتماد والصرف.",
            )
      }</section>`
    );
  }
  let heritageObserver;
  function initHeritageMotion() {
    heritageObserver?.disconnect();
    if (
      !("IntersectionObserver" in window) ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    heritageObserver = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("revealed");
            heritageObserver.unobserve(e.target);
          }
        }),
      { threshold: 0.1 },
    );
    document.querySelectorAll(".reveal").forEach((e) => {
      e.classList.add("will-reveal");
      heritageObserver.observe(e);
    });
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-scroll]");
    if (!b) return;
    e.preventDefault();
    document.getElementById(b.dataset.scroll)?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  });
  // Result records are keyed by edition, class and rank. Evidence is kept in docs/nailat-results.md.
  const nailatAwards = [
    {
      season: "2021–2022",
      edition: "6",
      title: "بداية الحضور",
      awards: [
        { rank: 2, title: "بيرق المؤسس", date: "2022-01-08" },
        { rank: 2, title: "فردي الجل", date: "2021-12-23" },
        { rank: 4, title: "فردي الجل", date: "2021-12-23" },
        { rank: 5, title: "فردي الجل", date: "2021-12-23" },
        { rank: 5, title: "فردي الدق", date: "2021-12-23" },
      ],
    },
    {
      season: "2022–2023",
      edition: "7",
      title: "بيرقٌ ونخبة",
      awards: [
        { rank: 1, title: "بيرق المؤسس", date: "2023-01-09" },
        { rank: 1, title: "نخبة النخبة", date: "2023-01-11" },
        { rank: 2, title: "فردي الجل", camel: "رعادة", date: "2022-12-22" },
      ],
    },
    {
      season: "2023–2024",
      edition: "8",
      title: "صدارة الوضح",
      awards: [
        { rank: 1, title: "بيرق الموحد", date: "2023-12-31" },
        { rank: 1, title: "نخبة النخبة", date: "2024-01-02" },
        ...[1, 2, 3, 4, 5].map((rank) => ({ rank, title: "فردي الجل" })),
      ],
    },
    {
      season: "2024–2025",
      edition: "9",
      title: "رايةٌ تتجدد",
      awards: [
        { rank: 1, title: "بيرق الموحد", date: "2024-12-30" },
        { rank: 1, title: "نخبة النخبة", date: "2024-12-31" },
        ...[1, 2, 3, 4, 5, 7, 9, 10].map((rank) => ({
          rank,
          title: "فردي الجل",
          date: "2024-12-19",
        })),
        ...[2, 5].map((rank) => ({
          rank,
          title: "فردي الدق · بكار",
          date: "2024-12-18",
        })),
      ],
    },
    {
      season: "2025–2026",
      edition: "10",
      title: "على درب الإنجاز",
      awards: [
        { rank: 1, title: "بيرق الموحد", date: "2025-12-30" },
        ...[1, 2, 3, 4, 5].map((rank) => ({
          rank,
          title: "فردي الجل",
          date: "2025-12-14",
        })),
      ],
    },
  ];
  let nailatEdition = "10";
  function nailatSeasonPanel(y) {
    return `<section class="nw-season" id="nailat-season-${y.edition}" role="tabpanel" aria-labelledby="nailat-tab-${y.edition}" tabindex="0" ${y.edition !== nailatEdition ? "hidden" : ""}>
      <div class="nw-season-note"><span>مهرجان الملك عبدالعزيز للإبل</span><div class="nw-edition-number" aria-label="النسخة ${y.edition}">${y.edition.padStart(2, "0")}</div><h3>${y.title}</h3><p>نتائج منقية النائلات<br>لون الوضح · موسم <bdi>${y.season}</bdi></p></div>
      <div class="nw-result-list">${y.awards.map((a) => `<article class="nw-result" data-rank="${a.rank}"><div class="nw-place" aria-label="المركز ${a.rank}"><small>المركز</small><strong>${a.rank}</strong></div><div><h3>${a.title}</h3><p>الوضح${a.camel ? ` <span aria-hidden="true">·</span> <span class="nw-camel-name">${a.camel}</span>` : ""}</p></div>${a.date ? `<time datetime="${a.date}" dir="ltr">${a.date.split("-").reverse().join(" / ")}</time>` : ""}</article>`).join("")}</div>
    </section>`;
  }
  function chooseNailatEdition(edition) {
    if (!nailatAwards.some((y) => y.edition === edition)) return;
    nailatEdition = edition;
    document.querySelectorAll("[data-nailat-edition]").forEach((b) => {
      const selected = b.dataset.nailatEdition === edition;
      b.setAttribute("aria-selected", String(selected));
      b.tabIndex = selected ? 0 : -1;
    });
    document
      .querySelectorAll(".nw-season")
      .forEach((p) => (p.hidden = p.id !== `nailat-season-${edition}`));
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-nailat-edition]");
    if (b) chooseNailatEdition(b.dataset.nailatEdition);
  });
  document.addEventListener("keydown", (e) => {
    const current = e.target.closest("[data-nailat-edition]");
    if (!current || !["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key))
      return;
    e.preventDefault();
    const tabs = [...document.querySelectorAll("[data-nailat-edition]")];
    const i = tabs.indexOf(current);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? tabs.length - 1
          : (i + (e.key === "ArrowLeft" ? 1 : -1) + tabs.length) % tabs.length;
    chooseNailatEdition(tabs[next].dataset.nailatEdition);
    tabs[next].focus();
  });
  function heritagePage() {
    return `<div class="heritage-home nailat-world">
      <section class="nailat-hero">
        <img class="nw-landscape" src="/brand/caravan-photo.png" width="1078" height="719" fetchpriority="high" alt="منقية النائلات في الصياهد">
        <header class="heritage-nav nw-nav"><a class="nw-brand" href="#heritage" aria-label="النائلات، الصفحة الرئيسية"><img src="/brand/isotype.png" width="58" height="54" alt=""><span><strong>النائلات</strong><small>منقية الوضح</small></span></a><div class="nw-links" role="navigation" aria-label="عن النائلات"><a href="#nailat-story" data-scroll="nailat-story">عن النائلات</a><a href="#nailat-honor" data-scroll="nailat-honor">لحظة التكريم</a><a href="#nailat-achievements" data-scroll="nailat-achievements">سجل الإنجازات</a></div><button class="nw-enter" data-page="overview">دخول الديوان ${icon("arrow", 16)}</button></header>
        <div class="nw-hero-body"><div class="nw-hero-copy"><span class="nw-eyebrow">مهرجان الملك عبدالعزيز للإبل · الصياهد</span><h1>النائلات<span>للأصالة راية.</span></h1><p>نوادر الوضح، وعزيمةٌ تتجدد.<br>إرثٌ أصيل، وإنجازٌ يتجدد في الميدان.</p><a class="nw-scroll" href="#nailat-achievements" data-scroll="nailat-achievements"><b aria-hidden="true">↓</b>اكتشف مسيرة النائلات</a></div>
        </div>
        <div class="nw-hero-foot"><span>منقية الشيخ عبدالله بن عامر النهدي</span><span>أصالة الموروث. ورفعة الحضور.</span></div>
      </section>
      <section class="nw-story" id="nailat-story"><div class="reveal"><span class="nw-section-label">إرث نعتز به</span><h2>في الوضح أصالة.<em>وللنائلات مكانة.</em></h2></div><div class="nw-story-copy reveal"><p>يجمعنا الشغف بالإبل، والاعتزاز بموروثٍ نحمله إلى الأجيال. وفي ميادين مهرجان الملك عبدالعزيز للإبل، تتجدد مسيرة النائلات؛ بعنايةٍ بالمنقية، وعزيمةٍ على المنافسة، وفرحةٍ بكل إنجاز.</p><img src="/brand/signature.png" width="617" height="165" alt="منقية النائلات الوضح" loading="lazy"></div></section>
      <section class="nw-honor" id="nailat-honor"><div class="nw-honor-copy reveal"><img class="nw-watermark" src="/brand/isotype.png" alt="" loading="lazy"><span class="nw-section-label">لحظة التكريم</span><h2>تشريفٌ نعتزّ به.<br><em>وفخرٌ نحمله.</em></h2><p>سمو ولي العهد الأمير محمد بن سلمان يكرّم الشيخ عبدالله بن عامر النهدي، في ختام النسخة 9 من مهرجان الملك عبدالعزيز للإبل.</p><div class="nw-honor-caption">فرحة الإنجاز تكتمل بهذا التشريف.<br><span>قصر اليمامة · الرياض · <bdi>2025</bdi></span></div></div><figure class="nw-honor-photo"><img src="/brand/honoring.jpg" width="1280" height="1127" alt="سمو ولي العهد الأمير محمد بن سلمان يسلم راية التكريم للشيخ عبدالله بن عامر النهدي" loading="lazy"></figure></section>
      <section class="nw-archive" id="nailat-achievements"><div class="nw-archive-head reveal"><div><span class="nw-section-label">محطات الحضور</span><h2>بيارقٌ ترتفع.<br><em>ومسيرةٌ تُروى.</em></h2></div><p>تصفّح المواسم، واكتشف نتائج النائلات في أشواط الجمل والفرديات.</p></div>
        <div class="nw-year-tabs" role="tablist" aria-label="مواسم النائلات">${[
          ...nailatAwards,
        ]
          .reverse()
          .map(
            (y) =>
              `<button id="nailat-tab-${y.edition}" role="tab" aria-controls="nailat-season-${y.edition}" aria-selected="${y.edition === nailatEdition}" tabindex="${y.edition === nailatEdition ? 0 : -1}" data-nailat-edition="${y.edition}"><strong dir="ltr">${y.season}</strong><small>النسخة ${y.edition}</small></button>`,
          )
          .join("")}</div>
        ${[...nailatAwards].reverse().map(nailatSeasonPanel).join("")}
        <div class="nw-archive-note"><span>مهرجان الملك عبدالعزيز للإبل</span><span>منقية النائلات · لون الوضح</span></div>
      </section>
      <section class="nw-photo-essay nw-field-presence nw-panorama"><figure><img src="/brand/white-camel-closeup.png" width="1375" height="778" alt="لقطة قريبة للوضح بخلفية صافية، من الهوية البصرية للنائلات" loading="lazy"></figure><div class="nw-panorama-caption"><span>شغفٌ يُورث. وعنايةٌ تُثمر.</span><h2>قريبون من إرثنا.<br>ماضون بعزيمتنا.</h2></div></section>
      <section class="nw-diwan" id="diwan-entry"><span class="nw-section-label">ديوان النائلات</span><h2>جهودٌ تتكامل. وإنجازٌ يتحقق.</h2><p>هنا تجتمع جهود فريق النائلات، وتنتظم أعمال اللجان، وتكتمل تفاصيل المشاركة.</p><div class="nw-diwan-actions"><button class="nw-enter" data-page="overview">دخول الديوان ${icon("arrow", 16)}</button><button class="nw-outline" data-action="join-dيوان">طلب الانضمام</button></div></section>
      <footer class="nw-footer"><img src="/brand/signature.png" width="617" height="165" alt="منقية النائلات الوضح" loading="lazy"><div class="nw-footer-social"><span>تابع النائلات</span><a href="https://x.com/alnailat" target="_blank" rel="noopener noreferrer" aria-label="حساب النائلات على منصة X"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 3 16 18h-4L0 3h4ZM20 3 4 21" transform="translate(2 0) scale(.85 1)"/></svg><bdi>@alnailat</bdi></a></div><a href="#heritage" data-scroll="main">العودة للأعلى ↑</a></footer>
    </div>`;
  }
  function render(animate = true) {
    if (!S) return;
    document.body.classList.toggle("landing-mode", page === "heritage");
    $("#crumb").textContent = labels[page] || labels.overview;
    if (page !== "heritage" && !DiwanViews.visible(S, page)) {
      page = "overview";
      location.hash = page;
    }
    const views = {
      overview: () => DiwanViews.overview(workspaceContext()),
      services: () => DiwanViews.services(workspaceContext()),
      decisions: () => DiwanViews.decisions(workspaceContext()),
      calendar: () => DiwanViews.calendar(workspaceContext()),
      field: () => DiwanViews.field(workspaceContext()),
      reports: () => DiwanViews.reports(workspaceContext()),
      projects: projectsPage,
      committees: committeesPage,
      tasks: tasksPage,
      expenses: expensesPage,
      advances: advancesPage,
      suppliers: suppliersPage,
      media: mediaPage,
      assets: assetsPage,
      documents: documentsPage,
      users: membersPage,
      audit: auditPage,
      heritage: heritagePage,
      settings: settingsPage,
    };
    views.profile = () => DiwanViews.profile(workspaceContext());
    $("#main").dataset.animate = String(animate);
    $("#main").innerHTML = (views[page] || views.overview)();
    if (animate) window.DiwanMotion?.enter($("#main"));
    if (page === "heritage") initHeritageMotion();

    if (
      page === "overview" &&
      can("users", "manage") &&
      S.projects.some((p) =>
        S.committees.some(
          (c) =>
            c.project_id === p.id &&
            (!c.manager_id ||
              !c.config?.second_approver_id ||
              !c.config?.budgetLines?.length),
        ),
      )
    )
      $("#main").insertAdjacentHTML(
        "afterbegin",
        '<div class="setup-notice"><strong>أكمل ربط الاعتمادات</strong><span>من صلاحيات الأعضاء امنح حق الاعتماد، ثم حدد مدير اللجنة والمعتمد الثاني وبنود الصرف من إعدادات اللجنة.</span><button class="button compact" data-page="projects">المشاريع</button><button class="button compact" data-page="committees">اللجان</button></div>',
      );
  }
  const field = (label, content, full = false) => {
    const tag = /<label|<button|<div|<span class="camera-upload"/.test(content)
      ? "div"
      : "label";
    return `<${tag} class="field ${full ? "full" : ""}"><span>${label}</span>${content}</${tag}>`;
  };
  const input = (name, value = "", type = "text", extra = "") =>
    `<input class="input" name="${name}" type="${type}" value="${esc(value)}" ${extra}>`;
  const textarea = (name, value = "", rows = 3, extra = "") =>
    `<textarea class="input" name="${name}" rows="${rows}" ${extra}>${esc(value)}</textarea>`;
  const select = (name, options, value = "", extra = "") =>
    `<select class="input" name="${name}" ${extra}>${options.map(([id, label]) => `<option value="${esc(id)}" ${String(id) === String(value) ? "selected" : ""}>${esc(label)}</option>`).join("")}</select>`;
  const multi = (name, options, values = []) =>
    options.length
      ? `<div class="choice-list" data-choice-group="${name}">${options.map(([id, label]) => `<label class="checkbox-line"><input type="checkbox" name="${name}" value="${esc(id)}" ${values.includes(id) ? "checked" : ""}> ${esc(label)}</label>`).join("")}</div>`
      : `<div class="muted" data-choice-group="${name}">لا توجد خيارات بعد.</div>`;
  const uploadField = (camera = false) =>
    field(
      "المرفقات",
      `<div class="upload-zone">${icon("file", 24)}<strong>أرفق ملفات أو صورًا</strong><span>PDF، صور، مستندات، أو صوت · حتى 10 م.ب للملف</span><input type="file" name="attachments" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.txt,audio/*"><div class="selected-files"></div></div>${camera ? '<span class="camera-upload">أو صوّر الفاتورة بالجوال<input type="file" name="attachments" accept="image/*" capture="environment"></span>' : ""}`,
      true,
    );
  const actions = (label = "حفظ", extra = "") =>
    `<div class="form-error full" role="alert" hidden></div><div class="form-actions full">${extra}<button class="button button-ghost" type="button" data-action="close-modal">إلغاء</button><button class="button button-dark" type="submit">${icon("check", 16)}${label}</button></div>`;
  function modal(title, html, onSubmit, wide = false) {
    const d = $("#modal");
    $("#modalTitle").textContent = title;
    $("#modalEyebrow").textContent = "ديوان النائلات";
    $("#modalBody").innerHTML = html;
    d.style.maxWidth = wide ? "1050px" : "760px";
    d.style.width = wide
      ? "min(1050px, calc(100vw - 32px))"
      : "min(760px, calc(100vw - 32px))";
    if (!d.open) d.showModal();
    const form = $("#modalBody form");
    if (form && onSubmit) {
      form.dataset.requestKey = crypto.randomUUID();
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const button = ev.submitter || form.querySelector("[type=submit]"),
          err = form.querySelector(".form-error");
        if (err) err.hidden = true;
        button.disabled = true;
        try {
          const afterSave = await onSubmit(new FormData(form), form, button);
          if (d.open) d.close();
          await refresh();
          if (typeof afterSave === "function") await afterSave();
        } catch (e) {
          if (err) {
            err.textContent = e.message;
            err.hidden = false;
          } else toast(e.message, true);
        } finally {
          button.disabled = false;
        }
      });
    }
    return d;
  }
  function formData(fd) {
    return Object.fromEntries(
      [...fd.entries()].filter(([k]) => k !== "attachments"),
    );
  }
  async function uploadFiles(fd, resource, projectId = "", entity = "") {
    const ids = [];
    for (const file of fd.getAll("attachments")) {
      if (!(file instanceof File) || !file.size) continue;
      const form = new FormData();
      form.set("file", file);
      form.set("resource", resource);
      form.set(
        "purpose",
        fd.get("purpose") ||
          (resource === "expenses" ? "invoice" : "reference"),
      );
      form.set("project", projectId);
      form.set("committee", fd.get("committee_id") || committee || "");
      if (entity) {
        form.set("entity", entity);
        if (fd.get("attach_later")) form.set("attach_later", "true");
      }
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const r = await res.json();
      if (!res.ok) throw Error(r.error || "تعذر رفع المرفق");
      ids.push(r.id);
    }
    return ids;
  }
  function projectForm(id) {
    const p = S.projects.find((x) => x.id === id) || {};
    modal(
      p.id ? "تعديل المشروع" : "مشروع جديد",
      `<form class="form-grid">${field("اسم مشروع المشاركة *", input("title", p.title || "", "text", 'required maxlength="200" placeholder="مشاركة مهرجان الملك عبدالعزيز للإبل 2026–2027"'), true)}${field("الوصف والهدف", textarea("description", p.description), true)}${field("الموسم / النسخة — اختياري", input("season", p.season || "", "text", 'placeholder="مثال: موسم 2027"'))}${field(
        "الحالة",
        select(
          "status",
          [
            ["planned", "مخطط"],
            ["active", "نشط"],
            ["onhold", "متوقف"],
            ["closed", "مغلق"],
          ],
          p.status || "active",
        ),
      )}${field("تاريخ البداية", input("start", p.start || "", "date"))}${field("تاريخ النهاية", input("due", p.due || "", "date"))}${p.budget !== undefined || !p.id ? field("الميزانية التقديرية — ر.س", input("budget", (p.budget || 0) / 100, "number", 'min="0" step="0.01"')) : '<p class="form-note full">الميزانية محجوبة حسب صلاحياتك.</p>'}${locationFields(p.meta?.site_location, "موقع الفعالية — اختياري")}${actions(p.id ? "حفظ التعديلات" : "إنشاء المشروع")}</form>`,
      async (fd, f) => {
        const b = formData(fd);
        b.sections = p.meta?.sections || [];
        b.site_location = locationValue(b);
        if (p.id) {
          b.id = p.id;
          b.version = p.version;
        }
        const res = await api("projects/save", b, f.dataset.requestKey);
        project = res.id;
        toast(
          p.id
            ? "تم تحديث المشروع"
            : "مشروع المشاركة جاهز. أضف لجانه ثم مهامه.",
        );
      },
    );
  }
  function cloneProject(id) {
    const p = S.projects.find((x) => x.id === id);
    modal(
      "بدء نسخة جديدة من المشروع",
      `<form class="form-grid"><div class="notice full">ستُنسخ أسماء اللجان واختصاصاتها وأعمدة لوحاتها فقط. تبدأ بلا مهام أو مصاريف أو مرفقات سابقة. تختار مسؤولي وأعضاء السنة الجديدة وصلاحياتهم من جديد.</div>${field("اسم النسخة الجديدة *", input("title", p.title + " — نسخة جديدة", "text", "required"), true)}${field("الموسم", input("season", ""))}${field("البداية الجديدة *", input("start", "", "date", "required"))}${field("النهاية الجديدة *", input("due", "", "date", "required"))}${actions("إنشاء النسخة")}</form>`,
      async (fd, f) => {
        const r = await api(
          "projects/clone",
          { id, ...formData(fd) },
          f.dataset.requestKey,
        );
        project = r.id;
        toast("تم إنشاء نسخة جديدة من المشروع");
      },
    );
  }
  const typeSteps = {
    execution: [
      "مراجعة دليل التنفيذ والمطلوب",
      "إتمام العمل المطلوب",
      "تجهيز ما يثبت الإنجاز",
    ],
    delivery: [
      "تأكيد العدد والمواصفات",
      "فحص التجهيز والاستلام",
      "توثيق نتيجة الاستلام",
    ],
    coordination: [
      "تأكيد الأطراف والموعد",
      "إتمام التنسيق والمتابعة",
      "توثيق النتيجة المتفق عليها",
    ],
    content: [
      "مراجعة المتطلبات والمراجع",
      "تجهيز النسخة المطلوبة",
      "إرفاق النسخة النهائية للمراجعة",
    ],
  };
  const part = (n, title, description, content) =>
    `<section class="form-part full"><header class="part-heading"><span>${n}</span><div><h3>${title}</h3>${description ? `<p>${description}</p>` : ""}</div></header><div class="form-grid">${content}</div></section>`;
  const typedUpload = (
    name,
    label,
    purpose,
    accept = ".pdf,.docx,.xlsx,image/*",
    required = false,
  ) =>
    `<label class="typed-upload"><span>${icon(purpose === "voice" ? "mic" : "file", 22)}<strong>${label}</strong></span><small>${purpose === "voice" ? "ارفع ملفًا صوتيًا أو سجل توجيهك هنا" : "اختر من الجهاز أو اسحب الملفات هنا"}</small><input type="file" name="${name}" accept="${accept}" multiple ${required ? "required" : ""} data-purpose="${purpose}"><output class="upload-names"></output></label>`;
  const rawMeta = (r) =>
    typeof r?.meta === "string" ? JSON.parse(r.meta || "{}") : r?.meta || {};
  // Keep recordings outside form named properties: form.voiceFiles resolves
  // to the <input name="voiceFiles">, not an iterable array of recordings.
  const draftVoiceFiles = new WeakMap();
  async function typedFiles(
    fd,
    name,
    purpose,
    resource,
    pid,
    entity = "",
    form = null,
  ) {
    const f = new FormData();
    for (const x of fd.getAll(name))
      if (x instanceof File && x.size) f.append("attachments", x);
    if (name === "voiceFiles" && form)
      for (const x of draftVoiceFiles.get(form) || []) f.append("attachments", x);
    if (entity) f.set("attach_later", "true");
    f.set("purpose", purpose);
    f.set("committee_id", fd.get("committee_id") || committee || "");
    return uploadFiles(f, resource, pid, entity);
  }
  function bindDraftVoice(form) {
    form
      .querySelector("[data-draft-voice],[data-voice-record]")
      ?.addEventListener("click", async (e) => {
        const button = e.currentTarget;
        if (form.voiceRecorder?.state === "recording") {
          form.voiceRecorder.stop();
          return;
        }
        try {
          if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
            throw Error(
              "يمكنك إرفاق ملف صوتي؛ التسجيل المباشر غير متاح في هذا المتصفح",
            );
          const stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
            }),
            chunks = [],
            rec = new MediaRecorder(stream);
          form.voiceRecorder = rec;
          rec.ondataavailable = (e) => {
            if (e.data.size) chunks.push(e.data);
          };
          rec.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            if (!form.isConnected) return;
            const mime = rec.mimeType.split(";")[0] || "audio/webm",
              file = new File(
                chunks,
                "توجيه-صوتي-" +
                  Date.now() +
                  (mime === "audio/mp4" ? ".m4a" : ".webm"),
                { type: mime },
              );
            draftVoiceFiles.set(form, [
              ...(draftVoiceFiles.get(form) || []),
              file,
            ]);
            button.textContent = "تسجيل توجيه آخر";
            form.querySelector("[data-voice-preview]").innerHTML =
              `<audio controls src="${URL.createObjectURL(file)}"></audio><small>سيُحفظ التسجيل مع المهمة</small>`;
          };
          rec.start();
          button.textContent = "إيقاف التسجيل وحفظه مع المهمة";
          (form.closest("dialog") || $("#modal")).addEventListener(
            "close",
            () => {
              if (rec.state === "recording") rec.stop();
              stream.getTracks().forEach((t) => t.stop());
            },
            { once: true },
          );
        } catch (error) {
          toast(error.message, true);
        }
      });
  }
  function taskForm(id, options = {}) {
    let t = structuredClone(
      S.tasks.find((t) => t.id === id) || {
        meta: {},
        priority: "normal",
        status: "todo",
      },
    );
    if (options.prefill)
      t = {
        ...t,
        ...options.prefill,
        meta: { ...t.meta, ...options.prefill.meta },
      };
    const cs = S.committees.filter(
      (c) =>
        expenseCommitteeAccess(c) &&
        can(
          "tasks",
          t.id ? "edit" : "create",
          t.id
            ? t
            : {
                project_id: c.project_id,
                committee_id: c.id,
                created_by: S.user.id,
              },
        ),
    );
    if (!cs.length)
      return toast("أضف لجنة وحدد مديرها وأعضاءها قبل إنشاء المهام", true);
    let cid =
      t.meta.committee_id ||
      options.committee_id ||
      S.tasks.find((x) => x.id === options.parent_id)?.meta.committee_id ||
      committee ||
      cs.find((c) => c.project_id === project)?.id ||
      cs[0].id;
    if (!cs.some((c) => c.id === cid)) cid = cs[0].id;
    const c = cs.find((c) => c.id === cid),
      pid = c.project_id;
    if (options.duplicate) {
      delete t.id;
      delete t.version;
      t.title = (t.title || "") + " — نسخة";
      t.meta.checklist = [];
      t.assignee_id = "";
    }
    const assign = can("tasks", "assign", {
        ...t,
        project_id: pid,
        meta: { ...t.meta, committee_id: cid },
      }),
      people = S.people.filter((p) => c.members.some((m) => m.id === p.id));
    modal(
      t.id ? "تعديل تفاصيل المهمة" : "إسناد مهمة جديدة",
      `<form class="form-grid task-editor">${part(
        "1",
        "التكليف",
        "اللجنة تحدد المنفذين ومدير اعتماد الإنجاز.",
        `${field(
          "اللجنة والمشروع",
          select(
            "committee_id",
            cs.map((c) => [c.id, projectName(c.project_id) + " / " + c.name]),
            cid,
            t.id ? "disabled" : "required",
          ),
          true,
        )}${field("عنوان المهمة *", input("title", t.title || "", "text", 'required maxlength="250" placeholder="مثال: تجهيز ضيافة اليوم الأول"'), true)}${field(
          "نوع المهمة",
          select(
            "task_type",
            (S.settings.taskTypes || []).map((t) => [t.id, t.name]),
            t.meta.type || "execution",
            t.id ? "disabled" : "",
          ),
        )}${field("المنفذ المسؤول *", select("assignee_id", [["", "اختر عضوًا من اللجنة"], ...people.map((p) => [p.id, p.name])], t.assignee_id || "", assign ? "required" : "disabled"))}${field("مدير اعتماد الإنجاز", input("manager_display", c.manager_id ? person(c.manager_id) : "لم يُعين مدير اللجنة", "text", "disabled"))}${field(
          "الأولوية",
          select(
            "priority",
            S.settings.priorities.map((p) => [p.id, p.name]),
            t.priority,
          ),
        )}${field("البدء", input("start", t.start || "", "date"))}${field("موعد التسليم *", input("due", t.due || "", "date", "required"))}${field(
          "المشاركون",
          multi(
            "collaborators",
            people
              .filter((p) => p.id !== t.assignee_id)
              .map((p) => [p.id, p.name]),
            t.meta.collaborators || [],
          ),
          true,
        )}`,
      )}${part("2", "طريقة التنفيذ والمرفقات", "كل نوع مرفق يظهر في مكانه داخل المهمة.", `${(S.settings.customFields || []).map((x) => field(esc(x.name) + (x.required ? " *" : ""), x.type === "select" ? select("custom_" + x.id, [["", "اختر"], ...(x.options || []).map((v) => [v, v])], t.meta.custom?.[x.id] || "", x.required ? "required" : "") : input("custom_" + x.id, t.meta.custom?.[x.id] || "", x.type === "number" ? "number" : x.type === "date" ? "date" : "text", x.required ? "required" : ""))).join("")}${field("المطلوب وتعليمات التنفيذ *", textarea("description", t.description || "", 4, 'required placeholder="حدد المطلوب والكمية والمكان والتوقيت"'), true)}${field("معيار قبول الإنجاز *", textarea("outcome", t.meta.outcome || "", 2, 'required placeholder="ما النتيجة التي سيراجعها مدير اللجنة؟"'), true)}<div class="full template-preview"><strong>خطوات التنفيذ المعتمدة</strong><ol data-step-preview>${(t.id ? (t.meta.checklist || []).map((x) => x.text) : typeSteps[t.meta.type || "execution"]).map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div><div class="upload-grid full">${typedUpload("guideFiles", "دليل تنفيذ المهمة", "guide")}${typedUpload("referenceFiles", "مراجع ومواصفات", "reference")}</div><div class="voice-field full">${typedUpload("voiceFiles", "التوجيه الصوتي", "voice", "audio/*")}<button type="button" class="button" data-draft-voice>${icon("mic")} تسجيل توجيه صوتي</button><div data-voice-preview></div></div>`)}${part(
        "3",
        "الربط ومراجعة الإسناد",
        "تبدأ المهمة بانتظار البدء، ويراجع مدير اللجنة إنجازها.",
        `${field(
          "وسوم معتمدة",
          multi(
            "tags",
            (c.config?.tags || []).map((x) => [x, x]),
            t.meta.tags || [],
          ),
          true,
        )}${field(
          "مهام يجب إكمالها أولًا",
          multi(
            "dependencies",
            S.tasks
              .filter((x) => x.project_id === pid && x.id !== t.id)
              .map((x) => [x.id, x.title]),
            t.meta.dependencies || [],
          ),
          true,
        )}<div class="flow-ribbon full"><span>إسناد</span><span>تنفيذ</span><span>مدير اللجنة يراجع</span><span>إنجاز معتمد</span></div><input type="hidden" name="parent_id" value="${esc(t.parent_id || options.parent_id || "")}">`,
      )}${locationFields(t.meta.site_location)}${actions(t.id ? "حفظ التفاصيل" : "حفظ المهمة وإشعار المنفذ")}</form>`,
      async (fd, f) => {
        if (f.voiceRecorder?.state === "recording")
          throw Error("أوقف التسجيل الصوتي قبل حفظ المهمة");
        if (f.dataset.extractedFile && f.analyzedFile) {
          const cleaned = new FormData();
          for (const [k, v] of fd.entries())
            if (!(
              v instanceof File &&
              v.name === f.analyzedFile.name &&
              v.size === f.analyzedFile.size &&
              v.lastModified === f.analyzedFile.lastModified
            ))
              cleaned.append(k, v);
          fd = cleaned;
        }
        const v = formData(fd),
          sel = S.committees.find(
            (c) => c.id === (t.id ? cid : v.committee_id),
          );
        const files = [];
        for (const [name, purpose] of [
          ["guideFiles", "guide"],
          ["referenceFiles", "reference"],
          ["voiceFiles", "voice"],
        ])
          files.push(
            ...(await typedFiles(
              fd,
              name,
              purpose,
              "tasks",
              sel.project_id,
              t.id || "",
              f,
            )),
          );
        if (options.guide) {
          const blob = await DiwanExports.guidePDF(options.guide, S),
            gf = new FormData();
          gf.set("purpose", "guide");
          gf.set("committee_id", sel.id);
          gf.set(
            "attachments",
            new File([blob], "دليل-" + options.guide.title + ".pdf", {
              type: "application/pdf",
            }),
          );
          files.push(...(await uploadFiles(gf, "tasks", sel.project_id)));
        }
        const body = {
          id: t.id,
          version: t.version,
          project_id: sel.project_id,
          title: v.title,
          description: v.description,
          start: v.start,
          due: v.due,
          priority: v.priority,
          assignee_id: assign ? v.assignee_id : t.assignee_id,
          parent_id: v.parent_id || null,
          meta: {
            ...t.meta,
            site_location: locationValue(v),
            custom: Object.fromEntries(
              (S.settings.customFields || []).map((x) => [
                x.id,
                v["custom_" + x.id] || "",
              ]),
            ),
            committee_id: sel.id,
            type: v.task_type || t.meta.type || "execution",
            outcome: v.outcome,
            tags: fd.getAll("tags"),
            collaborators: assign
              ? fd.getAll("collaborators")
              : t.meta.collaborators || [],
            dependencies: fd.getAll("dependencies"),
            checklist: t.meta.checklist || [],
          },
          files,
        };
        const result = await api("tasks/save", body, f.dataset.requestKey);
        toast("حُفظت المهمة وإشعارها داخل الديوان");
        $("#detail").close();
        setTimeout(
          () => openTask(result.id).catch((e) => toast(e.message, true)),
          100,
        );
      },
      true,
    );
    const f = $("#modalBody form");
    bindDraftVoice(f);
    f.querySelector("[name=task_type]")?.addEventListener("change", (e) => {
      f.querySelector("[data-step-preview]").innerHTML = typeSteps[
        e.target.value
      ]
        .map((x) => `<li>${esc(x)}</li>`)
        .join("");
    });
    f.querySelector("[name=committee_id]")?.addEventListener("change", (e) => {
      const cc = S.committees.find((c) => c.id === e.target.value);
      f.querySelector("[name=manager_display]").value = cc.manager_id
        ? person(cc.manager_id)
        : "لم يُعين مدير اللجنة";
      f.querySelector("[name=assignee_id]").innerHTML =
        '<option value="">اختر عضوًا من اللجنة</option>' +
        S.people
          .filter((p) => cc.members.some((m) => m.id === p.id))
          .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`)
          .join("");
      f.querySelector("[data-choice-group=collaborators]").outerHTML = multi(
        "collaborators",
        S.people
          .filter((p) => cc.members.some((m) => m.id === p.id))
          .map((p) => [p.id, p.name]),
        [],
      );
      f.querySelector("[data-choice-group=tags]").outerHTML = multi(
        "tags",
        (cc.config?.tags || []).map((t) => [t, t]),
        [],
      );
      f.querySelector("[data-choice-group=dependencies]").outerHTML = multi(
        "dependencies",
        S.tasks
          .filter((t) => t.project_id === cc.project_id && t.id !== id)
          .map((t) => [t.id, t.title]),
        [],
      );
    });
  }
  async function saveTaskStatus(t, next) {
    if (next === t.status) return;
    const labels = {
      doing: t.status === "review" ? "إعادة المهمة للتنفيذ" : "بدء التنفيذ",
      blocked: "طلب مساندة",
      review: "رفع الإنجاز لمدير اللجنة",
      done: "اعتماد الإنجاز",
    };
    modal(
      labels[next] || "تحديث المهمة",
      `<form>${field(next === "review" ? "ملخص ما أنجزته ونتيجة التسليم" : "ملاحظتك للعضو أو لمدير اللجنة", textarea("note", "", 3, ["review", "blocked"].includes(next) || (t.status === "review" && next === "doing") ? "required" : ""), true)}${next === "review" ? typedUpload("proofFiles", "إثباتات الإنجاز", "proof") : ""}${actions(labels[next] || "تأكيد")}</form>`,
      async (fd, f) => {
        const files =
          next === "review"
            ? await typedFiles(
                fd,
                "proofFiles",
                "proof",
                "tasks",
                t.project_id,
                t.id,
              )
            : [];
        await api(
          "tasks/transition",
          {
            id: t.id,
            version: t.version,
            status: next,
            note: fd.get("note"),
            files,
          },
          f.dataset.requestKey,
        );
        $("#detail").close();
        toast("حُدثت المرحلة وأُشعر المسؤول التالي");
      },
    );
  }
  const fileList = (files) =>
    files.length
      ? files
          .map(
            (f) =>
              `<div class="attachment">${icon(f.mime?.startsWith("audio") ? "mic" : "file", 20)}<div><a href="/api/files/${f.id}">${esc(f.name)}</a><span class="pill">${esc(S.settings.filePurposes?.[rawMeta(f).purpose] || "مرفق")}</span><span class="task-sub">${num(Math.ceil(f.size / 1024))} ك.ب${f.mime?.startsWith("audio") ? `<audio controls preload="none" src="/api/files/${f.id}?inline"></audio>` : ""}</span></div><a class="icon-btn" href="/api/files/${f.id}" aria-label="تنزيل الملف">${icon("download", 16)}</a></div>`,
          )
          .join("")
      : '<p class="muted">لا توجد مرفقات.</p>';
  async function openTask(id) {
    $("#detail").dataset.taskId = id;
    const data = await api("tasks/" + id),
      t = data.task || S.tasks.find((x) => x.id === id),
      edit = can("tasks", "edit", t),
      c = S.committees.find((c) => c.id === t.meta.committee_id),
      isManager = c?.manager_id === S.user.id;
    currentTask = t;
    const possible = {
      todo: ["doing", "blocked"],
      doing: ["blocked", "review"],
      blocked: ["doing", "review"],
      review: isManager ? ["done", "doing"] : [],
      done: isManager ? ["doing"] : [],
    }[t.status] || ["doing"];
    const actionName = {
      doing:
        t.status === "review"
          ? "إعادة للاستكمال"
          : t.status === "done"
            ? "إعادة فتح المهمة"
            : "بدء / استئناف التنفيذ",
      blocked: "طلب مساندة",
      review: "رفع الإنجاز لمدير اللجنة",
      done: "اعتماد الإنجاز",
    };
    const group = (purpose, title) =>
      `<section class="attachment-group"><h4>${title}</h4>${fileList(data.files.filter((f) => rawMeta(f).purpose === purpose))}</section>`;
    $("#detailBody").innerHTML =
      `<div class="detail-top"><div class="eyebrow">${esc(projectName(t.project_id))} / ${esc(c?.name || "تحتاج ربطًا بلجنة")}</div><h1>${esc(t.title)}</h1><div class="page-actions">${statusPill(t)}${priorityPill(t)}${edit && !["review", "done"].includes(t.status) ? btn("تعديل التفاصيل", "task-edit", id, "button-ghost compact", "edit") : ""}</div></div><div class="flow-ribbon">${S.settings.taskStatuses.map((s) => `<span class="${s.id === t.status ? "current" : ""}">${esc(s.name)}</span>`).join("")}</div><div class="detail-meta"><span>المسؤول عن التنفيذ</span><strong>${esc(person(t.assignee_id))}</strong><span>اعتماد الإنجاز</span><strong>${esc(person(c?.manager_id))}</strong><span>البداية / الاستحقاق</span><strong>${date(t.start)} / ${date(t.due)}</strong><span>المشاركون</span><strong>${(t.meta.collaborators || []).map(person).map(esc).join("، ") || "—"}</strong></div>${locationView(t.meta.site_location, "موقع تنفيذ المهمة") || locationView(S.projects.find((p) => p.id === t.project_id)?.meta?.site_location, "موقع الفعالية")}${requestFlow(t)}<section class="detail-section"><h3>المطلوب وطريقة التنفيذ</h3><div class="detail-description">${esc(t.description)}</div><div class="notice"><strong>معيار قبول الإنجاز:</strong> ${esc(t.meta.outcome || "يحدده مدير اللجنة في تفاصيل المهمة")}</div></section><section class="detail-section"><h3>خطوات التنفيذ · ${num((t.meta.checklist || []).filter((x) => x.done).length)} / ${num(t.meta.checklist?.length || 0)}</h3>${(t.meta.checklist || []).map((x) => `<label class="checklist-row ${x.done ? "done" : ""}"><input type="checkbox" data-check-item="${x.id}" ${x.done ? "checked" : ""} ${edit && !["review", "done"].includes(t.status) ? "" : "disabled"}><span>${esc(x.text)}</span></label>`).join("")}</section><section class="detail-section"><div class="panel-header"><h3>ملف المهمة</h3>${edit ? btn("إرفاق مصنف", "task-upload", id, "button-ghost compact", "plus") : ""}</div>${group("guide", "دليل تنفيذ المهمة")}${group("reference", "مستندات وصور مرجعية")}${group("voice", "التوجيهات الصوتية")}${group("proof", "إثباتات الإنجاز")}${data.files.some((f) => !rawMeta(f).purpose) ? `<h4>مرفقات سابقة</h4>${fileList(data.files.filter((f) => !rawMeta(f).purpose))}` : ""}${(data.guides || []).map((g) => `<div class="attachment">${icon("documents")}<strong>${esc(g.title)}</strong>${btn("تنزيل PDF", "guide-download", g.id, "button-ghost compact", "download")}</div>`).join("")}${mayCreate("assistant") ? btn("إعداد دليل مع سَنَد", "task-guide", id, "button-ghost compact", "assistant") : ""}</section>${t.meta.completion_note ? `<div class="notice"><strong>ملخص الإنجاز المرفوع:</strong> ${esc(t.meta.completion_note)}</div>` : ""}<div class="task-flow-actions">${edit && !t.meta.request ? possible.map((s) => `<button class="button ${s === "done" || s === "review" ? "button-dark" : ""}" data-action="task-transition" data-id="${id}" data-next="${s}">${actionName[s]}</button>`).join("") : ""}</div><section class="detail-section"><div class="panel-header"><h3>المهام الفرعية</h3>${mayCreate("tasks") ? btn("مهمة فرعية", "task-sub", id, "button-ghost compact", "plus") : ""}</div>${
        S.tasks
          .filter((x) => x.parent_id === id)
          .map(
            (x) =>
              `<button class="subtask-row" data-action="task" data-id="${x.id}">${esc(x.title)}${statusPill(x)}</button>`,
          )
          .join("") || '<p class="muted">لا توجد مهام فرعية.</p>'
      }</section><section class="detail-section task-conversation"><h3>محادثة المهمة</h3><p class="muted">الأسئلة والتوضيحات والردود محفوظة هنا مع مرفقاتها.</p>${
        data.comments
          .map((comment) => {
            const m = rawMeta(comment),
              reply = data.comments.find((x) => x.id === m.reply_to);
            return `<article class="comment" id="comment-${comment.id}"><div class="comment-head"><strong>${esc(person(comment.created_by))}</strong><small>${new Date(comment.created).toLocaleString("ar-SA-u-ca-gregory-nu-latn")}</small></div>${reply ? `<blockquote>${esc(person(reply.created_by))}: ${esc(reply.body.slice(0, 150) || "مرفق")}</blockquote>` : ""}<div class="detail-description">${esc(comment.body)}</div>${fileList(data.files.filter((f) => m.files?.includes(f.id)))}${edit ? `<button class="text-link" data-action="comment-reply" data-id="${comment.id}">رد على الرسالة</button>` : ""}</article>`;
          })
          .join("") || '<p class="muted">لا توجد رسائل حتى الآن.</p>'
      }${
        edit
          ? `<form id="commentForm" class="comment-form"><div class="notice" id="replyHint" hidden></div><input name="reply_to" type="hidden">${textarea("body", "", 3, 'placeholder="اكتب سؤالك أو وضّح ما تحتاجه…"')}<details><summary>إشعار عضو محدد وإضافة مرفقات</summary>${multi(
              "mentions",
              S.people
                .filter((p) => c?.members.some((m) => m.id === p.id))
                .map((p) => [p.id, "@ " + p.name]),
            )}${typedUpload("commentFiles", "صورة أو مستند للمحادثة", "comment", ".pdf,image/*,.docx,.xlsx")}${typedUpload("voiceFiles", "رسالة صوتية", "comment", "audio/*")}<button type="button" class="button compact" data-voice-record>${icon("mic")} تسجيل رد صوتي</button><div data-voice-preview></div></details><p class="form-note">يُشعر المعنيون داخل الديوان. إشعار واتساب بانتظار تفعيل الربط.</p><button class="button button-dark" type="submit">إرسال الرسالة</button></form>`
          : ""
      }</section><details class="detail-section"><summary>تسلسل الإنجاز</summary>${(t.meta.flowHistory || []).map((h) => `<div class="activity">${esc(person(h.by))} · ${esc(status(h.to, t).name)}<small>${esc(h.note || "")}</small></div>`).join("") || '<p class="muted">لم تتغير مرحلة المهمة بعد.</p>'}</details>`;
    if (!$("#detail").open) $("#detail").showModal();
    const f = $("#commentForm");
    if (f) {
      bindDraftVoice(f);
      f.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const button = f.querySelector("[type=submit]");
        button.disabled = true;
        try {
          const fd = new FormData(f);
          fd.set("committee_id", c?.id || "");
          const files = [
            ...(await typedFiles(
              fd,
              "commentFiles",
              "comment",
              "tasks",
              t.project_id,
              t.id,
            )),
            ...(await typedFiles(
              fd,
              "voiceFiles",
              "comment",
              "tasks",
              t.project_id,
              t.id,
              f,
            )),
          ];
          await api("tasks/comment", {
            id,
            body: fd.get("body"),
            reply_to: fd.get("reply_to"),
            mentions: fd.getAll("mentions"),
            files,
          });
          await refresh(false);
          await openTask(id);
        } catch (e) {
          toast(e.message, true);
          button.disabled = false;
        }
      });
    }
  }
  function supplierDetail(id) {
    const s = S.suppliers.find((r) => r.id === id);
    if (!s) return toast("ملف المورد غير متاح", true);
    if (s.meta?.media_profile) return mediaDetail(id);
    modal(
      "ملف المورد",
      `<div class="summary-banner"><div><h2>${esc(s.name)}</h2><p>${esc(s.category || "شريك المشاركة")}</p></div>${icon("suppliers", 30)}</div><div class="detail-meta"><span>مسؤول التواصل</span><strong>${esc(s.meta?.contact_name || "لم يحدد")}</strong><span>الجوال</span><strong dir="ltr">${esc(s.phone || "—")}</strong><span>البريد</span><strong data-verbatim>${esc(s.email || "—")}</strong><span>المدينة</span><strong>${esc(s.meta?.city || "—")}</strong></div>${locationView(s.meta?.site_location)}<p class="detail-description">${esc(s.notes || "")}</p><section class="detail-section"><h3>مرفقات المورد</h3>${fileList(S.files.filter((f) => f.entity_type === "suppliers" && f.entity_id === id))}</section>${can("suppliers", "edit", s) ? btn("تعديل ملف المورد", "supplier-edit", id, "button-dark", "edit") : ""}`,
      null,
      true,
    );
  }
  function guideDetail(id) {
    const g = S.guides.find((r) => r.id === id);
    if (!g) return toast("الدليل غير متاح", true);
    const task = S.tasks.find((t) => t.id === g.task_id);
    const download =
      can("documents", "export", g) || (task && can("tasks", "export", task));
    modal(
      "دليل التنفيذ",
      `<div class="summary-banner"><h2>${esc(g.title)}</h2><span class="pill">مسودة للمراجعة</span></div>${(g.content?.sections || []).map((s) => `<section class="detail-section"><h3>${esc(s.title)}</h3><p class="detail-description">${esc(s.body)}</p></section>`).join("")}${download ? btn("تنزيل PDF", "guide-download", id, "button-ghost", "download") : ""}`,
      null,
      true,
    );
  }
  function supplierForm(id) {
    const s = S.suppliers.find((x) => x.id === id) || { meta: {} },
      m = s.meta || {};
    if (m.media_profile) return mediaDetail(s.id);
    if (s.id && !can("suppliers", "edit", s))
      return modal(
        s.name,
        `<div class="detail-meta"><span>التخصص</span><strong>${esc(s.category)}</strong><span>جهة الاتصال</span><strong>${esc(m.contact_name || "—")}</strong><span>الهاتف</span><strong dir="ltr">${esc(s.phone || "—")}</strong><span>المدينة</span><strong>${esc(m.city || "—")}</strong></div><p>${esc(s.notes)}</p>${locationView(m.site_location)}`,
      );
    modal(
      s.id ? "ملف المورد" : "إضافة مورد",
      `<form class="form-grid">${part(
        "1",
        "بيانات التعامل",
        "سجل موحد يمكن ربطه بالمصاريف والأصول المستأجرة.",
        `${field("اسم المورد *", input("name", s.name || "", "text", "required"), true)}${field(
          "نوع الجهة",
          select(
            "entity_type",
            [
              ["business", "مؤسسة / شركة"],
              ["individual", "فرد"],
            ],
            m.entity_type || "business",
          ),
        )}${field(
          "التخصص *",
          select(
            "category",
            [
              "الخيام والكرفانات",
              "الضيافة والتموين",
              "النقل",
              "التجهيزات والصيانة",
              "الإعلام والطباعة",
              "الخدمات الميدانية",
              "خدمات أخرى",
            ].map((x) => [x, x]),
            s.category || "الخيام والكرفانات",
            "required",
          ),
        )}${field("مسؤول التواصل", input("contact_name", m.contact_name || ""))}${field("الجوال", input("phone", s.phone || "", "tel", 'dir="ltr" placeholder="+9665XXXXXXXX"'))}${field("البريد", input("email", s.email || "", "email", 'dir="ltr"'))}${field("المدينة", input("city", m.city || ""))}${field("العنوان", textarea("address", m.address || "", 2), true)}`,
      )}${locationFields(m.site_location, "موقع المورد — اختياري")}${part(
        "2",
        "البيانات النظامية وبيانات السداد",
        "تظهر بيانات الحساب البنكي لمن يملك إدارة ملف المورد فقط.",
        `${field("رقم السجل — إن وجد", input("registration", m.registration || ""))}${field("الرقم الضريبي — إن وجد", input("tax_number", s.tax_number || "", "text", 'inputmode="numeric" maxlength="15"'))}${field("اسم المستفيد البنكي", input("beneficiary", m.beneficiary || ""))}${field("البنك", input("bank_name", m.bank_name || ""))}${field("الآيبان السعودي — اختياري", input("iban", m.iban || "", "text", 'dir="ltr" placeholder="SA…" maxlength="24"'), true)}${field(
          "الحالة",
          select(
            "supplier_status",
            [
              ["active", "متاح للتعامل"],
              ["suspended", "موقوف عن التعامل الجديد"],
            ],
            m.status || "active",
          ),
        )}`,
      )}${part("3", "مستندات المورد والملاحظات", "السجل، شهادة الضريبة أو تعريف الحساب البنكي عند توفرها.", `<div class="full">${typedUpload("supplierFiles", "مستندات المورد", "supplier", ".pdf,image/*")}</div>${s.id ? `<div class="full">${fileList(S.files.filter((f) => f.entity_type === "suppliers" && f.entity_id === s.id))}</div>` : ""}${field("ملاحظات التعامل", textarea("notes", s.notes || "", 3), true)}<div class="notice full">سَنَد: تعبئة ملف المورد من المستند متاحة بعد ربط خدمة التحليل. يمكنك الآن استكمال البيانات والمرفقات يدويًا.</div>`)}${actions("حفظ ملف المورد")}</form>`,
      async (fd, f) => {
        const files = await typedFiles(
          fd,
          "supplierFiles",
          "supplier",
          "suppliers",
          "",
          s.id || "",
        );
        await api(
          "suppliers/save",
          {
            ...formData(fd),
            site_location: locationValue(formData(fd)),
            id: s.id,
            version: s.version,
            files,
          },
          f.dataset.requestKey,
        );
        toast("حُفظ ملف المورد");
      },
      true,
    );
  }
  const fundingNames = {
    personal: "من مالي الخاص",
    advance: "من عهدتي المالية",
    direct: "دفع مباشر من الجهة",
    unpaid: "لم يُدفع بعد",
  };
  const expenseCommittee = (e) =>
    S.committees.find((c) => c.id === e.meta?.committee_id) ||
    e.approval_context;
  const dueReviewer = (e) => {
    const c = expenseCommittee(e),
      p = S.projects.find((p) => p.id === e.project_id);
    return (e.effective_route || [
      c?.manager_id,
      c?.config?.second_approver_id,
    ])[e.effective_approval_index ?? e.meta?.approvalIndex ?? 0];
  };
  const settlementName = (e) =>
    e.status === "draft"
      ? "مسودة"
      : e.status === "returned"
        ? "معاد للاستكمال"
        : e.status === "pending"
          ? e.meta?.approvalIndex === 1
            ? "لدى المعتمد الثاني"
            : "لدى مدير اللجنة"
          : e.paid >= e.amount
            ? e.meta?.funding_source === "advance"
              ? "صُفّي من العهدة"
              : "مسدد بالكامل"
            : e.meta?.funding_source === "personal"
              ? e.paid
                ? "مستحق للعضو · سداد جزئي"
                : "مستحق للعضو"
              : "مستحق للمورد";
  const expenseCommitteeAccess = (c) =>
    can("users", "manage") ||
    c.manager_id === S.user.id ||
    (c.members || []).some((m) => m.id === S.user.id) ||
    can("expenses", "approve", {
      project_id: c.project_id,
      committee_id: c.id,
    }) ||
    can("expenses", "pay", { project_id: c.project_id, committee_id: c.id });
  const expenseTaskAccess = (t, c) =>
    t.meta.committee_id === c.id &&
    (can("users", "manage") ||
      c.manager_id === S.user.id ||
      can("tasks", "assign", t) ||
      t.assignee_id === S.user.id);
  function expenseForm(id, options = {}) {
    const e = structuredClone(
        S.expenses.find((e) => e.id === id) || {
          meta: {},
          status: "draft",
          date: today(),
        },
      ),
      linked = S.tasks.find((t) => t.id === options.task_id);
    const cs = S.committees.filter(
      (c) =>
        expenseCommitteeAccess(c) &&
        can(
          "expenses",
          e.id ? "edit" : "create",
          e.id
            ? e
            : {
                project_id: c.project_id,
                committee_id: c.id,
                created_by: S.user.id,
              },
        ),
    );
    if (!cs.length)
      return toast(
        "لم تُمنح وصول رفع المصاريف إلى لجنة. راجع عضويتك مع الأدمن.",
        true,
      );
    const cid =
        e.meta.committee_id ||
        linked?.meta.committee_id ||
        committee ||
        cs[0].id,
      c = cs.find((c) => c.id === cid) || cs[0],
      pid = c.project_id;
    const claimant = e.meta.claimant_id || S.user.id;
    modal(
      e.id ? "استكمال طلب المصروف" : "رفع مصروف أو مطالبة",
      `<form class="form-grid expense-editor">${part(
        "1",
        "اللجنة وبند الصرف",
        "بند الصرف هو التصنيف المعتمد داخل ميزانية لجنتك، مثل الضيافة أو النقل. ربط المصروف بمهمة اختياري.",
        `${field(
          "لجنة المصروف *",
          select(
            "committee_id",
            cs.map((c) => [c.id, projectName(c.project_id) + " / " + c.name]),
            c.id,
            e.id || cs.length === 1 ? "disabled" : "required",
          ),
          true,
        )}${field("بند الصرف *", select("budget_line_id", [["", "اختر بندًا معتمدًا"], ...(c.config?.budgetLines || []).filter((l) => l.active).map((l) => [l.id, l.name + (l.budget ? " · المخصص " + cash(l.budget) + " ر.س" : "")])], e.meta.budget_line_id || "", "required"))}${field("المهمة المرتبطة — اختياري", select("task_id", [["", "مصروف للجنة دون مهمة محددة"], ...S.tasks.filter((t) => expenseTaskAccess(t, c)).map((t) => [t.id, t.title])], e.meta.task_id || linked?.id || ""))}${field("وصف المصروف *", input("title", e.title || "", "text", 'required placeholder="مثال: وجبات ضيافة اليوم الأول"'), true)}${field("المورد — إن وجد", select("supplier_id", [["", "لا يوجد مورد مسجل"], ...S.suppliers.filter((s) => s.meta?.status !== "suspended").map((s) => [s.id, s.name])], e.supplier_id || ""))}${field("رقم الفاتورة / الإيصال", input("number", e.number || ""))}${field("الإجمالي شامل الضريبة — ر.س *", input("amount", e.amount === undefined ? "" : e.amount / 100, "number", 'required min="0.01" step="0.01"'))}${field("الضريبة ضمن الإجمالي — ر.س", input("tax", (e.tax || 0) / 100, "number", 'min="0" step="0.01"'))}${field("تاريخ الفاتورة أو الدفع *", input("date", e.date, "date", "required"))}`,
      )}${part(
        "2",
        "من أين دُفع المبلغ؟",
        "هذا الاختيار يحدد تصفية العهدة أو المبلغ المستحق لك بعد الاعتمادين.",
        `${field("مصدر الدفع *", select("funding_source", [["personal", "دفعت من مالي الخاص — أطلب تعويضي"], ["advance", "دفعت من عهدتي المالية"], ...(can("expenses", "pay", { project_id: pid, committee_id: c.id }) ? [["direct", "دُفع مباشرة من الجهة"]] : []), ["unpaid", "فاتورة مستحقة لم تُدفع بعد"]], e.meta.funding_source || "personal", "required"), true)}<div class="field full" data-advance-choice>${field("العهدة التي دفعت منها", select("advance_id", [["", "اختر عهدتك"], ...S.advances.filter((a) => a.project_id === pid && a.assignee_id === claimant).map((a) => [a.id, a.title + " · الرصيد " + cash(a.balance) + " ر.س"])], e.meta.advance_id || ""), true)}</div>${field(
          "وسيلة الدفع",
          select(
            "payment_method",
            [
              ["transfer", "تحويل بنكي"],
              ["cash", "نقدًا"],
              ["card", "بطاقة"],
              ["other", "أخرى"],
            ],
            e.meta.payment_method || "transfer",
          ),
        )}${field("مرجع الدفع — إن وجد", input("payment_reference", e.meta.payment_reference || ""))}<div class="notice full" data-source-note></div>`,
      )}${part("3", "الإثبات والاعتماد", "أرفق صورة أو PDF من جهازك، أو استخدم الكاميرا. لا يختار مقدم الطلب المعتمدين.", `<div class="upload-grid full">${typedUpload("invoiceFiles", "الفاتورة", "invoice", ".pdf,image/*")}${typedUpload("receiptFiles", "إيصال الدفع أو إثباته", "receipt", ".pdf,image/*")}</div><label class="button button-ghost full">${icon("calendar")} تصوير الفاتورة بالكاميرا<input type="file" name="cameraInvoice" accept="image/*" capture="environment" class="camera-input"></label>${e.id ? `<div class="full">${fileList(S.files.filter((f) => f.entity_type === "expenses" && f.entity_id === e.id))}</div>` : ""}<button type="button" class="button full" data-action="invoice-analyze">قراءة الفاتورة مع سَنَد</button><div id="extractionResult" class="notice full" hidden></div>${field("ملاحظات توضح المصروف", textarea("notes", e.meta.notes || "", 2), true)}<div class="approval-route full" data-approval-preview></div><input type="hidden" name="claimant_id" value="${claimant}"><input type="hidden" name="status" value="pending">`)}${actions("إرسال للاعتماد الأول", '<button type="submit" value="draft" class="button button-ghost">حفظ مسودة</button>')}</form>`,
      async (fd, f, button) => {
        if (f.dataset.extractedFile && f.analyzedFile) {
          const cleaned = new FormData();
          for (const [k, v] of fd.entries())
            if (!(
              v instanceof File &&
              v.name === f.analyzedFile.name &&
              v.size === f.analyzedFile.size &&
              v.lastModified === f.analyzedFile.lastModified
            ))
              cleaned.append(k, v);
          fd = cleaned;
        }
        const v = formData(fd),
          sel = S.committees.find(
            (item) =>
              item.id === (e.id ? e.meta.committee_id : v.committee_id || c.id),
          );
        const files = [
          ...(f.dataset.extractedFile ? [f.dataset.extractedFile] : []),
          ...(await typedFiles(
            fd,
            "invoiceFiles",
            "invoice",
            "expenses",
            sel.project_id,
            e.id || "",
          )),
          ...(await typedFiles(
            fd,
            "receiptFiles",
            "receipt",
            "expenses",
            sel.project_id,
            e.id || "",
          )),
          ...(await typedFiles(
            fd,
            "cameraInvoice",
            "invoice",
            "expenses",
            sel.project_id,
            e.id || "",
          )),
        ];
        await api(
          "expenses/save",
          {
            ...v,
            id: e.id,
            version: e.version,
            committee_id: sel.id,
            project_id: sel.project_id,
            status: button.value === "draft" ? "draft" : "pending",
            files,
          },
          f.dataset.requestKey,
        );
        toast(
          button.value === "draft"
            ? "حُفظت المسودة"
            : "أُرسل المصروف للاعتماد الأول",
        );
      },
      true,
    );
    const f = $("#modalBody form");
    const update = () => {
      const cc = S.committees.find(
          (c) =>
            c.id ===
            (e.id
              ? e.meta.committee_id
              : f.committee_id?.value ||
                f.querySelector("[name=committee_id]").value),
        ),
        source = f.querySelector("[name=funding_source]").value;
      f.querySelector("[data-advance-choice]").hidden = source !== "advance";
      f.querySelector("[name=advance_id]").required = source === "advance";
      f.querySelector("[data-source-note]").textContent = {
        personal:
          "بعد الاعتمادين يظهر المبلغ مستحقًا لك، ويظل قائمًا حتى تسجيل السداد وإرفاق إيصال التحويل.",
        advance:
          "لا نخصم عند الرفع. يُخصم المبلغ تلقائيًا من عهدتك بعد اعتماد مدير اللجنة والمعتمد الثاني.",
        direct:
          "يُثبت المصروف كمدفوع بعد الاعتمادين ومراجعة الإثبات؛ لا يُخصم من عهدة عضو.",
        unpaid:
          "يظهر المبلغ مستحقًا للمورد بعد الاعتمادين حتى تسجيل السداد وإرفاق إيصال الدفع.",
      }[source];
      const conflicted = new Set([claimant, e.created_by || S.user.id]);
      const route = [cc.manager_id, cc.config?.second_approver_id].map(
        (reviewer) => ({
          delegated: reviewer && conflicted.has(reviewer),
          id: conflicted.has(reviewer)
            ? cc.config?.review_delegate_id
            : reviewer,
        }),
      );
      f.querySelector("[data-approval-preview]").innerHTML = route
        .map(
          (step, i) =>
            `<span>${i + 1} · ${i ? "الاعتماد الثاني" : "الاعتماد الأول"}${step.delegated ? " · البديل الإداري" : ""}<strong>${step.id ? esc(person(step.id)) : "يلزم تعيين معتمد من إعدادات اللجنة"}</strong></span>`,
        )
        .join("");
    };
    update();
    f.querySelector("[name=funding_source]").onchange = update;
    f.querySelector("[name=committee_id]").onchange = () => {
      const cc = S.committees.find(
        (c) => c.id === f.querySelector("[name=committee_id]").value,
      );
      f.querySelector("[name=budget_line_id]").innerHTML =
        '<option value="">اختر بندًا معتمدًا</option>' +
        (cc.config?.budgetLines || [])
          .filter((l) => l.active)
          .map((l) => `<option value="${l.id}">${esc(l.name)}</option>`)
          .join("");
      f.querySelector("[name=task_id]").innerHTML =
        '<option value="">دون ربط بمهمة</option>' +
        S.tasks
          .filter((t) => expenseTaskAccess(t, cc))
          .map((t) => `<option value="${t.id}">${esc(t.title)}</option>`)
          .join("");
      f.querySelector("[name=advance_id]").innerHTML =
        '<option value="">اختر عهدتك</option>' +
        S.advances
          .filter(
            (a) => a.project_id === cc.project_id && a.assignee_id === claimant,
          )
          .map(
            (a) =>
              `<option value="${a.id}">${esc(a.title)} · ${cash(a.balance)} ر.س</option>`,
          )
          .join("");
      update();
    };
  }
  function expenseDetail(id) {
    const e = S.expenses.find((x) => x.id === id),
      payments = S.payments.filter((p) => p.expense_id === id),
      files = S.files.filter(
        (f) => f.entity_type === "expenses" && f.entity_id === id,
      ),
      c = expenseCommittee(e),
      p = S.projects.find((p) => p.id === e.project_id),
      route = e.effective_route || [
        c?.manager_id,
        c?.config?.second_approver_id,
      ],
      reviewer = dueReviewer(e),
      canReview =
        e.status === "pending" &&
        reviewer === S.user.id &&
        ![e.created_by, e.meta?.claimant_id].includes(S.user.id) &&
        can("expenses", "approve", e);
    modal(
      "ملف المصروف",
      `<div class="summary-banner"><div><h2>${esc(e.title)}</h2><p>${esc(e.project_title || projectName(e.project_id))} / ${esc(c?.name || "يحتاج ربطًا بلجنة")}</p><span class="pill">${esc(settlementName(e))}</span></div><strong class="asset-quantity">${cash(e.amount)} <small>ر.س</small></strong></div><div class="detail-meta"><span>بند الصرف</span><strong>${esc(e.meta.budget_line_name || e.category || "—")}</strong><span>صاحب المصروف</span><strong>${esc(person(e.meta.claimant_id || e.created_by))}</strong><span>مصدر الدفع</span><strong>${esc(fundingNames[e.meta.funding_source] || "سجل سابق يحتاج مراجعة")}</strong><span>العهدة المرتبطة</span><strong>${esc(S.advances.find((a) => a.id === e.meta.advance_id)?.title || "لا توجد")}</strong><span>المهمة — اختياري</span><strong>${esc(S.tasks.find((t) => t.id === e.meta.task_id)?.title || "مصروف على اللجنة دون مهمة")}</strong><span>المورد</span><strong>${esc(S.suppliers.find((s) => s.id === e.supplier_id)?.name || "—")}</strong><span>رقم الإثبات / تاريخه</span><strong>${esc(e.number || "—")} / ${date(e.date)}</strong><span>الضريبة ضمن الإجمالي</span><strong>${cash(e.tax)}</strong><span>المسدد / المتبقي</span><strong>${cash(e.paid)} / ${e.amount_hidden ? "محجوب" : cash(e.amount - e.paid)}</strong></div><div class="approval-route">${route.map((member, i) => `<span class="${reviewer === member && e.status === "pending" ? "current" : ""}">${i + 1} · ${i ? "المعتمد الثاني" : "مدير اللجنة"}<strong>${member ? esc(person(member)) : "لم يُعيّن"}</strong><small>${(e.meta.approvals || []).some((a) => a.member_id === member && a.decision === "approve") ? "اعتمد" : "لم يعتمد بعد"}</small></span>`).join("")}</div>${e.meta.notes ? `<p class="detail-description">${esc(e.meta.notes)}</p>` : ""}<section class="detail-section"><h3>الفاتورة وإثباتات الدفع والسداد</h3>${fileList(files)}</section><section class="detail-section"><h3>سجل القرارات</h3>${(e.meta.approvals || []).map((a) => `<div class="activity"><strong>${esc(person(a.member_id))}</strong> · ${a.decision === "approve" ? "اعتمد المصروف" : "أعاده للاستكمال"} · ${date(a.at || a.date)}<p>${esc(a.note || a.reason || "")}</p></div>`).join("") || '<p class="muted">لم يصدر قرار بعد.</p>'}</section><section class="detail-section"><h3>السداد والتصفية</h3>${
        payments.length
          ? table(
              ["التاريخ", "المبلغ — ر.س", "المرجع"],
              payments.map(
                (p) =>
                  `<tr><td>${date(p.date)}</td><td>${cash(p.amount)}</td><td>${esc(p.reference)}</td></tr>`,
              ),
            )
          : '<p class="muted">لا توجد دفعة أو تصفية مسجلة.</p>'
      }</section><div class="form-actions">${can("expenses", "edit", e) && (["draft", "returned"].includes(e.status) || (e.status === "pending" && !e.meta.funding_source && can("users", "manage"))) ? btn("استكمال المصروف", "expense-edit", id, "", "edit") : ""}${canReview ? btn("إعادة للاستكمال", "expense-return", id, "button-ghost", "arrow") + btn((e.effective_approval_index ?? e.meta.approvalIndex) === 1 ? "الاعتماد النهائي والتسوية" : "الاعتماد الأول", "expense-approve", id, "button-dark", "check") : ""}${can("expenses", "pay", e) && e.status === "approved" && !e.amount_hidden && e.paid < e.amount ? btn("تسجيل السداد وإرفاق الإيصال", "expense-pay", id, "button-dark", "plus") : ""}</div>`,
      null,
      true,
    );
  }
  function reviewExpense(id, approve) {
    const e = S.expenses.find((x) => x.id === id);
    modal(
      approve ? "اعتماد المصروف" : "إعادة المصروف للاستكمال",
      `<form class="form-grid"><div class="summary-banner full"><strong>${esc(e.title)}</strong><span>${cash(e.amount)} ر.س</span></div>${approve ? `<p class="notice full">${e.meta.approvalIndex === 1 ? (e.meta.funding_source === "advance" ? "سيُخصم المبلغ تلقائيًا من العهدة في عملية واحدة مع هذا الاعتماد." : e.meta.funding_source === "direct" ? "سيُثبت المصروف كدفع مباشر موثق." : "سيصبح المبلغ مستحقًا حتى تسجيل السداد وإرفاق إيصال الدفع.") : "ينتقل الطلب بعد موافقتك إلى المعتمد الثاني. لا يُخصم من العهدة في هذه المرحلة."}</p>` : field("سبب الإعادة *", textarea("reason", "", 3, "required"), true)}${actions(approve ? "تأكيد الاعتماد" : "إعادة المصروف")}</form>`,
      async (fd, f) => {
        await api(
          "expenses/review",
          {
            id,
            version: e.version,
            decision: approve ? "approve" : "return",
            reason: fd.get("reason") || "",
          },
          f.dataset.requestKey,
        );
        toast("تم تسجيل القرار");
      },
    );
  }
  function advancesPage() {
    const rows = scoped("advances"),
      sum = (k) => rows.reduce((s, a) => s + a[k], 0);
    return (
      heading(
        "العهد المالية",
        "تابع ما سُلّم لكل عضو، وما سُوّي بفواتير معتمدة، والرصيد المتبقي.",
        projectSelect() +
          (mayCreate("advances") ? btn("تسجيل عهدة", "advance-new") : "") +
          (S.advances.some((a) => can("advances", "export", a)) ||
          can("advances", "export", { project_id: project })
            ? btn(
                "تصدير Excel",
                "export",
                "advances",
                "button-ghost",
                "download",
              )
            : ""),
      ) +
      `<div class="stats">${stat("تمويل العهد", cash(sum("funded")), "مبالغ سُلّمت للأعضاء")}${stat("مصروفات مسوّاة", cash(sum("settled")), "فواتير معتمدة خُصمت من العهد")}${stat("مبالغ مستردة", cash(sum("returned")), "أُعيدت من الأعضاء")}${stat("الأرصدة المتبقية", cash(sum("balance")), "تمويل − تسويات − مستردات")}</div><section class="panel">${
        rows.length
          ? table(
              ["العهدة", "المشروع", "لدى", "التمويل", "المسوّى", "المتبقي", ""],
              rows.map(
                (a) =>
                  `<tr><td><button class="text-link" data-action="advance" data-id="${a.id}">${esc(a.title)}</button></td><td>${esc(projectName(a.project_id))}</td><td>${esc(person(a.assignee_id))}</td><td>${cash(a.funded)}</td><td>${cash(a.settled)}</td><td><strong>${cash(a.balance)}</strong></td><td>${can("advances", "pay", a) ? btn("تسجيل حركة", "advance-entry", a.id, "button-ghost compact", "plus") : ""}</td></tr>`,
              ),
            )
          : empty(
              "العهد واضحة من أول مبلغ",
              "سجّل المبلغ المسلّم للعضو. يختار العضو العهدة عند رفع المصروف؛ يخصم النظام تلقائيًا بعد الاعتمادين.",
            )
      }</section><p class="form-note">تمويل العهدة ليس مصروفًا إضافيًا. التقارير المالية تحسب الفاتورة مرة واحدة، وهذه الصفحة توضح أين بقيت الأموال.</p>`
    );
  }
  function advanceForm(id) {
    const a = S.advances.find((x) => x.id === id),
      cs = S.committees.filter((c) =>
        can(
          "advances",
          a ? "pay" : "create",
          a || { project_id: c.project_id },
        ),
      ),
      initial =
        cs.find((c) => c.id === a?.meta?.committee_id) ||
        cs.find((c) => c.project_id === project) ||
        cs[0];
    if (!a && !initial)
      return toast("أنشئ لجنة وأضف أعضاءها قبل تسليم عهدة", true);
    modal(
      a ? "تعزيز العهدة أو استرداد رصيد" : "تسليم عهدة مالية",
      `<form class="form-grid">${part(
        "1",
        "المستلم والغرض",
        "العهدة مبلغ مسلّم للعضو. تخصم مصاريفها من الطلبات بعد الاعتمادين.",
        a
          ? `<div class="notice full">${esc(a.title)} · ${esc(person(a.assignee_id))} · الرصيد ${cash(a.balance)} ر.س</div>${field(
              "نوع الحركة",
              select("type", [
                ["fund", "تعزيز العهدة بمبلغ جديد"],
                ["return", "استرداد مبلغ من العضو"],
              ]),
            )}`
          : `${field("عنوان العهدة *", input("title", "", "text", 'required placeholder="عهدة تشغيل لجنة الضيافة"'), true)}${field(
              "اللجنة والمشروع",
              select(
                "committee_id",
                cs.map((c) => [
                  c.id,
                  projectName(c.project_id) + " / " + c.name,
                ]),
                initial.id,
                "required",
              ),
            )}${field(
              "العضو المستلم",
              select(
                "assignee_id",
                S.people
                  .filter((p) => initial.members.some((m) => m.id === p.id))
                  .map((p) => [p.id, p.name]),
                "",
                "required",
              ),
            )}${field("الغرض وحدود الاستخدام *", textarea("purpose", "", 3, "required"), true)}${field("موعد التصفية المتوقع", input("settlement_due", "", "date"))}`,
      )}${part(
        "2",
        "المبلغ وإثبات التسليم",
        "سجل المبلغ الذي انتقل فعليًا، وأرفق إيصال التحويل أو سند الاستلام.",
        `${field("المبلغ — ر.س *", input("amount", "", "number", 'required min="0.01" step="0.01"'))}${field("تاريخ الحركة *", input("date", today(), "date", "required"))}${field(
          "وسيلة التسليم / الاسترداد",
          select("payment_method", [
            ["transfer", "تحويل بنكي"],
            ["cash", "نقدًا — سند استلام"],
            ["card", "بطاقة مخصصة"],
          ]),
        )}${field("مرجع العملية *", input("reference", "", "text", "required"))}<div class="full">${typedUpload("handoverFiles", "إثبات تسليم أو استرداد المبلغ", "handover", ".pdf,image/*", true)}</div>${field("ملاحظة الحركة", textarea("note", "", 2), true)}`,
      )}${actions(a ? "تسجيل الحركة الموثقة" : "تسجيل التسليم وإشعار العضو")}</form>`,
      async (fd, f) => {
        const v = formData(fd),
          cc = cs.find((c) => c.id === v.committee_id) || initial,
          pid = a?.project_id || cc.project_id;
        const files = await typedFiles(
          fd,
          "handoverFiles",
          "handover",
          "advances",
          pid,
          a?.id || "",
        );
        await api(
          a ? "advances/entry" : "advances/create",
          { ...v, id: a?.id, project_id: pid, files },
          f.dataset.requestKey,
        );
        toast("سُجلت الحركة وإثباتها وحُدث الرصيد");
      },
      true,
    );
    $("#modalBody [name=committee_id]")?.addEventListener("change", (e) => {
      const cc = cs.find((c) => c.id === e.target.value);
      $("#modalBody [name=assignee_id]").innerHTML = S.people
        .filter((p) => cc.members.some((m) => m.id === p.id))
        .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`)
        .join("");
    });
  }
  function advanceDetail(id) {
    const a = S.advances.find((x) => x.id === id),
      entries = S.advanceEntries.filter((x) => x.advance_id === id),
      pending = S.expenses
        .filter((e) => e.meta.advance_id === id && e.status === "pending")
        .reduce((s, e) => s + (e.amount || 0), 0);
    let balance = 0;
    modal(
      a.title,
      `<div class="summary-banner"><div><h2>${esc(person(a.assignee_id))}</h2><p>${esc(projectName(a.project_id))} / ${esc(S.committees.find((c) => c.id === a.meta?.committee_id)?.name || "—")}</p></div><span class="pill ${a.balance === 0 ? "green" : ""}">${a.balance === 0 ? "الرصيد مصفّى" : "عهدة قائمة"}</span></div><div class="stats">${stat("سُلّم للعضو", cash(a.funded), "إجمالي التسليم والتعزيز")}${stat("صُفّي بمصاريف", cash(a.settled), "بعد اعتمادين")}${stat("استُرد من العضو", cash(a.returned), "مبالغ أعيدت للجهة")}${stat("الرصيد الدفتري", cash(a.balance), "المسلّم − المصروف المعتمد − المسترد")}</div><p class="notice">طلبات من هذه العهدة بانتظار الاعتماد: ${cash(pending)} ر.س. لم تُخصم من الرصيد بعد.</p><p>${esc(a.meta?.purpose || "")} ${a.meta?.settlement_due ? "· موعد التصفية " + date(a.meta.settlement_due) : ""}</p>${table(
        [
          "التاريخ",
          "الحركة",
          "المبلغ",
          "الرصيد بعدها",
          "المرجع والمصروف",
          "الموثّق",
        ],
        entries.map((e) => {
          balance += e.type === "fund" ? e.amount : -e.amount;
          const payment = S.payments.find((p) => p.id === e.payment_id),
            expense = S.expenses.find((x) => x.id === payment?.expense_id);
          return `<tr><td>${date(e.date)}</td><td>${{ fund: "تسليم / تعزيز", return: "استرداد", settlement: "تصفية بمصروف معتمد" }[e.type]}</td><td>${cash(e.amount)}</td><td>${cash(balance)}</td><td>${esc(e.reference)}${expense ? `<br><button class="text-link" data-action="expense" data-id="${expense.id}">${esc(expense.title)}</button>` : ""}</td><td>${esc(person(e.created_by))}</td></tr>`;
        }),
      )}<section class="detail-section"><h3>إثباتات التسليم والاسترداد</h3>${fileList(S.files.filter((f) => f.entity_type === "advances" && f.entity_id === id))}</section><div class="form-actions">${can("advances", "pay", a) ? btn("تعزيز / استرداد", "advance-entry", id) : ""}${can("advances", "export", a) ? `<button class="button" data-action="advance-export" data-id="${id}">كشف العهدة Excel</button>` : ""}</div>`,
      null,
      true,
    );
  }
  function paymentForm(id) {
    const e = S.expenses.find((e) => e.id === id);
    modal(
      "إثبات سداد المستحق",
      `<form class="form-grid"><div class="notice full">المستفيد: ${e.meta.funding_source === "personal" ? esc(person(e.meta.claimant_id)) : esc(S.suppliers.find((s) => s.id === e.supplier_id)?.name || "المورد")} · المتبقي ${cash(e.amount - e.paid)} ر.س</div>${field("المبلغ المسدد — ر.س", input("amount", (e.amount - e.paid) / 100, "number", `required min="0.01" max="${(e.amount - e.paid) / 100}" step="0.01"`))}${field("تاريخ السداد", input("date", today(), "date", "required"))}${field("رقم التحويل أو مرجع السداد *", input("reference", "", "text", "required"), true)}<div class="full">${typedUpload("paymentFiles", "إيصال السداد الفعلي", "reimbursement", ".pdf,image/*", true)}</div><p class="form-note full">سيُحفظ الإيصال داخل الطلب، ويُشعر صاحب المستحق بالسداد.</p>${actions("تسجيل السداد وإشعار المستفيد")}</form>`,
      async (fd, f) => {
        fd.set("committee_id", e.meta.committee_id);
        const files = await typedFiles(
          fd,
          "paymentFiles",
          "reimbursement",
          "expenses",
          e.project_id,
          e.id,
        );
        await api(
          "expenses/pay",
          { id, ...formData(fd), files },
          f.dataset.requestKey,
        );
        toast("سُجل السداد وأُرفق الإيصال وأُنشئ إشعار المستفيد");
      },
    );
  }
  function locationFields(g = {}, title = "الموقع — اختياري") {
    g ||= {};
    return `<fieldset class="location-editor full" data-location-editor><legend>${esc(title)}</legend><div class="location-map-choice"><div><strong>${esc(g.label || "أين يقع المكان؟")}</strong><p data-geo-status>${g.lat != null ? "تم تحديد نقطة على الخريطة" : "افتح الخريطة واضغط على المكان المطلوب"}</p></div><button type="button" class="button button-dark" data-geo-map>${icon("search")} تحديد على الخريطة</button></div><div class="form-grid">${field("اسم المكان / الخيمة / البوابة", input("geo_label", g.label || "", "text", 'maxlength="200"'))}${field("إرشادات الوصول", input("geo_notes", g.notes || "", "text", 'maxlength="1000"'))}</div><input type="hidden" name="geo_lat" value="${esc(g.lat ?? "")}"><input type="hidden" name="geo_lng" value="${esc(g.lng ?? "")}"><button type="button" class="button compact button-ghost" data-geo-clear>مسح الموقع</button></fieldset>`;
  }
  let mapLibrary;
  async function openMapPicker(box) {
    if (!window.L) {
      mapLibrary ||= new Promise((resolve, reject) => {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "/vendor/leaflet/leaflet.css";
        document.head.append(css);
        const js = document.createElement("script");
        js.src = "/vendor/leaflet/leaflet.js";
        js.onload = resolve;
        js.onerror = () => {
          mapLibrary = null;
          reject(Error("تعذر فتح الخريطة. حاول مرة أخرى."));
        };
        document.head.append(js);
      });
      await mapLibrary;
    }
    const dialog = document.createElement("dialog");
    dialog.className = "map-picker";
    dialog.innerHTML = `<header><div><span class="eyebrow">ديوان النائلات</span><h2>حدد الموقع على الخريطة</h2></div><button type="button" class="icon-btn" data-map-close aria-label="إغلاق">${icon("close")}</button></header><p>اضغط على المكان أو اسحب العلامة. يمكنك تحريك الخريطة وتكبيرها.</p><div class="map-canvas" aria-label="خريطة اختيار الموقع"></div><output aria-live="polite"></output><footer><button type="button" class="button" data-map-current>موقعي الحالي</button><button type="button" class="button" data-map-center>اختيار مركز الخريطة</button><button type="button" class="button button-dark" data-map-save disabled>اعتماد الموقع</button></footer>`;
    document.body.append(dialog);
    dialog.showModal();
    const lat = box.querySelector("[name=geo_lat]").value,
      lng = box.querySelector("[name=geo_lng]").value;
    let point = lat !== "" && lng !== "" ? [Number(lat), Number(lng)] : null,
      marker;
    const map = L.map(dialog.querySelector(".map-canvas")).setView(
      point || [24.7136, 46.6753],
      point ? 16 : 9,
    );
    const output = dialog.querySelector("output");
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
    })
      .addTo(map)
      .on(
        "tileerror",
        () =>
          (output.textContent =
            "تعذر تحميل بعض أجزاء الخريطة. تحقق من اتصالك."),
      );
    const choose = (ll) => {
      point = [
        Math.max(-90, Math.min(90, ll.lat)),
        ((((ll.lng + 180) % 360) + 360) % 360) - 180,
      ];
      if (!marker) {
        marker = L.marker(point, { draggable: true }).addTo(map);
        marker.on("dragend", () => choose(marker.getLatLng()));
      } else marker.setLatLng(point);
      dialog.querySelector("[data-map-save]").disabled = false;
      output.textContent =
        "تم اختيار الموقع؛ اضغط اعتماد الموقع لحفظه في النموذج.";
    };
    map.on("click", (e) => choose(e.latlng));
    if (point) choose({ lat: point[0], lng: point[1] });
    dialog.querySelector("[data-map-center]").onclick = () =>
      choose(map.getCenter());
    dialog.querySelector("[data-map-current]").onclick = () => {
      if (!navigator.geolocation) {
        output.textContent = "خدمة الموقع غير متاحة؛ اختر المكان على الخريطة.";
        return;
      }
      output.textContent = "بانتظار إذن الموقع…";
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!dialog.isConnected) return;
          choose({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          map.setView(point, 17);
        },
        () => {
          if (dialog.isConnected)
            output.textContent =
              "تعذر تحديد موقع الجهاز. اختر المكان على الخريطة.";
        },
        { timeout: 12000 },
      );
    };
    dialog.querySelector("[data-map-save]").onclick = () => {
      if (!point) return;
      box.querySelector("[name=geo_lat]").value = point[0].toFixed(6);
      box.querySelector("[name=geo_lng]").value = point[1].toFixed(6);
      box.querySelector("[data-geo-status]").textContent =
        "تم تحديد الموقع على الخريطة";
      dialog.close();
    };
    dialog.querySelector("[data-map-close]").onclick = () => dialog.close();
    dialog.addEventListener(
      "close",
      () => {
        map.remove();
        dialog.remove();
      },
      { once: true },
    );
    setTimeout(() => map.invalidateSize(), 50);
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-geo-map]");
    if (b)
      openMapPicker(b.closest("[data-location-editor]")).catch((err) =>
        toast(err.message, true),
      );
  });
  function locationValue(v) {
    return {
      label: v.geo_label || "",
      notes: v.geo_notes || "",
      lat: v.geo_lat || "",
      lng: v.geo_lng || "",
    };
  }
  function locationView(g, title = "الموقع") {
    if (!g || (!g.label && !g.notes && g.lat == null)) return "";
    const point =
      typeof g.lat === "number" &&
      typeof g.lng === "number" &&
      Number.isFinite(g.lat) &&
      Number.isFinite(g.lng);
    return `<div class="record-location"><div><strong>${esc(title)}${g.label ? " · " + esc(g.label) : ""}</strong>${g.notes ? `<p>${esc(g.notes)}</p>` : ""}${point ? `<small dir="ltr">${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}</small>` : ""}</div>${point ? `<a class="button compact button-ghost" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(g.lat + "," + g.lng)}">فتح الاتجاهات</a>` : ""}</div>`;
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-geo-current],[data-geo-clear]");
    if (!b) return;
    const box = b.closest("[data-location-editor]"),
      out = box.querySelector("[data-geo-status]");
    const val = (k, v) => {
      box.querySelector(`[name=geo_${k}]`).value = v;
    };
    if (b.hasAttribute("data-geo-clear")) {
      box.dataset.request = String(Number(box.dataset.request || 0) + 1);
      ["label", "notes", "lat", "lng"].forEach((k) => val(k, ""));
      out.textContent = "تم مسح الموقع؛ احفظ السجل لتأكيد التعديل.";
      return;
    }
    if (!navigator.geolocation) {
      out.textContent =
        "الموقع غير متاح في هذا المتصفح. أدخل الإحداثيات يدويًا.";
      return;
    }
    const request = String(Number(box.dataset.request || 0) + 1);
    box.dataset.request = request;
    out.textContent = "بانتظار إذن الموقع…";
    b.disabled = true;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        b.disabled = false;
        if (!box.isConnected || box.dataset.request !== request) return;
        val("lat", p.coords.latitude.toFixed(6));
        val("lng", p.coords.longitude.toFixed(6));
        out.textContent = `تم تحديد الموقع بدقة تقريبية ${Math.round(p.coords.accuracy)} متر. راجعه ثم احفظ السجل.`;
      },
      () => {
        b.disabled = false;
        if (box.isConnected && box.dataset.request === request)
          out.textContent =
            "تعذر تحديد الموقع. اسمح بالوصول من المتصفح أو أدخل الإحداثيات يدويًا.";
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
  let barcodeLibrary;
  async function barcodeReader() {
    if (!window.ZXingBrowser) {
      barcodeLibrary ||= new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "/vendor/zxing-browser.min.js";
        s.onload = resolve;
        s.onerror = () => {
          barcodeLibrary = null;
          s.remove();
          reject(Error("تعذر تحميل قارئ الرموز. أدخل الرمز يدويًا."));
        };
        document.head.append(s);
      });
      await barcodeLibrary;
    }
    return new window.ZXingBrowser.BrowserMultiFormatReader();
  }
  function scanCode(onRead) {
    const d = document.createElement("dialog");
    d.className = "code-scanner";
    d.innerHTML = `<header><div><h2>قراءة الباركود أو QR</h2><p>وجّه الكاميرا إلى الرمز أو اختر صورة واضحة له.</p></div><button type="button" class="icon-btn" data-scan-close aria-label="إغلاق">×</button></header><video muted playsinline data-scan-video></video><div class="location-actions"><button type="button" class="button" data-scan-start>تشغيل الكاميرا</button><button type="button" class="button button-ghost" data-scan-stop>إيقاف الكاميرا</button><label class="button button-ghost">قراءة صورة<input type="file" accept="image/*" data-scan-image hidden></label></div><p data-scan-state role="status">الكاميرا متوقفة.</p>`;
    document.body.append(d);
    d.showModal();
    let controls,
      stopped = false,
      generation = 0;
    const video = d.querySelector("video"),
      status = d.querySelector("[data-scan-state]");
    const stop = () => {
      generation++;
      controls?.stop();
      controls = null;
      video.srcObject?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
    const finish = (text) => {
      d.close();
      onRead(text);
    };
    d.addEventListener(
      "close",
      () => {
        stopped = true;
        stop();
        d.remove();
      },
      { once: true },
    );
    d.querySelector("[data-scan-close]").onclick = () => d.close();
    d.querySelector("[data-scan-stop]").onclick = () => {
      stop();
      status.textContent = "الكاميرا متوقفة.";
    };
    d.querySelector("[data-scan-start]").onclick = async function () {
      stop();
      const n = generation;
      this.disabled = true;
      status.textContent = "بانتظار إذن الكاميرا…";
      try {
        const reader = await barcodeReader();
        if (stopped || n !== generation) return;
        const c = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          video,
          (r, err, ctl) => {
            if (r && !stopped && n === generation) {
              ctl.stop();
              finish(r.getText());
            }
          },
        );
        if (stopped || n !== generation) c.stop();
        else {
          controls = c;
          status.textContent = "ضع الرمز داخل الكاميرا حتى تتم قراءته.";
        }
      } catch (err) {
        if (!stopped)
          status.textContent =
            "تعذر تشغيل الكاميرا. اسمح باستخدامها، أو اختر صورة الرمز، أو أدخله يدويًا.";
      } finally {
        this.disabled = false;
      }
    };
    d.querySelector("[data-scan-image]").onchange = async (e) => {
      stop();
      const n = generation,
        file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      status.textContent = "جارٍ قراءة الصورة…";
      try {
        const reader = await barcodeReader(),
          r = await reader.decodeFromImageUrl(url);
        if (!stopped && n === generation) finish(r.getText());
      } catch {
        if (!stopped && n === generation)
          status.textContent =
            "لم يُقرأ رمز واضح. جرّب صورة أقرب أو أدخل الرمز يدويًا.";
      } finally {
        URL.revokeObjectURL(url);
      }
    };
  }
  function findAssetByCode(code) {
    code = String(code || "").trim();
    let id = code;
    try {
      const u = new URL(code);
      if (u.origin === location.origin && u.hash.startsWith("#assets?"))
        id = new URLSearchParams(u.hash.split("?")[1]).get("asset");
    } catch {}
    if (!code) return toast("أدخل رقم الأصل أو امسح رمزه.", true);
    const matches = S.assets.filter(
      (a) =>
        a.id === id ||
        a.serial === code ||
        a.meta?.manufacturer_serial === code,
    );
    if (matches.length > 1)
      return toast(
        "الرقم مرتبط بأكثر من سجل. استخدم رقم تعريف الأصل الفريد أو ملصق QR.",
        true,
      );
    const a = matches[0];
    if (a) assetDetail(a.id);
    else toast("لا يوجد أصل مطابق ضمن السجلات المتاحة لك.", true);
  }
  function assetLookup() {
    modal(
      "البحث عن أصل بالرمز",
      `<form class="form-grid">${field("رقم التعريف / الرقم التسلسلي", input("lookup_code", "", "text", 'required dir="ltr"'), true)}<button type="button" class="button full" data-lookup-camera>قراءة بالكاميرا أو من صورة</button><div class="form-actions full"><button type="submit" class="button button-dark">فتح سجل الأصل</button></div></form>`,
    );
    const f = $("#modalBody form");
    f.onsubmit = (e) => {
      e.preventDefault();
      findAssetByCode(f.elements.lookup_code.value);
    };
    f.querySelector("[data-lookup-camera]").onclick = () =>
      scanCode(findAssetByCode);
  }
  function assetLabelPicker() {
    modal(
      "اختيار الأصول للطباعة",
      `<div class="label-picker"><label>ابحث بالاسم أو الرقم أو التصنيف${input("label_search", "", "search")}</label><div class="label-picker-actions"><button type="button" class="button button-ghost" data-label-select>تحديد النتائج الظاهرة</button><button type="button" class="button button-ghost" data-label-clear>مسح التحديد</button><span data-label-count>0 محدد</span></div><div class="label-asset-list">${S.assets.map((a) => `<label data-label-row data-search="${esc([a.name, a.serial, a.category].join(" ").toLowerCase())}"><input type="checkbox" value="${a.id}"><span>${esc(a.name)}<small>${esc(a.category)}</small></span><bdi>${esc(a.serial || "")}</bdi></label>`).join("")}</div><div class="form-actions"><button type="button" class="button button-dark" data-label-next>معاينة الملصقات</button></div></div>`,
      null,
      true,
    );
    const body = $("#modalBody"),
      rows = [...body.querySelectorAll("[data-label-row]")];
    const count = () =>
      (body.querySelector("[data-label-count]").textContent =
        `${body.querySelectorAll("[data-label-row] input:checked").length} محدد`);
    body.querySelector("[name=label_search]").oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      rows.forEach((r) => (r.hidden = !r.dataset.search.includes(q)));
    };
    body.querySelector("[data-label-select]").onclick = () => {
      rows
        .filter((r) => !r.hidden)
        .slice(0, 200)
        .forEach((r) => (r.querySelector("input").checked = true));
      count();
    };
    body.querySelector("[data-label-clear]").onclick = () => {
      rows.forEach((r) => (r.querySelector("input").checked = false));
      count();
    };
    body
      .querySelectorAll("[type=checkbox]")
      .forEach((c) => (c.onchange = count));
    body.querySelector("[data-label-next]").onclick = () =>
      assetLabel(
        [...body.querySelectorAll("[data-label-row] input:checked")].map(
          (c) => c.value,
        ),
      );
  }
  function assetLabel(value) {
    const ids = Array.isArray(value) ? value : [value],
      assets = [...new Set(ids)]
        .map((id) => S.assets.find((a) => a.id === id))
        .filter(Boolean);
    if (!assets.length || assets.length > 200)
      return toast("اختر من 1 إلى 200 أصل للطباعة", true);
    if (assets.some((a) => !a.serial))
      return toast("يلزم اكتمال ترقيم الأصل قبل طباعة الملصق", true);
    const L = window.DiwanLabels;
    if (!L || !window.qrcode)
      return toast("تعذر تحميل أداة الملصقات. حدّث الصفحة.", true);
    modal(
      "ملصقات الأصول",
      `<div class="asset-label-editor"><div class="notice">${assets.length} ملصقًا من الأرقام المحفوظة. إعادة الطباعة تستخدم الرقم نفسه، ولا تنشئ أصلًا جديدًا.</div><div class="form-grid">${field(
        "مقاس الطباعة",
        select(
          "label_size",
          Object.entries(L.presets).map(([k, p]) => [k, p.name]),
          "tze36",
        ),
      )}${field(
        "ما يحمله QR",
        select(
          "label_mode",
          [
            ["link", "رابط سجل الأصل — يفتح بعد الدخول"],
            ["code", "رقم الأصل — للقراءة داخل الديوان"],
          ],
          "link",
        ),
      )}</div><div class="asset-label-preview" data-label-preview></div><p class="form-note" data-label-note></p><div class="form-actions"><button type="button" class="button button-dark" data-label-print>طباعة الملصقات</button><button type="button" class="button" data-label-pdf>تنزيل PDF بالمقاس الفعلي</button>${assets.length === 1 ? '<button type="button" class="button button-ghost" data-label-svg>تنزيل الملصق SVG</button>' : ""}</div><details class="label-help"><summary>إعداد الطابعة وتثبيت الملصق</summary><p>اختر الطابعة ومقاس الشريط المطابق، واجعل التحجيم 100% والهوامش صفرًا وأوقف رأس الصفحة وتذييلها. جرّب ملصقًا واحدًا أولًا ثم امسحه.</p><p>للأصول الدائمة: ملصق مغلف مناسب للسطح. للدروع: خلف القاعدة أو على العلبة. للأوشحة: بطاقة معلقة أو تغليف القطعة. الطباعة تتم عبر نافذة النظام بعد تثبيت تعريف الطابعة.</p><p>إذا لم تظهر طابعتك على الجوال، نزّل PDF وافتحه على الكمبيوتر المتصل بها.</p></details></div>`,
      null,
      true,
    );
    const body = $("#modalBody"),
      size = body.querySelector("[name=label_size]"),
      mode = body.querySelector("[name=label_mode]");
    const update = () => {
      body.querySelector("[data-label-preview]").innerHTML = assets
        .slice(0, 3)
        .map(
          (a) =>
            `<div class="label-preview-item">${L.labelSVG(a, size.value, mode.value, location.origin)}</div>`,
        )
        .join("");
      body.querySelector("[data-label-note]").textContent =
        `معاينة ${Math.min(3, assets.length)} من ${assets.length}. ${mode.value === "link" ? "الرمز يفتح السجل حسب صلاحية المستخدم." : "اقرأ هذا الرمز من «قراءة رمز أصل» في الديوان؛ يبقى صالحًا عند تغيير نطاق الموقع."}`;
    };
    size.onchange = update;
    mode.onchange = update;
    update();
    const run = (button, fn) =>
      (button.onclick = async () => {
        button.disabled = true;
        try {
          await fn();
        } catch (e) {
          toast(e.message, true);
        } finally {
          button.disabled = false;
        }
      });
    run(body.querySelector("[data-label-print]"), () =>
      L.print(assets, size.value, mode.value),
    );
    run(body.querySelector("[data-label-pdf]"), async () => {
      const bytes = await L.pdf(assets, size.value, mode.value);
      DiwanExports.download(
        new Blob([bytes], { type: "application/pdf" }),
        `Nailat-labels-${assets.length}.pdf`,
      );
    });
    const svg = body.querySelector("[data-label-svg]");
    if (svg)
      run(svg, () =>
        DiwanExports.download(
          new Blob(
            [L.labelSVG(assets[0], size.value, mode.value, location.origin)],
            { type: "image/svg+xml" },
          ),
          `Nailat-${assets[0].serial}.svg`,
        ),
      );
  }

  function assetForm(id) {
    const a = S.assets.find((x) => x.id === id) || {
        quantity: 1,
        kind: "serialized",
        meta: {},
      },
      m = a.meta;
    modal(
      a.id ? "ملف الأصل" : "إضافة أصل",
      `<form class="form-grid">${part(
        "1",
        "هوية الأصل وطريقة تتبعه",
        "رقم فريد يولده الديوان عند الحفظ، ويبقى ثابتًا مع الأصل في كل موسم. يمكن تجهيز عدة قطع متشابهة بأرقام مستقلة.",
        `${field("اسم الأصل *", input("name", a.name || "", "text", "required"), true)}${field(
          "الملكية",
          select(
            "ownership",
            [
              ["owned", "مملوك — يبقى معنا بعد الموسم"],
              ["rented", "مستأجر لفترة محددة"],
              ["borrowed", "مستعار ويجب إرجاعه"],
            ],
            a.ownership || "owned",
          ),
        )}${field(
          "طريقة التتبع",
          select(
            "kind",
            [
              ["serialized", "كل قطعة بسجل ورقم مستقل"],
              ["quantity", "صنف بالكمية — ملصق واحد للصنف"],
              ["consumable", "مواد توزع أو تستهلك — متابعة بالكمية"],
            ],
            a.kind || "quantity",
          ),
        )}${field(
          "التصنيف",
          select(
            "category",
            [
              ...new Set(
                [...(S.settings.assetCategories || []), a.category].filter(
                  Boolean,
                ),
              ),
            ].map((x) => [x, x]),
            a.category || "دروع وتذكارات التكريم",
          ),
        )}${field("تفصيل التصنيف — اختياري", input("category_detail", m.category_detail || "", "text", 'maxlength="200" placeholder="مثال: درع تكريم ضيف أو وشاح فريق التنظيم"'))}<div data-unit-count>${field("عدد القطع الجديدة *", input("count", 1, "number", 'min="1" max="50" step="1"'))}</div><div data-stock-count>${field("كمية الصنف *", input("quantity", a.quantity, "number", 'required min="1" max="1000000" step="1"'))}</div><div class="notice full" data-tracking-note></div>${field("رقم الأصل الدائم", input("serial", a.serial || "", "text", 'readonly dir="ltr" placeholder="يتولد تلقائيًا بعد الحفظ"') + "<small>لا يتكرر ولا يتغير عند التعديل أو إعادة طباعة الملصق.</small>")}${field("رقم الشركة المصنعة — إن وجد", input("manufacturer_serial", m.manufacturer_serial || "", "text", 'maxlength="150" dir="ltr"') + '<button type="button" class="text-link" data-fill-barcode>قراءة رقم الشركة المصنعة</button>')}${field("العلامة التجارية", input("brand", m.brand || ""))}${field("نهاية الضمان", input("warranty_end", m.warranty_end || "", "date"))}${field("الطراز / الوصف المختصر", input("model", m.model || ""))}${field("المقاس / الأبعاد", input("dimensions", m.dimensions || ""))}${field(
          "الحالة",
          select(
            "condition",
            [
              ["ready", "جاهز للاستخدام"],
              ["maintenance", "تحت الصيانة"],
              ["damaged", "تالف"],
            ],
            a.condition || "ready",
          ),
        )}`,
      )}${part("2", "القيمة والتعامل المرتبط", "قيمة الأصل مرجع للسجل. المصروف المالي يسجل بإثبات مستقل حتى لا تتكرر التكلفة.", `${field("قيمة الوحدة — ر.س", input("unit_value", (m.unit_value || 0) / 100, "number", 'min="0" step="0.01"'))}${field("تاريخ التملك / التسجيل", input("acquired", m.acquired || "", "date"))}${field("المورد / المؤجر", select("supplier_id", [["", "غير مرتبط"], ...S.suppliers.map((s) => [s.id, s.name])], m.supplier_id || ""))}${field("مشروع الاستخدام — اختياري", select("project_id", [["", "أصل مشترك بين المواسم"], ...S.projects.map((p) => [p.id, p.title])], m.project_id || project))}<div class="form-grid full" data-rental-fields>${field("بداية الإيجار / الاستعارة", input("rental_start", m.rental_start || "", "date"))}${field("نهاية الإيجار / الاستعارة", input("rental_end", m.rental_end || "", "date"))}${field("إيجار الوحدة للفترة — ر.س", input("rental_total", (m.rental_total || 0) / 100, "number", 'min="0" step="0.01"'))}${field("مبلغ التأمين المسترد — ر.س", input("deposit", (m.deposit || 0) / 100, "number", 'min="0" step="0.01"'))}</div>`)}${part("3", "الموقع والمستندات", "التسليم لشخص وتوثيق الإرجاع يتمان من سجل حركة الأصل.", `${field("الموقع الحالي", input("location", a.location || ""))}${field("موقع الحفظ بعد الموسم", input("storage_location", m.storage_location || ""))}${locationFields(m.site_location, "الموقع الجغرافي للأصل — اختياري")}${field("المواصفات والملحقات والملاحظات", textarea("notes", m.notes || "", 3), true)}<div class="full">${typedUpload("assetFiles", "صور الأصل أو عقد الإيجار أو مستند الملكية", "asset", ".pdf,image/*")}<label class="button button-ghost">التقاط صورة للأصل<input type="file" name="assetFiles" accept="image/*" capture="environment" hidden></label></div>`)}${actions("حفظ سجل الأصل", '<button type="submit" value="print" class="button">حفظ وتجهيز الملصقات</button>')}</form>`,
      async (fd, f, button) => {
        const files = await typedFiles(
          fd,
          "assetFiles",
          "asset",
          "assets",
          "",
          a.id || "",
        );
        const saved = await api(
          "assets/save",
          {
            ...formData(fd),
            site_location: locationValue(formData(fd)),
            id: a.id,
            version: a.version,
            files,
          },
          f.dataset.requestKey,
        );
        toast(
          saved.count > 1
            ? `حُفظت ${saved.count} قطع، لكل قطعة رقم وملصق مستقل`
            : "حُفظ الأصل برقمه الدائم",
        );
        if (button.value === "print")
          return () => assetLabel(saved.ids || [saved.id]);
      },
      true,
    );
    const f = $("#modalBody form"),
      update = () => {
        const rented = f.querySelector("[name=ownership]").value !== "owned";
        f.querySelector("[data-rental-fields]").hidden = !rented;
        const serialized = f.elements.kind.value === "serialized";
        f.querySelector("[data-unit-count]").hidden = !serialized || !!a.id;
        f.elements.count.disabled = !serialized || !!a.id;
        f.querySelector("[data-stock-count]").hidden = serialized;
        if (serialized) f.elements.quantity.value = 1;
        const many = !a.id && serialized && Number(f.elements.count.value) > 1;
        f.elements.manufacturer_serial.disabled = many;
        f.querySelector("[data-fill-barcode]").hidden = many;
        f.querySelector("[data-tracking-note]").textContent = serialized
          ? many
            ? `سيُنشئ الديوان ${f.elements.count.value} سجلات مستقلة بأرقام مختلفة. الصور والمواصفات مشتركة عند الإنشاء، ويمكن تعديل كل قطعة لاحقًا.`
            : "لكل قطعة رقمها وملصقها وحركاتها. قيمة الوحدة وأرقام الشركة المصنعة تخص القطعة نفسها."
          : "رقم واحد للصنف أو المجموعة؛ طباعة نسخ من هذا الملصق لا تعطي القطع أرقامًا مستقلة. اختر تتبع كل قطعة إذا أردت جردها منفردة.";
      };
    f.querySelector("[data-fill-barcode]").onclick = () =>
      scanCode((code) => {
        if (f.isConnected)
          f.elements.manufacturer_serial.value = code.slice(0, 150);
      });
    f.elements.count.oninput = update;
    update();
    f.querySelector("[name=ownership]").onchange = update;
    f.querySelector("[name=kind]").onchange = update;
  }
  function assetDetail(id) {
    const a = S.assets.find((x) => x.id === id),
      ms = S.movements.filter((m) => m.asset_id === id);
    let qr = "";
    if (window.qrcode) {
      const q = window.qrcode(0, "M");
      q.addData(location.origin + "/#assets?asset=" + id);
      q.make();
      qr = q.createSvgTag(3, 4);
    }
    modal(
      a.name,
      `<div class="summary-banner"><div><h2>${esc(a.name)}</h2><p>${esc(a.location || "الموقع غير محدد")}</p><span class="pill">${esc(a.serial || a.id.slice(0, 8))}</span></div><div class="qr-label">${qr}<small>فتح سجل الأصل بعد الدخول</small></div></div><div class="stats">${stat("الإجمالي", num(a.quantity), "وحدة", "assets")}${stat("المتاح", num(a.available), "وحدة", "check")}${stat("في العهدة", num(a.issued), "وحدة", "users")}${stat("المستهلك", num(a.consumed), "وحدة", "expenses")}</div><div class="detail-meta"><span>الملكية</span><strong>${{ owned: "مملوك", rented: "مستأجر", borrowed: "مستعار" }[a.ownership]}</strong><span>قيمة الوحدة</span><strong>${a.meta.unit_value ? cash(a.meta.unit_value) + " ر.س" : "لم تُسجل"}</strong><span>المورد / المؤجر</span><strong>${esc(S.suppliers.find((s) => s.id === a.meta.supplier_id)?.name || "—")}</strong><span>تكلفة الإيجار للفترة</span><strong>${a.meta.rental_total ? cash(a.meta.rental_total) + " ر.س" : "—"}</strong><span>التأمين المسترد</span><strong>${a.meta.deposit ? cash(a.meta.deposit) + " ر.س" : "—"}</strong><span>موقع الحفظ</span><strong>${esc(a.meta.storage_location || "—")}</strong><span>رقم الشركة المصنعة</span><strong dir="ltr">${esc(a.meta.manufacturer_serial || "—")}</strong><span>العلامة التجارية</span><strong>${esc(a.meta.brand || "—")}</strong><span>نهاية الضمان</span><strong>${date(a.meta.warranty_end)}</strong><span>الطراز / المقاس</span><strong>${esc([a.meta.model, a.meta.dimensions].filter(Boolean).join(" / ") || "—")}</strong></div><p class="detail-description">${esc(a.meta.notes || "")}</p>${locationView(a.meta.site_location)}<div class="asset-photo-gallery">${S.files
        .filter(
          (f) =>
            f.entity_type === "assets" &&
            f.entity_id === id &&
            f.mime?.startsWith("image/"),
        )
        .map(
          (f) =>
            `<a href="/api/files/${f.id}?inline" target="_blank" rel="noopener"><img src="/api/files/${f.id}?inline" alt="${esc(f.name)}" loading="lazy"><span>${esc(f.name)}</span></a>`,
        )
        .join(
          "",
        )}</div>${a.meta.rental_end ? `<p>نهاية الإيجار / الاستعارة: ${date(a.meta.rental_end)}</p>` : ""}<section class="detail-section"><h3>المرفقات</h3>${fileList(S.files.filter((f) => f.entity_type === "assets" && f.entity_id === id))}</section><section class="detail-section"><h3>سجل الحركات</h3>${
        ms.length
          ? table(
              ["الحركة", "الكمية", "العضو", "المشروع", "التاريخ"],
              ms.map(
                (m) =>
                  `<tr><td>${{ issue: "تسليم أصل", return: "استرجاع", consume: "استهلاك" }[m.type]}</td><td>${num(m.quantity)}</td><td>${esc(person(m.member_id))}</td><td>${m.project_id ? esc(projectName(m.project_id)) : "—"}</td><td>${date(m.created)}</td></tr>`,
              ),
            )
          : '<p class="muted">لا توجد حركات حتى الآن.</p>'
      }</section><div class="form-actions">${btn("معاينة وطباعة الملصق", "asset-label", id, "button-ghost")}${can("assets", "edit", a) ? btn("تعديل الأصل", "asset-edit", id, "", "edit") : ""}${can("assets", "assign", a) ? btn("تسجيل حركة", "asset-move", id) : ""}</div>`,
      null,
      true,
    );
  }
  function assetMove(id) {
    const a = S.assets.find((x) => x.id === id);
    modal(
      "حركة أصل: " + a.name,
      `<form class="form-grid"><div class="notice full">المتاح الآن ${num(a.available)} · في العُهد ${num(a.issued)}</div>${field(
        "الحركة",
        select(
          "type",
          a.kind === "consumable"
            ? [["consume", "تسجيل استهلاك"]]
            : [
                ["issue", "تسليم عهدة"],
                ["return", "استرجاع عهدة"],
              ],
          a.available ? "issue" : "return",
        ),
      )}${field("الكمية *", input("quantity", 1, "number", 'required min="1" step="1"'))}${field(
        "العضو المستلم / المعيد *",
        select(
          "member_id",
          S.people.map((m) => [m.id, m.name]),
          S.user.id,
          "required",
        ),
      )}${field("المشروع", select("project_id", [["", "غير مرتبط بمشروع"], ...S.projects.map((p) => [p.id, p.title])], project))}${field("مرجع التسليم / الاسترجاع", input("reference", ""))}${field("موعد الإرجاع المتوقع", input("return_due", "", "date"))}${field(
        "الحالة عند الحركة",
        select("handover_condition", [
          ["good", "سليم"],
          ["wear", "ملاحظات استخدام"],
          ["damaged", "به تلف"],
        ]),
      )}${field("الملحقات المسلّمة", input("accessories", ""))}${field("ملاحظات التسليم والحالة", textarea("notes", ""), true)}<div class="full">${typedUpload("moveFiles", "محضر التسليم أو صور الحالة", "asset", ".pdf,image/*")}</div>${actions("تسجيل الحركة")}</form>`,
      async (fd, f) => {
        const files = await typedFiles(
          fd,
          "moveFiles",
          "asset",
          "assets",
          "",
          id,
        );
        await api(
          "assets/move",
          { id, ...formData(fd), files },
          f.dataset.requestKey,
        );
        toast("تم تحديث رصيد الأصل وتوثيق الحركة");
      },
    );
  }
  function ruleRow(
    g = {
      resource: "tasks",
      action: "view",
      effect: "allow",
      scope: "project",
    },
    index = 0,
  ) {
    return `<tr data-rule-row><td>${select("rule_resource", [["*", "كل الأقسام"], ...Object.keys(resourceActions).map((r) => [r, labels[r]]), ["expenses.amount", "قيمة المصروف"], ["projects.budget", "ميزانية المشروع"], ["users.phone", "جوال العضو"]], g.resource)}</td><td>${select("rule_action", [["*", "كل الإجراءات"], ...(resourceActions[g.resource] || (g.resource.includes(".") ? ["view"] : Object.keys(actionLabels))).map((a) => [a, actionLabels[a]])], g.action)}</td><td>${select(
      "rule_effect",
      [
        ["allow", "سماح"],
        ["deny", "منع"],
      ],
      g.effect,
    )}</td><td>${select(
      "rule_scope",
      [
        ["all", "كل السجلات"],
        ["project", "مشروع محدد"],
        ["committee", "لجنة محددة"],
        ["assigned", "المسند إليه أو المنشأ بواسطته"],
      ],
      g.scope || "all",
    )}</td><td>${select("rule_project", [["", "اختر المشروع"], ...S.projects.map((p) => [p.id, p.title])], g.projectId || "")}</td><td>${select("rule_committee", [["", "اختر اللجنة"], ...S.committees.map((c) => [c.id, projectName(c.project_id) + " / " + c.name])], g.committeeId || "")}</td><td>${input("rule_expires", g.expires?.slice(0, 10) || "", "date")}</td><td><button type="button" class="icon-btn" data-action="remove-rule" aria-label="حذف القاعدة">${icon("close", 16)}</button></td></tr>`;
  }
  function permissionsEditor(grants = []) {
    const full = grants.some(
        (g) =>
          g.resource === "*" &&
          g.action === "*" &&
          g.effect === "allow" &&
          (g.scope || "all") === "all" &&
          !g.expires,
      ),
      base = (g) =>
        (g.scope || "all") === "all" &&
        !g.expires &&
        resourceActions[g.resource]?.includes(g.action),
      extras = grants.filter(
        (g) =>
          !base(g) &&
          !(
            g.resource === "*" &&
            g.action === "*" &&
            g.effect === "allow" &&
            (g.scope || "all") === "all" &&
            !g.expires
          ),
      );
    const cols = [
      "view",
      "create",
      "edit",
      "assign",
      "approve",
      "pay",
      "export",
      "archive",
      "manage",
    ];
    return `<section class="full permission-editor"><div class="field-section">مصفوفة الوصول</div><label class="toggle-row"><span><strong>وصول عام مع الاستثناءات أدناه</strong><small>كل الأقسام والإجراءات، وتبقى قواعد المنع الصريحة سارية.</small></span><input type="checkbox" name="full_access" ${full ? "checked" : ""}></label><p class="inherit-note">«افتراضي» يرث الحزم والوصول الكامل. بدون سماح لا يوجد وصول. «منع» يتقدم على أي سماح.</p><div class="table-wrap"><table class="permission-table"><thead><tr><th>القسم</th>${cols.map((c) => `<th>${actionLabels[c]}</th>`).join("")}</tr></thead><tbody>${Object.entries(
      resourceActions,
    )
      .map(
        ([r, acts]) =>
          `<tr><th>${labels[r]}</th>${cols
            .map((a) =>
              acts.includes(a)
                ? `<td><select class="permission-cell" aria-label="${labels[r]}: ${actionLabels[a]}" data-permission-resource="${r}" data-permission-action="${a}">${[
                    ["", "افتراضي"],
                    ["allow", "سماح"],
                    ["deny", "منع"],
                  ]
                    .map(([value, label]) => {
                      const found = grants.filter(
                          (g) => base(g) && g.resource === r && g.action === a,
                        ),
                        v = found.some((g) => g.effect === "deny")
                          ? "deny"
                          : found.some((g) => g.effect === "allow")
                            ? "allow"
                            : "";
                      return `<option value="${value}" ${v === value ? "selected" : ""}>${label}</option>`;
                    })
                    .join("")}</select></td>`
                : '<td class="muted">—</td>',
            )
            .join("")}</tr>`,
      )
      .join(
        "",
      )}</tbody></table></div><div class="panel-header"><div><h3>استثناءات ونطاقات محددة</h3><span class="muted">مشروع محدد، مهام العضو، صلاحية مؤقتة، أو حجب مبلغ.</span></div><button class="button compact" type="button" data-action="add-rule">${icon("plus", 14)} قاعدة</button></div><div class="table-wrap"><table class="permission-table rules-table"><thead><tr><th>المورد</th><th>الإجراء</th><th>القرار</th><th>النطاق</th><th>المشروع</th><th>اللجنة</th><th>حتى نهاية يوم</th><th></th></tr></thead><tbody id="permissionRules">${extras.map(ruleRow).join("")}</tbody></table></div><div class="notice" id="permissionPreview">تحدد قواعد الوصول الأقسام المتاحة لهذا العضو.</div></section>`;
  }
  function readGrants(form) {
    const grants = [];
    if (form.querySelector("[name=full_access]")?.checked)
      grants.push({
        resource: "*",
        action: "*",
        effect: "allow",
        scope: "all",
      });
    form.querySelectorAll("[data-permission-resource]").forEach((el) => {
      if (el.value)
        grants.push({
          resource: el.dataset.permissionResource,
          action: el.dataset.permissionAction,
          effect: el.value,
          scope: "all",
        });
    });
    form.querySelectorAll("[data-rule-row]").forEach((row) => {
      const v = (n) => row.querySelector(`[name=rule_${n}]`).value,
        g = {
          resource: v("resource"),
          action: v("action"),
          effect: v("effect"),
          scope: v("scope"),
        };
      if (g.scope === "project") g.projectId = v("project");
      if (g.scope === "committee") g.committeeId = v("committee");
      if (v("expires")) g.expires = v("expires") + "T23:59:59+03:00";
      grants.push(g);
    });
    return grants;
  }
  function updatePermissionPreview() {
    const f = $("#modalBody form");
    if (!f?.querySelector(".permission-editor")) return;
    const gs = readGrants(f),
      bundleIds = [...f.querySelectorAll("[name=bundles]:checked")].map(
        (x) => x.value,
      );
    gs.push(
      ...S.bundles
        .filter((b) => bundleIds.includes(b.id))
        .flatMap((b) => b.grants),
    );
    const names = Object.keys(resourceActions)
      .filter(
        (r) =>
          gs.some(
            (g) =>
              (g.resource === r || g.resource === "*") &&
              (g.action === "view" || g.action === "*") &&
              g.effect === "allow" &&
              (!g.expires || Date.parse(g.expires) > Date.now()),
          ) &&
          !gs.some(
            (g) =>
              (g.resource === r || g.resource === "*") &&
              (g.action === "view" || g.action === "*") &&
              g.effect === "deny" &&
              (g.scope || "all") === "all",
          ),
      )
      .map((r) => labels[r]);
    $("#permissionPreview").textContent = names.length
      ? "الأقسام التي يمكن أن تظهر بحسب النطاق: " + names.join("، ")
      : "لا توجد صلاحية مشاهدة. لن تظهر سجلات عمل لهذا العضو.";
  }
  function memberLinkRow(link = { committee_id: "", role: "member" }) {
    return `<div class="member-link" data-member-link>${field("اللجنة", select("link_committee", [["", "اختر لجنة"], ...S.committees.map((c) => [c.id, projectName(c.project_id) + " / " + c.name])], link.committee_id, "required"))}${field(
      "الدور في اللجنة",
      select(
        "link_role",
        [
          ["member", "عضو — مهامه ومصاريفه"],
          ["manager", "مدير اللجنة — يتابع ويعتمد"],
          ["supervisor", "مشرف متابعة — يطّلع"],
        ],
        link.role,
      ),
    )}<button type="button" class="icon-btn" data-action="member-link-remove" aria-label="إزالة العضوية">×</button></div>`;
  }
  function memberPayload(f) {
    const fd = new FormData(f),
      mode = fd.get("access_mode");
    return {
      name: fd.get("name"),
      phone: fd.get("phone"),
      email: fd.get("email"),
      team: fd.get("team"),
      status: fd.get("status"),
      grants:
        mode === "full"
          ? [{ resource: "*", action: "*", effect: "allow", scope: "all" }]
          : mode === "committee"
            ? []
            : readGrants(f),
      bundles: mode === "custom" ? fd.getAll("bundles") : [],
      memberships: [...f.querySelectorAll("[data-member-link]")].map((row) => ({
        committee_id: row.querySelector("[name=link_committee]").value,
        role: row.querySelector("[name=link_role]").value,
      })),
    };
  }
  async function memberStep(step) {
    const f = $("#memberForm");
    if (!f) return;
    if (step > Number(f.dataset.step || 0)) {
      for (const field of f.querySelectorAll(
        `[data-member-step="${f.dataset.step || 0}"] input,[data-member-step="${f.dataset.step || 0}"] select`,
      ))
        if (!field.checkValidity()) return field.reportValidity();
    }
    if (step === 2) {
      const out = $("#memberReview");
      out.innerHTML = "<p>جارٍ مراجعة الوصول…</p>";
      try {
        const payload = memberPayload(f),
          r = await api("users/access-preview", {
            id: f.dataset.memberId || undefined,
            ...payload,
          });
        out.innerHTML = `<div class="member-review-identity"><span class="avatar avatar-gold">${esc(payload.name.slice(0, 1))}</span><div><h3>${esc(payload.name)}</h3><span dir="ltr">${esc(payload.phone || payload.email || "")}</span></div><span class="pill ${payload.status === "active" ? "green" : "amber"}">${memberStateLabels[payload.status]}</span></div><div class="member-review-access"><strong>${f.elements.namedItem("access_mode").value === "full" ? "كامل صلاحيات المنصة" : "الوصول الذي سيحصل عليه"}</strong><p>${payload.status === "active" ? "الحساب معتمد. يبدأ الوصول عند تسجيل الدخول وتوثيق هويته." : "لن يدخل مساحة العمل حتى تغيّر حالته إلى نشط."}</p></div>${r.committees.length ? `<div class="member-review-committees">${r.committees.map((c) => `<span>${esc(c.name)} · ${esc(c.role)}</span>`).join("")}</div>` : ""}<div class="table-wrap"><table><thead><tr><th>القسم</th><th>النطاق</th><th>ما يمكنه فعله</th></tr></thead><tbody>${r.access.map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.scope)}</td><td>${esc(x.actions.join("، "))}</td></tr>`).join("")}</tbody></table></div>${r.restrictions.length ? `<div class="notice">قيود صريحة: ${r.restrictions.map(esc).join("، ")}</div>` : ""}<p class="form-note">الموافقة المالية تبقى على مرحلتين. تعيين المعتمد الثاني يتم من إعدادات كل لجنة، بعد منحه صلاحية الاعتماد.</p>`;
      } catch (e) {
        out.innerHTML = `<div class="form-error">${esc(e.message)}</div>`;
        return;
      }
    }
    f.dataset.step = String(step);
    f.querySelectorAll("[data-member-step]").forEach(
      (e) => (e.hidden = Number(e.dataset.memberStep) !== step),
    );
    f.querySelectorAll("[data-member-step-link]").forEach((e) => {
      e.classList.toggle("active", Number(e.dataset.memberStepLink) === step);
      e.setAttribute(
        "aria-current",
        Number(e.dataset.memberStepLink) === step ? "step" : "false",
      );
    });
    $("#memberBack").hidden = step === 0;
    $("#memberNext").hidden = step === 2;
    $("#memberSave").hidden = step !== 2;
    $("#memberSave").textContent =
      f.elements.namedItem("status").value === "active"
        ? "اعتماد الحساب وحفظ الوصول"
        : "حفظ إعدادات الحساب";
    $("#modalBody").scrollTop = 0;
  }
  function memberForm(id) {
    const m = S.members.find((x) => x.id === id) || {
      grants: [],
      bundles: [],
      status: "invited",
    };
    const links = S.committees
      .filter((c) => c.members.some((x) => x.id === id))
      .map((c) => ({
        committee_id: c.id,
        role:
          c.manager_id === id
            ? "manager"
            : c.members.find((x) => x.id === id).role,
      }));
    const isFull =
      m.grants.length === 1 &&
      m.grants[0].resource === "*" &&
      m.grants[0].action === "*" &&
      m.grants[0].effect === "allow" &&
      (m.grants[0].scope || "all") === "all" &&
      !m.grants[0].expires &&
      !m.bundles.length;
    const mode = isFull
      ? "full"
      : m.grants.length || m.bundles.length
        ? "custom"
        : "committee";
    modal(
      m.id
        ? (m.status === "pending" ? "مراجعة طلب " : "وصول ") + m.name
        : "إضافة عضو للديوان",
      `<form id="memberForm" class="member-wizard" data-step="0" data-member-id="${esc(m.id || "")}">
      <div class="member-stepper">${["بيانات الحساب", "اللجان والصلاحيات", "مراجعة واعتماد"].map((x, i) => `<span data-member-step-link="${i}" class="${i === 0 ? "active" : ""}"><b>${i + 1}</b>${x}</span>`).join("")}</div>
      <section data-member-step="0" class="form-grid"><div class="full"><h3>بيانات المستخدم</h3><p class="muted">رقم الجوال هو مفتاح حساب العضو. المسمى للتعريف به، والصلاحيات تحددها في الخطوة التالية.</p></div>${field("الاسم *", input("name", m.name || "", "text", "required"))}${field("رقم الجوال *", input("phone", m.phone || "", "tel", 'required dir="ltr" placeholder="+9665XXXXXXXX" pattern="\\+[1-9][0-9]{7,14}"'))}${field("المسمى — اختياري", input("team", m.team || "", "text", 'placeholder="مشرف عام، متابعة مالية…"'))}${field("البريد — اختياري", input("email", m.email || "", "email", 'dir="ltr"'))}${field(
        "قرار الحساب",
        select(
          "status",
          [
            ["active", "اعتماد الحساب — نشط"],
            ["pending", "إبقاء الطلب بانتظار الموافقة"],
            ["invited", "تجهيز الحساب دون تفعيل"],
            ["suspended", "إيقاف الوصول"],
          ],
          m.status,
        ),
        true,
      )}<p class="form-note full">${m.id ? "يمكنك تعديل الصلاحيات أو إيقاف الوصول لاحقًا من ملف العضو." : "إذا اخترت اعتماد الحساب الآن، يدخل العضو بعد توثيق الرقم نفسه. اختيار «تجهيز الحساب» يبقيه بانتظار موافقتك."}</p></section>
      <section data-member-step="1" class="form-grid" hidden><div class="full"><h3>ماذا يستطيع أن يرى وينجز؟</h3><p class="muted">اختر طريقة الوصول، ثم اربطه باللجان التي يعمل معها.</p></div><div class="access-mode-options full">${[
        [
          "committee",
          "حسب عضويته في اللجان",
          "يأخذ صلاحيات الدور داخل كل لجنة فقط.",
        ],
        [
          "full",
          "كامل صلاحيات المنصة",
          "جميع المشاريع واللجان والأعضاء والمصاريف والإعدادات.",
        ],
        [
          "custom",
          "صلاحيات أخصصها بنفسي",
          "أقسام وإجراءات محددة، مع نطاقات واستثناءات.",
        ],
      ]
        .map(
          ([v, t, h]) =>
            `<label><input type="radio" name="access_mode" value="${v}" ${v === mode ? "checked" : ""}><span><strong>${t}</strong><small>${h}</small></span></label>`,
        )
        .join("")}</div>
      <div class="full access-full-note" ${mode === "full" ? "" : "hidden"}><strong>وصول شامل إلى المنصة</strong><p>يشمل إدارة الأعضاء ومنح الصلاحيات وتسجيل السداد. هذا الاختيار يستبدل التخصيص السابق بوصول كامل، مع بقاء تسلسل الاعتمادين ومنع اعتماد الشخص لمصروفه.</p></div>
      <div class="full"><h3>اللجان التي يعمل معها</h3><p class="muted">عضوية اللجنة تحدد مسؤوليات العمل. يمكن تركها فارغة لمن لديه وصول عام.</p></div><div class="full" id="memberCommittees">${links.map(memberLinkRow).join("")}</div><button type="button" class="button full" data-action="member-link-add">+ ربط بلجنة</button><div class="role-explainer full"><span><strong>عضو اللجنة</strong>مهامه ومصاريفه.</span><span><strong>مدير اللجنة</strong>متابعة مهام اللجنة واعتماد الإنجاز والموافقة الأولى للمصاريف.</span><span><strong>مشرف متابعة</strong>الاطلاع على عمل اللجنة ومصاريفه الشخصية.</span></div>
      <div id="memberCustom" class="full" ${mode === "custom" ? "" : "hidden"}>${
        S.bundles.length
          ? field(
              "حزم محفوظة — اختياري",
              multi(
                "bundles",
                S.bundles.map((b) => [b.id, b.name]),
                m.bundles,
              ),
              true,
            )
          : ""
      }<div class="permission-shortcuts"><strong>تجهيز معتمد المصروفات الثاني</strong><p>امنحه صلاحية الاعتماد هنا، ثم اختره في إعدادات اللجنة. يمكن اختيار الشخص نفسه لعدة لجان.</p>${select("approver_scope", [["", "اختر نطاق الاعتماد"], ...S.projects.map((p) => ["project:" + p.id, p.title + " · كل اللجان"]), ...S.committees.map((c) => ["committee:" + c.id, projectName(c.project_id) + " / " + c.name])], "")}<button type="button" class="button compact" data-action="grant-approver">إضافة صلاحية الاعتماد</button></div>${permissionsEditor(m.grants)}</div></section>
      <section data-member-step="2" hidden><h3>راجع الوصول قبل حفظه</h3><div id="memberReview"></div></section><div class="form-error" role="alert" hidden></div><div class="member-wizard-actions"><button type="button" class="button button-ghost" data-action="close-modal">إلغاء</button><button type="button" class="button" id="memberBack" data-action="member-back" hidden>السابق</button><button type="button" class="button button-dark" id="memberNext" data-action="member-next">التالي</button><button type="submit" class="button button-dark" id="memberSave" hidden>حفظ الوصول</button></div></form>`,
      async (fd, f) => {
        if (f.dataset.step !== "2")
          throw Error("راجع الوصول في الخطوة الأخيرة قبل الحفظ.");
        await api(
          "users/save",
          { id: m.id, version: m.version, ...memberPayload(f) },
          f.dataset.requestKey,
        );
        toast("حُفظ الحساب وصلاحياته وارتباطه باللجان");
      },
      true,
    );
    updatePermissionPreview();
  }
  function bundleForm(id) {
    const b = S.bundles.find((x) => x.id === id) || { grants: [] };
    modal(
      b.id ? "تعديل حزمة الصلاحيات" : "حزمة صلاحيات جديدة",
      `<form class="form-grid">${field("اسم الحزمة *", input("name", b.name || "", "text", 'required placeholder="اسم تختاره أنت"'), true)}<p class="form-note full">تعديل الحزمة يطبق على كل الأعضاء المرتبطين بها. يبقى المنع المباشر للعضو مقدمًا عليها.</p>${permissionsEditor(b.grants)}${actions("حفظ الحزمة")}</form>`,
      async (fd, f) => {
        await api(
          "bundles/save",
          {
            id: b.id,
            version: b.version,
            name: fd.get("name"),
            grants: readGrants(f),
          },
          f.dataset.requestKey,
        );
        toast("تم حفظ حزمة الصلاحيات");
      },
      true,
    );
    updatePermissionPreview();
  }
  function statusEditorRow(s) {
    return `<div class="status-setting" data-status-setting="${esc(s.id)}">${input("status_name", s.name, "text", 'required maxlength="60"')}${input("status_color", s.color, "color")}<label class="checkbox-line"><input type="checkbox" name="status_done" ${s.done ? "checked" : ""}> مكتملة</label><button class="icon-btn" type="button" data-action="remove-status" aria-label="حذف الحالة">${icon("close", 16)}</button></div>`;
  }
  function customFieldRow(c) {
    return `<div class="custom-field-row" data-custom-field="${esc(c.id)}">${input("custom_name", c.name, "text", 'required placeholder="اسم الحقل"')}${select(
      "custom_type",
      [
        ["text", "نص"],
        ["number", "رقم"],
        ["date", "تاريخ"],
        ["select", "قائمة اختيار"],
      ],
      c.type,
    )}${input("custom_options", (c.options || []).join("، "), "text", 'placeholder="خيارات القائمة بفاصلة"')}<label class="checkbox-line"><input type="checkbox" name="custom_required" ${c.required ? "checked" : ""}> مطلوب</label><button class="icon-btn" type="button" data-action="remove-custom-field" aria-label="حذف الحقل">${icon("close", 16)}</button></div>`;
  }
  const settingsTabs = {
    sanad: "تخصيص سَنَد",
    workspace: "هوية مساحة العمل",

    fields: "الحقول المخصصة",

    approvals: "سياسات الاعتماد",
    guide: "قالب دليل التنفيذ",

    notifications: "الإشعارات",
    connections: "الربط والخدمات",
    legacy: "السجلات السابقة",
  };
  async function showReadiness() {
    const out = $("#readinessResult");
    if (!out) return;
    out.textContent = "جارٍ فحص الجاهزية…";
    try {
      const r = await api("readiness"),
        names = {
          ai: "سَنَد",
          voice: "الصوت",
          whatsapp: "تنبيهات واتساب",
          phone: "توثيق الجوال",
          webhook: "حالات تسليم واتساب",
        };
      if (!out.isConnected) return;
      out.innerHTML = `<div class="integration-grid">${r.components.map((c) => `<article class="integration-card"><span class="pill ${c.status === "configured_unverified" ? "green" : "amber"}">${c.status === "configured_unverified" ? "مهيأ · يحتاج اختبارًا فعليًا" : "يحتاج إعداد الربط"}</span><h3>${names[c.id]}</h3><p>${c.missing.length ? "الإعدادات غير مكتملة" : "راجع التفعيل وصحة الإعدادات"}</p></article>`).join("")}</div><section class="detail-section"><h3>مسارات اللجان</h3>${r.issues.length ? `<ul>${r.issues.map((i) => `<li><button type="button" class="text-link" data-action="committee-edit" data-id="${esc(i.id)}">${esc(i.title)}</button> · ${esc(i.issue)}</li>`).join("")}</ul>` : "<p>لا توجد نواقص في تعيين المعتمدين والبنود للجان الحالية.</p>"}</section><section class="detail-section"><h3>متطلبات تشغيل الفريق والربط الخارجي</h3><ul>${[...r.configuration_issues, ...r.external_gates].map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section><p>آخر دورة صيانة: ${r.maintenance?.completed_at ? esc(r.maintenance.completed_at.replace("T", " ").slice(0, 19)) : "لم تُشغل بعد"} · حفظ محادثات سند: ${num(r.agent.retention_days)} يومًا</p><div class="readiness-deliveries">${r.deliveries.map((d) => `<span class="pill">${esc({ accepted: "قُبل الإرسال", sent: "أُرسلت", delivered: "وصلت", read: "قُرئت", retry: "تنتظر المحاولة", sending: "جارٍ الإرسال", needs_review: "تحتاج مراجعة", not_eligible: "غير مؤهلة للإرسال", failed: "فشل التسليم" }[d.status] || d.status)}: ${num(d.count)}</span>`).join("")}</div>`;
    } catch (e) {
      out.textContent = e.message;
    }
  }
  function settingsPage() {
    const s = S.settings;
    let body = "";
    switch (selectedSettings) {
      case "workspace":
        body =
          field(
            "اسم مساحة العمل",
            input("name", s.name, "text", "required"),
            true,
          ) +
          field(
            "العبارة التعريفية",
            textarea("description", s.description, 2),
            true,
          ) +
          '<div class="soft-box full"><img src="/brand/isotype.png" alt="شعار النائلات" width="74"><p>الهوية: الأسود، الرملي، والأبيض. الخط: تجوال.</p><span class="muted">المنطقة الزمنية: الرياض · العملة: ريال سعودي</span></div>';
        break;
      case "statuses":
        body =
          '<p class="form-note full">أضف حالات العمل من البداية إلى الإغلاق. لا يمكن حذف حالة مرتبطة بمهام قائمة.</p><div id="statusEditor" class="full status-editor">' +
          s.taskStatuses.map(statusEditorRow).join("") +
          '</div><div class="full"><button class="button" type="button" data-action="add-status">' +
          icon("plus") +
          " إضافة حالة</button></div>";
        break;
      case "fields":
        body =
          '<p class="form-note full">حقول إضافية تظهر في نموذج المهمة وتفاصيلها. احتفظ بمعرف الحقل لحماية بياناته السابقة.</p><div id="customEditor" class="full">' +
          s.customFields.map(customFieldRow).join("") +
          '</div><div class="full"><button class="button" type="button" data-action="add-custom-field">' +
          icon("plus") +
          " إضافة حقل</button></div>";
        break;
      case "templates":
        body = `<div class="full">${
          s.taskTemplates.length
            ? table(
                ["القالب", "الأولوية", "الخطوات", ""],
                s.taskTemplates.map(
                  (t) =>
                    `<tr><td>${esc(t.name)}</td><td>${esc(s.priorities.find((p) => p.id === t.priority)?.name || "عادية")}</td><td>${num(t.checklist?.length || 0)}</td><td><button type="button" class="icon-btn" data-action="template-remove" data-id="${esc(t.id)}" aria-label="حذف القالب">${icon("close")}</button></td></tr>`,
                ),
              )
            : '<p class="muted">افتح أي مهمة، ثم اختر «حفظ المهمة كقالب». يظهر القالب عند إنشاء المهام الجديدة.</p>'
        }</div>`;
        break;
      case "approvals":
        body =
          '<div class="notice full"><strong>مسار المهام:</strong> المنفذ يرفع الإنجاز، ومدير اللجنة يراجعه ويعتمده أو يعيده للاستكمال.<br><strong>مسار المصروف:</strong> مدير اللجنة ثم المعتمد الثاني المحدد للجنة، ويجب أن يكونا شخصين مختلفين.<br>لا يختار العضو المعتمدين. تحددهم الإدارة من صلاحيات المستخدمين وإعداد اللجنة. الفاتورة أو إثبات الدفع مطلوب للإرسال.</div><div class="full"><button type="button" class="button" data-page="projects">إعدادات المشاريع</button><button type="button" class="button" data-page="committees">إعدادات اللجان والبنود</button></div>';
        break;
      case "guide":
        body =
          field(
            "عنوان القالب",
            input("guideName", s.guideTemplate.name, "text", "required"),
            true,
          ) +
          field(
            "أقسام الدليل — كل قسم بسطر",
            textarea(
              "guideSections",
              s.guideTemplate.sections.join("\n"),
              7,
              "required",
            ),
            true,
          ) +
          `<label class="toggle-row full"><span><strong>اعتماد هذا القالب</strong><small>اعتماد الهيكل لا يعني اعتماد محتوى كل دليل. الإصدار الحالي ${num(s.guideTemplate.version)}.</small></span><input type="checkbox" name="guideApproved" ${s.guideTemplate.approved ? "checked" : ""}></label>`;
        break;
      case "categories":
        body = field(
          "تصنيفات المصروفات — كل تصنيف بسطر",
          textarea("categories", s.categories.join("\n"), 8, "required"),
          true,
        );
        break;
      case "notifications":
        body = `<div class="notice full">الإشعارات داخل الديوان تعمل. واتساب متوقف حتى ربط المزود؛ لا تُعرض الرسائل على أنها مرسلة.</div><label class="toggle-row full"><span><strong>تجهيز تنبيه واتساب عند الإسناد</strong><small>يسجل الحدث بحالة «بانتظار الربط».</small></span><input type="checkbox" name="taskAssigned" ${s.notifications.taskAssigned ? "checked" : ""}></label><p class="form-note full">إسناد المهام وقرارات اعتماد المصاريف ينشئ إشعارات داخل الديوان. تذكيرات المواعيد تعمل عند تشغيل الصيانة أو ربط المجدول على الاستضافة.</p>`;
        break;
      case "sanad":
        body = `${field(
          "أسلوب الرد",
          select(
            "sanad_tone",
            [
              ["clear", "واضح ومباشر"],
              ["formal", "رسمي"],
            ],
            s.sanad.tone,
          ),
        )}${field(
          "مستوى التفصيل",
          select(
            "sanad_detail",
            [
              ["brief", "مختصر"],
              ["balanced", "متوازن"],
              ["detailed", "مفصل"],
            ],
            s.sanad.detail,
          ),
        )}${field("تعريف المشاركة لسند", textarea("sanad_context", s.sanad.event_context, 4, 'required maxlength="1500"'), true)}${field("حفظ المحادثات — أيام", input("sanad_retention", s.sanad.retention_days, "number", 'required min="1" max="90"'))}<p class="form-note full">التخصيص يضبط الردود وسياق المشاركة. صلاحيات العضو ومسارات الاعتماد ثابتة على الخادم. يستطيع كل عضو حذف محادثاته. التنظيف الدوري يزيل المحادثات بعد المدة المحددة.</p>`;
        break;
      case "connections":
        body = `<div class="notice full">راجع جاهزية الربط ومسارات اللجان من هنا. وجود الإعدادات لا يعني نجاح الاتصال الفعلي بالمزود.</div><div class="full location-actions"><button type="button" class="button button-dark" data-action="readiness-check">فحص جاهزية الديوان</button><button type="button" class="button" data-action="maintenance-run">تشغيل التذكيرات والصيانة</button></div><div class="full" id="readinessResult" aria-live="polite"></div><p class="form-note full">مفاتيح الربط تحفظ في إعدادات الخادم. التذكيرات تراعي صلاحيات المستلم وموافقته على واتساب، والمحادثات تنظف وفق المدة المحددة.</p>`;
        break;
      case "legacy":
        body =
          '<div class="full"><p>السجلات السابقة محفوظة في أرشيفها الأصلي. افحصها ثم استورد نسخة إلى هيكلة الديوان الحالية عند الحاجة.</p><button class="button" type="button" data-action="legacy-inspect">فحص السجلات السابقة</button><div id="legacyResult"></div></div>';
        break;
    }
    return (
      heading(
        "على طريقتك.",
        "خصص الديوان بما يناسب عملك؛ الحالات والحقول والقوالب والسياسات.",
      ) +
      `<div class="settings-grid"><nav class="settings-menu">${Object.entries(
        settingsTabs,
      )
        .map(
          ([id, name]) =>
            `<button class="${selectedSettings === id ? "active" : ""}" data-action="settings-tab" data-tab="${id}">${name}</button>`,
        )
        .join(
          "",
        )}</nav><section class="panel settings-panel"><div class="panel-header"><h2>${settingsTabs[selectedSettings]}</h2>${icon("settings")}</div><div class="panel-body"><form id="settingsForm" class="form-grid">${body}${can("settings", "manage") && !["connections", "templates", "legacy", "approvals"].includes(selectedSettings) ? '<div class="form-error full" hidden></div><div class="form-actions full"><button class="button button-dark" type="submit">حفظ الإعدادات</button></div>' : ""}</form></div></section></div>`
    );
  }
  function routeRow(id = "") {
    return `<div class="inline-input">${select(
      "reviewer",
      S.people.map((u) => [u.id, u.name]),
      id,
    )}<button class="icon-btn" type="button" data-action="remove-reviewer" aria-label="حذف المراجع">${icon("close", 16)}</button></div>`;
  }
  async function saveSettings(form) {
    const fd = new FormData(form),
      s = structuredClone(S.settings),
      lines = (v) =>
        String(v || "")
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean);
    switch (selectedSettings) {
      case "sanad":
        s.sanad = {
          tone: fd.get("sanad_tone"),
          detail: fd.get("sanad_detail"),
          event_context: fd.get("sanad_context"),
          retention_days: Number(fd.get("sanad_retention")),
        };
        break;
      case "workspace":
        s.name = fd.get("name");
        s.description = fd.get("description");
        break;
      case "statuses":
        s.taskStatuses = [
          ...form.querySelectorAll("[data-status-setting]"),
        ].map((r) => ({
          id: r.dataset.statusSetting,
          name: r.querySelector("[name=status_name]").value,
          color: r.querySelector("[name=status_color]").value,
          done: r.querySelector("[name=status_done]").checked,
        }));
        break;
      case "fields":
        s.customFields = [...form.querySelectorAll("[data-custom-field]")].map(
          (r) => ({
            id: r.dataset.customField,
            name: r.querySelector("[name=custom_name]").value,
            type: r.querySelector("[name=custom_type]").value,
            required: r.querySelector("[name=custom_required]").checked,
            options: r
              .querySelector("[name=custom_options]")
              .value.split(/[,،]/)
              .map((x) => x.trim())
              .filter(Boolean),
          }),
        );
        break;
      case "approvals":
        s.approval = {
          allowSelf: fd.has("allowSelf"),
          requireReceipt: fd.has("requireReceipt"),
          route: fd.getAll("reviewer"),
        };
        s.taskReview = {
          required: fd.has("taskReviewRequired"),
          requireProof: fd.has("taskRequireProof"),
        };
        break;
      case "guide":
        s.guideTemplate = {
          ...s.guideTemplate,
          name: fd.get("guideName"),
          sections: lines(fd.get("guideSections")),
          approved: fd.has("guideApproved"),
        };
        break;
      case "categories":
        s.categories = lines(fd.get("categories"));
        break;
      case "notifications":
        s.notifications = {
          ...s.notifications,
          taskAssigned: fd.has("taskAssigned"),
        };
        break;
      default:
        return;
    }
    await api("settings/save", { settings: s, version: S.settings_version });
    await refresh();
    toast("حُفظ تخصيص الديوان");
  }
  function guideFields() {
    const g = assistantDraft,
      tpl = S.settings.guideTemplate;
    return `<form id="guideForm" class="form-grid"><div class="notice full">دليل تنفيذ بالقالب المعتمد للديوان. راجع الخطوات ومعيار القبول قبل تنزيله أو ربطه بالمهمة.</div>${field("عنوان المهمة والدليل *", input("title", g.title || "", "text", "required"), true)}${field(
      "المشروع *",
      select(
        "project_id",
        S.projects.map((p) => [p.id, p.title]),
        g.project_id || project || S.projects[0]?.id,
        "required " + (g.task_id ? "disabled" : ""),
      ),
      true,
    )}${field("المسؤول المقترح", select("assignee_id", [["", "غير مسندة"], ...S.people.map((p) => [p.id, p.name])], g.content?.assignee_id || ""))}${field("تاريخ الاستحقاق", input("due", g.content?.due || "", "date"))}${field(
      "الأولوية",
      select(
        "priority",
        S.settings.priorities.map((p) => [p.id, p.name]),
        g.content?.priority || "normal",
      ),
      true,
    )}<div class="field-section full">${esc(tpl.name)} <span class="pill ${tpl.approved ? "green" : "amber"}">${tpl.approved ? "قالب معتمد" : "قالب أولي"} · ${num(tpl.version)}</span></div>${(g.content?.sections || tpl.sections.map((title) => ({ title, body: "" }))).map((s, i) => field(esc(s.title), textarea("section_" + i, s.body || "", 3, `data-section-title="${esc(s.title)}"`), true)).join("")}<div class="form-error full" hidden></div><div class="form-actions full"><button class="button" type="submit" name="guideAction" value="save">حفظ المسودة</button><button class="button" type="submit" name="guideAction" value="pdf">${icon("download", 16)} PDF</button><button class="button button-dark" type="submit" name="guideAction" value="task">${g.task_id ? "إرفاق بالمهمة" : "مراجعة وتحويل إلى مهمة"}</button></div><p class="form-note full">ملف الدليل يحمل علامة «مسودة للمراجعة». إسناد المهمة قرار مستقل تؤكده بعد مراجعة التفاصيل.</p></form>`;
  }
  let sanadTurns = [],
    sanadContext = {},
    sanadRecorder = null,
    sanadBusy = false;
  const sanadSymbol =
    '<img class="sanad-welcome-mark" src="/brand/isotype.png" width="64" height="64" alt="">';
  function sanadChatView() {
    const connected = S.integrations?.ai;
    $("#assistantBody").innerHTML =
      `<div class="sanad-context"><span>${esc(labels[sanadContext.page] || "الديوان")}</span><strong>${esc(sanadContext.task_id ? S.tasks.find((t) => t.id === sanadContext.task_id)?.title || "" : sanadContext.committee_id ? committeeName(sanadContext.committee_id) : sanadContext.project_id ? projectName(sanadContext.project_id) : "بحسب وصولك")}</strong></div><div id="sanadMessages" class="sanad-messages" aria-live="polite">${sanadTurns.length ? sanadTurns.map((t) => `<div class="sanad-bubble from-member">${esc(t.message)}</div><div class="sanad-bubble from-sanad"><span class="eyebrow">سَنَد</span><p>${esc(t.reply)}</p>${t.proposal?.resource ? `<button class="button compact" data-action="sanad-draft" data-id="${esc(t.id)}">مراجعة ${esc({ tasks: "المهمة", expenses: "المصروف", suppliers: "المورد", assets: "الأصل", guides: "دليل التنفيذ" }[t.proposal.resource])}</button>` : ""}<small>${t.created ? date(t.created.slice(0, 10)) : "الآن"}</small></div>`).join("") : `<div class="sanad-welcome">${sanadSymbol}<span class="eyebrow">سَنَد الديوان</span><h2>ما الذي ننجزه اليوم؟</h2><p>من متابعة اللجان إلى تفاصيل المهمة،<br>ابدأ بسؤالك أو بما تريد إنجازه.</p></div>`}</div><div class="sanad-history-actions"><button type="button" class="text-link" data-action="sanad-clear">حذف محادثاتي</button><span>المحادثة ضمن النطاق الحالي</span></div><div class="sanad-suggestions">${["وش أعلى بند صرفنا عليه؟", "جهّز لي مهمة لاستقبال الضيوف", "أبغى أضيف مورد خيام"].map((q) => `<button type="button" data-action="sanad-suggest" data-prompt="${esc(q)}">${q}</button>`).join("")}</div>${!connected ? '<div class="sanad-offline">المحادثة والتحليل بانتظار تفعيل خدمة الذكاء الاصطناعي. يمكنك الآن فتح النماذج وتجهيز دليل التنفيذ.</div>' : ""}<form id="sanadChatForm" class="sanad-composer"><textarea name="message" rows="2" maxlength="6000" required aria-label="رسالتك إلى سَنَد" placeholder="اسأل، أو صف ما تريد إنجازه…"></textarea><div><button class="icon-btn" type="button" data-action="sanad-voice" aria-label="تسجيل رسالة صوتية">${icon("mic")}</button><span id="sanadVoiceState"></span><button class="button button-dark" type="submit">إرسال ${icon("arrow", 16)}</button></div><p class="form-error" hidden></p></form><details class="sanad-quick"><summary>أدوات الديوان <span>المهام · المصاريف · الوثائق</span></summary><div class="sanad-tools">${[
        ["tasks", "task-new", "مهمة"],
        ["expenses", "expense-new", "مصروف وفاتورة"],
        ["suppliers", "supplier-new", "مورد"],
        ["assets", "asset-new", "أصل"],
      ]
        .filter(([r]) => mayCreate(r))
        .map(
          ([r, a, l]) =>
            `<button type="button" data-action="${a}">${icon(r, 16)} ${l}</button>`,
        )
        .join(
          "",
        )}<button type="button" data-action="assistant-spend">المصاريف من السجلات</button>${mayCreate("assistant") && S.projects.length ? '<button type="button" data-action="sanad-guide">دليل تنفيذ PDF</button>' : ""}</div></details>`;
    $("#sanadChatForm").onsubmit = sendSanad;
    const m = $("#sanadMessages");
    m.scrollTop = m.scrollHeight;
  }
  async function openAssistant(taskId) {
    if (!S.modules.includes("assistant"))
      return toast("ليس لديك وصول لسَنَد", true);
    taskId ||= $("#detail").open ? $("#detail").dataset.taskId : "";
    sanadContext = {
      page,
      project_id: project || "",
      committee_id: committee || "",
      task_id: taskId || "",
    };
    if (taskId) {
      const t = S.tasks.find((t) => t.id === taskId);
      if (t) {
        sanadContext.project_id = t.project_id;
        sanadContext.committee_id = t.meta?.committee_id || "";
      }
    }
    sanadTurns = [];
    sanadChatView();
    if (!$("#assistant").open) $("#assistant").showModal();
    $("#assistant").dataset.loading = "true";
    try {
      sanadTurns = (await api("agent/history")).turns.filter((t) =>
        ["project_id", "committee_id", "task_id"].every(
          (k) => (t.context[k] || "") === sanadContext[k],
        ),
      );
      if ($("#sanadChatForm")) {
        const typed = $("#sanadChatForm").elements.namedItem("message").value;
        sanadChatView();
        $("#sanadChatForm").elements.namedItem("message").value = typed;
      }
    } catch (e) {
      toast(e.message, true);
    } finally {
      $("#assistant").dataset.loading = "false";
    }
  }
  function openSanadGuide(taskId) {
    if (!mayCreate("assistant"))
      return toast("ليس لديك صلاحية إنشاء الأدلة", true);
    const task = S.tasks.find((t) => t.id === (taskId || sanadContext.task_id));
    assistantDraft = task
      ? {
          project_id: task.project_id,
          task_id: task.id,
          title: task.title,
          content: {
            assignee_id: task.assignee_id,
            due: task.due,
            priority: task.priority,
            sections: S.settings.guideTemplate.sections.map((title, i) => ({
              title,
              body: i === 0 ? task.description : "",
            })),
          },
        }
      : { project_id: project || S.projects[0]?.id, content: {} };
    $("#assistantBody").innerHTML =
      '<button class="button compact" data-action="assistant">العودة إلى المحادثة</button>' +
      guideFields();
    if (!$("#assistant").open) $("#assistant").showModal();
    $("#guideForm").addEventListener("submit", guideSubmit);
  }
  async function sendSanad(ev) {
    ev.preventDefault();
    if (sanadBusy) return;
    const f = ev.currentTarget,
      message = f.elements.namedItem("message").value.trim(),
      err = f.querySelector(".form-error");
    if (!message) return;
    sanadBusy = true;
    err.hidden = true;
    f.querySelector("[type=submit]").disabled = true;
    try {
      const r = await api("agent/ask", { message, context: sanadContext });
      sanadTurns.push({ ...r, message });
      sanadChatView();
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
    } finally {
      sanadBusy = false;
      if (f.isConnected) f.querySelector("[type=submit]").disabled = false;
    }
  }
  async function sanadVoice() {
    if (sanadRecorder?.state === "recording") {
      sanadRecorder.stop();
      return;
    }
    if (!S.integrations?.voice)
      return toast("المحادثة الصوتية بانتظار تفعيل خدمة الصوت.", true);
    if (!navigator.mediaDevices || !window.MediaRecorder)
      return toast("التسجيل غير متاح على هذا المتصفح.", true);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }),
      chunks = [];
    sanadRecorder = new MediaRecorder(stream);
    const timer = setTimeout(
      () => sanadRecorder?.state === "recording" && sanadRecorder.stop(),
      120000,
    );
    sanadRecorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    sanadRecorder.onstop = async () => {
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      const state = $("#sanadVoiceState");
      if (state) state.textContent = "جارٍ تفريغ الصوت…";
      try {
        const fd = new FormData();
        const mime = sanadRecorder.mimeType || "audio/webm";
        fd.set(
          "file",
          new Blob(chunks, { type: mime }),
          "voice." + (mime.includes("mp4") ? "m4a" : "webm"),
        );
        const r = await fetch("/api/agent/transcribe", {
          method: "POST",
          body: fd,
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if ($("#sanadChatForm"))
          $("#sanadChatForm").elements.namedItem("message").value = d.text;
        toast("راجع النص ثم أرسله إلى سَنَد.");
      } catch (e) {
        toast(e.message, true);
      } finally {
        if (state) state.textContent = "";
      }
    };
    sanadRecorder.start();
    $("#sanadVoiceState").textContent = "يسجل الآن · اضغط لإيقاف التسجيل";
  }
  function reviewSanadDraft(id) {
    const d = sanadTurns.find((t) => t.id === id)?.proposal;
    if (!d?.resource) return;
    $("#assistant").close();
    const v = d.fields;
    if (d.resource === "guides") {
      openSanadGuide();
      assistantDraft = {
        project_id: v.project_id || project || S.projects[0]?.id,
        title: v.title || "",
        content: {
          sections: S.settings.guideTemplate.sections.map((title, i) => ({
            title,
            body: [v.objective, v.steps, v.acceptance, v.notes][i] || "",
          })),
        },
      };
      $("#assistantBody").innerHTML = guideFields();
      $("#guideForm").addEventListener("submit", guideSubmit);
      return;
    }
    if (d.resource === "tasks")
      taskForm(null, {
        prefill: {
          ...v,
          meta: {
            committee_id: v.committee_id,
            type: v.type || "execution",
            outcome: v.outcome || "",
          },
        },
      });
    else if (d.resource === "suppliers") supplierForm();
    else if (d.resource === "assets") assetForm();
    else expenseForm();
    const f = $("#modalBody form");
    if (!f) return;
    for (const name of ["project_id", "committee_id", ...Object.keys(v)]) {
      const el = f.elements.namedItem(name);
      if (!el || typeof el.value === "undefined" || el.disabled) continue;
      if (
        el.tagName === "SELECT" &&
        !Array.from(el.options).some((o) => o.value === v[name])
      )
        continue;
      el.value = v[name];
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    f.insertAdjacentHTML(
      "afterbegin",
      '<div class="notice full">مسودة جهزها سَنَد. راجع الحقول وأكمل المطلوب؛ لا يُحفظ السجل ولا تُسند المهمة حتى ترسل النموذج.</div>',
    );
  }
  async function analyzeExpenseFile(button) {
    const f = button.closest("form"),
      file = [...f.querySelectorAll("input[type=file]")]
        .flatMap((i) => [...i.files])
        .find(
          (x) => x.type === "application/pdf" || x.type.startsWith("image/"),
        );
    if (!file) return toast("أرفق الفاتورة من جهازك أو صوّرها أولًا.", true);
    const cid = f.querySelector("[name=committee_id]").value,
      c = S.committees.find((c) => c.id === cid);
    button.disabled = true;
    const out = f.querySelector("#extractionResult");
    out.hidden = false;
    out.textContent = "جارٍ قراءة الفاتورة…";
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("purpose", "invoice");
      fd.set("resource", "expenses");
      fd.set("project", c.project_id);
      fd.set("committee", c.id);
      const up = await fetch("/api/upload", { method: "POST", body: fd }),
        u = await up.json();
      if (!up.ok) throw new Error(u.error);
      f.dataset.extractedFile = u.id;
      f.analyzedFile = file;
      const d = await api("extract", { file_id: u.id });
      const labels = {
        number: "رقم الفاتورة",
        date: "التاريخ",
        amount: "الإجمالي",
        tax: "الضريبة",
        description: "وصف المصروف",
        supplier_name: "اسم المورد",
      };
      out.innerHTML =
        "<strong>قراءة الفاتورة · راجع الحقول قبل إرسالها</strong>" +
        Object.entries(d.fields)
          .map(
            ([k, x]) =>
              `<div class="extraction-row"><span>${labels[k]}</span><b>${x.value === null ? "يحتاج إدخالًا يدويًا" : esc(x.value)}</b><small>${x.confidence === "clear" ? "مقروء" : "غير مؤكد"}</small></div>`,
          )
          .join("");
      for (const [k, x] of Object.entries(d.fields)) {
        if (x.value === null) continue;
        let el = f.elements.namedItem(k === "description" ? "title" : k);
        if (k === "supplier_name") {
          const matches = S.suppliers.filter(
            (s) => s.name.trim() === x.value.trim(),
          );
          if (matches.length === 1)
            f.elements.namedItem("supplier_id").value = matches[0].id;
          continue;
        }
        if (el) el.value = x.value;
      }
    } catch (e) {
      out.textContent =
        e.message + " يمكنك إدخال البيانات يدويًا؛ مرفقك محفوظ للمراجعة.";
    } finally {
      button.disabled = false;
    }
  }
  function showJoinState(account) {
    const stopped = account.status === "suspended";
    modal(
      stopped ? "حالة الحساب" : "طلب الانضمام",
      `<div class="join-state"><span class="avatar avatar-gold">${esc(account.name?.slice(0, 1) || "✓")}</span><h3>${stopped ? "الوصول إلى الحساب موقوف" : "وصل طلبك، يا " + esc(account.name || "ضيف الديوان")}</h3><p>${stopped ? "تواصل مع إدارة الديوان لمراجعة حالة حسابك." : "تم توثيق جوالك. تراجع إدارة الديوان طلبك وتحدد اللجان والصلاحيات قبل تفعيل حسابك."}</p><button class="button button-dark" data-action="join-check">التحقق من حالة الطلب</button></div>`,
    );
  }
  async function phoneForm(join = false) {
    let info = S?.integrations;
    try {
      const r = await api("auth/status");
      info = r;
      if (!S && r.account) {
        if (r.account.status !== "active") return showJoinState(r.account);
        await refresh();
        return navigate("overview");
      }
    } catch {}
    const available = !!info?.phone;
    modal(
      join
        ? "طلب الانضمام إلى فريق العمل"
        : S
          ? "توثيق رقم الجوال"
          : "دخول الديوان",
      `<form id="phoneForm" class="form-grid"><div class="join-progress full"><span class="active" id="joinStepPhone">1 · رقم الجوال</span><span id="joinStepCode">2 · رمز واتساب</span><span>3 · ${S ? "التوثيق" : "حالة الحساب"}</span></div>${join ? field("الاسم *", input("name", "", "text", "required"), true) : ""}${field("رقم الجوال *", input("phone", S?.user?.phone || "", "tel", 'required dir="ltr" placeholder="+9665XXXXXXXX"'), true)}${join ? '<p class="form-note full">بعد توثيق رقمك، يصل الطلب لإدارة الديوان لاعتماده وتحديد صلاحياتك.</p>' : ""}<label class="checkbox-line full"><input name="consent" type="checkbox" required> أوافق على استلام رمز التحقق عبر واتساب.</label><label class="checkbox-line full"><input name="notifications" type="checkbox"> استلام تنبيهات المهام والاعتمادات عبر واتساب.</label><div id="otpFields" class="full" hidden>${field("رمز التحقق", input("code", "", "text", 'inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" dir="ltr"'), true)}</div><p class="form-error full" hidden></p><div class="form-actions full"><button type="submit" class="button button-dark" ${available ? "" : "disabled"}>إرسال رمز التحقق</button><button type="button" class="button" id="resendOtp" hidden>إعادة إرسال الرمز</button></div>${!available ? '<p class="form-note full">التسجيل بالجوال غير متاح حاليًا. تواصل مع إدارة الديوان للانضمام.</p>' : ""}${!join && !S ? '<button type="button" class="text-link full" data-action="join-dيوان">ليس لديك حساب؟ اطلب الانضمام</button>' : ""}</form>`,
    );
    const f = $("#phoneForm"),
      button = f.querySelector("[type=submit]"),
      err = f.querySelector(".form-error");
    let challenge = "";
    const request = async () => {
      const r = await api("auth/request", {
        phone: f.elements.namedItem("phone").value,
        consent: f.elements.namedItem("consent").checked,
      });
      challenge = r.challenge_id;
      f.elements.namedItem("phone").readOnly = true;
      $("#otpFields").hidden = false;
      f.elements.namedItem("code").required = true;
      $("#joinStepPhone").classList.remove("active");
      $("#joinStepCode").classList.add("active");
      button.textContent = "تحقق وأكمل";
      $("#resendOtp").hidden = false;
      $("#resendOtp").disabled = true;
      setTimeout(() => {
        if ($("#resendOtp")) $("#resendOtp").disabled = false;
      }, r.retry_after * 1000);
      f.elements.namedItem("code").focus();
      toast(r.message);
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      button.disabled = true;
      err.hidden = true;
      try {
        if (!challenge) await request();
        else {
          const r = await api("auth/verify", {
            challenge_id: challenge,
            code: f.elements.namedItem("code").value,
            name: f.elements.namedItem("name")?.value,
            notifications: f.elements.namedItem("notifications").checked,
          });
          if (r.status === "active") {
            $("#modal").close();
            await refresh();
            navigate("overview");
            toast("حيّاك الله في ديوان النائلات");
          } else
            showJoinState({
              status: r.status,
              name: f.elements.namedItem("name")?.value,
            });
        }
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
      } finally {
        button.disabled = false;
      }
    };
    $("#resendOtp").onclick = async () => {
      try {
        await request();
      } catch (e) {
        err.textContent = e.message;
        err.hidden = false;
      }
    };
  }
  function collectGuide(f) {
    const fd = new FormData(f);
    return {
      ...assistantDraft,
      title: fd.get("title"),
      project_id: assistantDraft.task_id
        ? assistantDraft.project_id
        : fd.get("project_id"),
      content: {
        assignee_id: fd.get("assignee_id") || null,
        due: fd.get("due") || null,
        priority: fd.get("priority"),
        sections: [...f.querySelectorAll("[data-section-title]")].map((x) => ({
          title: x.dataset.sectionTitle,
          body: x.value,
        })),
      },
    };
  }
  async function persistGuide(g, key) {
    const res = await api("guides/save", g, key);
    assistantDraft = {
      ...g,
      id: res.id,
      version: res.version,
      template_version: S.settings.guideTemplate.version,
    };
    return assistantDraft;
  }
  async function guideSubmit(ev) {
    ev.preventDefault();
    const f = ev.currentTarget,
      button = ev.submitter,
      error = f.querySelector(".form-error");
    error.hidden = true;
    button.disabled = true;
    try {
      const g = collectGuide(f);
      await persistGuide(g);
      await refresh(false);
      if (button.value === "pdf") {
        await api("guides/" + assistantDraft.id + "/export");
        const blob = await DiwanExports.guidePDF(assistantDraft, S);
        DiwanExports.download(blob, "دليل-" + assistantDraft.title + ".pdf");
        toast("تم تجهيز ملف الدليل");
      } else if (button.value === "task") reviewGuideTask();
      else toast("حُفظت مسودة الدليل");
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  }
  function reviewGuideTask() {
    const g = structuredClone(assistantDraft);
    $("#assistant").close();
    if (!g.task_id) {
      project = g.project_id;
      taskForm(null, {
        guide: g,
        prefill: {
          title: g.title,
          description: g.content.sections
            .map((s) => s.title + "\n" + s.body)
            .join("\n\n"),
          due: g.content.due,
          priority: g.content.priority,
          assignee_id: g.content.assignee_id,
          meta: {},
        },
      });
      return;
    }
    modal(
      "إرفاق دليل التنفيذ",
      `<form><p class="notice">سيُرفق الدليل المصاغ بالمهمة «${esc(g.title)}» بوصفه دليل تنفيذ.</p>${actions("إرفاق الدليل")}</form>`,
      async () => {
        const blob = await DiwanExports.guidePDF(g, S),
          fd = new FormData();
        fd.set("purpose", "guide");
        fd.set(
          "attachments",
          new File([blob], "دليل-" + g.title + ".pdf", {
            type: "application/pdf",
          }),
        );
        await uploadFiles(fd, "tasks", g.project_id, g.task_id);
        toast("حُفظ دليل التنفيذ في ملف المهمة");
      },
    );
  }
  async function exportData(type, selectedIds) {
    let ids = "";
    if (type === "tasks")
      ids = filteredTasks()
        .map((t) => t.id)
        .join(",");
    const q = new URLSearchParams({ type });
    if (project && ["tasks", "expenses", "advances"].includes(type))
      q.set("project", project);
    if (type === "tasks") q.set("ids", ids || "none");
    if (committee) q.set("committee", committee);
    if (selectedIds) q.set("ids", selectedIds.join(","));
    const data = await api("export?" + q);
    const blob = DiwanExports.workbook(data);
    DiwanExports.download(
      blob,
      "ديوان-النائلات-" + labels[type] + "-" + today() + ".xlsx",
    );
    toast("تم تجهيز ملف Excel وفق صلاحياتك والتصفية الحالية");
  }
  function searchModal() {
    modal(
      "البحث في الديوان",
      `<label class="search-trigger full">${icon("search")}<input class="input" id="globalSearch" placeholder="ابحث عن مهمة أو لجنة أو عهدة أو دليل أو رقم أصل" autofocus></label><div id="searchResults" class="search-results"><p class="muted">ابحث في السجلات المتاحة لك</p></div>`,
    );
    $("#globalSearch").addEventListener("input", (e) => {
      const normalizeSearch = (v) =>
        String(v || "")
          .normalize("NFKC")
          .replace(/[\u064B-\u065F\u0640]/g, "")
          .replace(/[أإآ]/g, "ا")
          .toLocaleLowerCase("ar");
      const q = normalizeSearch(e.target.value.trim());
      const groups = [
        ["tasks", "task", "title"],
        ["projects", "project-open", "title"],
        ["expenses", "expense", "title"],
        ["assets", "asset", "name"],
        ["suppliers", "supplier-view", "name"],
        ["committees", "committee-open", "name"],
        ["advances", "advance", "title"],
        ["guides", "guide-view", "title"],
      ];
      $("#searchResults").innerHTML = q
        ? groups
            .flatMap(([r, a, key]) =>
              (S[r] || [])
                .filter((x) =>
                  normalizeSearch(
                    [x[key], x.description, x.serial, x.category]
                      .filter(Boolean)
                      .join(" "),
                  ).includes(q),
                )
                .slice(0, 10)
                .map(
                  (x) =>
                    `<button class="search-result" data-action="${a}" data-id="${x.id}">${icon(r)}<span>${esc(x[key])}<small>${r === "guides" ? "أدلة التنفيذ" : r === "suppliers" && x.meta?.media_profile ? "العلاقات الإعلامية" : labels[r]}</small></span>${icon("arrow", 14)}</button>`,
                ),
            )
            .join("") || '<p class="muted">لا توجد نتائج مطابقة.</p>'
        : '<p class="muted">اكتب كلمة للبحث.</p>';
    });
  }
  async function notificationsModal() {
    modal(
      "إشعارات الديوان",
      S.notifications.length
        ? S.notifications
            .map(
              (n) =>
                `<button class="notification ${n.status === "unread" ? "unread" : ""}" data-action="${n.resource === "tasks" ? "task" : n.resource === "advances" ? "advance" : "expense"}" data-id="${n.entity_id}"><span class="activity-icon">${icon(n.resource)}</span><span><strong>${esc(n.title)}</strong><p>${esc(n.body)}</p><small>${date(n.created)}</small></span></button>`,
            )
            .join("")
        : empty("أنت على اطلاع", "ستظهر هنا الإسنادات وقرارات اعتماد مصاريفك."),
    );
    await api("notifications/read", {});
    await refresh(false);
  }
  function quickModal() {
    modal(
      "ماذا تريد أن تضيف؟",
      `<div class="quick-grid">${[
        ["projects", "project-new", "مشروع"],
        ["tasks", "task-new", "مهمة"],
        ["expenses", "expense-new", "مصروف"],
        ["suppliers", "supplier-new", "مورد"],
        ["assets", "asset-new", "أصل"],
        ["users", "user-new", "عضو"],
      ]
        .filter(([r]) =>
          r === "users" ? can("users", "manage") : mayCreate(r),
        )
        .map(
          ([r, a, name]) =>
            `<button class="quick-card" data-action="${a}">${icon(r, 28)}<span>${name}</span></button>`,
        )
        .join("")}</div>`,
    );
  }
  async function recordVoice(id) {
    if (recorder?.state === "recording") {
      recorder.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
      throw Error(
        "التسجيل الصوتي غير متاح في هذا المتصفح. يمكنك إرفاق ملف صوتي.",
      );
    recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      ),
      chunks = [];
    recorder = new MediaRecorder(recordStream, mime ? { mimeType: mime } : {});
    const r = recorder;
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = async () => {
      recordStream?.getTracks().forEach((t) => t.stop());
      recorder = null;
      if (r.cancelled) return;
      try {
        const type = r.mimeType.split(";")[0],
          blob = new Blob(chunks, { type }),
          fd = new FormData();
        fd.set(
          "attachments",
          new File(
            [blob],
            "ملاحظة-صوتية-" +
              today() +
              (type === "audio/mp4"
                ? ".m4a"
                : type === "audio/ogg"
                  ? ".ogg"
                  : ".webm"),
            { type },
          ),
        );
        await uploadFiles(fd, "tasks", currentTask.project_id, id);
        await refresh(false);
        await openTask(id);
        toast("حُفظت الملاحظة الصوتية");
      } catch (e) {
        toast(e.message, true);
      }
    };
    r.start();
    const b = $("[data-action=record]");
    b.textContent = "إيقاف وحفظ التسجيل";
    b.classList.add("recording");
    $("#recordStatus").textContent = "جارٍ التسجيل…";
    setTimeout(() => {
      if (recorder === r && r.state === "recording") r.stop();
    }, 180000);
  }
  function stopRecording() {
    if (recorder && recorder.state !== "inactive") {
      recorder.cancelled = true;
      recorder.stop();
    }
    recordStream?.getTracks().forEach((t) => t.stop());
  }
  async function taskUpload(id) {
    const t = S.tasks.find((t) => t.id === id);
    modal(
      "إرفاق ملف للمهمة",
      `<form>${field(
        "نوع المرفق",
        select("purpose", [
          ["guide", "دليل يشرح طريقة التنفيذ"],
          ["reference", "مرجع أو مواصفات"],
          ["proof", "إثبات إنجاز"],
          ["voice", "توجيه صوتي"],
        ]),
      )}${uploadField()}${actions("إرفاق الملف")}</form>`,
      async (fd) => {
        await uploadFiles(fd, "tasks", t.project_id, id);
        await openTask(id);
        toast("حُفظ المرفق في قسمه داخل المهمة");
      },
    );
  }
  async function saveTaskTemplate(id) {
    const t = S.tasks.find((x) => x.id === id);
    modal(
      "حفظ المهمة كقالب",
      `<form class="form-grid">${field("اسم القالب *", input("name", t.title, "text", "required"), true)}<p class="form-note full">يحفظ العنوان والوصف والأولوية وخطوات التحقق. لا يحفظ الأشخاص أو المواعيد أو المرفقات.</p>${actions("حفظ القالب")}</form>`,
      async (fd, f) => {
        const settings = structuredClone(S.settings);
        settings.taskTemplates.push({
          id: crypto.randomUUID(),
          name: fd.get("name"),
          title: t.title,
          description: t.description,
          priority: t.priority,
          checklist: (t.meta.checklist || []).map((c) => c.text),
        });
        await api(
          "settings/save",
          { settings, version: S.settings_version },
          f.dataset.requestKey,
        );
        toast("أصبح القالب متاحًا لإنشاء المهام");
      },
    );
  }
  async function inspectLegacy() {
    const r = await api("legacy");
    $("#legacyResult").innerHTML = r.available
      ? `<div class="notice">${Object.entries(r.counts)
          .map(([k, v]) => esc(k) + ": " + num(v))
          .join(
            " · ",
          )}</div>${r.imported ? "<p>تم استيراد نسخة من هذه السجلات سابقًا.</p>" : btn("استيراد نسخة إلى الديوان", "legacy-import", "", "button-dark", "download")}`
      : '<p class="muted">لا توجد سجلات سابقة قابلة للاستيراد.</p>';
  }
  async function handleAction(el) {
    const a = el.dataset.action,
      id = el.dataset.id;
    if (
      el.closest("#assistant") &&
      ["task-new", "expense-new", "supplier-new", "asset-new"].includes(a)
    )
      $("#assistant").close();
    switch (a) {
      case "service-filter":
        serviceFilter = el.dataset.filterValue;
        render();
        break;
      case "schedule-filter":
        scheduleFilter = el.dataset.filterValue;
        render();
        break;
      case "decision-filter":
        decisionFilter = el.dataset.filterValue;
        render();
        break;
      case "field-filter":
        fieldFilter = el.dataset.filterValue;
        render();
        break;
      case "workspace-readiness":
        selectedSettings = "connections";
        navigate("settings");
        await showReadiness();
        break;
      case "workspace-export": {
        const current = DiwanWorkspace.derive(S, {
          project,
          committee,
          today: today(),
          can,
        });
        const rows = current.records[id] || S[id] || [];
        const selected = rows
          .filter((r) => can(id, "export", r))
          .map((r) => r.id);
        await exportData(id, selected.length ? selected : ["none"]);
        break;
      }
      case "supplier-view":
        supplierDetail(id);
        break;
      case "guide-view":
        guideDetail(id);
        break;
      case "grant-approver": {
        const value = $("[name=approver_scope]").value;
        if (!value) {
          toast("اختر مشروعًا أو لجنة أولًا", true);
          break;
        }
        const [scope, id] = value.split(":");
        for (const action of ["view", "approve"])
          $("#permissionRules").insertAdjacentHTML(
            "beforeend",
            ruleRow({
              resource: "expenses",
              action,
              effect: "allow",
              scope,
              ...(scope === "project"
                ? { projectId: id }
                : { committeeId: id }),
            }),
          );
        updatePermissionPreview();
        toast(
          "أضيفت قواعد المشاهدة والاعتماد. احفظ العضو ثم اختره داخل اللجنة.",
        );
        break;
      }
      case "sanad-clear":
        if (
          sanadBusy ||
          !confirm("حذف جميع محادثاتك مع سند؟ تبقى سجلات الديوان محفوظة.")
        )
          return;
        await api("agent/history/clear", {});
        sanadTurns = [];
        sanadChatView();
        toast("حُذفت محادثاتك");
        break;
      case "readiness-check":
        await showReadiness();
        break;
      case "maintenance-run": {
        await api("maintenance/run", {});
        toast("اكتملت دورة الصيانة؛ راجع حالة الربط والتنبيهات");
        await showReadiness();
        break;
      }
      case "integration-dispatch": {
        const r = await api("integrations/dispatch", {});
        toast(
          r.ready
            ? "قُبل إرسال " + num(r.accepted) + " تنبيه."
            : "واتساب بانتظار تهيئة المزود.",
        );
        break;
      }

      case "sanad-suggest":
        $("#sanadChatForm").elements.namedItem("message").value =
          el.dataset.prompt;
        $("#sanadChatForm").elements.namedItem("message").focus();
        break;
      case "sanad-draft":
        reviewSanadDraft(id);
        break;
      case "sanad-guide":
        openSanadGuide();
        break;
      case "sanad-voice":
        await sanadVoice();
        break;
      case "invoice-analyze":
        await analyzeExpenseFile(el);
        break;
      case "phone-verify":
        phoneForm();
        break;
      case "whatsapp-disable":
        await api("contact/preferences", { whatsapp: false });
        toast("أوقفت تنبيهات واتساب لحسابك.");
        break;

      case "join-dيوان":
        phoneForm(true);
        break;
      case "budget-add":
        $("#budgetCatalog").insertAdjacentHTML("beforeend", budgetRow());
        break;
      case "task-transition":
        await saveTaskStatus(
          S.tasks.find((t) => t.id === id),
          el.dataset.next,
        );
        break;
      case "comment-reply":
        $("#commentForm [name=reply_to]").value = id;
        $("#replyHint").hidden = false;
        $("#replyHint").textContent = "أنت ترد على رسالة محددة في المهمة";
        $("#commentForm [name=body]").focus();
        break;
      case "member-link-add":
        $("#memberCommittees").insertAdjacentHTML("beforeend", memberLinkRow());
        break;
      case "member-link-remove":
        el.closest("[data-member-link]").remove();
        break;
      case "sidebar-toggle":
        if (window.innerWidth <= 860) $("#sidebar").classList.toggle("open");
        else document.body.classList.toggle("sidebar-collapsed");
        syncMenu();
        break;
      case "menu":
        $("#sidebar").classList.toggle("open");
        syncMenu();
        break;
      case "theme":
        document.body.classList.toggle("dark");
        localStorage.setItem(
          "diwan-theme",
          document.body.classList.contains("dark") ? "dark" : "light",
        );
        break;
      case "close-modal":
        $("#modal").close();
        break;
      case "close-detail":
        stopRecording();
        $("#detail").close();
        break;
      case "close-assistant":
        $("#assistant").close();
        break;
      case "search":
        searchModal();
        break;
      case "notifications":
        await notificationsModal();
        break;
      case "quick":
        quickModal();
        break;
      case "advance-new":
        advanceForm();
        break;
      case "advance-export":
        await exportData("advances", [id]);
        break;
      case "advance-entry":
        advanceForm(id);
        break;
      case "advance":
        advanceDetail(id);
        break;
      case "committee-new":
        committeeForm();
        break;
      case "committee-edit":
        committeeForm(id);
        break;
      case "committee-open":
        $("#modal").close();
        committee = id;
        project = S.committees.find((c) => c.id === id).project_id;
        taskView = "kanban";
        taskFilter = { q: "", status: "", priority: "", assignee: "" };
        navigate("tasks");
        break;
      case "board-settings":
        boardForm();
        break;
      case "membership-add":
        $("#committeeMembers").insertAdjacentHTML(
          "beforeend",
          committeeMemberRow(),
        );
        break;
      case "membership-remove":
        el.closest("[data-membership]").remove();
        break;
      case "board-remove":
        el.closest("[data-board-column]").remove();
        break;
      case "board-up": {
        const row = el.closest("[data-board-column]");
        if (row.previousElementSibling) row.before(row.previousElementSibling);
        break;
      }
      case "board-down": {
        const row = el.closest("[data-board-column]");
        if (row.nextElementSibling) row.nextElementSibling.after(row);
        break;
      }
      case "task-request":
        requestForm(id);
        break;
      case "request-stage": {
        const t = S.tasks.find((t) => t.id === id),
          stage = el.dataset.stage;
        modal(
          requestNames[stage],
          `<form>${field("توضيح ما تم والكمية المستلمة أو المتبقية", textarea("note", "", 3, "required"), true)}${actions("تأكيد الخطوة وإشعار المسؤول التالي")}</form>`,
          async (fd, f) => {
            await api(
              "tasks/request-stage",
              { id, stage, version: t.version, note: fd.get("note") },
              f.dataset.requestKey,
            );
            $("#detail").close();
            toast("حُدث التسلسل وأُنشئ التنبيه");
          },
        );
        break;
      }
      case "project-new":
        projectForm();
        break;
      case "project-edit":
        projectForm(id);
        break;
      case "project-open":
        project = id;
        $("#modal").close();
        committee = "";
        navigate("committees");
        break;
      case "project-clone":
        cloneProject(id);
        break;
      case "task-new":
        taskForm(null, { status: el.dataset.status });
        break;
      case "task-edit":
        taskForm(id);
        break;
      case "task-duplicate":
        taskForm(id, { duplicate: true });
        break;
      case "task-sub":
        taskForm(null, {
          parent_id: id,
          project_id: S.tasks.find((t) => t.id === id).project_id,
        });
        break;
      case "task":
        $("#modal").close();
        await openTask(id);
        break;
      case "toggle-task": {
        const t = S.tasks.find((x) => x.id === id);
        await openTask(id);
        break;
      }
      case "task-view":
        taskView = el.dataset.view;
        render();
        break;
      case "calendar-prev":
        calendarOffset--;
        render();
        break;
      case "calendar-next":
        calendarOffset++;
        render();
        break;
      case "calendar-today":
        calendarOffset = 0;
        render();
        break;
      case "media-new":
        return mediaForm();
      case "media-edit":
        return mediaForm(id);
      case "media-detail":
        return mediaDetail(id);
      case "supplier-new":
        supplierForm();
        break;
      case "supplier-edit":
        supplierForm(id);
        break;
      case "expense-new":
        expenseForm();
        break;
      case "expense-edit":
        expenseForm(id);
        break;
      case "expense":
        expenseDetail(id);
        break;
      case "expense-approve":
        reviewExpense(id, true);
        break;
      case "expense-return":
        reviewExpense(id, false);
        break;
      case "expense-pay":
        paymentForm(id);
        break;
      case "asset-lookup":
        assetLookup();
        break;
      case "asset-labels":
        assetLabelPicker();
        break;
      case "asset-label":
        assetLabel(id);
        break;
      case "asset-new":
        assetForm();
        break;
      case "asset-edit":
        assetForm(id);
        break;
      case "asset":
        assetDetail(id);
        break;
      case "asset-move":
        assetMove(id);
        break;
      case "join-check":
        await phoneForm();
        break;
      case "member-tab":
        memberTab = el.dataset.tab;
        render();
        break;
      case "member-next":
        await memberStep(Number($("#memberForm").dataset.step) + 1);
        break;
      case "member-back":
        await memberStep(Number($("#memberForm").dataset.step) - 1);
        break;
      case "user-new":
        memberForm();
        break;
      case "user-edit":
        memberForm(id);
        break;
      case "bundle-new":
        bundleForm();
        break;
      case "bundle-edit":
        bundleForm(id);
        break;
      case "add-rule":
        $("#permissionRules").insertAdjacentHTML("beforeend", ruleRow());
        updatePermissionPreview();
        break;
      case "remove-rule":
        el.closest("tr").remove();
        updatePermissionPreview();
        break;
      case "settings-tab":
        selectedSettings = el.dataset.tab;
        render();
        break;
      case "add-status":
        $("#statusEditor").insertAdjacentHTML(
          "beforeend",
          statusEditorRow({
            id: "s_" + crypto.randomUUID().slice(0, 8),
            name: "حالة جديدة",
            color: "#cab799",
            done: false,
          }),
        );
        break;
      case "remove-status":
        el.closest("[data-status-setting]").remove();
        break;
      case "add-custom-field":
        $("#customEditor").insertAdjacentHTML(
          "beforeend",
          customFieldRow({
            id: "f_" + crypto.randomUUID().slice(0, 8),
            name: "",
            type: "text",
            options: [],
          }),
        );
        break;
      case "remove-custom-field":
        el.closest("[data-custom-field]").remove();
        break;
      case "add-reviewer":
        $("#approvalRoute").insertAdjacentHTML("beforeend", routeRow());
        break;
      case "remove-reviewer":
        el.closest(".inline-input").remove();
        break;
      case "task-template-save":
        await saveTaskTemplate(id);
        break;
      case "template-remove": {
        const settings = structuredClone(S.settings);
        settings.taskTemplates = settings.taskTemplates.filter(
          (t) => t.id !== id,
        );
        await api("settings/save", { settings, version: S.settings_version });
        await refresh();
        toast("تم حذف القالب");
        break;
      }
      case "assistant":
        $("#modal").close();
        await openAssistant();
        break;
      case "task-guide":
        sanadContext.task_id = id;
        openSanadGuide(id);
        break;
      case "guide-download": {
        const g = await api("guides/" + id + "/export");
        const blob = await DiwanExports.guidePDF(g, S);
        DiwanExports.download(blob, "دليل-" + g.title + ".pdf");
        break;
      }
      case "assistant-spend": {
        const es = S.expenses.filter((e) => e.status === "approved"),
          rank = [...es]
            .filter((e) => !e.amount_hidden)
            .sort((a, b) => b.amount - a.amount)
            .slice(0, 5);
        modal(
          "أعلى المصاريف المعتمدة",
          `<p class="form-note">تقرير مباشر من السجلات المتاحة لك. لم يُستخدم تحليل بالذكاء الاصطناعي.</p>${
            rank.length
              ? table(
                  ["المصروف", "المشروع", "الإجمالي"],
                  rank.map(
                    (e) =>
                      `<tr><td>${esc(e.title)}</td><td>${esc(e.project_title || projectName(e.project_id))}</td><td>${cash(e.amount)} ر.س</td></tr>`,
                  ),
                )
              : empty(
                  "لا توجد مصروفات معتمدة متاحة",
                  "تظهر النتائج بعد إضافة المصروفات واعتمادها.",
                )
          }`,
        );
        break;
      }
      case "export":
        await exportData(id);
        break;
      case "record":
        await recordVoice(id);
        break;
      case "task-upload":
        await taskUpload(id);
        break;
      case "legacy-inspect":
        await inspectLegacy();
        break;
      case "legacy-import":
        modal(
          "استيراد السجلات السابقة",
          `<form class="form-grid"><p class="full">سينشئ الديوان نسخة من السجلات السابقة داخل مشروع أرشيفي. المصاريف تُستورد كمسودات تحتاج مراجعة، والأعضاء السابقون يبقون بانتظار الموافقة. تبقى النسخة الأصلية محفوظة.</p><label class="checkbox-line full"><input type="checkbox" required> اطلعت على طريقة الاستيراد.</label>${actions("استيراد نسخة")}</form>`,
          async (fd, f) => {
            await api("legacy/import", {}, f.dataset.requestKey);
            toast("تم استيراد السجلات السابقة للمراجعة");
          },
        );
        break;
    }
  }
  document.addEventListener("click", async (ev) => {
    const el = ev.target.closest("[data-page],[data-action]");
    if (!el || el.disabled) return;
    if (el.tagName === "BUTTON") ev.preventDefault();
    try {
      if (el.dataset.page) {
        navigate(el.dataset.page);
        return;
      }
      await handleAction(el);
    } catch (e) {
      toast(e.message, true);
    }
  });
  document.addEventListener("change", async (ev) => {
    const el = ev.target;
    try {
      if (el.dataset.taskStatus)
        await saveTaskStatus(
          S.tasks.find((t) => t.id === el.dataset.taskStatus),
          el.value,
        );
      if (el.id === "projectFilter") {
        project = el.value;
        committee = "";
        render();
      }
      if (el.id === "committeeFilter") {
        committee = el.value;
        if (committee)
          project = S.committees.find((c) => c.id === committee).project_id;
        render();
      }
      if (el.name === "membership_role") {
        const row = el.closest("[data-membership]");
        const id = row.querySelector("[name=membership_id]").value;
        const selectedManager = $("#modalBody [name=manager_id]");
        if (el.value === "manager" && selectedManager)
          selectedManager.value = id;
        else if (selectedManager?.value === id) selectedManager.value = "";
        row.outerHTML = committeeMemberRow({
          id,
          role: el.value,
          grants: membershipPreset(el.value),
        });
      }
      if (el.dataset.filter && el.dataset.filter !== "q") {
        taskFilter[el.dataset.filter] = el.value;
        render();
      }
      if (el.name === "rule_resource") {
        const action = el.closest("tr").querySelector("[name=rule_action]"),
          options =
            resourceActions[el.value] ||
            (el.value.includes(".") ? ["view"] : Object.keys(actionLabels));
        action.innerHTML =
          '<option value="*">كل الإجراءات</option>' +
          options
            .map((a) => `<option value="${a}">${actionLabels[a]}</option>`)
            .join("");
        updatePermissionPreview();
      }
      if (el.type === "file") {
        const output = el.closest(".typed-upload")?.querySelector("output");
        if (output) output.dataset.verbatim = "";
        if (output)
          output.textContent = [...el.files].map((f) => f.name).join("، ");
      }
      if (el.dataset.checkItem) {
        el.disabled = true;
        await api("tasks/checklist", {
          id: currentTask.id,
          item_id: el.dataset.checkItem,
          done: el.checked,
          version: currentTask.version,
        });
        await refresh(false);
        await openTask(currentTask.id);
      }
      if (el.name === "access_mode") {
        $("#memberCustom").hidden = el.value !== "custom";
        $(".access-full-note").hidden = el.value !== "full";
        if (el.value === "custom")
          $("#memberForm [name=full_access]").checked = false;
      }
      if (el.closest(".permission-editor") || el.name === "bundles")
        updatePermissionPreview();
      if (el.name === "attachments") {
        const target = el
          .closest(".upload-zone")
          ?.querySelector(".selected-files");
        if (target) target.dataset.verbatim = "";
        if (target)
          target.textContent = [...el.files].map((f) => f.name).join("، ");
      }
    } catch (e) {
      toast(e.message, true);
      if (el.dataset.checkItem) {
        el.checked = !el.checked;
        el.disabled = false;
      }
    }
  });
  let filterTimer;
  document.addEventListener("input", (e) => {
    if (e.target.dataset.filter === "q") {
      const el = e.target;
      taskFilter.q = el.value;
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => {
        const at = el.selectionStart;
        render();
        const n = $("[data-filter=q]");
        n?.focus();
        n?.setSelectionRange(at, at);
      }, 250);
    }
  });
  document.addEventListener("submit", async (e) => {
    if (e.target.id !== "settingsForm") return;
    e.preventDefault();
    const f = e.target,
      b = f.querySelector("[type=submit]"),
      err = f.querySelector(".form-error");
    if (!b) return;
    b.disabled = true;
    try {
      await saveSettings(f);
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      b.disabled = false;
    }
  });
  document.addEventListener("dragstart", (e) => {
    const card = e.target.closest("[data-task-drag]");
    if (!card) return;
    e.dataTransfer.setData("text/plain", card.dataset.taskDrag);
    card.classList.add("dragging");
  });
  document.addEventListener("dragend", () =>
    $$(".dragging,.drag-over").forEach((x) =>
      x.classList.remove("dragging", "drag-over"),
    ),
  );
  document.addEventListener("dragover", (e) => {
    const c = e.target.closest("[data-status-drop]");
    if (c) {
      e.preventDefault();
      c.classList.add("drag-over");
    }
  });
  document.addEventListener("dragleave", (e) =>
    e.target.closest("[data-status-drop]")?.classList.remove("drag-over"),
  );
  document.addEventListener("drop", async (e) => {
    const c = e.target.closest("[data-status-drop]");
    if (!c) return;
    e.preventDefault();
    c.classList.remove("drag-over");
    const t = S.tasks.find(
      (t) => t.id === e.dataTransfer.getData("text/plain"),
    );
    if (!t) return;
    const others = filteredTasks()
      .filter((x) => x.status === c.dataset.statusDrop && x.id !== t.id)
      .sort((a, b) => (a.meta.rank || 0) - (b.meta.rank || 0));
    const target = e.target.closest("[data-task-drag]")?.dataset.taskDrag;
    const at = others.findIndex((x) => x.id === target);
    const before = at < 0 ? others.at(-1) : others[at - 1],
      after = at < 0 ? null : others[at];
    const rank =
      before && after
        ? ((before.meta.rank || 0) + (after.meta.rank || 0)) / 2
        : after
          ? (after.meta.rank || 0) - 1024
          : before
            ? (before.meta.rank || 0) + 1024
            : 0;
    try {
      if (t.status === c.dataset.statusDrop) {
        await api("tasks/reorder", { id: t.id, version: t.version, rank });
        await refresh();
      } else await saveTaskStatus(t, c.dataset.statusDrop);
    } catch (e) {
      toast(e.message, true);
    }
  });
  $("#detail").addEventListener("close", stopRecording);
  $("#assistant").addEventListener("close", () => {
    if (sanadRecorder?.state === "recording") sanadRecorder.stop();
  });
  setInterval(() => {
    if (
      S &&
      !document.hidden &&
      !document.querySelector("dialog[open]") &&
      !document.activeElement?.matches("input,textarea,select")
    )
      refresh().catch(() => {});
  }, 15000);
  function openLinkedRecord() {
    const [type, q] = location.hash.slice(1).split("?");
    if (!q) return;
    const id = new URLSearchParams(q).get("record");
    if (!id) return;
    const found = S?.[type]?.find((r) => r.id === id);
    if (!found) return toast("السجل غير متاح ضمن صلاحياتك الحالية.", true);
    if (type === "tasks") openTask(id);
    else if (type === "expenses") expenseDetail(id);
    else if (type === "advances") advanceDetail(id);
    else if (type === "assets") assetDetail(id);
  }
  window.addEventListener("hashchange", () => {
    const hash = location.hash.slice(1),
      [next, query] = hash.split("?");
    if (!S) {
      if (next === "heritage") {
        document.body.classList.add("landing-mode");
        $("#main").innerHTML = heritagePage();
        initHeritageMotion();
      } else phoneForm();
      return;
    }
    if (next && next !== page) {
      page = labels[next] ? next : "overview";
      renderNav();
      render();
    }
    openLinkedRecord();
    if (query) {
      const id = new URLSearchParams(query).get("asset");
      if (id && S?.assets.some((a) => a.id === id)) assetDetail(id);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#sidebar").classList.contains("open")) {
      $("#sidebar").classList.remove("open");
      syncMenu();
      $(".mobile-menu").focus();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      searchModal();
    }
  });
  try {
    if (localStorage.getItem("diwan-theme") === "dark")
      document.body.classList.add("dark");
  } catch {}
  window.addEventListener("resize", syncMenu);
  syncMenu();
  refresh()
    .then(() => {
      if (new URLSearchParams(location.search).get("join") === "1")
        phoneForm(true);
      openLinkedRecord();
      const [p, q] = location.hash.slice(1).split("?");
      if (q && p === "assets") {
        page = "assets";
        render();
        const id = new URLSearchParams(q).get("asset");
        if (S.assets.some((a) => a.id === id)) assetDetail(id);
      }
    })
    .catch((e) => {
      if (page === "heritage") {
        document.body.classList.add("landing-mode");
        $("#main").innerHTML = heritagePage();
        initHeritageMotion();
        return;
      }
      $("#main").innerHTML =
        `<div class="page-error"><div class="empty-symbol">${icon("lock", 30)}</div><h1>تعذر فتح مساحة العمل</h1><p>${esc(e.message)}</p><button class="button button-dark" id="retryBoot">إعادة المحاولة</button></div>`;
      $("#retryBoot").onclick = () => location.reload();
    });
})();
