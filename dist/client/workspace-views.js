/* Workspace composition uses only the server-filtered state and existing record forms. */
(() => {
  const catalog = [
    [
      "planning",
      "projects",
      "المواسم والمشاركات",
      "خطط للموسم وحدد أهدافه وتابع إنجازه",
      "projects",
      "project-new",
      "موسم جديد",
    ],
    [
      "planning",
      "committees",
      "اللجان والفريق",
      "وزع المسؤوليات وهيئ مسارات الاعتماد",
      "committees",
      "committee-new",
      "إضافة لجنة",
    ],
    [
      "planning",
      "tasks",
      "المهام والتنفيذ",
      "من التكليف إلى التسليم بإثبات واضح",
      "tasks",
      "task-new",
      "إنشاء مهمة",
    ],
    [
      "planning",
      "calendar",
      "تقويم المشاركة",
      "المهام والمواسم ومواعيد الأصول في مكان واحد",
      "calendar",
    ],
    [
      "planning",
      "check",
      "مركز القرارات",
      "كل ما ينتظر مراجعتك والخطوة المطلوبة منك",
      "decisions",
    ],
    [
      "field",
      "assets",
      "الأصول والتجهيزات",
      "سجل دائم للأصل وكمياته وموقعه وحركاته",
      "assets",
      "asset-new",
      "تسجيل أصل",
    ],
    [
      "field",
      "assets",
      "الخدمات الميدانية",
      "تابع الجاهزية ونهاية الإيجار وافتح سجل الأصل",
      "field",
    ],
    [
      "field",
      "search",
      "قراءة رمز الأصل",
      "امسح الرمز أو أدخل الرقم للوصول إلى ملفه",
      "assets",
      "asset-lookup",
      "قراءة الرمز",
    ],
    [
      "field",
      "documents",
      "ملصقات الأصول",
      "جهز رموز الأصول للطباعة الفردية والجماعية",
      "assets",
      "asset-labels",
      "تجهيز الملصقات",
    ],
    [
      "finance",
      "expenses",
      "المصاريف والإثباتات",
      "ارفع المصروف وتابع الاعتمادين والسداد",
      "expenses",
      "expense-new",
      "رفع مصروف",
    ],
    [
      "finance",
      "advances",
      "العهد المالية",
      "التمويل والتسوية والاسترداد في سجل واحد",
      "advances",
      "advance-new",
      "تسجيل عهدة",
    ],
    [
      "finance",
      "suppliers",
      "الموردون والشركاء",
      "بيانات الشريك وأعماله ومرفقاته عبر المواسم",
      "suppliers",
      "supplier-new",
      "إضافة مورد",
    ],
    [
      "finance",
      "reports",
      "التقارير والمتابعة",
      "اقرأ مؤشرات المشاركة وجهز تقارير السجلات",
      "reports",
    ],
    [
      "archive",
      "media",
      "العلاقات الإعلامية",
      "ملفات الإعلاميين وأعمال المشاركة ورصد الحسابات",
      "media",
      "media-new",
      "إضافة ملف إعلامي",
    ],
    [
      "archive",
      "documents",
      "الوثائق وأدلة التنفيذ",
      "ارجع إلى الأدلة والمرفقات المرتبطة بالعمل",
      "documents",
    ],
    [
      "archive",
      "assistant",
      "سَنَد",
      "ابحث واستفسر وجهز مسودة تراجعها قبل الحفظ",
      "assistant",
      "assistant",
      "فتح سَنَد",
    ],
    [
      "archive",
      "users",
      "الأعضاء والصلاحيات",
      "جهز الفريق وحدد وصول كل عضو إلى العمل",
      "users",
      "user-new",
      "إضافة عضو",
    ],
    [
      "archive",
      "settings",
      "جاهزية الديوان",
      "راجع إعدادات التكامل والخدمات ومتطلبات تشغيلها",
      "settings",
      "workspace-readiness",
      "فحص الجاهزية",
    ],
  ];
  const groups = {
    planning: ["01", "التخطيط وقيادة المشاركة"],
    field: ["02", "الميدان والتجهيزات"],
    finance: ["03", "المالية والشركاء"],
    archive: ["04", "المعرفة وإدارة الديوان"],
  };
  function visible(S, page) {
    const resources = { media: "suppliers", field: "assets" };
    if (
      [
        "calendar",
        "decisions",
        "services",
        "reports",
        "profile",
        "overview",
      ].includes(page)
    )
      return true;
    return S.modules.includes(resources[page] || page);
  }
  function setup(c) {
    const m = DiwanWorkspace.derive(c.S, {
      project: c.project,
      committee: c.committee,
      today: c.today(),
      can: c.can,
    });
    const filters = () => c.projectSelect() + c.committeeSelect();
    const scopeNote = () =>
      `<p class="scope-note">المؤشرات والمواعيد من السجلات المتاحة لك ضمن التصفية الحالية${c.committee ? " والأصول والعهد المالية موارد مشتركة تظهر عند اختيار كل اللجان" : c.project ? " وتظهر الأصول التي لها حركات مرتبطة بالموسم المختار" : ""}</p>`;
    const nav = (page, title, cls = "button button-ghost compact") =>
      `<button class="${cls}" data-page="${page}">${title}${c.icon("arrow", 16)}</button>`;
    const section = (title, body, to = "", link = "عرض الكل") =>
      `<section class="command-section panel"><div class="section-heading"><h2>${title}</h2>${to ? nav(to, link) : ""}</div>${body}</section>`;
    const blank = (title, note) =>
      `<div class="command-empty">${c.icon("check", 24)}<h3>${title}</h3><p>${note}</p></div>`;
    const event = (r) =>
      `<button class="focus-row" data-action="${c.esc(r.action)}" data-id="${c.esc(r.id)}"><span class="focus-date">${c.icon(r.resource, 20)}<small>${r.date ? c.date(r.date) : "للمراجعة"}</small></span><span class="focus-copy"><strong>${c.esc(r.title)}</strong><small>${c.esc(r.note || c.projectName(r.project_id))}</small></span><span class="service-arrow">${c.icon("arrow", 16)}</span></button>`;
    const task = (t) =>
      event({
        ...t,
        action: "task",
        resource: "tasks",
        date: t.due,
        note: `${c.person(t.assignee_id)} ${t.due && t.due < c.today() ? "— تجاوز الموعد" : "— " + c.projectName(t.project_id)}`,
      });
    const metric = (title, value, note, sym, to) =>
      `<button class="metric-card" data-page="${to}"><span class="metric-top">${title}${c.icon(sym)}</span><strong class="metric-number">${c.num(value)}</strong><span class="metric-caption">${note}${c.icon("arrow", 14)}</span></button>`;
    const chips = (items, selected, action) =>
      `<div class="filter-chips" role="group" aria-label="خيارات العرض">${items.map(([id, text]) => `<button class="filter-chip ${selected === id ? "current" : ""}" data-action="${action}" data-filter-value="${id}" aria-pressed="${selected === id}">${text}</button>`).join("")}</div>`;
    return {
      m,
      filters,
      scopeNote,
      nav,
      section,
      blank,
      event,
      task,
      metric,
      chips,
    };
  }
  function overview(c) {
    const { m, filters, scopeNote, nav, section, blank, event, task, metric } =
      setup(c);
    const tiles = [
      [
        "decisions",
        "check",
        "مركز القرارات",
        `${c.num(m.counts.decisions)} بانتظار خطوتك`,
      ],
      ["calendar", "calendar", "تقويم المشاركة", "مواعيدك في نظرة واحدة"],
      ["field", "assets", "الخدمات الميدانية", "جاهزية الأصول والتجهيزات"],
      [
        "services",
        "services",
        "كل خدمات الديوان",
        "كل ما يحتاجه فريق المشاركة",
      ],
    ].filter(([p]) => visible(c.S, p));
    const seasons = m.records.projects
      .slice(0, 4)
      .map((p) => {
        const ts = m.records.tasks.filter((t) => t.project_id === p.id),
          complete = ts.filter(c.done).length,
          pc = ts.length ? Math.round((complete / ts.length) * 100) : 0;
        return `<article class="season-card"><div class="season-top"><span class="pill ${p.status === "active" ? "green" : ""}">${{ active: "موسم نشط", planned: "قيد التخطيط", onhold: "متوقف", closed: "مغلق" }[p.status] || c.esc(p.status)}</span><span>${c.esc(p.season || "مشاركة الديوان")}</span></div><h3><button class="text-link" data-action="project-open" data-id="${c.esc(p.id)}">${c.esc(p.title)}</button></h3><p>${c.esc(p.description || "كل لجنة تعرف مسؤوليتها وكل خطوة لها أثر")}</p><div class="season-progress"><span>إنجاز المهام المرئية</span><strong>${pc}%</strong></div><div class="progress-track"><div class="progress-fill" style="width:${pc}%"></div></div><div class="card-footer"><span>${c.num(complete)} من ${c.num(ts.length)} مهمة</span><button class="icon-btn" data-action="project-open" data-id="${c.esc(p.id)}" aria-label="فتح ${c.esc(p.title)}">${c.icon("arrow")}</button></div></article>`;
      })
      .join("");
    const stats = `<div class="metric-grid">${metric("المواسم النشطة", m.counts.activeProjects, `${c.num(m.counts.committees)} لجنة في نطاقك`, "projects", "projects")}${metric("إنجاز المشاركة", m.counts.progress, `${c.num(m.counts.completedTasks)} مهمة مكتملة من ${c.num(m.counts.tasks)}`, "check", "tasks")}${metric("تحتاج إلى متابعة", m.counts.overdueTasks, "مهام تجاوزت موعدها", "calendar", "calendar")}${metric("قرارات تنتظرك", m.counts.decisions, "مراجعات موجهة إليك", "decisions", "decisions")}</div>`;
    const hero = `<section class="command-hero"><div class="hero-copy"><span class="command-eyebrow">ديوان النائلات <span>مساحة الفريق</span></span><h1>إرث يجمعنا<br><em>وإنجاز يليق بنا</em></h1><p>مرحبًا ${c.esc(c.S.user.name)}<br>من هنا تبدأ خطوتك التالية في المشاركة</p><div class="page-actions">${c.mayCreate("tasks") ? c.btn("مهمة جديدة", "task-new") : nav("profile", "مساحتي")}${nav("services", "اكتشف خدمات الديوان")}</div></div><span class="command-date">${new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh" }).format(new Date())}</span></section>`;
    const services = `<div class="command-services">${tiles.map(([p, i, t, sub]) => `<button class="service-tile" data-page="${p}"><span class="service-icon">${c.icon(i, 23)}</span><span class="service-copy"><strong>${t}</strong><small>${sub}</small></span><span class="service-arrow">${c.icon("arrow", 16)}</span></button>`).join("")}</div>`;
    const progress = `<div class="command-progress"><div class="progress-orbit" style="--progress:${m.counts.progress}%"><strong>${m.counts.progress}<small>%</small></strong><span>إنجاز المهام</span></div><div class="status-list">${c.S.settings.taskStatuses.map((s) => `<div class="status-line"><span><i class="status-dot" style="--status-color:${c.esc(s.color)}"></i>${c.esc(s.name)}</span><strong>${c.num(m.records.tasks.filter((t) => t.status === s.id).length)}</strong></div>`).join("")}</div></div>`;
    const notes = m.insights.filter((i) => i.count > 0).slice(0, 3);
    return (
      hero +
      `<div class="command-toolbar"><div><span class="eyebrow">نظرة المشاركة</span><h2>الصورة الكاملة أمامك</h2></div><div class="filters">${filters()}</div></div>` +
      stats +
      services +
      `<div class="command-layout"><div class="command-main">${section("أولويات اليوم", m.focus.length ? `<div class="focus-list">${m.focus.slice(0, 5).map(task).join("")}</div>` : blank("مساحة جاهزة للإنجاز", "أضف مهام المشاركة لتظهر أولويات الفريق هنا"), "tasks", "لوحة المهام")}${section("المواسم تحت المتابعة", seasons ? `<div class="season-grid">${seasons}</div>` : blank("بداية موسم يليق بالنائلات", "أنشئ الموسم ثم جهز لجانه ووزع مسؤولياته"), "projects", "كل المواسم")}</div><aside class="command-aside">${section("وتيرة الإنجاز", progress)}${section("بانتظار قرارك", m.decisions.length ? `<div class="focus-list">${m.decisions.slice(0, 3).map(event).join("")}</div>` : blank("قراراتك مكتملة", "ستظهر هنا المراجعات التي تحتاج خطوتك"), "decisions")}${notes.length ? section("لخطوة أكثر جاهزية", `<div class="activity-list">${notes.map((i) => `<button class="activity-item" data-page="${c.esc(i.page)}"><span class="service-icon">${c.icon(i.resource)}</span><span><strong>${c.esc(i.title)}</strong><small>${c.esc(i.note)}</small></span><b>${c.num(i.count)}</b></button>`).join("")}</div>`) : ""}</aside></div>${scopeNote()}`
    );
  }
  function services(c) {
    const { nav, chips } = setup(c),
      selected = c.serviceFilter || "all";
    const items = catalog.filter(
      (x) => visible(c.S, x[4]) && (selected === "all" || x[0] === selected),
    );
    const creationResource = { media: "suppliers" };
    const actionAllowed = (x) => {
      if (!x[5]) return false;
      if (["asset-lookup", "asset-labels", "assistant"].includes(x[5]))
        return true;
      if (x[5] === "workspace-readiness") return c.can("settings", "manage");
      if (x[5] === "user-new") return c.can("users", "manage");
      return c.mayCreate(creationResource[x[4]] || x[4]);
    };
    return (
      c.heading(
        "كل خدمة في مكانها",
        "مساحة واحدة للتخطيط والتنفيذ والمالية وكل تفاصيل المشاركة",
        nav("profile", "مساحتي"),
      ) +
      chips(
        [
          ["all", "كل الخدمات"],
          ...Object.entries(groups).map(([k, v]) => [k, v[1]]),
        ],
        selected,
        "service-filter",
      ) +
      `<div class="service-directory">${Object.entries(groups)
        .map(([id, [no, title]]) => {
          const rows = items.filter((x) => x[0] === id);
          return rows.length
            ? `<section class="service-group"><div class="section-heading"><h2><span class="service-number">${no}</span>${title}</h2><span class="muted">${rows.length} خدمات</span></div><div class="service-grid">${rows.map((x) => `<article class="service-card"><span class="service-icon">${c.icon(x[1], 25)}</span><h3>${x[2]}</h3><p>${x[3]}</p><div class="service-actions">${x[4] === "assistant" ? c.btn("فتح سَنَد", "assistant", "", "button-ghost compact", "arrow") : nav(x[4], "فتح الخدمة")}${actionAllowed(x) && x[4] !== "assistant" ? c.btn(x[6], x[5], "", "button-ghost compact", "plus") : ""}</div></article>`).join("")}</div></section>`
            : "";
        })
        .join("")}</div>`
    );
  }
  function decisions(c) {
    const { m, filters, scopeNote, section, blank, event, chips } = setup(c);
    const selected = c.decisionFilter || "all",
      rows = m.decisions.filter(
        (x) => selected === "all" || x.resource === selected,
      );
    return (
      c.heading(
        "الخطوة الآن عندك",
        "قائمة موحدة لما يحتاج مراجعتك افتح السجل وراجع تفاصيله قبل القرار",
        filters(),
      ) +
      chips(
        [
          ["all", "كل القرارات"],
          ["tasks", "إنجاز المهام"],
          ["expenses", "المصاريف"],
          ["users", "طلبات الانضمام"],
        ],
        selected,
        "decision-filter",
      ) +
      section(
        `${c.num(rows.length)} مراجعة مطلوبة`,
        rows.length
          ? `<div class="focus-list">${rows.map(event).join("")}</div>`
          : blank(
              "كل شيء تحت المتابعة",
              "لا توجد مراجعات موجهة إليك ضمن هذا العرض",
            ),
      ) +
      scopeNote()
    );
  }
  function calendar(c) {
    const { m, filters, scopeNote, section, blank, event, chips } = setup(c);
    const selected = c.scheduleFilter || "week",
      start = c.today(),
      end = new Date(start + "T12:00:00Z");
    end.setUTCDate(end.getUTCDate() + (selected === "month" ? 30 : 7));
    const limit = end.toISOString().slice(0, 10);
    const rows = m.schedule.filter((r) =>
      selected === "overdue"
        ? r.date < start
        : selected === "all" || (r.date >= start && r.date <= limit),
    );
    const days = [...new Set(rows.map((r) => r.date))].sort();
    return (
      c.heading(
        "كل موعد له مكان",
        "استحقاقات المهام والمواسم ونهاية إيجار الأصول وضمانها",
        filters(),
      ) +
      chips(
        [
          ["week", "الأيام 7 القادمة"],
          ["month", "الأيام 30 القادمة"],
          ["overdue", "مواعيد تجاوزت تاريخها"],
          ["all", "كل المواعيد"],
        ],
        selected,
        "schedule-filter",
      ) +
      (days.length
        ? `<div class="schedule-groups">${days
            .map((d) =>
              section(
                c.date(d),
                `<div class="focus-list">${rows
                  .filter((r) => r.date === d)
                  .map(event)
                  .join("")}</div>`,
              ),
            )
            .join("")}</div>`
        : section(
            "تقويم المشاركة",
            blank(
              "مساحة لتنظيم القادم",
              "لا توجد مواعيد مسجلة في الفترة المحددة",
            ),
          )) +
      scopeNote()
    );
  }
  function field(c) {
    const { m, filters, scopeNote, section, blank, metric, chips } = setup(c);
    const selected = c.fieldFilter || "all",
      rows = m.records.assets.filter(
        (a) =>
          selected === "all" ||
          (selected === "unready"
            ? a.condition !== "ready"
            : selected === "rented"
              ? a.ownership === "rented"
              : a.available <= 0),
      );
    return (
      c.heading(
        "الميدان على أهبة الاستعداد",
        "جاهزية التجهيزات وملفات الأصول وأدوات المسح والطباعة",
        filters() +
          c.btn("قراءة رمز أصل", "asset-lookup", "", "button-ghost", "search") +
          (c.S.assets.length
            ? c.btn(
                "طباعة الملصقات",
                "asset-labels",
                "",
                "button-dark",
                "documents",
              )
            : ""),
      ) +
      `<div class="metric-grid">${metric("الأصول المتاحة لك", m.counts.assets, "سجلات ضمن النطاق", "assets", "assets")}${metric("تحتاج إلى معالجة", m.counts.unreadyAssets, "صيانة أو تلف", "settings", "field")}${metric("إيجارات قاربت الانتهاء", m.counts.expiringRentals, "خلال الأيام 7 القادمة", "calendar", "calendar")}</div>` +
      chips(
        [
          ["all", "كل الأصول"],
          ["unready", "تحتاج معالجة"],
          ["rented", "مستأجرة"],
          ["unavailable", "لا توجد كمية متاحة"],
        ],
        selected,
        "field-filter",
      ) +
      section(
        "تجهيزات المشاركة",
        rows.length
          ? `<div class="service-grid field-grid">${rows.map((a) => `<article class="service-card"><div class="card-top"><span class="service-icon">${c.icon("assets", 24)}</span><span class="pill ${a.condition === "ready" ? "green" : "amber"}">${{ ready: "جاهز", maintenance: "صيانة", damaged: "تالف" }[a.condition] || c.esc(a.condition)}</span></div><h3>${c.esc(a.name)}</h3><p>${c.esc(a.location || "الموقع غير محدد")}</p><span class="asset-serial" dir="ltr">${c.esc(a.serial)}</span><strong class="field-quantity">${c.num(a.available)} <small>متاح من ${c.num(a.quantity)}</small></strong><div class="service-actions">${c.btn("ملف الأصل", "asset", a.id, "button-ghost compact", "arrow")}${c.can("assets", "assign", a) ? c.btn("تسجيل حركة", "asset-move", a.id, "button-ghost compact", "plus") : ""}</div></article>`).join("")}</div>`
          : blank(
              "لا توجد أصول في هذا العرض",
              "أضف تجهيزاتك أو غيّر تصفية الحالة",
            ),
      ) +
      scopeNote()
    );
  }
  function reports(c) {
    const { m, filters, scopeNote, metric, section, blank } = setup(c);
    const types = [
      "tasks",
      "projects",
      "expenses",
      "advances",
      "assets",
      "suppliers",
    ];
    const names = {
      tasks: "المهام",
      projects: "المواسم",
      expenses: "المصاريف",
      advances: "العهد المالية",
      assets: "الأصول",
      suppliers: "الموردون",
    };
    const cards = types
      .filter(
        (r) =>
          c.S.modules.includes(r) &&
          (c.can(r, "export", {
            project_id: c.project,
            committee_id: c.committee,
          }) ||
            (m.records[r] || c.S[r] || []).some((x) => c.can(r, "export", x))),
      )
      .map(
        (r) =>
          `<article class="service-card"><span class="service-icon">${c.icon(r)}</span><h3>تقرير ${names[r]}</h3><p>ملف Excel للسجلات المتاحة ضمن صلاحيات التصدير</p>${c.btn("تجهيز التقرير", "workspace-export", r, "button-ghost compact", "download")}</article>`,
      )
      .join("");
    return (
      c.heading(
        "وضوح يساند القرار",
        "مؤشرات المشاركة والتقارير التشغيلية والمالية في مكان واحد",
        filters(),
      ) +
      `<div class="metric-grid">${metric("نسبة إنجاز المهام", m.counts.progress, "من المهام المرئية", "check", "tasks")}${metric("مهام تحتاج مساندة", m.counts.blockedTasks, "تحتاج إزالة عائق", "tasks", "tasks")}${metric("مصاريف تنتظر الاعتماد", m.counts.pendingExpenses, "ضمن النطاق الحالي", "expenses", "expenses")}</div>` +
      section(
        "مكتبة التقارير",
        cards
          ? `<div class="service-grid">${cards}</div>`
          : blank(
              "التقارير حسب دورك",
              "ستظهر ملفات التصدير عندما تتوفر صلاحيتها لحسابك",
            ),
      ) +
      (c.S.modules.includes("expenses")
        ? c.expenseBreakdown(m.records.expenses)
        : "") +
      scopeNote()
    );
  }
  function profile(c) {
    const { section, blank, task, event, metric } = setup(c),
      id = c.S.user.id;
    const tasks = c.S.tasks.filter((t) => t.assignee_id === id && !c.done(t));
    const expenses = c.S.expenses.filter((e) =>
      [e.created_by, e.meta?.claimant_id].includes(id),
    );
    const advances = c.S.advances.filter((a) => a.assignee_id === id);
    const returned = expenses.filter((e) =>
      ["returned", "draft"].includes(e.status),
    );
    const personal = expenses.filter(
      (e) =>
        e.meta?.claimant_id === id &&
        e.meta?.funding_source === "personal" &&
        e.status === "approved",
    );
    const owed = personal.some((e) => e.amount_hidden)
      ? "محجوب"
      : c.cash(personal.reduce((s, e) => s + e.amount - e.paid, 0)) + " ريال";
    return (
      c.heading(
        "مساحتك في الديوان",
        "مهامك وطلباتك وعهدك المالية وكل ما يحتاج خطوتك",
        c.btn(
          "إعدادات الجوال والتنبيهات",
          "phone-verify",
          "",
          "button-ghost",
          "settings",
        ),
      ) +
      `<div class="metric-grid">${metric("مهامي المفتوحة", tasks.length, "بانتظار إنجازك", "tasks", "tasks")}${metric("مصروفات للاستكمال", returned.length, "مسودات أو طلبات معادة", "expenses", "expenses")}<div class="metric-card"><span class="metric-top">مستحقاتي الشخصية${c.icon("expenses")}</span><strong class="metric-number personal-money">${owed}</strong><span class="metric-caption">مصروفات معتمدة لم تسدد بالكامل</span></div></div><div class="command-layout"><div class="command-main">${section(
        "أعمالي القادمة",
        tasks.length
          ? `<div class="focus-list">${tasks
              .sort((a, b) => (a.due || "9999").localeCompare(b.due || "9999"))
              .map(task)
              .join("")}</div>`
          : blank("خطوتك القادمة تبدأ هنا", "لا توجد مهام مفتوحة مسندة إليك"),
      )}${section("مصروفاتي التي تحتاج استكمالًا", returned.length ? `<div class="focus-list">${returned.map((e) => event({ ...e, action: "expense", resource: "expenses", note: e.status === "returned" ? "معاد للاستكمال" : "مسودة لم ترسل" })).join("")}</div>` : blank("طلباتك تحت المتابعة", "لا توجد مصروفات تحتاج استكمالًا"))}</div><aside class="command-aside">${section("عهدي المالية", advances.length ? `<div class="focus-list">${advances.map((a) => event({ ...a, action: "advance", resource: "advances", note: "الرصيد المتبقي " + c.cash(a.balance) + " ريال" })).join("")}</div>` : blank("عهد واضحة", "لا توجد عهد مالية مسجلة باسمك"))}<div class="panel panel-body"><h3>تفضيلات التواصل</h3><p class="muted">تحكم في وصول تنبيهات الديوان إلى جوالك</p>${c.btn("إيقاف تنبيهات واتساب", "whatsapp-disable", "", "button-ghost compact", "bell")}</div></aside></div>`
    );
  }
  globalThis.DiwanViews = {
    overview,
    services,
    decisions,
    calendar,
    field,
    reports,
    profile,
    visible,
  };
})();
