import { ContentPolicyError } from "./content-policy";
import type { MediaKind } from "./types";

/* ==========================================================================
   Checking that a file is what it says it is

   `validateUpload()` checks the extension and the content type. Both are
   supplied by the browser, which means both are supplied by whoever is
   uploading: renaming `payload.exe` to `photo.jpg` and setting the header to
   `image/jpeg` passed every check the product had.

   This reads the first bytes instead. It is not virus scanning — see
   scanUpload() in server/content-scan.ts for that, and the note there about
   what a real scanner adds — but it is the check that has to exist regardless,
   because a scanner that is not configured must not leave the door open to
   the trivial case.

   Signatures are the standard leading magic numbers. Only the formats the
   upload rules already accept are listed; anything not listed is refused for
   the kinds that require a signature, which is deliberate — an allowlist that
   falls open is not one.
   ========================================================================== */

type Signature = {
  /** Bytes that must appear at `offset`. */
  bytes: number[];
  label: string;
  offset: number;
};

const SIGNATURES: Record<string, Signature[]> = {
  gif: [
    { bytes: [0x47, 0x49, 0x46, 0x38], label: "GIF", offset: 0 },
  ],
  jpeg: [{ bytes: [0xff, 0xd8, 0xff], label: "JPEG", offset: 0 }],
  mp3: [
    { bytes: [0x49, 0x44, 0x33], label: "MP3 with ID3", offset: 0 },
    { bytes: [0xff, 0xfb], label: "MP3", offset: 0 },
    { bytes: [0xff, 0xf3], label: "MP3", offset: 0 },
    { bytes: [0xff, 0xf2], label: "MP3", offset: 0 },
  ],
  mp4: [
    { bytes: [0x66, 0x74, 0x79, 0x70], label: "MP4", offset: 4 },
  ],
  ogg: [{ bytes: [0x4f, 0x67, 0x67, 0x53], label: "Ogg", offset: 0 }],
  pdf: [{ bytes: [0x25, 0x50, 0x44, 0x46], label: "PDF", offset: 0 }],
  png: [
    { bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], label: "PNG", offset: 0 },
  ],
  wav: [{ bytes: [0x52, 0x49, 0x46, 0x46], label: "RIFF/WAV", offset: 0 }],
  webm: [
    { bytes: [0x1a, 0x45, 0xdf, 0xa3], label: "Matroska/WebM", offset: 0 },
  ],
  webp: [{ bytes: [0x52, 0x49, 0x46, 0x46], label: "RIFF/WebP", offset: 0 }],
  /* Every Office format and every .h5p is a zip. */
  zip: [
    { bytes: [0x50, 0x4b, 0x03, 0x04], label: "Zip", offset: 0 },
    { bytes: [0x50, 0x4b, 0x05, 0x06], label: "Empty zip", offset: 0 },
    { bytes: [0x50, 0x4b, 0x07, 0x08], label: "Spanned zip", offset: 0 },
  ],
};

/** Which signature family each accepted extension has to match. */
const EXPECTED: Record<string, keyof typeof SIGNATURES> = {
  docx: "zip",
  gif: "gif",
  h5p: "zip",
  jpeg: "jpeg",
  jpg: "jpeg",
  m4a: "mp4",
  mov: "mp4",
  mp3: "mp3",
  mp4: "mp4",
  ogg: "ogg",
  pdf: "pdf",
  png: "png",
  pptx: "zip",
  wav: "wav",
  webm: "webm",
  webp: "webp",
  xlsx: "zip",
};

/**
 * Refuses a file whose leading bytes do not match its extension.
 *
 * `.txt` is the one accepted extension with no signature at all — plain text
 * has none — so it is checked for control bytes instead, which is what
 * separates a text file from a binary wearing its name.
 */
export function verifyFileSignature(input: {
  bytes: Uint8Array;
  extension: string;
  kind: MediaKind;
}): void {
  const { bytes, extension } = input;

  if (extension === "txt") {
    /* Nulls and most control characters do not occur in text a school types.
       Tab, newline and carriage return do. */
    const head = bytes.subarray(0, 512);
    for (const byte of head) {
      const isPrintable = byte >= 0x20 || byte === 0x09 || byte === 0x0a || byte === 0x0d;
      if (!isPrintable) {
        throw new ContentPolicyError(
          "That file is named .txt but is not a text file.",
        );
      }
    }
    return;
  }

  const family = EXPECTED[extension];
  if (!family) {
    throw new ContentPolicyError(
      `Files of type .${extension} cannot be checked, so they cannot be accepted.`,
    );
  }

  const matched = SIGNATURES[family].some((signature) =>
    startsWith(bytes, signature),
  );
  if (!matched) {
    throw new ContentPolicyError(
      `That file is named .${extension} but its contents are not a ${family} file. Check you selected the right one.`,
    );
  }
}

function startsWith(bytes: Uint8Array, signature: Signature): boolean {
  if (bytes.length < signature.offset + signature.bytes.length) return false;
  return signature.bytes.every(
    (byte, index) => bytes[signature.offset + index] === byte,
  );
}
