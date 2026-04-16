import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Briefcase, Users, Building2, CalendarDays } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/lib/workspace";
import { cn } from "@/lib/utils";

export const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, end: true },
  { title: "Jobs", url: "/jobs", icon: Briefcase },
  { title: "Candidates", url: "/candidates", icon: Users },
  { title: "Clients", url: "/clients", icon: Building2 },
  { title: "Interviews", url: "/interviews", icon: CalendarDays },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { memberships, currentWorkspaceId } = useWorkspace();
  const ws = memberships.find((m) => m.workspace_id === currentWorkspaceId)?.workspaces;
  const location = useLocation();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-display text-base">
            T
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-display text-sm leading-tight truncate">
                {ws?.name ?? "TalentFlow"}
              </div>
              <div className="text-[11px] text-muted-foreground">Workspace</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Navigate</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active =
                  item.end
                    ? location.pathname === item.url
                    : location.pathname.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink to={item.url} end={item.end}>
                        <item.icon className={cn("h-4 w-4", active && "text-primary")} />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
