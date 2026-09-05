import { IconBrandDiscord, IconBrandGithub, IconBrandYoutube } from "@tabler/icons-react";
import { Heart } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MarketingFooterNavLink = {
  label: string;
  href: string;
};

export type MarketingFooterSocialLink = {
  id: "github" | "x" | "youtube" | "roblox" | "discord";
  label: string;
  href: string;
};

type MarketingFooterProps = {
  brandLine: string;
  rightsLine: string;
  navLinks: readonly MarketingFooterNavLink[];
  socialLinks: readonly MarketingFooterSocialLink[];
};

const footerLinkClass =
  "text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground transition-colors duration-150 hover:text-foreground";

const socialLinkClass =
  "inline-flex items-center justify-center rounded-sm p-0.5 text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background [&_svg]:h-[1.3rem] [&_svg]:w-[1.3rem]";

const XIcon = ({ className }: { className?: string }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
  </svg>
);

const socialIcon = (id: MarketingFooterSocialLink["id"]): ReactNode => {
  switch (id) {
    case "github":
      return <IconBrandGithub className="h-5 w-5" stroke={1.8} />;
    case "x":
      return <XIcon className="h-4 w-4" />;
    case "youtube":
      return <IconBrandYoutube className="h-5 w-5" stroke={1.8} />;
    case "roblox":
      return (
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect
            x="4"
            y="4"
            width="16"
            height="16"
            transform="rotate(15 12 12)"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <rect
            x="9.75"
            y="9.75"
            width="4"
            height="4"
            transform="rotate(15 12 12)"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "discord":
      return <IconBrandDiscord className="h-[1.35rem] w-[1.35rem]" stroke={1.8} />;
  }
};

export function MarketingFooter({ brandLine, rightsLine, navLinks, socialLinks }: MarketingFooterProps) {
  return (
    <footer className="relative z-[1] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto h-px w-full max-w-[1120px] bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,hsl(var(--muted))_78%,transparent),transparent)]" />
      <div className="mx-auto grid w-full max-w-[1120px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-x-2 gap-y-4 pt-7 sm:gap-x-6">
        <div className="grid gap-1.5 text-sm text-muted-foreground">
          <p>{brandLine}</p>
          <p>
            <a
              href="https://github.com/abran-labs/dqr"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4 decoration-muted-foreground/60 transition-colors duration-150 hover:text-foreground hover:decoration-foreground"
            >
              {rightsLine}
            </a>
          </p>
        </div>

        <div className="col-start-2 row-start-1 flex flex-col items-center text-center">
          <Button
            asChild
            variant="secondary"
            className="border-pink-500/30 bg-pink-500/10 text-pink-500 hover:border-pink-500/30 hover:bg-pink-500/20"
          >
            <a href="https://github.com/sponsors/abran-labs" target="_blank" rel="noopener noreferrer">
              <Heart className="mr-2 h-4 w-4 fill-none stroke-pink-500" />
              Support
            </a>
          </Button>
        </div>

        <div className="col-start-3 row-start-1 grid justify-items-end gap-3 sm:gap-4">
          {navLinks.length > 0 ? (
            <nav className="flex flex-wrap items-center justify-end gap-3 sm:gap-4" aria-label="Footer">
              {navLinks.map((link) => (
                <a key={link.href} href={link.href} className={footerLinkClass}>
                  {link.label}
                </a>
              ))}
            </nav>
          ) : null}

          <div className="flex items-center justify-end gap-1">
            {socialLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className={cn(socialLinkClass, link.id === "youtube" && "hidden md:inline-flex")}
                aria-label={link.label}
              >
                {socialIcon(link.id)}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
