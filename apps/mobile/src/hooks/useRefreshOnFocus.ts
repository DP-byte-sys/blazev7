import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/** Silently refreshes data when a screen regains focus (e.g. after creating a ticket), skipping the first focus. */
export function useRefreshOnFocus(refresh: () => void) {
  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      refresh();
    }, [refresh]),
  );
}
