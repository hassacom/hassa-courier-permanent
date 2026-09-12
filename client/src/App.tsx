import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Login from "./pages/Login";

function Router() {
  return (
    <Switch>
      <Route path="/login/courier" component={Login} />
      <Route path="/" component={Home} />
      <Route path="/rider" component={Home} />
      <Route path="/courier" component={Home} />
      <Route path="/courier/orders" component={Home} />
      <Route path="/courier/availability" component={Home} />
      <Route path="/courier/support" component={Home} />
      <Route path="/courier/settings" component={Home} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster position="top-center" richColors />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
