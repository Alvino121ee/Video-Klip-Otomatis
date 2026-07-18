import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner'; // Using sonner instead of toast for modern feel
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { AppLayout } from '@/components/layout/app-layout';
import Dashboard from '@/pages/dashboard';
import ProjectsList from '@/pages/projects';
import NewProject from '@/pages/projects/new';
import ProjectDetail from '@/pages/projects/detail';
import ClipsGallery from '@/pages/clips';
import ClipDetail from '@/pages/clips/detail';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/projects" component={ProjectsList} />
        <Route path="/projects/new" component={NewProject} />
        <Route path="/projects/:id" component={ProjectDetail} />
        <Route path="/clips" component={ClipsGallery} />
        <Route path="/clips/:id" component={ClipDetail} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster theme="dark" position="bottom-right" className="font-sans" />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
