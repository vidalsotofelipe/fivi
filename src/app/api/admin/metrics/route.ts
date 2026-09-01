import { adminRoute, ok } from "@/lib/adminHandler";
import { dateRange, rpc, sp } from "@/lib/adminQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * KPIs y series del dashboard. Todo el cálculo ocurre en `admin_dashboard`
 * (agregados SQL): no se bajan filas al servidor ni al cliente.
 *
 * Query params: `?period=7|30|90` o `?from=ISO&to=ISO`. El comparativo usa la
 * ventana anterior de igual duración.
 */
export const GET = adminRoute(async (req, ctx) => {
  const range = dateRange(sp(req));
  const data = await rpc("admin_dashboard", {
    p_from: range.from,
    p_to: range.to,
    p_prev_from: range.prevFrom,
    p_prev_to: range.prevTo,
  });
  await ctx.audit({ action: "dashboard.view", entity: "dashboard", metadata: { range } });
  return ok({ range, ...(data as Record<string, unknown>) });
});
