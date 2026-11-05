/**
 * بديل Supabase Realtime: قاعدة البيانات داخل الصفحة ترسل NOTIFY من مشغّلات (triggers) على
 * movements وalerts، وهنا نوصلها لنفس واجهة القناة اللي يستخدمها LiveProvider.
 */
type Payload = { table: string; eventType: string; new: Record<string, unknown> };
type Handler = { table: string; cb: (payload: Payload) => void };

const handlers = new Set<Handler>();
let muted = false;

export function emitChange(payload: Payload) {
  if (muted) return;
  for (const h of handlers) if (h.table === payload.table) h.cb(payload);
}

/** إعادة البيانات التجريبية تولّد مئات الإدراجات، فنسكت الإشعارات وقتها ونحدّث الواجهة مرة وحدة */
export function setRealtimeMuted(value: boolean) {
  muted = value;
}

interface Channel {
  on(type: string, filter: { table: string }, cb: (payload: Payload) => void): Channel;
  subscribe(status?: (s: string) => void): Channel;
  handlers: Handler[];
}

export function getSupabase() {
  return {
    channel(): Channel {
      const channel: Channel = {
        handlers: [],
        on(_type, filter, cb) {
          channel.handlers.push({ table: filter.table, cb });
          return channel;
        },
        subscribe(status) {
          for (const h of channel.handlers) handlers.add(h);
          queueMicrotask(() => status?.("SUBSCRIBED"));
          return channel;
        },
      };
      return channel;
    },
    removeChannel(channel: Channel) {
      for (const h of channel.handlers) handlers.delete(h);
      return Promise.resolve("ok");
    },
  };
}
