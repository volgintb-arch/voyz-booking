import { useCallback, useEffect, useState } from 'react';

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 2200);
    return () => clearTimeout(id);
  }, [message]);
  const show = useCallback((m: string) => setMessage(m), []);
  const node = message ? (
    <div className="toast" role="status">
      {message}
    </div>
  ) : null;
  return { show, node };
}
