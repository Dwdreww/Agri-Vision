import { useEffect, useState } from 'react';
import { localDateKey, nextLocalMidnight } from './activity';

export function useLocalToday() {
  const [today, setToday] = useState(() => localDateKey(new Date()));
  useEffect(() => {
    let timer;
    function refresh() {
      clearTimeout(timer);
      const now = new Date();
      setToday(localDateKey(now));
      timer = setTimeout(refresh, nextLocalMidnight(now) - now.getTime() + 50);
    }
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  return today;
}
