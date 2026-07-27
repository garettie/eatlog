import React, { createContext, useCallback, useContext, useRef } from 'react';
import { Alert } from 'react-native';

interface GuardEntry {
  isDirty: () => boolean;
  markClean: () => void;
}

interface DiscardGuard {
  register: (isDirty: () => boolean, markClean: () => void) => () => void;
  isAnyDirty: () => boolean;
  requestClose: (allowClose: () => void) => boolean;
}

export const DiscardGuardContext = createContext<DiscardGuard | null>(null);

export function useDiscardGuardContext() {
  const ctx = useContext(DiscardGuardContext);
  if (!ctx) {
    return { register: () => () => {}, isAnyDirty: () => false, requestClose: (cb: () => void) => { cb(); return true; } };
  }
  return ctx;
}

export function useDiscardGuard(): DiscardGuard {
  const guardsRef = useRef<GuardEntry[]>([]);

  const register = useCallback(
    (isDirty: () => boolean, markClean: () => void) => {
      const entry: GuardEntry = { isDirty, markClean };
      guardsRef.current.push(entry);
      return () => {
        guardsRef.current = guardsRef.current.filter((g) => g !== entry);
      };
    },
    [],
  );

  const isAnyDirty = useCallback(() => {
    return guardsRef.current.some((g) => g.isDirty());
  }, []);

  const requestClose = useCallback(
    (allowClose: () => void): boolean => {
      if (!isAnyDirty()) {
        for (const g of guardsRef.current) g.markClean();
        allowClose();
        return true;
      }
      Alert.alert('Discard changes?', 'Your edits will be lost.', [
        { text: 'Keep Editing' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            for (const g of guardsRef.current) g.markClean();
            allowClose();
          },
        },
      ]);
      return false;
    },
    [isAnyDirty],
  );

  return { register, isAnyDirty, requestClose };
}
