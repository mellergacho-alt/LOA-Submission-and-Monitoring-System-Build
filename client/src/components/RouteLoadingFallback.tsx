import { Skeleton } from "./Skeleton";
import "./RouteLoadingFallback.css";

// Suspense fallback shown while a lazy-loaded route chunk downloads (see
// App.tsx). Each page wraps itself in AppLayout internally, so this renders
// *before* AppLayout/Sidebar exist yet -- it mimics the app shell's rough
// shape (a solid sidebar-colored block + a topbar strip + a couple of
// skeleton cards) purely so navigating between routes doesn't flash a blank
// white screen while the chunk fetches, on a normal connection this is only
// visible for a moment since chunks are small and get cached after first load.
export default function RouteLoadingFallback() {
  return (
    <div className="route-fallback">
      <div className="route-fallback__sidebar" />
      <div className="route-fallback__content">
        <div className="route-fallback__topbar" />
        <div className="route-fallback__body">
          <Skeleton height={64} radius={12} style={{ marginBottom: 18 }} />
          <Skeleton height={220} radius={18} />
        </div>
      </div>
    </div>
  );
}
