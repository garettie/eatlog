import React, { useRef } from 'react';
import { Text, View } from 'react-native';

import Sheet from './Sheet';

interface AdaptiveInfoSheetProps {
  visible: boolean;
  onClosed: () => void;
}

const SNAP_POINTS = ['50%'];

function AdaptiveInfoSheet({ visible, onClosed }: AdaptiveInfoSheetProps) {
  const canCloseRef = useRef(() => true);

  return (
    <Sheet
      visible={visible}
      snapPoints={SNAP_POINTS}
      enableDynamicSizing
      stateKey="adaptive-info"
      canCloseRef={canCloseRef}
      onSheetClosed={onClosed}
      forceClose
    >
      <View className="px-5 pb-6 gap-3" accessibilityViewIsModal>
        <Text className="text-m3-on-surface font-bold text-base">Adaptive targets</Text>
        <Text className="text-m3-on-surface-variant text-sm leading-5">
          Log food on 14 different days to unlock weekly target reviews.
        </Text>
        <Text className="text-m3-on-surface-variant text-sm leading-5">
          Each week, Marco compares your logged intake with your measured weight trend and
          proposes updated calorie and macro targets. Nothing changes unless you accept.
        </Text>
        <Text className="text-m3-on-surface-variant text-sm leading-5">
          Trend weight is a smoothed average that filters daily water swings, so your weekly
          rate reflects real change rather than noise.
        </Text>
      </View>
    </Sheet>
  );
}

export default React.memo(AdaptiveInfoSheet);
