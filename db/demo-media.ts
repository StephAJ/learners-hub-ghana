import { getMediaStore, getSchoolDatabase } from "./index";

/* ==========================================================================
   Bytes for the demo's study resources

   The seed inserted media_assets rows with status 'ready' and a plausible
   size, and wrote nothing to the media store — the comment in
   learning-repository.ts said as much: "Nothing is on disk for these".

   'ready' is not a description, it is a promise the player believes. A
   resource block resolves the attachment from the row, so it rendered a
   filename, a format, a size and a working-looking Download button for a
   file that answered 404. Every demo lesson had one.

   So the demo now writes a real, openable PDF for each of its study
   resources, and corrects the row's size to the bytes actually written.
   Placeholder content, but a genuine file: a walkthrough where Download
   produces a document is worth more than one where it produces an error, and
   the size on the row has to match the bytes behind it or the response sends
   a content-length it cannot fill.

   H5P packages are deliberately left alone. A believable .h5p is a real zip
   of real library code, not something to fabricate, and the failure a
   teacher meets when activating one — "The H5P package file is unavailable"
   — is already the truth.
   ========================================================================== */

export async function ensureDemoMediaObjects(): Promise<void> {
  const database = await getSchoolDatabase();
  const assets = await database
    .prepare(
      `SELECT id, object_key, original_filename, size_bytes
      FROM media_assets
      WHERE object_key LIKE 'demo/%' AND kind = 'document'
        AND status = 'ready'`,
    )
    .bind()
    .all<{
      id: string;
      object_key: string;
      original_filename: string;
      size_bytes: number;
    }>();
  if (assets.results.length === 0) return;

  const store = await getMediaStore();

  for (const asset of assets.results) {
    /* Idempotent: the seed runs on every cold start, and rewriting a file a
       school has since replaced would be the seed overwriting real work. */
    const existing = await store.get(asset.object_key);
    if (existing) {
      /* The bytes are there but the row may still carry the invented size,
         which is what makes the download stall. Repairing it here is what
         fixes a database written by an earlier build. */
      if (existing.size !== Number(asset.size_bytes)) {
        await recordSize(asset.id, existing.size);
      }
      continue;
    }

    const bytes = placeholderPdf(asset.original_filename);
    await store.put(asset.object_key, bytes, {
      httpMetadata: { contentType: "application/pdf" },
    });
    await recordSize(asset.id, bytes.byteLength);
  }
}

async function recordSize(assetId: string, sizeBytes: number) {
  const database = await getSchoolDatabase();
  await database
    .prepare(`UPDATE media_assets SET size_bytes = ? WHERE id = ?`)
    .bind(sizeBytes, assetId)
    .run();
}

/**
 * A one-page PDF naming the file it stands in for.
 *
 * Written by hand rather than with a library: the whole need is a few hundred
 * bytes that a PDF reader will open, and a dependency to produce demo data
 * would ship in the image that serves real schools.
 *
 * The cross-reference table carries byte offsets, so the objects are
 * assembled first and measured as they go.
 */
export function placeholderPdf(filename: string): Uint8Array {
  const title = pdfString(filename);
  const body = [
    `BT /F1 16 Tf 64 760 Td (${title}) Tj ET`,
    `BT /F1 11 Tf 64 730 Td (${pdfString(
      "Placeholder study resource from the Learners Hub demo school.",
    )}) Tj ET`,
    `BT /F1 11 Tf 64 712 Td (${pdfString(
      "A teacher's own upload replaces this file.",
    )}) Tj ET`,
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
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

  /* Latin-1 rather than UTF-8: the offsets above are string indices, and a
     multi-byte character would put every one of them out by the difference. */
  const bytes = new Uint8Array(pdf.length);
  for (let index = 0; index < pdf.length; index += 1) {
    bytes[index] = pdf.charCodeAt(index) & 0xff;
  }
  return bytes;
}

/** Escapes the three characters that end a PDF literal string early. */
function pdfString(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    /* Anything outside Latin-1 would break the byte offsets, and a filename
       is the school's to choose. Replaced rather than refused. */
    .replace(/[^\x20-\x7e]/g, "?");
}
