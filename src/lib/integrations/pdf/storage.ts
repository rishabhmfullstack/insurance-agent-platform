import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { put } from "@vercel/blob";
import { config, pdfStorageMode } from "@/lib/config";

// PDF storage behind one function (D-08). `blob` on Vercel (public,
// unguessable URL); `local` is the dev fallback when no Blob token exists —
// files land in var/pdf-storage/ (gitignored) and are served by
// /api/files/[name]. The deployed app always runs in blob mode; the README
// service matrix states which mode is active.

export const LOCAL_PDF_DIR = path.join(process.cwd(), "var", "pdf-storage");

/** @returns a URL the app can store on the application row */
export async function storePdf(filename: string, buffer: Buffer): Promise<string> {
  if (pdfStorageMode === "blob") {
    const blob = await put(filename, buffer, {
      access: "public",
      contentType: "application/pdf",
      token: config.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  }

  await mkdir(LOCAL_PDF_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_PDF_DIR, filename), buffer);
  return `${config.APP_URL}/api/files/${filename}`;
}
