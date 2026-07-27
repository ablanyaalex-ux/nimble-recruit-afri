import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import Landing from "@/pages/Landing";

export default function RootGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <div className="font-display text-xl text-muted-foreground animate-pulse">TalentFlow</div>
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  return <Landing />;
}
