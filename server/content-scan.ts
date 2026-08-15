import { ContentPolicyError } from "../domain/content/content-policy";
import { verifyFileSignature } from "../domain/content/file-signatures";
import type { MediaKind } from "../domain/content/types";

/* ==========================================================================
   Scanning what a school accepts

   Learners hand in files against assignments and file-upload questions,
   teachers upload lesson media and H5P packages, applicants upload documents.
   All of it landed in storage with a size limit and an extension check, and
   both of those come from the browser — so renaming an executable to
   `photo.jpg` passed every check the product had.

   Two layers, and they answer different questions.

   The signature check is local, always runs, and answers "is this file what it
   says it is". It costs nothing and closes the trivial case, which matters
   most on a school VPS where a scanner may never be configured.

   The scanner answers "is this file known to be dangerous", which no amount of
   local checking can. It speaks clamd's INSTREAM protocol over TCP, because
   ClamAV is what a Hostinger VPS can actually run and what a school's host is
   likely to already offer. Unset CLAMAV_HOST and the scan is skipped — stated
   plainly here rather than pretended, and surfaced by /api/health so a school
   can see that uploads are unscanned rather than assume they are not.
   ========================================================================== */

const CHUNK = 64 * 1024;

export type ScanOutcome =
  | { scanned: false; reason: string }
  | { scanned: true; clean: true }
  | { scanned: true; clean: false; threat: string };

export function scannerConfigured(): boolean {
  return Boolean(process.env.CLAMAV_HOST?.trim());
}

/**
 * Checks an upload, and throws if it must not be kept.
 *
 * The signature check throws a ContentPolicyError, which the API turns into a
 * 422 the person can act on. A detected threat does the same, deliberately: a
 * teacher whose file is refused is owed a sentence, and a 500 tells them
 * nothing and tells the log the wrong thing.
 */
export async function scanUpload(input: {
  bytes: Uint8Array;
  extension: string;
  kind: MediaKind;
}): Promise<ScanOutcome> {
  verifyFileSignature(input);

  const outcome = await scanWithClamav(input.bytes);
  if (outcome.scanned && !outcome.clean) {
    throw new ContentPolicyError(
      `That file was refused: ${outcome.threat}. If you believe this is wrong, tell the school office.`,
    );
  }
  return outcome;
}

/**
 * clamd's INSTREAM command, over a plain socket.
 *
 * A scanner that is down must not stop a school working, so a connection
 * failure is reported as "not scanned" rather than thrown — the same trade
 * the mail transport makes. What it must not do is report "clean" when it did
 * not look, which is why the two are different shapes in the return type
 * rather than a boolean.
 */
async function scanWithClamav(bytes: Uint8Array): Promise<ScanOutcome> {
  const host = process.env.CLAMAV_HOST?.trim();
  if (!host) {
    return { reason: "CLAMAV_HOST is not configured.", scanned: false };
  }
  const port = Number(process.env.CLAMAV_PORT ?? 3310);

  try {
    const { Socket } = await import("node:net");
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = new Socket();
      let received = "";

      socket.setTimeout(15_000);
      socket.on("data", (chunk) => {
        received += chunk.toString("utf8");
      });
      socket.on("end", () => resolve(received));
      socket.on("error", reject);
      socket.on("timeout", () => {
        socket.destroy();
        reject(new Error("The virus scanner did not answer in time."));
      });

      socket.connect(port, host, () => {
        socket.write("zINSTREAM\0");
        /* Length-prefixed chunks, then a zero-length chunk to end the
           stream. Chunked rather than one write so a 25 MB upload does not
           become a 25 MB socket buffer. */
        for (let at = 0; at < bytes.length; at += CHUNK) {
          const slice = bytes.subarray(at, at + CHUNK);
          const header = Buffer.alloc(4);
          header.writeUInt32BE(slice.length, 0);
          socket.write(header);
          socket.write(slice);
        }
        socket.write(Buffer.alloc(4));
      });
    });

    if (reply.includes("OK") && !reply.includes("FOUND")) {
      return { clean: true, scanned: true };
    }
    if (reply.includes("FOUND")) {
      const threat =
        reply.replace(/^stream:\s*/, "").replace(/\s*FOUND\s*$/, "").trim() ||
        "a known threat";
      return { clean: false, scanned: true, threat };
    }
    return { reason: `The scanner answered "${reply.trim()}".`, scanned: false };
  } catch (error) {
    /* Logged rather than thrown. A school whose scanner is down should still
       be able to teach; what it should not do is believe files were checked. */
    console.error("[scan] virus scan could not run", error);
    return {
      reason:
        error instanceof Error ? error.message : "The scanner is unreachable.",
      scanned: false,
    };
  }
}
