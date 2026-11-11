import { runTokenKeepAlive } from '../app/modules/social/services/token-keepalive.service';

// Hourly pass; each account is actually renewed or checked at most once a day (TikTok/X once a week).
export function startTokenKeepAliveWorker() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await runTokenKeepAlive(); } catch { console.error('Token keep-alive unavailable; will retry.'); } finally { running = false; }
  };
  const first = setTimeout(run, 60000); first.unref();
  const timer = setInterval(run, 60 * 60 * 1000); timer.unref();
  return timer;
}
