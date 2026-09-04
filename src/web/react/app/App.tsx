import { ApplicationRouter } from "./ApplicationRouter/ApplicationRouter";

export { AppErrorBoundary } from "./AppErrorBoundary/AppErrorBoundary";

export function App({ initialMode }: { initialMode?: "basic" | "world" }) {
  return <ApplicationRouter initialMode={initialMode} />;
}
