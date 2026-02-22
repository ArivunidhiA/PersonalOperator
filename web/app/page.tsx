import { ErrorBoundary } from "./components/ErrorBoundary";
import RealtimeVoice from "./components/RealtimeVoice";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <ErrorBoundary>
      <RealtimeVoice />
    </ErrorBoundary>
  );
}
