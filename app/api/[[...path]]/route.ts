import { handleApiRequest } from "@/api/router";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

async function handler(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return handleApiRequest(request, path);
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
