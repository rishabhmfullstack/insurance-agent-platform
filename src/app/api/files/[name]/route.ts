import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { pdfStorageMode } from "@/lib/config";
import { LOCAL_PDF_DIR } from "@/lib/integrations/pdf/storage";

// Serves locally stored PDFs in dev only (storage mode `local`). In blob mode
// (the deployment) this route is inert — PDFs live on Vercel Blob URLs.
// Filenames are strictly whitelisted: no traversal, no other files.
const NAME_RE = /^quote-[0-9a-f-]{36}-[0-9a-f]{8}\.pdf$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (pdfStorageMode !== "local" || !NAME_RE.test(name)) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const buffer = await readFile(path.join(LOCAL_PDF_DIR, name));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${name}"`,
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
