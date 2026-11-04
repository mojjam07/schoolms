import { useEffect } from 'react';
export function usePageTitle(title: string) {
  useEffect(() => { document.title = title ? `${title} | Kingdom of Knowledge` : 'Kingdom of Knowledge'; }, [title]);
}
