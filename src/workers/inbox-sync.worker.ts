import { featureFlags } from '../config/features';
import { syncInboxes } from '../app/modules/social/services/inbox-sync.service';

// Manual inbox: pulls new Messenger / Instagram DMs every 30 seconds. It never sends anything.
export function startInboxSyncWorker() {
  if (!featureFlags.manualInbox) return;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await syncInboxes(); } catch { console.error('Inbox sync unavailable; will retry.'); } finally { running = false; }
  };
  void run();
  const timer = setInterval(run, 30000);
  timer.unref();
  return timer;
}
