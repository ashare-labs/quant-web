import { useEffect, useState } from 'react';
import { resolveRoute } from './routes.mjs';
export function useHashRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const update = () => setHash(location.hash);
    addEventListener('hashchange', update);
    return () => removeEventListener('hashchange', update);
  }, []);
  return resolveRoute(hash);
}
