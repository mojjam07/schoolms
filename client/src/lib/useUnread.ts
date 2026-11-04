import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export const NOTIFICATIONS_CHANGED = 'notifications-changed';

// Unread count for the menu badge. Refreshes every minute while the tab is visible, when the tab regains focus,
// and straight away after the notifications page changes something.
export function useUnreadCount(enabled: boolean) {
  const [count, setCount] = useState(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    try { setCount((await api<{ count: number }>('/notifications/unread-count')).count); } catch { /* the badge is a nicety; ignore */ }
  }, [enabled]);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener(NOTIFICATIONS_CHANGED, refresh); };
  }, [refresh]);
  return count;
}
