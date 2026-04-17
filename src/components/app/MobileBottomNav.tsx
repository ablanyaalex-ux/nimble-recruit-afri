import { NavLink } from "react-router-dom";
import { navItems } from "./AppSidebar";
import { cn } from "@/lib/utils";

export function MobileBottomNav() {
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-6">
        {navItems.map((item) => (
          <li key={item.title}>
            <NavLink
              to={item.url}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn("h-5 w-5", isActive && "stroke-[2.25]")} />
                  <span className="leading-none">{item.title}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
