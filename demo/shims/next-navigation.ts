/**
 * بديل next/navigation: التنقل على هاش الرابط (#gates) لأن صفحة claude.ai تمرر الهاش البسيط فقط.
 *   /            ↔ #overview
 *   /gates       ↔ #gates
 *   /inventory   ↔ #inventory
 *   /inventory/x ↔ #product-x
 */
import { useSyncExternalStore } from "react";

export function hashToPath(hash: string): string {
  const name = hash.replace(/^#/, "");
  if (name === "gates") return "/gates";
  if (name === "inventory") return "/inventory";
  if (name.startsWith("product-")) return `/inventory/${name.slice("product-".length)}`;
  return "/";
}

export function pathToHash(path: string): string {
  if (path === "/gates") return "#gates";
  if (path === "/inventory") return "#inventory";
  const product = path.match(/^\/inventory\/([A-Za-z0-9-]+)$/);
  if (product) return `#product-${product[1]}`;
  return "#overview";
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function usePathname(): string {
  return useSyncExternalStore(
    subscribe,
    () => hashToPath(window.location.hash),
    () => "/",
  );
}

export function useRouter() {
  return {
    push: (path: string) => {
      window.location.hash = pathToHash(path);
    },
  };
}
