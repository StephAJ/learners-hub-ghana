/* ==========================================================================
   A report card as a document a family keeps

   "Download" was `window.print()`. That produces whatever the browser makes
   of the screen — a different document on every device, with the school's
   navigation in the margins on some of them — and it produces nothing at all
   on a phone that cannot print. A report card is the artefact a Ghanaian
   family files, photocopies and brings to the next school; it has to be one
   fixed thing.

   Written by hand rather than with a library, following the same reasoning as
   db/demo-media.ts: a PDF writer that lays out a table of subjects is a few
   hundred lines, and a dependency for it ships in the image that serves real
   schools. Helvetica and Helvetica-Bold are two of the fourteen fonts every
   reader has built in, so nothing needs embedding.

   The report ID is printed on the page. It is what a school checks when
   somebody presents a copy — the "report ID for verification" the scope asks
   for — and it is the version-qualified id, so a corrected report and the one
   it superseded are visibly different documents.
   ========================================================================== */

export type ReportPdfInput = {
  attendance: { present: number; total: number };
  className: string;
  classTeacherComment: string;
  conduct: string;
  headteacherComment: string;
  issuedAt: string;
  learnerName: string;
  overallAverage: number;
  periodName: string;
  promotionDecision: string;
  reportId: string;
  schoolName: string;
  studentNumber: string;
  subjects: Array<{
    grade: string;
    remark: string;
    scorePercent: number;
    subjectName: string;
    teacherComment: string;
  }>;
  version: number;
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT = 56;
const RIGHT = PAGE_WIDTH - 56;

export function renderReportCardPdf(input: ReportPdfInput): Uint8Array {
  const lines: string[] = [];
  let y = PAGE_HEIGHT - 64;

  const attendancePercent =
    input.attendance.total > 0
      ? (input.attendance.present / input.attendance.total) * 100
      : 0;

  /* -- Masthead ---------------------------------------------------------- */
  lines.push(text(input.schoolName, LEFT, y, 18, true));
  y -= 22;
  lines.push(text("End-of-term academic report", LEFT, y, 12));
  y -= 10;
  lines.push(rule(y));
  y -= 24;

  /* -- Who ---------------------------------------------------------------- */
  lines.push(text(input.learnerName, LEFT, y, 14, true));
  lines.push(text(input.periodName, RIGHT - 150, y, 11));
  y -= 16;
  lines.push(
    text(
      [input.className, input.studentNumber].filter(Boolean).join(" · "),
      LEFT,
      y,
      10,
    ),
  );
  lines.push(text(`Issued ${input.issuedAt}`, RIGHT - 150, y, 10));
  y -= 26;

  /* -- Subjects ----------------------------------------------------------- */
  lines.push(text("Subject", LEFT, y, 9, true));
  lines.push(text("Score", LEFT + 250, y, 9, true));
  lines.push(text("Grade", LEFT + 300, y, 9, true));
  lines.push(text("Remark", LEFT + 345, y, 9, true));
  y -= 6;
  lines.push(rule(y));
  y -= 16;

  for (const subject of input.subjects) {
    lines.push(text(truncate(subject.subjectName, 34), LEFT, y, 10));
    lines.push(text(`${subject.scorePercent.toFixed(1)}%`, LEFT + 250, y, 10));
    lines.push(text(subject.grade, LEFT + 300, y, 10));
    lines.push(text(truncate(subject.remark, 22), LEFT + 345, y, 10));
    y -= 14;
    if (subject.teacherComment) {
      lines.push(
        text(truncate(subject.teacherComment, 88), LEFT + 8, y, 8.5),
      );
      y -= 13;
    }
    /* A learner with fourteen subjects and a comment on each overruns one
       page. Rather than silently dropping the tail, the page says so — a
       second page is worth having and is not worth guessing at here.

       320 is what everything below the table needs in the worst case: the
       summary row, two four-line comments, the decision, and the footer that
       starts at 72. Stopping lower would push the headteacher's comment off
       the page, which is the one line a report card cannot lose. */
    if (y < 320) {
      lines.push(text("Continued on the school's copy.", LEFT, y, 9));
      y -= 14;
      break;
    }
  }

  y -= 4;
  lines.push(rule(y));
  y -= 20;

  /* -- Summary ------------------------------------------------------------ */
  lines.push(text("Overall average", LEFT, y, 9, true));
  lines.push(text("Attendance", LEFT + 150, y, 9, true));
  lines.push(text("Conduct", LEFT + 290, y, 9, true));
  y -= 15;
  lines.push(text(`${input.overallAverage.toFixed(1)}%`, LEFT, y, 12, true));
  lines.push(
    text(
      `${attendancePercent.toFixed(1)}% (${input.attendance.present}/${input.attendance.total})`,
      LEFT + 150,
      y,
      12,
      true,
    ),
  );
  lines.push(text(truncate(input.conduct, 20), LEFT + 290, y, 12, true));
  y -= 28;

  /* -- Comments ----------------------------------------------------------- */
  for (const [label, body] of [
    ["Class teacher", input.classTeacherComment],
    ["Headteacher", input.headteacherComment],
  ] as Array<[string, string]>) {
    if (!body.trim()) continue;
    lines.push(text(label, LEFT, y, 9, true));
    y -= 14;
    for (const line of wrap(body, 92)) {
      lines.push(text(line, LEFT, y, 10));
      y -= 13;
    }
    y -= 8;
  }

  if (input.promotionDecision.trim()) {
    lines.push(text("Decision", LEFT, y, 9, true));
    y -= 14;
    lines.push(text(truncate(input.promotionDecision, 92), LEFT, y, 10));
    y -= 20;
  }

  /* -- Foot --------------------------------------------------------------- */
  lines.push(rule(72));
  lines.push(
    text(
      `Report ${input.reportId} · version ${input.version} · issued by ${input.schoolName}`,
      LEFT,
      58,
      8,
    ),
  );
  lines.push(
    text(
      "Check this reference against the school's records before relying on a copy.",
      LEFT,
      46,
      8,
    ),
  );

  return assemble(lines.join("\n"));
}

/* -- PDF primitives ------------------------------------------------------- */

function text(
  value: string,
  x: number,
  y: number,
  size: number,
  bold = false,
): string {
  return `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${escapePdf(value)}) Tj ET`;
}

function rule(y: number): string {
  return `0.75 w 0.8 0.85 0.82 RG ${LEFT} ${y} m ${RIGHT} ${y} l S 0 0 0 RG`;
}

function truncate(value: string, limit: number): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1)}…`;
}

/** Greedy wrap on words, since a fixed-pitch estimate is close enough here. */
function wrap(value: string, limit: number): string[] {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) {
      line = word;
    } else if (`${line} ${word}`.length <= limit) {
      line = `${line} ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
    /* Four lines of a comment is a paragraph; more is a letter, and a report
       card is not one. */
    if (lines.length === 4) break;
  }
  if (line && lines.length < 4) lines.push(line);
  return lines;
}

/**
 * The characters that would end a PDF literal string early, plus anything
 * outside Latin-1 — the cross-reference offsets below are string indices, and
 * a multi-byte character would put every one of them out by the difference.
 */
function escapePdf(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^ -ÿ]/g, "-");
}

function assemble(body: string): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      "/Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${body.length} >>\nstream\n${body}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let index = 0; index < pdf.length; index += 1) {
    bytes[index] = pdf.charCodeAt(index) & 0xff;
  }
  return bytes;
}
