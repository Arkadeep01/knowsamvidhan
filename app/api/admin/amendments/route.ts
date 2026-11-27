// app/api/admin/amendments/route.ts

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateAmendmentInput } from "@/lib/amendments/validation.mjs";

// ✅ GET all amendments
export async function GET() {
  const amendments = await prisma.amendment.findMany({
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ amendments });
}

// ✅ POST create amendment
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const result = validateAmendmentInput(body);
    if (!result.ok || !result.value) {
      return NextResponse.json({ error: result.errors.join("; ") }, { status: 400 });
    }

    const created = await prisma.amendment.create({
      data: {
        number:          result.value.number,
        year:            result.value.year,
        title:           result.value.title,
        summary:         result.value.summary,
        whyItMatters:    result.value.whyItMatters,
        relatedArticles: result.value.relatedArticles,
      },
    });

    return NextResponse.json({ amendment: created }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "Amendment number already exists" }, { status: 409 });
    }
    console.error("POST /api/admin/amendments error:", error);
    return NextResponse.json({ error: "Failed to create amendment" }, { status: 500 });
  }
}