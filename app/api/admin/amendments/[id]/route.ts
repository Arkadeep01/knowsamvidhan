import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAmendmentInput } from "@/lib/amendments/validation.mjs";

// ✅ PUT — update amendment
export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const result = validateAmendmentInput(body);
    if (!result.ok || !result.value) {
      return NextResponse.json({ error: result.errors.join("; ") }, { status: 400 });
    }

    const updated = await prisma.amendment.update({
      where: { id },
      data: {
        number:          result.value.number,
        year:            result.value.year,
        title:           result.value.title,
        summary:         result.value.summary,
        whyItMatters:    result.value.whyItMatters,
        relatedArticles: result.value.relatedArticles,
      },
    });

    return NextResponse.json({ amendment: updated });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Amendment number already exists" }, { status: 409 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Amendment not found" }, { status: 404 });
    }
    console.error("PUT /api/admin/amendments/[id] error:", error);
    return NextResponse.json({ error: "Failed to update amendment" }, { status: 500 });
  }
}

// ✅ DELETE — remove amendment
export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await prisma.amendment.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Amendment not found" }, { status: 404 });
    }
    console.error("DELETE /api/admin/amendments/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete amendment" }, { status: 500 });
  }
}
