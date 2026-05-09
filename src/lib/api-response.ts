import { NextResponse } from "next/server";

type ApiErrorCode =
  | "bad_request"
  | "forbidden"
  | "invalid_payload"
  | "invalid_session"
  | "not_configured"
  | "quota_exceeded"
  | "rate_limited"
  | "unauthorized"
  | "upstream_error";

type ApiErrorBody = {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type ApiFailure = {
  ok: false;
  error: ApiErrorBody;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data } satisfies ApiSuccess<T>, init);
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown,
) {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details === undefined ? {} : { details }),
      },
    } satisfies ApiFailure,
    { status },
  );
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
