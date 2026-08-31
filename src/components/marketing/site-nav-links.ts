export type SiteNavLink = {
  label: string;
  href: string;
  activePath?: string;
  native?: boolean;
};

export function isMarketingNavLinkActive(pathname: string, link: SiteNavLink): boolean {
  const activePath = link.activePath ?? link.href;
  if (activePath === "/") {
    return pathname === "/";
  }
  return pathname === activePath || pathname.startsWith(`${activePath}/`);
}
