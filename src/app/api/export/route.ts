import { randomUUID } from "crypto";

import { z } from "zod";

import { apiError, apiSuccess, readJsonBody } from "@/lib/api-response";
import { getSession } from "@/lib/auth";
import { PLAN_CONFIG } from "@/lib/plans";
import { isRoutableProjectId, isUuid } from "@/lib/project-ids";
import { getSupabaseUserContext } from "@/lib/supabase/domain";

const exportSchema = z.object({
  projectId: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => isRoutableProjectId(value), {
      message: "Project id must be a UUID or local project slug.",
    }),
  aspectRatios: z
    .array(z.enum(["9:16", "16:9"]))
    .min(1)
    .max(2)
    .refine((ratios) => new Set(ratios).size === ratios.length, {
      message: "Choose each aspect ratio only once.",
    }),
  format: z.enum(["mp4", "webm"]).default("mp4"),
});

type ExportRequest = z.infer<typeof exportSchema>;
type ExportJob = {
  exportId: string;
  aspectRatio: string;
  format: string;
  watermarked: boolean;
  storageAllowed: boolean;
};
type CachedExportRequest = {
  resetAt: number;
  promise: Promise<ExportJob[]>;
};
type ExportRateWindow = {
  count: number;
  resetAt: number;
};
type ApiErrorCode = Parameters<typeof apiError>[0];

const EXPORT_IDEMPOTENCY_WINDOW_MS = 30_000;
const EXPORT_RATE_LIMIT_WINDOW_MS = 60_000;
const EXPORT_RATE_LIMIT_UNIQUE_REQUESTS = 20;

declare global {
  var __codecinematicExportRequests: Map<string, CachedExportRequest> | undefined;
  var __codecinematicExportRateWindows: Map<string, ExportRateWindow> | undefined;
}

const exportRequests =
  globalThis.__codecinematicExportRequests ??
  (globalThis.__codecinematicExportRequests = new Map<string, CachedExportRequest>());
const exportRateWindows =
  globalThis.__codecinematicExportRateWindows ??
  (globalThis.__codecinematicExportRateWindows = new Map<string, ExportRateWindow>());

class ExportRouteError extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return apiError("unauthorized", "Unauthorized", 401);
  }

  const parsed = exportSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return apiError("invalid_payload", "Invalid payload", 400, parsed.error.flatten());
  }

  const plan = PLAN_CONFIG[session.plan];
  const cacheKey = buildExportCacheKey(session.email, parsed.data);
  const cachedRequest = getCachedExportRequest(cacheKey);
  if (cachedRequest) {
    try {
      const jobs = await cachedRequest.promise;
      return apiSuccess({ jobs, reused: true }, { headers: { "x-codecinematic-export-cache": "hit" } });
    } catch (error) {
      exportRequests.delete(cacheKey);
      if (error instanceof ExportRouteError) {
        return apiError(error.code, error.message, error.status, error.details);
      }
      return apiError("upstream_error", "Could not create export jobs.", 502);
    }
  }

  if (isExportRateLimited(session.email)) {
    return apiError(
      "rate_limited",
      "Too many export requests. Please wait a minute and try again.",
      429,
    );
  }

  const promise = createExportJobs(parsed.data, plan);
  exportRequests.set(cacheKey, {
    resetAt: Date.now() + EXPORT_IDEMPOTENCY_WINDOW_MS,
    promise,
  });

  try {
    const jobs = await promise;
    return apiSuccess({ jobs, reused: false }, { headers: { "x-codecinematic-export-cache": "miss" } });
  } catch (error) {
    exportRequests.delete(cacheKey);
    if (error instanceof ExportRouteError) {
      return apiError(error.code, error.message, error.status, error.details);
    }

    return apiError("upstream_error", "Could not create export jobs.", 502);
  }
}

async function createExportJobs(
  exportRequest: ExportRequest,
  plan: (typeof PLAN_CONFIG)[keyof typeof PLAN_CONFIG],
): Promise<ExportJob[]> {
  const context = await getSupabaseUserContext();

  if (context && isUuid(exportRequest.projectId)) {
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id")
      .eq("id", exportRequest.projectId)
      .eq("user_id", context.user.id)
      .maybeSingle();

    if (projectError) {
      throw new ExportRouteError("upstream_error", "Could not verify project ownership.", 502);
    }

    if (!project) {
      throw new ExportRouteError("forbidden", "Project not found for this user.", 403);
    }

    const rows = exportRequest.aspectRatios.map((aspectRatio) => ({
      project_id: exportRequest.projectId,
      user_id: context.user.id,
      aspect_ratio: aspectRatio,
      export_format: exportRequest.format,
      render_mode: "browser",
      status: "queued",
      watermarked: plan.watermark,
      metadata: {
        requestedBy: "api/export",
        storageAllowed: plan.maxStoredExports > 0,
      },
    }));

    const { data: exports, error: insertError } = await context.supabase
      .from("exports")
      .insert(rows)
      .select("id, aspect_ratio, export_format, watermarked");

    if (insertError || !exports) {
      throw new ExportRouteError("upstream_error", "Could not create export jobs.", 502);
    }

    return exports.map((job) => ({
      exportId: job.id,
      aspectRatio: job.aspect_ratio,
      format: job.export_format,
      watermarked: job.watermarked,
      storageAllowed: plan.maxStoredExports > 0,
    }));
  }

  return exportRequest.aspectRatios.map((aspectRatio) => ({
    exportId: randomUUID(),
    aspectRatio,
    format: exportRequest.format,
    watermarked: plan.watermark,
    storageAllowed: plan.maxStoredExports > 0,
  }));
}

function getCachedExportRequest(cacheKey: string) {
  const cachedRequest = exportRequests.get(cacheKey);
  if (!cachedRequest) {
    return null;
  }

  if (cachedRequest.resetAt <= Date.now()) {
    exportRequests.delete(cacheKey);
    return null;
  }

  return cachedRequest;
}

function buildExportCacheKey(email: string, exportRequest: ExportRequest) {
  const aspectKey = [...exportRequest.aspectRatios].sort().join("+");
  return [
    email.toLowerCase(),
    exportRequest.projectId,
    aspectKey,
    exportRequest.format,
  ].join(":");
}

function isExportRateLimited(email: string) {
  const key = email.toLowerCase();
  const now = Date.now();
  const current = exportRateWindows.get(key);

  if (!current || current.resetAt <= now) {
    exportRateWindows.set(key, {
      count: 1,
      resetAt: now + EXPORT_RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  const count = current.count + 1;
  exportRateWindows.set(key, { ...current, count });
  return count > EXPORT_RATE_LIMIT_UNIQUE_REQUESTS;
}
