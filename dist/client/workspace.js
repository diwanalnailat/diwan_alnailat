/* Read-only views of the current server-authorized state
 * This module does not authorize writes or infer external provider connectivity
 */
(function (root) {
  "use strict";
  const list = (value) => (Array.isArray(value) ? value : []);
  const meta = (record) => {
    if (record?.meta && typeof record.meta === "object") return record.meta;
    try {
      const value = JSON.parse(record?.meta || "{}");
      return value && typeof value === "object" ? value : {};
    } catch {
      return {};
    }
  };
  const day = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
      return "";
    const stamp = Date.parse(value + "T12:00:00Z");
    return Number.isFinite(stamp) &&
      new Date(stamp).toISOString().slice(0, 10) === value
      ? value
      : "";
  };
  const localToday = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  const committeeId = (record) =>
    record.committee_id || meta(record).committee_id;
  const dateOrder = (a, b) =>
    (day(a.due) || "9999").localeCompare(day(b.due) || "9999") ||
    String(a.id).localeCompare(String(b.id));
  const priorities = { urgent: 0, high: 1, normal: 2, low: 3 };

  function derive(state = {}, options = {}) {
    const today = day(options.today) || localToday(),
      weekEnd = new Date(Date.parse(today + "T12:00:00Z") + 7 * 86400000)
        .toISOString()
        .slice(0, 10),
      selectedCommittee = list(state.committees).find(
        (record) => record.id === options.committee,
      ),
      project = options.project || selectedCommittee?.project_id || "",
      committee = options.committee || "",
      invalidScope =
        !!committee &&
        (!selectedCommittee || selectedCommittee.project_id !== project),
      inProject = (record) => !project || record.project_id === project,
      inScope = (record) =>
        !invalidScope &&
        inProject(record) &&
        (!committee || committeeId(record) === committee),
      can = typeof options.can === "function" ? options.can : () => false,
      user = state.user || {},
      doneIds = new Set([
        "done",
        ...list(state.settings?.taskStatuses)
          .filter((status) => status.done)
          .map((status) => status.id),
      ]),
      done = (record) => doneIds.has(record.status),
      projectAssets = new Set(
        list(state.movements)
          .filter((movement) => movement.project_id === project)
          .map((movement) => movement.asset_id),
      ),
      records = {
        projects: list(state.projects).filter(
          (record) => !invalidScope && (!project || record.id === project),
        ),
        committees: list(state.committees).filter(
          (record) =>
            !invalidScope &&
            inProject(record) &&
            (!committee || record.id === committee),
        ),
        tasks: list(state.tasks).filter(inScope),
        expenses: list(state.expenses).filter(inScope),
        // Neither advances nor assets have a committee association in the schema
        advances: committee ? [] : list(state.advances).filter(inProject),
        assets: committee
          ? []
          : list(state.assets).filter(
              (record) => !project || projectAssets.has(record.id),
            ),
      },
      closedProject = (record) =>
        list(state.projects).some(
          (project) =>
            project.id === record.project_id && project.status === "closed",
        ),
      openTasks = records.tasks.filter((record) => !done(record)),
      focus = [...openTasks].sort(
        (a, b) =>
          Number(!!day(b.due) && b.due < today) -
            Number(!!day(a.due) && a.due < today) ||
          (priorities[a.priority] ?? 2) - (priorities[b.priority] ?? 2) ||
          dateOrder(a, b),
      );

    const openItem = (record, resource, action, kind, note, date = "") => ({
      key: kind + ":" + record.id,
      id: record.id,
      resource,
      action,
      kind,
      title: record.title || record.name || "",
      note,
      date: day(date),
      project_id: resource === "projects" ? record.id : record.project_id || "",
      record,
    });
    const decisions = [];
    if (user.id && user.status === "active") {
      for (const expense of records.expenses) {
        const details = meta(expense),
          context =
            list(state.committees).find(
              (record) => record.id === committeeId(expense),
            ) || expense.approval_context,
          route = Array.isArray(expense.effective_route)
            ? expense.effective_route
            : [context?.manager_id, context?.config?.second_approver_id],
          index =
            expense.effective_approval_index ?? details.approvalIndex ?? 0;
        if (
          expense.status === "pending" &&
          Number.isInteger(index) &&
          route[index] === user.id &&
          ![expense.created_by, details.claimant_id].includes(user.id) &&
          can("expenses", "view", expense) &&
          can("expenses", "approve", expense)
        )
          decisions.push(
            openItem(
              expense,
              "expenses",
              "expense",
              "expense_review",
              index === 1
                ? "بانتظار مراجعتك للاعتماد النهائي"
                : "بانتظار مراجعتك للاعتماد الأول",
              expense.date,
            ),
          );
      }
      for (const task of records.tasks) {
        const owner = list(state.committees).find(
          (record) => record.id === committeeId(task),
        );
        if (
          task.status === "review" &&
          !meta(task).request &&
          !closedProject(task) &&
          owner?.manager_id === user.id &&
          can("tasks", "view", task) &&
          can("tasks", "edit", task) &&
          can("tasks", "approve", task)
        )
          decisions.push(
            openItem(
              task,
              "tasks",
              "task",
              "task_review",
              "إنجاز ينتظر مراجعة مدير اللجنة",
              task.due,
            ),
          );
      }
      // Membership is global and cannot be attributed to a selected season or committee
      if (
        !project &&
        !committee &&
        can("users", "view") &&
        can("users", "manage")
      )
        for (const member of list(state.members))
          if (
            member.status === "pending" &&
            can("users", "view", member) &&
            can("users", "manage", member)
          )
            decisions.push(
              openItem(
                member,
                "users",
                "user-edit",
                "membership_review",
                "طلب انضمام ينتظر مراجعة الإدارة",
                String(member.created || "").slice(0, 10),
              ),
            );
    }

    const schedule = [];
    const event = (record, resource, action, kind, note, date) => {
      if (!day(date)) return;
      schedule.push({
        ...openItem(record, resource, action, kind, note, date),
        overdue: date < today,
        upcoming: date >= today && date <= weekEnd,
      });
    };
    for (const task of openTasks)
      if (!closedProject(task))
        event(task, "tasks", "task", "task_due", "موعد إنجاز المهمة", task.due);
    for (const item of records.projects)
      if (item.status !== "closed")
        event(
          item,
          "projects",
          "project-open",
          "project_due",
          "موعد اكتمال المشاركة",
          item.due,
        );
    for (const asset of records.assets) {
      const details = meta(asset);
      if (["rented", "borrowed"].includes(asset.ownership))
        event(
          asset,
          "assets",
          "asset",
          "rental_end",
          "نهاية الإيجار أو الاستعارة",
          details.rental_end,
        );
      event(
        asset,
        "assets",
        "asset",
        "warranty_end",
        "نهاية ضمان الأصل",
        details.warranty_end,
      );
    }
    schedule.sort(
      (a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key),
    );
    const counts = {
      projects: records.projects.length,
      activeProjects: records.projects.filter(
        (record) => record.status === "active",
      ).length,
      committees: records.committees.length,
      tasks: records.tasks.length,
      completedTasks: records.tasks.filter(done).length,
      openTasks: openTasks.length,
      overdueTasks: openTasks.filter(
        (record) => day(record.due) && record.due < today,
      ).length,
      dueTodayTasks: openTasks.filter((record) => day(record.due) === today)
        .length,
      blockedTasks: openTasks.filter((record) => record.status === "blocked")
        .length,
      reviewTasks: openTasks.filter((record) => record.status === "review")
        .length,
      expenses: records.expenses.length,
      pendingExpenses: records.expenses.filter(
        (record) => record.status === "pending",
      ).length,
      decisions: decisions.length,
      advances: records.advances.length,
      assets: records.assets.length,
      unreadyAssets: records.assets.filter((record) =>
        ["maintenance", "damaged"].includes(record.condition),
      ).length,
      expiringRentals: schedule.filter(
        (item) =>
          item.kind === "rental_end" &&
          item.date >= today &&
          item.date <= weekEnd,
      ).length,
      progress: records.tasks.length
        ? Math.round(
            (records.tasks.filter(done).length / records.tasks.length) * 100,
          )
        : 0,
    };
    const insights = [
      {
        id: "overdue",
        resource: "tasks",
        page: "tasks",
        title: "مهام تحتاج متابعة",
        note: "تجاوزت موعد الإنجاز المحدد",
        count: counts.overdueTasks,
        severity: "warning",
      },
      {
        id: "blocked",
        resource: "tasks",
        page: "tasks",
        title: "طلبات مساندة",
        note: "مهام تحتاج معالجة العائق لاستكمال التنفيذ",
        count: counts.blockedTasks,
        severity: "warning",
      },
      {
        id: "undated",
        resource: "tasks",
        page: "tasks",
        title: "مهام تحتاج موعدًا",
        note: "حدد الاستحقاق ليظهر العمل في تقويم المشاركة",
        count: openTasks.filter((record) => !day(record.due)).length,
        severity: "info",
      },
      {
        id: "unassigned",
        resource: "tasks",
        page: "tasks",
        title: "مهام تحتاج مسؤولًا",
        note: "أكمل إسناد الأعمال المفتوحة",
        count: openTasks.filter((record) => !record.assignee_id).length,
        severity: "info",
      },
      {
        id: "committees",
        resource: "committees",
        page: "committees",
        title: "جاهزية اللجان",
        note: "لجان تحتاج مديرًا أو معتمدًا ثانيًا أو بنود صرف",
        count: records.committees.filter(
          (record) =>
            !record.manager_id ||
            !record.config?.second_approver_id ||
            !list(record.config?.budgetLines).length,
        ).length,
        severity: "warning",
      },
      {
        id: "assets",
        resource: "assets",
        page: "assets",
        title: "أصول تحتاج معالجة",
        note: "أصول مسجلة بحالة صيانة أو تلف",
        count: counts.unreadyAssets,
        severity: "warning",
      },
      {
        id: "rentals",
        resource: "assets",
        page: "assets",
        title: "إيجارات تنتهي قريبًا",
        note: "نهاية الإيجار أو الاستعارة خلال 7 أيام",
        count: counts.expiringRentals,
        severity: "info",
      },
    ].filter((item) => item.count > 0);
    const integrations = [
      ["ai", "سَنَد"],
      ["voice", "المحادثة الصوتية"],
      ["whatsapp", "تنبيهات واتساب"],
      ["phone", "توثيق الجوال"],
    ].map(([id, title]) => ({
      id,
      title,
      configured: state.integrations?.[id] === true,
      status:
        state.integrations?.[id] === true
          ? "configured_unverified"
          : "awaiting_configuration",
      note:
        state.integrations?.[id] === true
          ? "الإعدادات موجودة وتحتاج اختبارًا فعليًا"
          : "بانتظار إعداد الخدمة واختبارها",
    }));
    return {
      scope: {
        project,
        committee,
        today,
        weekEnd,
        invalid: invalidScope,
        assets: committee
          ? "unavailable_for_committee"
          : project
            ? "project_movements"
            : "all",
        advances: committee
          ? "unavailable_for_committee"
          : project
            ? "project"
            : "all",
      },
      records,
      counts,
      focus,
      decisions,
      schedule,
      insights,
      integrations,
    };
  }
  root.DiwanWorkspace = Object.freeze({ derive });
})(globalThis);
