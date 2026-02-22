import { ErrorBoundary } from "./components/ErrorBoundary";
import RealtimeVoice from "./components/RealtimeVoice";

export default function Home() {
  return (
    <ErrorBoundary>
      <RealtimeVoice />
    </ErrorBoundary>
  );
}
