import jsPDF from "jspdf";

export type OfferAuditEvent = {
  label: string;
  timestamp: string | null | undefined;
  actor?: string | null;
  ip?: string | null;
  meta?: string | null;
};

export type OfferPdfInput = {
  candidateName: string;
  candidateEmail?: string | null;
  jobTitle: string;
  clientName?: string | null;
  workspaceName?: string | null;
  recruiterName?: string | null;
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
  // Signature + audit
  envelopeId?: string | null;
  signature?: {
    type: "typed" | "drawn";
    data: string; // typed name string OR dataURL for drawn
    signedAt: string;
    signerName: string;
    signerEmail?: string | null;
    signerIp?: string | null;
    signerUa?: string | null;
  } | null;
  createdAt?: string | null;
  approvedAt?: string | null;
  viewedAt?: string | null;
  viewedIp?: string | null;
};

const formatSalary = (amount: number | null, currency: string | null) =>
  amount == null ? "—" : `${currency ?? ""} ${Number(amount).toLocaleString()}`.trim();

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const fmtUtc = (iso?: string | null) =>
  iso ? `${new Date(iso).toISOString().replace("T", " ").slice(0, 19)} UTC` : "—";

function renderOfferLetter(doc: jsPDF, o: OfferPdfInput) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 56;
  let y = 72;

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
  doc.text(`Prepared for ${o.candidateName}${o.clientName ? ` · ${o.clientName}` : ""}`, marginX, y);
  y += 24;

  if (o.envelopeId) {
    doc.setFontSize(9);
    doc.setTextColor(140);
    doc.text(`Envelope ID: ${o.envelopeId}`, marginX, y);
    y += 16;
  }

  doc.setDrawColor(220);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 24;

  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text(`Dear ${o.candidateName},`, marginX, y);
  y += 22;

  const intro = doc.splitTextToSize(
    `We are delighted to extend you an offer for the position of ${o.jobTitle}${o.clientName ? ` at ${o.clientName}` : ""}. The key terms of your offer are outlined below.`,
    pageWidth - marginX * 2,
  );
  doc.text(intro, marginX, y);
  y += intro.length * 16 + 18;

  const rows: [string, string][] = [
    ["Position", o.jobTitle],
    ["Annual salary", formatSalary(o.salary_amount, o.salary_currency)],
    ["Start date", o.start_date ? new Date(o.start_date).toLocaleDateString(undefined, { dateStyle: "long" }) : "To be confirmed"],
    ["Equity", o.equity || "—"],
    ["Sign-on bonus", o.bonus || "—"],
  ];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
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

  if (o.notes) {
    if (y > pageHeight - 160) { doc.addPage(); y = 72; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text("Additional notes", marginX, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(60);
    const noteLines = doc.splitTextToSize(o.notes, pageWidth - marginX * 2);
    doc.text(noteLines, marginX, y);
    y += noteLines.length * 15 + 20;
  }

  if (y > pageHeight - 220) { doc.addPage(); y = 72; }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(30);
  const closing = doc.splitTextToSize(
    o.signature
      ? "This offer has been electronically signed. The signature and full audit trail are captured on the Certificate of Completion appended to this document."
      : "To accept this offer, please use the secure link below to review and sign electronically. Contact your recruiter with any questions.",
    pageWidth - marginX * 2,
  );
  doc.text(closing, marginX, y);
  y += closing.length * 16 + 20;

  // Signature block
  if (o.signature) {
    if (y > pageHeight - 200) { doc.addPage(); y = 72; }
    doc.setDrawColor(220);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(30);
    doc.text("Accepted and signed by", marginX, y);
    y += 18;

    // Render signature — drawn = image, typed = cursive-ish text
    if (o.signature.type === "drawn" && o.signature.data.startsWith("data:image")) {
      try {
        doc.addImage(o.signature.data, "PNG", marginX, y, 200, 60);
      } catch { /* ignore */ }
      y += 68;
    } else {
      doc.setFont("times", "italic");
      doc.setFontSize(28);
      doc.setTextColor(20);
      doc.text(o.signature.data, marginX, y + 30);
      y += 60;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(`${o.signature.signerName}${o.signature.signerEmail ? ` · ${o.signature.signerEmail}` : ""}`, marginX, y);
    y += 14;
    doc.text(`Signed ${fmt(o.signature.signedAt)}`, marginX, y);
    y += 14;
    if (o.envelopeId) {
      doc.setTextColor(140);
      doc.setFontSize(9);
      doc.text(`Envelope ID: ${o.envelopeId}`, marginX, y);
      y += 14;
    }
  } else if (o.publicUrl) {
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
  doc.line(marginX, pageHeight - 80, pageWidth - marginX, pageHeight - 80);
  doc.setTextColor(140);
  doc.setFontSize(9);
  doc.text(
    `Status: ${o.status}${o.sent_at ? ` · Sent ${new Date(o.sent_at).toLocaleDateString()}` : ""}${o.decided_at ? ` · Decided ${new Date(o.decided_at).toLocaleDateString()}` : ""}`,
    marginX, pageHeight - 60,
  );
  doc.text("This document is confidential and intended solely for the named recipient.", marginX, pageHeight - 46);
}

function renderCertificate(doc: jsPDF, o: OfferPdfInput) {
  doc.addPage();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 56;
  let y = 60;

  // Header banner
  doc.setFillColor(30, 21, 35); // Midnight Plum
  doc.rect(0, 0, pageWidth, 90, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Certificate of Completion", marginX, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(240, 220, 180);
  doc.text(`Envelope ID: ${o.envelopeId ?? "—"}`, marginX, 60);
  doc.text(`Status: ${o.signature ? "Completed" : o.status}`, marginX, 74);

  y = 120;

  // Subject
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30);
  doc.text("Subject", marginX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`${o.jobTitle}${o.clientName ? ` · ${o.clientName}` : ""}`, marginX + 90, y);
  y += 22;

  // Originator
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Originator", marginX, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const originatorRows: [string, string][] = [
    ["Recruiter", o.recruiterName ?? "—"],
    ["Company", o.workspaceName ?? "—"],
    ["Created", fmtUtc(o.createdAt)],
    ["Approved", fmtUtc(o.approvedAt)],
    ["Sent", fmtUtc(o.sent_at)],
  ];
  originatorRows.forEach(([k, v]) => {
    doc.setTextColor(120);
    doc.text(k, marginX, y);
    doc.setTextColor(30);
    doc.text(v, marginX + 120, y);
    y += 14;
  });
  y += 10;

  // Signer
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text("Signer Events", marginX, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const s = o.signature;
  const signerRows: [string, string][] = [
    ["Name", s?.signerName ?? o.candidateName],
    ["Email", s?.signerEmail ?? o.candidateEmail ?? "—"],
    ["Security", "Email Authentication (secure token link)"],
    ["IP Address", s?.signerIp ?? "—"],
    ["User Agent", (s?.signerUa ?? "—").slice(0, 90)],
    ["Signed", s ? fmtUtc(s.signedAt) : "—"],
    ["Signature Type", s ? (s.type === "drawn" ? "Drawn (canvas)" : "Typed (adopted)") : "—"],
  ];
  signerRows.forEach(([k, v]) => {
    doc.setTextColor(120);
    doc.text(k, marginX, y);
    doc.setTextColor(30);
    const wrapped = doc.splitTextToSize(v, pageWidth - marginX - 120 - marginX);
    doc.text(wrapped, marginX + 120, y);
    y += 14 * wrapped.length;
  });

  // Signature image
  if (s) {
    y += 8;
    doc.setDrawColor(220);
    doc.roundedRect(marginX, y, 260, 70, 6, 6);
    if (s.type === "drawn" && s.data.startsWith("data:image")) {
      try {
        doc.addImage(s.data, "PNG", marginX + 6, y + 6, 248, 58);
      } catch { /* ignore */ }
    } else {
      doc.setFont("times", "italic");
      doc.setFontSize(22);
      doc.setTextColor(20);
      doc.text(s.data, marginX + 12, y + 42);
    }
    y += 82;
  }

  // Audit log
  if (y > pageHeight - 200) { doc.addPage(); y = 72; }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30);
  doc.text("Audit Trail", marginX, y);
  y += 16;

  const events: OfferAuditEvent[] = [
    { label: "Offer created", timestamp: o.createdAt, actor: o.recruiterName ?? undefined },
    { label: "Offer approved internally", timestamp: o.approvedAt, actor: o.recruiterName ?? undefined },
    { label: "Offer sent to candidate", timestamp: o.sent_at },
    { label: "Offer viewed by candidate", timestamp: o.viewedAt, ip: o.viewedIp ?? undefined },
    {
      label: "Offer electronically signed",
      timestamp: s?.signedAt,
      actor: s?.signerName,
      ip: s?.signerIp ?? undefined,
      meta: o.envelopeId ? `Envelope ${o.envelopeId}` : undefined,
    },
  ];

  // Table header
  doc.setFillColor(245, 243, 240);
  doc.rect(marginX, y, pageWidth - marginX * 2, 20, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text("EVENT", marginX + 8, y + 13);
  doc.text("TIMESTAMP (UTC)", marginX + 200, y + 13);
  doc.text("ACTOR / DETAILS", marginX + 360, y + 13);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  events.forEach((e, i) => {
    if (i % 2 === 1) {
      doc.setFillColor(250, 249, 247);
      doc.rect(marginX, y, pageWidth - marginX * 2, 22, "F");
    }
    doc.setTextColor(30);
    doc.text(e.label, marginX + 8, y + 14);
    doc.setTextColor(80);
    doc.text(fmtUtc(e.timestamp ?? undefined), marginX + 200, y + 14);
    const detail = [e.actor, e.ip, e.meta].filter(Boolean).join(" · ") || "—";
    const wrapped = doc.splitTextToSize(detail, pageWidth - marginX - 360 - marginX);
    doc.text(wrapped, marginX + 360, y + 14);
    y += 22;
  });

  // Footer
  doc.setDrawColor(220);
  doc.line(marginX, pageHeight - 60, pageWidth - marginX, pageHeight - 60);
  doc.setTextColor(140);
  doc.setFontSize(8);
  doc.text(
    `Generated ${fmtUtc(new Date().toISOString())} · ${o.workspaceName ?? ""} · Electronic signature captured under the E-SIGN Act.`,
    marginX, pageHeight - 44,
  );
}

export function buildOfferPdf(o: OfferPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  renderOfferLetter(doc, o);
  renderCertificate(doc, o);
  return doc;
}

export function downloadOfferPdf(o: OfferPdfInput) {
  const doc = buildOfferPdf(o);
  const safeName = o.candidateName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const suffix = o.signature ? "signed" : "draft";
  doc.save(`offer-${safeName || "candidate"}-${suffix}.pdf`);
}
