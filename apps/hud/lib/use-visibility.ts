import { useEffect, useState } from 'react';

export function useDocumentVisibility(): DocumentVisibilityState {
  const [vis, setVis] = useState<DocumentVisibilityState>(
    () => (typeof document !== 'undefined' ? document.visibilityState : 'visible'),
  );
  useEffect(() => {
    const fn = () => setVis(document.visibilityState);
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  }, []);
  return vis;
}
