import jsPDF from "jspdf";

export type OfferPdfInput = {
  candidateName: string;
  candidateEmail?: string | null;
  jobTitle: string;
  clientName?: string | null;
  workspaceName?: string | null;
  salary_amount: number | null;
  salary_currency: string | null;
  start_date: string | null;
  equity: string | null;
  bonus: string | null;
  notes: string | null;
  status: string;
  sent_at?: string | null;
  decided_at?: string | null;
  publicUrl?: string | null;
};

function formatSalary(amount: number | null, currency: string | null) {
  if (amount == null) return "—";
  return `${currency ?? ""} ${Number(amount).toLocaleString()}`.trim();
}

export function downloadOfferPdf(o: OfferPdfInput) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 56;
  let y = 72;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text((o.workspaceName ?? "Offer Letter").toUpperCase(), marginX, y);
  y += 24;

  doc.setFontSize(24);
  doc.setTextColor(30);
  doc.text("Offer of Employment", marginX, y);
  y += 30;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(60);
  doc.text(
    `Prepared for ${o.candidateName}${o.clientName ? ` · ${o.clientName}` : ""}`,
    marginX,
    y,
  );
  y += 30;

  // Divider
  doc.setDrawColor(220);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 24;

  // Salutation
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text(`Dear ${o.candidateName},`, marginX, y);
  y += 22;

  const introLines = doc.splitTextToSize(
    `We are delighted to extend you an offer for the position of ${o.jobTitle}${o.clientName ? ` at ${o.clientName}` : ""}. The key terms of your offer are outlined below.`,
    pageWidth - marginX * 2,
  );
  doc.text(introLines, marginX, y);
  y += introLines.length * 16 + 18;

  // Terms table
  const rows: Array<[string, string]> = [
    ["Position", o.jobTitle],
    ["Annual salary", formatSalary(o.salary_amount, o.salary_currency)],
    ["Start date", o.start_date ? new Date(o.start_date).toLocaleDateString(undefined, { dateStyle: "long" }) : "To be confirmed"],
    ["Equity", o.equity || "—"],
    ["Sign-on bonus", o.bonus || "—"],
  ];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text("Offer terms", marginX, y);
  y += 16;

  doc.setDrawColor(230);
  doc.setFillColor(248, 248, 246);
  doc.roundedRect(marginX, y, pageWidth - marginX * 2, rows.length * 26 + 12, 8, 8, "FD");
  y += 20;

  rows.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(label.toUpperCase(), marginX + 14, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30);
    const wrapped = doc.splitTextToSize(value, pageWidth - marginX * 2 - 180);
    doc.text(wrapped, marginX + 180, y);
    y += 26;
  });
  y += 16;

  // Notes
  if (o.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text("Additional notes", marginX, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(60);
    const noteLines = doc.splitTextToSize(o.notes, pageWidth - marginX * 2);
    // Page break guard
    if (y + noteLines.length * 15 > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = 72;
    }
    doc.text(noteLines, marginX, y);
    y += noteLines.length * 15 + 20;
  }

  // Closing
  if (y > doc.internal.pageSize.getHeight() - 160) {
    doc.addPage();
    y = 72;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(30);
  const closing = doc.splitTextToSize(
    "To accept or decline this offer, please use the secure link below or contact your recruiter directly. We are excited about the possibility of you joining the team.",
    pageWidth - marginX * 2,
  );
  doc.text(closing, marginX, y);
  y += closing.length * 16 + 20;

  if (o.publicUrl) {
    doc.setTextColor(120);
    doc.setFontSize(10);
    doc.text("Secure response link:", marginX, y);
    y += 14;
    doc.setTextColor(180, 90, 20);
    doc.textWithLink(o.publicUrl, marginX, y, { url: o.publicUrl });
    y += 24;
  }

  // Footer
  doc.setDrawColor(220);
  doc.line(marginX, doc.internal.pageSize.getHeight() - 80, pageWidth - marginX, doc.internal.pageSize.getHeight() - 80);
  doc.setTextColor(140);
  doc.setFontSize(9);
  doc.text(
    `Status: ${o.status}${o.sent_at ? ` · Sent ${new Date(o.sent_at).toLocaleDateString()}` : ""}${o.decided_at ? ` · Decided ${new Date(o.decided_at).toLocaleDateString()}` : ""}`,
    marginX,
    doc.internal.pageSize.getHeight() - 60,
  );
  doc.text(
    "This document is confidential and intended solely for the named recipient.",
    marginX,
    doc.internal.pageSize.getHeight() - 46,
  );

  const safeName = o.candidateName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  doc.save(`offer-${safeName || "candidate"}.pdf`);
}
