export type SiteNavLink = {
  label: string;
  href: string;
  activePath?: string;
  native?: boolean;
};

export function isMarketingNavLinkActive(pathname: string, link: SiteNavLink): boolean {
  const currentPath = pathname.replace(/\/$/, "") || "/";
  const activePath = (link.activePath ?? link.href).replace(/\/$/, "") || "/";
  if (activePath === "/") {
    return currentPath === "/";
  }
  return currentPath === activePath || currentPath.startsWith(`${activePath}/`);
}
