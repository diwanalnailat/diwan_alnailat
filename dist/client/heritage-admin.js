/* Admin forms reuse the workspace dialog and server-enforced settings permission. */
(() => {
  function page(c) {
    queueMicrotask(() => load(c));
    return (
      c.heading(
        "نتائج المواسم",
        "إدارة المواسم والنتائج التي تظهر للزوار في سجل الإنجازات.",
        c.btn("إضافة موسم", "heritage-season-new") +
          '<a class="button button-ghost" href="/heritage#nailat-achievements" target="_blank" rel="noopener">عرض الصفحة التعريفية</a>',
      ) +
      '<section id="heritageResultsPanel" aria-busy="true"><p role="status">جارٍ تحميل المواسم…</p></section>'
    );
  }
  async function load(c) {
    const panel = document.querySelector("#heritageResultsPanel");
    if (!panel) return;
    try {
      const { seasons } = await c.api("heritage-results/manage");
      if (!panel.isConnected) return;
      panel.innerHTML = seasons.length
        ? seasons
            .map(
              (s) =>
                `<article class="panel heritage-season-card"><div class="section-heading"><div><span class="eyebrow">النسخة ${c.esc(s.edition)}</span><h2><bdi>${c.esc(s.season)}</bdi></h2><p>${c.esc(s.title)}</p></div><div class="page-actions">${c.btn("تعديل الموسم والنتائج", "heritage-season-edit", s.edition, "button-ghost compact", "edit")}${c.btn("حذف الموسم", "heritage-season-delete", s.edition, "button-ghost compact", "")}</div></div><div class="panel-body"><p class="muted">${s.awards.length} نتيجة · تظهر بالترتيب التالي</p>${s.awards.length ? `<ol class="heritage-award-preview">${s.awards.map((a) => `<li><strong>المركز ${a.rank}</strong><span>${c.esc(a.title)}${a.camel ? ` · ${c.esc(a.camel)}` : ""}</span>${a.date ? `<time dir="ltr" datetime="${c.esc(a.date)}">${c.esc(a.date)}</time>` : ""}</li>`).join("")}</ol>` : '<p class="muted">لم تضف نتائج لهذا الموسم بعد.</p>'}</div></article>`,
            )
            .join("")
        : '<div class="empty"><h3>لا توجد مواسم منشورة</h3><p>أضف موسمًا ونتائجه ليظهر في سجل الإنجازات.</p>' +
          c.btn("إضافة أول موسم", "heritage-season-new") +
          "</div>";
    } catch (error) {
      if (panel.isConnected)
        panel.innerHTML = `<div class="panel panel-body"><p class="form-error" role="alert">${c.esc(error.message)}</p>${c.btn("إعادة المحاولة", "heritage-results-reload", "", "button-ghost", "")}</div>`;
    } finally {
      if (panel.isConnected) panel.setAttribute("aria-busy", "false");
    }
  }
  function awardFields(c, a = {}) {
    return `<fieldset class="heritage-award-editor"><legend>نتيجة</legend><div class="form-grid">${c.field("اسم الشوط *", c.input("award_title", a.title || "", "text", 'required maxlength="160"'))}${c.field("المركز *", c.input("award_rank", a.rank || 1, "number", 'required min="1" max="999" step="1"'))}${c.field("تاريخ النتيجة (اختياري)", c.input("award_date", a.date || "", "date"))}${c.field("اسم المطية (اختياري)", c.input("award_camel", a.camel || "", "text", 'maxlength="120"'))}</div><div class="page-actions"><button type="button" class="button button-ghost compact" data-award-move="-1">نقل لأعلى</button><button type="button" class="button button-ghost compact" data-award-move="1">نقل لأسفل</button><button type="button" class="button button-ghost compact" data-award-remove>إزالة النتيجة</button></div></fieldset>`;
  }
  async function form(c, edition = "") {
    const data = await c.api("heritage-results/manage");
    const old = data.seasons.find((s) => s.edition === edition);
    if (edition && !old) throw new Error("الموسم غير متاح. حدّث القائمة.");
    const season = old || { edition: "", season: "", title: "", awards: [] };
    const dialog = c.modal(
      old ? "تعديل الموسم والنتائج" : "إضافة موسم",
      `<form class="form-grid heritage-season-form">${c.field("الموسم *", c.input("season", season.season, "text", 'required maxlength="40" placeholder="2026–2027"'))}${c.field("رقم النسخة *", c.input("edition", season.edition, "number", 'required min="1" max="9999" step="1"'))}${c.field("عنوان الموسم *", c.input("title", season.title, "text", 'required maxlength="120"'), true)}<div class="full"><div class="section-heading"><h3>نتائج الموسم</h3><button type="button" class="button button-ghost compact" data-award-add>إضافة نتيجة</button></div><p class="form-note">رتّب النتائج كما تريد عرضها للزوار. يمكنك ترك الموسم بلا نتائج وإضافتها لاحقًا.</p><div data-award-list>${season.awards.map((a) => awardFields(c, a)).join("")}</div><p role="status" class="form-note" data-award-status></p></div><p class="form-note full">الحفظ ينشر التغييرات في الصفحة التعريفية. المواسم مرتبة حسب رقم النسخة من الأحدث إلى الأقدم.</p>${c.actions("حفظ ونشر النتائج")}</form>`,
      async (fd, form) => {
        const updated = {
          edition: fd.get("edition"),
          season: fd.get("season"),
          title: fd.get("title"),
          awards: [...form.querySelectorAll(".heritage-award-editor")].map(
            (row) => ({
              title: row.querySelector('[name="award_title"]').value,
              rank: Number(row.querySelector('[name="award_rank"]').value),
              date: row.querySelector('[name="award_date"]').value,
              camel: row.querySelector('[name="award_camel"]').value,
            }),
          ),
        };
        await c.api("heritage-results/save", {
          version: data.version,
          seasons: [
            ...data.seasons.filter((s) => s.edition !== edition),
            updated,
          ],
        });
        c.toast("تم حفظ نتائج الموسم ونشرها");
      },
      true,
    );
    const element = dialog.querySelector(".heritage-season-form");
    const list = element.querySelector("[data-award-list]");
    const status = element.querySelector("[data-award-status]");
    const sync = () => {
      [...list.children].forEach((row, i) => {
        row.querySelector("legend").textContent = `النتيجة ${i + 1}`;
        row.querySelector('[data-award-move="-1"]').disabled = i === 0;
        row.querySelector('[data-award-move="1"]').disabled =
          i === list.children.length - 1;
      });
      element.querySelector("[data-award-add]").disabled =
        list.children.length >= 100;
    };
    sync();
    const error = element.querySelector(".form-error");
    error.setAttribute("role", "alert");
    element.addEventListener("click", (e) => {
      const button = e.target.closest("button");
      if (!button || button.disabled) return;
      if (button.hasAttribute("data-award-add")) {
        list.insertAdjacentHTML("beforeend", awardFields(c));
        list.lastElementChild.querySelector("input").focus();
        status.textContent = "أضيفت نتيجة جديدة. احفظ لنشر التغييرات.";
      } else if (button.hasAttribute("data-award-remove")) {
        const row = button.closest("fieldset");
        const next = row.nextElementSibling || row.previousElementSibling;
        row.remove();
        (
          next?.querySelector("input") ||
          element.querySelector("[data-award-add]")
        ).focus();
        status.textContent = "أزيلت النتيجة من النموذج. احفظ لتأكيد الإزالة.";
      } else if (button.hasAttribute("data-award-move")) {
        const row = button.closest("fieldset");
        if (button.dataset.awardMove === "-1" && row.previousElementSibling)
          list.insertBefore(row, row.previousElementSibling);
        else if (row.nextElementSibling)
          list.insertBefore(row.nextElementSibling, row);
        row.querySelector("input").focus();
        status.textContent = "تغير ترتيب النتائج. احفظ لنشر التغييرات.";
      }
      sync();
    });
  }
  async function remove(c, edition) {
    const data = await c.api("heritage-results/manage");
    const season = data.seasons.find((s) => s.edition === edition);
    if (!season) throw new Error("الموسم غير متاح. حدّث القائمة.");
    c.modal(
      "حذف الموسم",
      `<form class="form-grid"><p class="full">سيُحذف موسم <bdi>${c.esc(season.season)}</bdi> وجميع نتائجه (${season.awards.length}) من الصفحة التعريفية.</p>${c.actions("تأكيد حذف الموسم")}</form>`,
      async () => {
        await c.api("heritage-results/save", {
          version: data.version,
          seasons: data.seasons.filter((s) => s.edition !== edition),
        });
        c.toast("تم حذف الموسم ونتائجه");
      },
    );
  }
  window.DiwanHeritageAdmin = { page, load, form, remove };
})();
