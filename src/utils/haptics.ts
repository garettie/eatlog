import * as Haptics from 'expo-haptics';

// Functional feedback only. No celebration/gamification (DESIGN.md:312).

export const haptics = {
  select(): void {
    void Haptics.selectionAsync();
  },
  tap(): void {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
  confirm(): void {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  },
  warn(): void {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  },
};
