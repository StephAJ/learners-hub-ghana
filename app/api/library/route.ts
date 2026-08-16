import {
  addLibraryResource,
  archiveLibraryResource,
  listLibrary,
} from "../../../db/library-repository";
import {
  requireSchoolRequestUser,
  schoolApiErrorResponse,
} from "../../../server/request-auth";

export const dynamic = "force-dynamic";

/** The shelf, filtered. Any active member of the school may read it. */
export async function GET(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const url = new URL(request.url);
    const shelf = await listLibrary(schoolUser.access, {
      category: url.searchParams.get("category") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      subjectId: url.searchParams.get("subjectId") ?? undefined,
    });
    return Response.json({ shelf });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

/* Multipart rather than JSON: the file is the resource, and reading it as
   form data is what lets the repository scan the bytes before anything is
   written. */
export async function POST(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return Response.json(
        { error: "Choose the file to add to the library." },
        { status: 400 },
      );
    }

    const resource = await addLibraryResource(schoolUser.access, {
      category: String(form.get("category") ?? ""),
      description: String(form.get("description") ?? ""),
      file,
      subjectId: String(form.get("subjectId") ?? "") || undefined,
      title: String(form.get("title") ?? ""),
      yearGroup: String(form.get("yearGroup") ?? "") || undefined,
    });
    return Response.json({ resource }, { status: 201 });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}

/* Archived rather than deleted — see the note in the repository. */
export async function DELETE(request: Request) {
  try {
    const schoolUser = await requireSchoolRequestUser();
    const url = new URL(request.url);
    await archiveLibraryResource(
      schoolUser.access,
      url.searchParams.get("resourceId") ?? "",
    );
    return Response.json({ ok: true });
  } catch (error) {
    return schoolApiErrorResponse(error);
  }
}
