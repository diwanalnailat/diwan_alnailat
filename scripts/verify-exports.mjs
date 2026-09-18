import fs from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import { DEFAULT_SETTINGS } from "../lib/domain.js";
globalThis.jspdf = { jsPDF };
globalThis.fetch = async (url) => {
  const data = fs.readFileSync(path.join("public", url));
  return new Response(data);
};
await import("../public/exports.js");
const out = process.argv[2] || "/tmp/diwan-export-check";
fs.mkdirSync(out, { recursive: true });
const state = {
  settings: DEFAULT_SETTINGS,
  projects: [{ id: "p", title: "تجهيز موقع المشاركة" }],
  people: [{ id: "u", name: "مسؤول التشغيل" }],
  suppliers: [{ id: "s", name: "مورد تجريبي" }],
};
const guide = {
  id: "g",
  title: "دليل تجهيز الخيام واستلام الموقع",
  project_id: "p",
  template_version: 1,
  content: {
    assignee_id: "u",
    due: "2027-01-20",
    priority: "high",
    sections: [
      {
        title: "الهدف والنتيجة المطلوبة",
        body: "تجهيز الخيام وفق المخطط المعتمد، وتوثيق الاستلام قبل بدء الفعالية. هذا دليل تجريبي للتحقق من تنسيق النص العربي.",
      },
      {
        title: "المتطلبات السابقة",
        body: "مخطط الموقع المعتمد.\nتحديد المسؤولين عن الاستلام.\nالتأكد من توفر العدد المطلوب من الخيام.",
      },
      {
        title: "خطوات التنفيذ",
        body: Array.from(
          { length: 14 },
          (_, i) =>
            i +
            1 +
            ". مراجعة تجهيزات الموقع وفحص الخيمة والتأكد من ملاءمة الموقع ومسارات الدخول والخروج.",
        ).join("\n"),
      },
      {
        title: "قائمة التحقق",
        body: "تثبيت الخيام في مواقعها.\nتوثيق صور الاستلام.\nمراجعة ملاحظات التنفيذ وإقفالها.",
      },
      { title: "إثبات الإنجاز", body: "إرفاق صور واضحة ومحضر الاستلام." },
      { title: "التعثر والتواصل", body: "" },
    ],
  },
};
const pdf = await DiwanExports.guidePDF(guide, state);
fs.writeFileSync(
  out + "/guide-check.pdf",
  new Uint8Array(await pdf.arrayBuffer()),
);
const exportData = {
  ...state,
  type: "expenses",
  as_of: "2026-09-14T12:00:00Z",
  rows: [
    {
      id: "e",
      project_id: "p",
      supplier_id: "s",
      title: '=HYPERLINK("https://example.com")',
      number: "00001",
      category: "التجهيزات",
      amount: 11550,
      tax: 1550,
      paid: 5000,
      date: "2027-01-10",
      status: "approved",
      meta: { notes: "نص عربي آمن" },
    },
    {
      id: "hidden",
      project_id: "p",
      title: "مبلغ محجوب",
      amount_hidden: true,
      status: "draft",
      meta: {},
    },
  ],
  payments: [
    {
      id: "pay",
      expense_id: "e",
      amount: 5000,
      date: "2027-01-11",
      reference: "BANK-001",
      created_by: "u",
    },
  ],
};
fs.writeFileSync(
  out + "/expenses-check.xlsx",
  new Uint8Array(await DiwanExports.workbook(exportData).arrayBuffer()),
);
console.log("Export check files written to " + out);

const advancesData = {...state,type:"advances",as_of:"2026-09-14T12:00:00Z",rows:[{title:"عهدة الضيافة",project_id:"p",assignee_id:"u",funded:10000,settled:5000,returned:2000,balance:3000}],payments:[]};
fs.writeFileSync(out+"/advances-check.xlsx",new Uint8Array(await DiwanExports.workbook(advancesData).arrayBuffer()));
