/** بديل next/link: رابط عادي على هاش الصفحة */
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { pathToHash } from "./next-navigation";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: string | { pathname?: string } };

const Link = forwardRef<HTMLAnchorElement, Props>(function Link({ href, ...rest }, ref) {
  const path = typeof href === "string" ? href : (href.pathname ?? "/");
  return <a ref={ref} href={pathToHash(path)} {...rest} />;
});

export default Link;
