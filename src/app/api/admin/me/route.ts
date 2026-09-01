import { adminRoute, ok } from "@/lib/adminHandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Whoami del panel: si se llega acá, `requireAdmin` ya validó que es admin. */
export const GET = adminRoute(async (_req, ctx) =>
  ok({ adminId: ctx.adminId, email: ctx.email }),
);
