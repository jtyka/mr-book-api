import { NextRequest } from "next/server";

export interface PaginationParams {
  page: number;
  size: number;
  sort: string;
  dir: "asc" | "desc";
}

export function parsePagination(
  request: NextRequest,
  defaults: Partial<PaginationParams> = {}
): PaginationParams {
  const params = request.nextUrl.searchParams;
  return {
    page: Math.max(0, parseInt(params.get("page") ?? "0", 10)),
    size: Math.max(0, parseInt(params.get("size") ?? String(defaults.size ?? 20), 10)),
    sort: params.get("sort") ?? defaults.sort ?? "id",
    dir: params.get("dir") === "desc" ? "desc" : "asc",
  };
}

export interface PagedResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  page: number;
  size: number;
}

export function buildPagedResponse<T>(
  content: T[],
  totalElements: number,
  page: number,
  size: number
): PagedResponse<T> {
  const totalPages = size === 0 ? 1 : Math.ceil(totalElements / size);
  return { content, totalElements, totalPages, page, size };
}
