import { useCallback, useRef, useState } from 'react';

export interface ToastItem {
  id: number;
  text: string;
  out: boolean;
}

/** Ported from app.js:749-757 toast() -- same 3600ms/4100ms timing, now as a
 *  small queue instead of ad hoc appended/removed DOM nodes. */
export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((text: string) => {
    const id = ++nextId.current;
    setToasts(t => [...t, { id, text, out: false }]);
    setTimeout(() => setToasts(t => t.map(x => (x.id === id ? { ...x, out: true } : x))), 3600);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4100);
  }, []);

  return { toasts, showToast };
}
