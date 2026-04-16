import { Outlet, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useWorkspace } from "@/lib/workspace";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function FullPageSpinner() {
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="font-display text-xl text-muted-foreground animate-pulse">TalentFlow</div>
    </div>
  );
}

export default function AppLayout() {
  const { user, loading: authLoading } = useAuth();
  const { loading: wsLoading, memberships, currentWorkspaceId } = useWorkspace();

  if (authLoading || (user && wsLoading)) return <FullPageSpinner />;
  if (!user) return <Navigate to="/auth" replace />;
  if (memberships.length === 0) return <Navigate to="/onboarding/workspace" replace />;
  if (!currentWorkspaceId) return <FullPageSpinner />;

  const initial = (user.email ?? "?").charAt(0).toUpperCase();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        {/* Desktop sidebar */}
        <div className="hidden md:block">
          <AppSidebar />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar */}
          <header className="h-14 flex items-center justify-between px-3 md:px-6 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <div className="hidden md:block">
                <SidebarTrigger />
              </div>
              <div className="md:hidden font-display text-lg tracking-tight">TalentFlow</div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full h-9 w-9 bg-secondary text-foreground">
                  <span className="font-medium text-sm">{initial}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => supabase.auth.signOut()}>
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <main className="flex-1 pb-20 md:pb-0">
            <Outlet />
          </main>
        </div>

        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
