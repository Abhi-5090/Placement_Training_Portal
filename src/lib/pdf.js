const BRAND = [234, 88, 41];
const INK = [17, 24, 39];
const MUTED = [107, 114, 128];

/**
 * Generic branded, multi-section tabular PDF (matches the Excel exports' data).
 * sections: [{ heading?, head: [col…], body: [[cell…]…] }]. jsPDF + autotable
 * are imported lazily so they stay out of the main bundle.
 */
export async function downloadTablePdf({ title, subtitle, sections, filename = "report.pdf", orientation = "p", headColor = BRAND }) {
  const { jsPDF } = await import("jspdf");
  const autoMod = await import("jspdf-autotable");
  const autoTable = autoMod.default || autoMod.autoTable || autoMod;

  const doc = new jsPDF({ unit: "pt", format: "a4", orientation });
  const margin = 40;
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(...INK);
  doc.text(title, margin, 50);

  let cursor = 68;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(subtitle, margin, cursor);
    cursor += 10;
  }
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(1.5);
  doc.line(margin, cursor, pageW - margin, cursor);

  let y = cursor + 22;

  const heading = (t) => {
    if (y > pageH - 90) {
      doc.addPage();
      y = margin + 10;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...BRAND);
    doc.text(t, margin, y);
    doc.setTextColor(...INK);
    y += 8;
  };

  for (const s of sections || []) {
    if (!s || !s.head) continue;
    if (s.heading) heading(s.heading);
    autoTable(doc, {
      head: [s.head],
      body: s.body && s.body.length ? s.body : [s.head.map(() => "—")],
      startY: y,
      margin: { left: margin, right: margin },
      // Content is centre-aligned by default; sections override per column.
      styles: { fontSize: 9, cellPadding: 4, overflow: "linebreak", textColor: INK, lineColor: [229, 231, 235], lineWidth: 0.5, halign: "center", valign: "middle" },
      headStyles: { fillColor: headColor, textColor: 255, fontStyle: "bold", halign: "center" },
      alternateRowStyles: { fillColor: [247, 248, 250] },
      columnStyles: s.columnStyles || {},
      theme: "grid",
    });
    y = doc.lastAutoTable.finalY + 24;
  }

  const pages = doc.internal.getNumberOfPages();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - 16, { align: "right" });
    doc.text("Torii Minds · Placement Training", margin, pageH - 16);
  }

  doc.save(filename);
}
