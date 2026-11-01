import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import { AppState } from 'react-native';

/** Calls `fn` every `ms` while the screen is focused and the app is in the foreground. No live connection; just a gentle refresh. */
export function usePolling(fn: () => void, ms = 30_000) {
  const latest = useRef(fn);
  latest.current = fn; // always call the newest callback without restarting the timer
  useFocusEffect(
    useCallback(() => {
      const id = setInterval(() => {
        if (AppState.currentState === 'active') latest.current();
      }, ms);
      return () => clearInterval(id);
    }, [ms]),
  );
}
