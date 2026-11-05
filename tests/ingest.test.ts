/**
 * اختبارات تكامل لخادم الاستقبال على قاعدة بيانات حقيقية.
 * تعمل فقط إذا عُرّف TEST_DATABASE_URL (قاعدة فيها المخطط مطبّق)، وكل اختبار داخل معاملة تُلغى في النهاية.
 *   TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test
 */
import { afterAll, describe, expect, it } from "vitest";
import { buildEpc } from "@/lib/inventory";
import { syncDerivedAlertsTx } from "@/lib/server/alerts-sync";
import { createSql, type Tx } from "@/lib/server/db";
import { closeIdleReceipts, ingestReadsTx, type ReadsPayload } from "@/lib/server/ingest";
import { generatePass, toRiyadhIso, type WireRead } from "@/lib/simulator/passes";
import { createRng } from "@/lib/simulator/rng";

const url = process.env.TEST_DATABASE_URL;
const sql = url ? createSql(url, { max: 2 }) : null;
const describeDb = sql ? describe : describe.skip;
afterAll(async () => {
  await sql?.end();
});

const ROLLBACK = new Error("rollback");
async function inTx(fn: (tx: Tx) => Promise<void>) {
  await sql!
    .begin(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    })
    .catch((err) => {
      if (err !== ROLLBACK) throw err;
    });
}

const T0 = new Date();
const at = (ms: number) => new Date(T0.getTime() + ms);
const IDLE = 3_000;

async function fixture(tx: Tx) {
  await tx`insert into zones (id, name_ar, type) values
    ('T-RCV', 'استلام اختبار', 'receiving'), ('T-STO', 'تخزين اختبار', 'storage'), ('T-COLD', 'تبريد اختبار', 'cold')`;
  await tx`insert into gates (id, name_ar, type, from_zone_id, to_zone_id) values
    ('T-G1', 'استلام', 'inbound', null, 'T-RCV'),
    ('T-G2', 'شحن', 'outbound', null, 'T-STO'),
    ('T-G3', 'تبريد', 'transfer', 'T-RCV', 'T-COLD'),
    ('T-G5', 'مخرج خلفي', 'restricted', null, 'T-STO')`;
  const [product] = await tx<{ id: string }[]>`
    insert into products (sku, name_ar, category, unit_cost, unit_price, pack_size, lead_time_days, default_zone_id, has_expiry, shelf_life_days)
    values ('FF01', 'صنف اختبار', 'dairy', 5, 7, 6, 2, 'T-STO', true, 10) returning id`;
  const pid = product!.id;
  const [soon] = await tx<{ id: string }[]>`
    insert into batches (product_id, lot_number, quantity, expiry_date, received_at, zone_id)
    values (${pid}, 'T-SOON', 6, current_date + 3, now() - interval '5 days', 'T-STO') returning id`;
  const [late] = await tx<{ id: string }[]>`
    insert into batches (product_id, lot_number, quantity, expiry_date, received_at, zone_id)
    values (${pid}, 'T-LATE', 12, current_date + 9, now() - interval '1 day', 'T-STO') returning id`;
  const epcs = [1, 2, 3].map((n) => buildEpc("FF01", n));
  await tx`insert into rfid_tags ${tx([
    { epc: epcs[0], product_id: pid, batch_id: soon!.id, units: 6, status: "active", last_zone_id: "T-STO" },
    { epc: epcs[1], product_id: pid, batch_id: late!.id, units: 6, status: "active", last_zone_id: "T-STO" },
    { epc: epcs[2], product_id: pid, batch_id: late!.id, units: 6, status: "active", last_zone_id: "T-RCV" },
  ])}`;
  const [po] = await tx<{ id: string }[]>`insert into purchase_orders (po_number, status) values ('T-PO-1', 'open') returning id`;
  await tx`insert into po_lines (po_id, product_id, qty_expected) values (${po!.id}, ${pid}, 12)`;
  const [so] = await tx<{ id: string }[]>`insert into sales_orders (so_number, destination, status) values ('T-SO-1', 'فرع اختبار', 'open') returning id`;
  await tx`insert into so_lines (so_id, product_id, qty_ordered) values (${so!.id}, ${pid}, 6)`;
  return { pid, soonId: soon!.id, lateId: late!.id, epcs: epcs as [string, string, string] };
}

const send = (tx: Tx, gate_id: string, reads: WireRead[], now = at(5_000)) =>
  ingestReadsTx(tx, { gate_id, reads } as ReadsPayload, { now, receiptIdleMs: IDLE });

const pass = (epc: string, kind: "in" | "out" | "unconfirmed", start: Date, seed = 1) =>
  generatePass(epc, kind, start, createRng(seed));

async function qty(tx: Tx, batchId: string) {
  const [b] = await tx<{ quantity: number }[]>`select quantity from batches where id = ${batchId}`;
  return b!.quantity;
}

describeDb("خادم الاستقبال (POST /api/rfid/reads)", () => {
  it("مرور بهوائيين مع قراءات مكررة = حركة واحدة، والمكرر يُحفظ خامًا", async () => {
    await inTx(async (tx) => {
      const { epcs } = await fixture(tx);
      const reads = pass(epcs[2], "in", at(0));
      const result = await send(tx, "T-G3", reads);
      expect(result).toMatchObject({ accepted: reads.length, duplicates: reads.length - 1, movements: 1, confirmed: 1 });

      const moves = await tx`select direction, flag, units from movements where gate_id = 'T-G3'`;
      expect(moves).toEqual([{ direction: "in", flag: null, units: 6 }]);
      const [raw] = await tx<{ raw: number; dup: number }[]>`
        select count(*)::int as raw, count(*) filter (where is_duplicate)::int as dup from rfid_reads where gate_id = 'T-G3'`;
      expect(raw).toEqual({ raw: reads.length, dup: reads.length - 1 });
      const [tag] = await tx`select last_zone_id from rfid_tags where epc = ${epcs[2]}`;
      expect(tag?.last_zone_id).toBe("T-COLD");
    });
  });

  it("نفس المرور مرة ثانية خلال 5 ثوانٍ ما ينتج حركة جديدة", async () => {
    await inTx(async (tx) => {
      const { epcs } = await fixture(tx);
      await send(tx, "T-G3", pass(epcs[2], "in", at(0)));
      const again = await send(tx, "T-G3", pass(epcs[2], "in", at(2_500), 2));
      expect(again.movements).toBe(0);
      const [m] = await tx<{ n: number }[]>`select count(*)::int as n from movements where gate_id = 'T-G3'`;
      expect(m?.n).toBe(1);
    });
  });

  it("الهوائي الثاني في دفعة لاحقة يؤكد الاتجاه", async () => {
    await inTx(async (tx) => {
      const { epcs } = await fixture(tx);
      const reads = pass(epcs[2], "out", at(0));
      const firstAntenna = reads.filter((r) => r.antenna === "A");
      const secondAntenna = reads.filter((r) => r.antenna === "B");
      await send(tx, "T-G3", firstAntenna);
      const [pending] = await tx`select direction, flag from movements where gate_id = 'T-G3'`;
      expect(pending).toEqual({ direction: null, flag: "unconfirmed" });
      const result = await send(tx, "T-G3", secondAntenna);
      expect(result.confirmed).toBe(1);
      const [done] = await tx`select direction, flag from movements where gate_id = 'T-G3'`;
      expect(done).toEqual({ direction: "out", flag: null });
    });
  });

  it("قراءة على هوائي واحد: اتجاه غير مؤكد والمخزون ما يتغير", async () => {
    await inTx(async (tx) => {
      const { epcs, soonId, lateId } = await fixture(tx);
      const result = await send(tx, "T-G2", pass(epcs[0], "unconfirmed", at(0)));
      expect(result).toMatchObject({ movements: 1, confirmed: 0, stock_changed: false });
      const [m] = await tx`select direction, flag from movements where gate_id = 'T-G2'`;
      expect(m).toEqual({ direction: null, flag: "unconfirmed" });
      expect((await qty(tx, soonId)) + (await qty(tx, lateId))).toBe(18);
    });
  });

  it("الشحن بأمر صرف: يخصم FEFO ويطابق أمر الصرف ويغلقه", async () => {
    await inTx(async (tx) => {
      const { epcs, soonId, lateId } = await fixture(tx);
      const result = await send(tx, "T-G2", pass(epcs[1], "out", at(0)));
      expect(result.stock_changed).toBe(true);
      // البطاقة من الدفعة المتأخرة، لكن الخصم بقاعدة FEFO من الأقرب انتهاءً
      expect(await qty(tx, soonId)).toBe(0);
      expect(await qty(tx, lateId)).toBe(12);
      const [m] = await tx`select direction, reference_type, reference_id, flag from movements where gate_id = 'T-G2'`;
      expect(m).toEqual({ direction: "out", reference_type: "SO", reference_id: "T-SO-1", flag: null });
      const [so] = await tx`select status from sales_orders where so_number = 'T-SO-1'`;
      expect(so?.status).toBe("shipped");
      const [tag] = await tx`select status from rfid_tags where epc = ${epcs[1]}`;
      expect(tag?.status).toBe("sold");
      const [alerts] = await tx<{ n: number }[]>`
        select count(*)::int as n from alerts where type = 'security' and entity_ref like 'gate:T-%'`;
      expect(alerts?.n).toBe(0);
    });
  });

  it("الشحن بدون أمر صرف مفتوح: خروج غير مصرح وتنبيه حرج", async () => {
    await inTx(async (tx) => {
      const { epcs } = await fixture(tx);
      await send(tx, "T-G2", pass(epcs[0], "out", at(0)));
      await send(tx, "T-G2", pass(epcs[1], "out", at(6_000)), at(8_000));
      const flags = await tx`select flag from movements where gate_id = 'T-G2' order by created_at`;
      expect(flags.map((f) => f.flag)).toEqual([null, "unauthorized"]);
      const [alert] = await tx`
        select severity, type, entity_ref, status from alerts where type = 'security' and entity_ref = 'gate:T-G2'`;
      expect(alert).toEqual({ severity: "critical", type: "security", entity_ref: "gate:T-G2", status: "open" });
      const [tag] = await tx`select status from rfid_tags where epc = ${epcs[1]}`;
      expect(tag?.status).toBe("missing");
    });
  });

  it("الخروج من البوابة المقيدة: خصم + تنبيه حرج واحد يجمع القطع + بطاقة مفقودة", async () => {
    await inTx(async (tx) => {
      const { epcs, soonId, lateId } = await fixture(tx);
      await send(tx, "T-G5", pass(epcs[0], "out", at(0)));
      await send(tx, "T-G5", pass(epcs[1], "out", at(1_500), 3), at(6_000));
      expect((await qty(tx, soonId)) + (await qty(tx, lateId))).toBe(6);
      const alerts = await tx<{ severity: string; title: string; body: string }[]>`
        select severity, title, body from alerts where type = 'security' and entity_ref = 'gate:T-G5'`;
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.severity).toBe("critical");
      expect(alerts[0]?.body).toContain("صنف اختبار ×12");
      expect(alerts[0]?.body).toContain("60 ر.س");
      const statuses = await tx`select status from rfid_tags where epc in ${tx([epcs[0], epcs[1]])}`;
      expect(statuses.map((s) => s.status)).toEqual(["missing", "missing"]);
    });
  });

  it("الاستلام: بطاقة جديدة تفتح دفعة وتطابق أمر الشراء، وبعد المهلة يُكشف النقص وقيمته", async () => {
    await inTx(async (tx) => {
      const { pid } = await fixture(tx);
      const newEpc = buildEpc("FF01", 0x0100_0001);
      const result = await send(tx, "T-G1", pass(newEpc, "in", at(0)));
      expect(result.stock_changed).toBe(true);

      const [tag] = await tx`select product_id, units, status, last_zone_id from rfid_tags where epc = ${newEpc}`;
      expect(tag).toEqual({ product_id: pid, units: 6, status: "active", last_zone_id: "T-RCV" });
      const [m] = await tx`select reference_type, reference_id, flag from movements where gate_id = 'T-G1'`;
      expect(m).toEqual({ reference_type: "PO", reference_id: "T-PO-1", flag: null });
      const [po] = await tx`select status from purchase_orders where po_number = 'T-PO-1'`;
      expect(po?.status).toBe("receiving");

      // قبل انتهاء المهلة ما يُغلق
      expect(await closeIdleReceipts(tx, at(2_000), IDLE)).toEqual([]);
      // بعد المهلة: المطلوب 12 والمستلم 6
      expect(await closeIdleReceipts(tx, at(10_000), IDLE)).toEqual([{ po_number: "T-PO-1", status: "short" }]);
      const [alert] = await tx<{ severity: string; type: string; title: string; body: string }[]>`
        select severity, type, title, body from alerts where entity_ref = 'po:T-PO-1' and status = 'open'`;
      expect(alert).toMatchObject({ severity: "warning", type: "receipt", title: "شحنة T-PO-1 ناقصة" });
      expect(alert?.body).toContain("المطلوب 12، المستلم 6 (نقص 6 وحدات بقيمة 30 ر.س)");
    });
  });

  it("النبضة الفاضية تحدّث اتصال البوابة وترفض البوابة غير المعروفة", async () => {
    await inTx(async (tx) => {
      await fixture(tx);
      const result = await send(tx, "T-G1", [], at(0));
      expect(result.accepted).toBe(0);
      const [gate] = await tx`select is_online from gates where id = 'T-G1'`;
      expect(gate?.is_online).toBe(true);
      await expect(send(tx, "NOPE", [{ epc: buildEpc("FF01", 1), antenna: "A", rssi: -50, read_at: toRiyadhIso(at(0)) }])).rejects.toThrow(
        /Unknown gate/,
      );
    });
  });

  it("تنبيهات المخزون تُفتح وتُغلق تلقائيًا مع تغيّر الحالة", async () => {
    await inTx(async (tx) => {
      const { pid } = await fixture(tx);
      await tx`insert into sales_daily (product_id, date, units_sold)
        select ${pid}, d::date, 10 from generate_series(current_date - 84, current_date - 1, interval '1 day') d`;
      await syncDerivedAlertsTx(tx, at(0));
      const open = await tx`select severity from alerts where entity_ref = ${`product:${pid}`} and status = 'open'`;
      expect(open.map((a) => a.severity)).toEqual(["critical"]); // 18 وحدة ÷ 10 يوميًا = 1.8 يوم → حرج

      await tx`update batches set quantity = 200 where product_id = ${pid} and lot_number = 'T-LATE'`;
      await syncDerivedAlertsTx(tx, at(0));
      const after = await tx`select severity, status from alerts where entity_ref = ${`product:${pid}`} order by created_at`;
      expect(after).toEqual([{ severity: "critical", status: "resolved" }]); // 206 وحدة = 20 يوم → سليم
    });
  });
});
