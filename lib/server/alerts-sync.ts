import { planAlertSync, productAlerts, type ExistingAlert } from "@/lib/inventory";
import type { Sql, Tx } from "./db";
import { loadInventory } from "./inventory";

/**
 * يزامن التنبيهات المشتقة من الحالة (نفاد قريب، مخزون منخفض، راكد، صلاحية) مع جدول alerts.
 * يُستدعى بعد كل تغيّر في المخزون، وعند تعبئة البيانات التجريبية.
 */
export async function syncDerivedAlerts(sql: Sql, now: Date = new Date()) {
  return sql.begin((tx) => syncDerivedAlertsTx(tx, now));
}

export async function syncDerivedAlertsTx(tx: Tx, now: Date = new Date()) {
  // طلبان متزامنان ما يضيفان نفس التنبيه مرتين
  await tx`select pg_advisory_xact_lock(hashtext('makhzoon:alerts-sync'))`;

  const inventory = await loadInventory(tx, now);
  const desired = inventory.items.flatMap((i) => productAlerts(i.product, i.metrics, i.batches));
  const existing = await tx<ExistingAlert[]>`
    select id, type, severity, entity_ref, title, body, status
    from alerts
    where type in ('stock', 'stale', 'expiry') and status <> 'resolved'`;

  const plan = planAlertSync(existing, desired);

  if (plan.insert.length) {
    await tx`insert into alerts ${tx(
      plan.insert.map((a) => ({ ...a, status: "open", created_at: now, updated_at: now })),
      "type",
      "severity",
      "entity_ref",
      "title",
      "body",
      "status",
      "created_at",
      "updated_at",
    )}`;
  }
  for (const u of plan.update) {
    await tx`update alerts set title = ${u.title}, body = ${u.body}, updated_at = ${now} where id = ${u.id}`;
  }
  if (plan.resolve.length) {
    await tx`update alerts set status = 'resolved', updated_at = ${now} where id in ${tx(plan.resolve)}`;
  }

  return { inserted: plan.insert.length, updated: plan.update.length, resolved: plan.resolve.length };
}
