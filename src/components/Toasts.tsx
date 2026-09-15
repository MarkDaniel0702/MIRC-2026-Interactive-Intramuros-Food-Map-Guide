import type { ToastItem } from '../hooks/useToasts';

/** Ported from app.js:749-757 -- rendered inside .mapwrap, same as the original. */
export function Toasts({ toasts }: { toasts: ToastItem[] }) {
  return (
    <>
      {toasts.map(t => (
        <div key={t.id} className={`toast${t.out ? ' is-out' : ''}`} role="status">{t.text}</div>
      ))}
    </>
  );
}
