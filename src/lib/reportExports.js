import { downloadTablePdf } from "@/lib/pdf";

/**
 * Report exports. A `report` object (built by the Reports page) has:
 *   { usn, name, branch, batch, phone, torii, scopeLabel,
 *     att:{present,absent,total,percent,workingDays,
 *          light:{present,total,percent}, bright:{present,total,percent}, days:[{date,light,bright}]},
 *     apt:{tests:[{title,kind,score,correct,wrong,accuracy,questions,date}],taken,avgScore,avgAccuracy,preScore,grandAvg},
 *     grade }
 */

const BRAND = [234, 88, 41];
const HEADER_BG = [17, 24, 39]; // black — the report card's header strip + table headers
const INK = [17, 24, 39];
const MUTED = [107, 114, 128];
const EMERALD = [16, 163, 74];
const AMBER = [217, 119, 6];
const ROSE = [225, 29, 72];
const round = (n) => Math.round((Number(n) || 0) * 10) / 10;

function pctTriple(p) {
  if (p >= 75) return EMERALD;
  if (p >= 50) return AMBER;
  return ROSE;
}

/** Fetch an image (PNG) as a data URL for embedding in jsPDF; null on failure. */
async function loadImageDataUrl(url) {
  try {
    if (typeof fetch === "undefined") return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Load jsPDF + autotable + the logo once, to reuse across many report cards. */
async function reportCtx() {
  const { jsPDF } = await import("jspdf");
  const autoMod = await import("jspdf-autotable");
  const autoTable = autoMod.default || autoMod.autoTable || autoMod;
  const logo = await loadImageDataUrl("/placement-trainings/logo-dark.png");
  return { jsPDF, autoTable, logo };
}

/** Build the one-page student report card as a jsPDF doc (no save). */
function buildStudentReportDoc(report, ctx) {
  const { jsPDF, autoTable, logo } = ctx;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const a = report.att || {};
  const ap = report.apt || {};

  // ── Header band (black) ──────────────────────────────────────
  doc.setFillColor(...HEADER_BG);
  doc.rect(0, 0, W, 96, "F");
  doc.setTextColor(255, 255, 255);
  // Torii Minds logo (white wordmark reads on the brand band); text fallback.
  if (logo) {
    try { doc.addImage(logo, "PNG", M, 20, 64, 22); } catch { /* fallback below */ }
  }
  if (!logo) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("TORII MINDS · PLACEMENT TRAINING", M, 34);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Student Report Card", M, 62);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(report.scopeLabel || "Phase 1", M, 80);

  // ── Identity ─────────────────────────────────────────────────
  let y = 128;
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(report.name || report.usn || "Student", M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  const idLine = [report.usn, report.branch, report.batch].filter(Boolean).join("  ·  ");
  doc.text(idLine, M, y + 18);
  if (report.phone || report.torii) {
    doc.text([report.torii, report.phone].filter(Boolean).join("  ·  "), M, y + 33);
  }

  // ── Stat tiles ───────────────────────────────────────────────
  y += 54;
  const gap = 12;
  const tw = (W - M * 2 - gap * 3) / 4;
  const tiles = [
    { label: "ATTENDANCE", value: `${a.percent ?? 0}%`, color: pctTriple(a.percent ?? 0) },
    { label: "SESSIONS", value: `${a.present ?? 0}/${a.total ?? 0}`, color: BRAND },
    { label: "ASSESSMENTS", value: `${ap.taken ?? 0}`, color: [99, 102, 241] },
    { label: "AVG ACCURACY", value: `${ap.avgAccuracy ?? 0}%`, color: pctTriple(ap.avgAccuracy ?? 0) },
  ];
  tiles.forEach((t, i) => {
    const x = M + i * (tw + gap);
    doc.setFillColor(248, 249, 251);
    doc.roundedRect(x, y, tw, 58, 8, 8, "F");
    doc.setFillColor(...t.color);
    doc.roundedRect(x, y, tw, 4, 2, 2, "F");
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(String(t.value), x + 12, y + 34);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(t.label, x + 12, y + 48);
  });

  // ── Attendance detail ────────────────────────────────────────
  y += 84;
  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text("Attendance", M, y);
  y += 8;
  autoTable(doc, {
    startY: y,
    head: [["Session mode", "Present", "Total", "%"]],
    body: [
      ["Light Mode", String(a.light?.present ?? 0), String(a.light?.total ?? 0), `${a.light?.percent ?? 0}%`],
      ["Bright Mode", String(a.bright?.present ?? 0), String(a.bright?.total ?? 0), `${a.bright?.percent ?? 0}%`],
      ["Overall", String(a.present ?? 0), String(a.total ?? 0), `${a.percent ?? 0}%`],
    ],
    margin: { left: M, right: M },
    styles: { fontSize: 9, cellPadding: 5, halign: "center", lineColor: [229, 231, 235], lineWidth: 0.5 },
    headStyles: { fillColor: HEADER_BG, textColor: 255, halign: "center" },
    columnStyles: { 0: { halign: "left", fontStyle: "bold" } },
    theme: "grid",
  });
  y = doc.lastAutoTable.finalY + 8;
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Worked days in phase: ${a.workingDays ?? 0}`, M, y + 4);

  // ── Aptitude ─────────────────────────────────────────────────
  y += 24;
  doc.setTextColor(...BRAND);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.5);
  doc.text("Aptitude", M, y);
  y += 8;
  const tests = ap.tests || [];
  autoTable(doc, {
    startY: y,
    head: [["Assessment", "Type", "Score", "Correct", "Wrong", "Accuracy"]],
    body: tests.length
      ? tests.map((t) => (t.attempted
          ? [t.title, t.kind, String(t.score), String(t.correct), String(t.wrong), `${t.accuracy}%`]
          : [t.title, t.kind, "—", "—", "—", "Not Attempted"]))
      : [["No aptitude tests conducted in this phase", "", "", "", "", ""]],
    margin: { left: M, right: M },
    styles: { fontSize: 8.5, cellPadding: 4, halign: "center", overflow: "linebreak", lineColor: [229, 231, 235], lineWidth: 0.5 },
    headStyles: { fillColor: HEADER_BG, textColor: 255, halign: "center" },
    columnStyles: { 0: { halign: "left", cellWidth: 200 }, 1: { cellWidth: 54 } },
    alternateRowStyles: { fillColor: [248, 249, 251] },
    theme: "grid",
  });
  y = doc.lastAutoTable.finalY + 10;
  if (tests.length) {
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Average score: ${round(ap.avgScore)}    ·    Average accuracy: ${ap.avgAccuracy ?? 0}%${ap.preScore != null ? `    ·    Pre-assessment: ${ap.preScore}` : ""}`, M, y);
    y += 6;
  }

  // ── Coding & SQL ─────────────────────────────────────────────
  const codeSection = (heading, rows) => {
    y += 20;
    if (y > 700) { doc.addPage(); y = 50; }
    doc.setTextColor(...BRAND);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.text(heading, M, y);
    y += 8;
    autoTable(doc, {
      startY: y,
      head: [["Test", "MCQ %", "Coding %", "Accuracy"]],
      body: rows.length
        ? rows.map((t) => (t.attempted
            ? [t.title, `${t.mcq}%`, `${t.coding}%`, `${t.overall}%`]
            : [t.title, "—", "—", "Not Attempted"]))
        : [[`No ${heading.toLowerCase()} tests conducted in this phase`, "", "", ""]],
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 4, halign: "center", overflow: "linebreak", lineColor: [229, 231, 235], lineWidth: 0.5 },
      headStyles: { fillColor: HEADER_BG, textColor: 255, halign: "center" },
      columnStyles: { 0: { halign: "left", cellWidth: 220 } },
      alternateRowStyles: { fillColor: [248, 249, 251] },
      theme: "grid",
    });
    y = doc.lastAutoTable.finalY;
  };
  codeSection("Coding", (report.coding?.tests) || []);
  codeSection("SQL", (report.sql?.tests) || []);
  y += 10;

  // Footer
  const H = doc.internal.pageSize.getHeight();
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(1);
  doc.line(M, H - 34, W - M, H - 34);
  doc.setTextColor(...MUTED);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const when = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  doc.text(`Generated ${when} · Torii Minds`, M, H - 20);
  doc.text("Step IN, Stand OUT", W - M, H - 20, { align: "right" });

  return doc;
}

const reportFileBase = (r) => (r.usn || r.torii || "student").replace(/[^A-Za-z0-9_-]/g, "_");

/** A downloadable, LinkedIn-ready one-page student report card (PDF). */
export async function downloadStudentReportPdf(report) {
  const ctx = await reportCtx();
  const doc = buildStudentReportDoc(report, ctx);
  doc.save(`report-${reportFileBase(report)}.pdf`);
}

/**
 * Bundle every report's card into a single ZIP of per-student PDFs, each named
 * by USN (e.g. 1NC23CS007.pdf). `onProgress(done, total)` fires as it builds.
 */
export async function downloadAllReportsZip(reports, { onProgress, filename = "student-reports.zip" } = {}) {
  const ctx = await reportCtx();
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const used = new Set();
  for (let i = 0; i < reports.length; i++) {
    const r = reports[i];
    const doc = buildStudentReportDoc(r, ctx);
    let name = `${reportFileBase(r)}.pdf`;
    if (used.has(name)) name = `${reportFileBase(r)}-${i + 1}.pdf`; // guard duplicate USNs
    used.add(name);
    zip.file(name, doc.output("blob"));
    onProgress?.(i + 1, reports.length);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Single-student report as Excel (Summary + Attendance by day + Assessments). */
export async function downloadStudentReportExcel(report) {
  const XLSX = await import("xlsx");
  const a = report.att || {};
  const ap = report.apt || {};
  const wb = XLSX.utils.book_new();
  const add = (name, rows, cols) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (cols) ws["!cols"] = cols;
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  add("Summary", [
    ["Student Report", report.scopeLabel || "Phase 1"],
    [],
    ["USN", report.usn || ""],
    ["Name", report.name || ""],
    ["Branch", report.branch || ""],
    ["Batch", report.batch || ""],
    ["Torii Number", report.torii || ""],
    ["Phone", report.phone || ""],
    [],
    ["Attendance %", `${a.percent ?? 0}%`],
    ["Sessions present / total", `${a.present ?? 0} / ${a.total ?? 0}`],
    ["Light Mode %", `${a.light?.percent ?? 0}%`],
    ["Bright Mode %", `${a.bright?.percent ?? 0}%`],
    ["Working days", a.workingDays ?? 0],
    ["Assessments taken", ap.taken ?? 0],
    ["Average score", round(ap.avgScore)],
    ["Average accuracy", `${ap.avgAccuracy ?? 0}%`],
    ["Pre-assessment score", ap.preScore != null ? ap.preScore : "—"],
  ], [{ wch: 26 }, { wch: 30 }]);

  add("Attendance by day", [
    ["Date", "Light Mode", "Bright Mode"],
    ...(a.days || []).map((d) => [d.date, statusLabel(d.light), statusLabel(d.bright)]),
  ], [{ wch: 14 }, { wch: 14 }, { wch: 14 }]);

  add("Aptitude", [
    ["Assessment", "Type", "Score", "Correct", "Wrong", "Accuracy %", "Questions", "Date"],
    ...(ap.tests || []).map((t) => (t.attempted
      ? [t.title, t.kind, t.score, t.correct, t.wrong, t.accuracy, t.questions, t.date || ""]
      : [t.title, t.kind, "Not Attempted", "", "", "", t.questions, t.date || ""])),
  ], [{ wch: 32 }, { wch: 10 }, { wch: 12 }, { wch: 9 }, { wch: 8 }, { wch: 11 }, { wch: 10 }, { wch: 16 }]);

  const codeSheet = (rows) => [
    ["Test", "Technology", "MCQ %", "Coding %", "Accuracy %", "Date"],
    ...rows.map((t) => (t.attempted
      ? [t.title, t.technology || "", t.mcq, t.coding, t.overall, t.date || ""]
      : [t.title, t.technology || "", "", "", "Not Attempted", t.date || ""])),
  ];
  const codeCols = [{ wch: 30 }, { wch: 16 }, { wch: 8 }, { wch: 9 }, { wch: 11 }, { wch: 16 }];
  add("Coding", codeSheet((report.coding?.tests) || []), codeCols);
  add("SQL", codeSheet((report.sql?.tests) || []), codeCols);

  XLSX.writeFile(wb, `report-${report.usn || report.torii || "student"}.xlsx`);
}

const statusLabel = (s) => (s === "present" ? "Present" : s === "absent" ? "Absent" : "—");

const DEPT_HEAD = ["USN", "Name", "Branch", "Batch", "Attendance %", "Present", "Total", "Assessments", "Avg Score", "Avg Accuracy %", "Pre-Assessment"];
const deptRow = (r) => [
  r.usn || "", r.name || "", r.branch || "", r.batch || "",
  r.att?.percent ?? 0, r.att?.present ?? 0, r.att?.total ?? 0,
  r.apt?.taken ?? 0, round(r.apt?.avgScore), r.apt?.avgAccuracy ?? 0,
  r.apt?.preScore != null ? r.apt.preScore : "—",
];

/** Whole-department roster with each student's key stats (Excel). */
export async function downloadDepartmentExcel(dept, reports) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([DEPT_HEAD, ...reports.map(deptRow)]);
  ws["!cols"] = [{ wch: 13 }, { wch: 28 }, { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 7 }, { wch: 11 }, { wch: 10 }, { wch: 13 }, { wch: 13 }];
  XLSX.utils.book_append_sheet(wb, ws, "Department Report");
  XLSX.writeFile(wb, `department-report-${(dept || "all").replace(/\s+/g, "_")}.xlsx`);
}

/** Whole-department report as PDF (summary + roster table). */
export async function downloadDepartmentPdf(dept, summary, reports) {
  await downloadTablePdf({
    title: `Department Report — ${dept || "All departments"}`,
    subtitle: `${summary.scopeLabel} · ${reports.length} students · avg attendance ${summary.avgAttendance}% · avg score ${round(summary.avgScore)}`,
    sections: [
      {
        heading: "Students",
        head: DEPT_HEAD,
        body: reports.map((r) => deptRow(r).map(String)),
        columnStyles: { 0: { halign: "left" }, 1: { halign: "left" }, 3: { halign: "left" } },
      },
    ],
    orientation: "l",
    headColor: HEADER_BG,
    filename: `department-report-${(dept || "all").replace(/\s+/g, "_")}.pdf`,
  });
}
