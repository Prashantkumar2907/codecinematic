import { NextResponse } from "next/server";

import { getDemoSession } from "@/lib/demo-auth";

export async function GET() {
  const session = await getDemoSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    items: [
      {
        id: "demo-export-vertical",
        title: "API Gateway explainer",
        aspectRatio: "9:16",
        status: "completed",
        mode: "browser"
      },
      {
        id: "demo-export-landscape",
        title: "API Gateway explainer",
        aspectRatio: "16:9",
        status: "completed",
        mode: "browser"
      }
    ]
  });
}
