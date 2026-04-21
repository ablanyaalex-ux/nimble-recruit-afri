import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";
import { WorkspaceProvider } from "@/lib/workspace";
import AppLayout from "@/components/app/AppLayout";
import AuthPage from "./pages/Auth";
import CreateWorkspace from "./pages/CreateWorkspace";
import Dashboard from "./pages/Dashboard";
import Team from "./pages/Team";
import AcceptInvite from "./pages/AcceptInvite";
import Clients from "./pages/Clients";
import ClientDetail from "./pages/ClientDetail";
import Jobs from "./pages/Jobs";
import JobDetail from "./pages/JobDetail";
import Candidates from "./pages/Candidates";
import Placeholder from "./pages/Placeholder";
import CareersPublic from "./pages/CareersPublic";
import CareersJobPublic from "./pages/CareersJobPublic";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <WorkspaceProvider>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/onboarding/workspace" element={<CreateWorkspace />} />
              <Route path="/invite/:token" element={<AcceptInvite />} />
              <Route path="/careers/:workspaceId" element={<CareersPublic />} />
              <Route path="/careers/:workspaceId/:jobId" element={<CareersJobPublic />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/jobs" element={<Jobs />} />
                <Route path="/jobs/:id" element={<JobDetail />} />
                <Route path="/candidates" element={<Candidates />} />
                <Route path="/clients" element={<Clients />} />
                <Route path="/clients/:id" element={<ClientDetail />} />
                <Route path="/interviews" element={<Placeholder eyebrow="Schedule" title="Interviews" />} />
                <Route path="/team" element={<Team />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </WorkspaceProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
