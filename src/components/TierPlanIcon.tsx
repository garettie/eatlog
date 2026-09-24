import React from 'react';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

type EatlogTier = 'pugo' | 'manok' | 'itik';

interface TierPlanIconProps {
  tier: EatlogTier;
  size?: number;
}

export default function TierPlanIcon({ tier, size = 48 }: TierPlanIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessible={false}>
      <Circle cx="24" cy="24" r="24" fill="#1A1A1A" />
      {tier === 'itik' ? (
        <G transform="translate(24 26) scale(1.12) rotate(-16) translate(-24 -26)">
          <Path d="M7.5 30C7.5 20.9 14.9 13.5 24 13.5S40.5 20.9 40.5 30c0 1.1-.9 2-2 2h-29c-1.1 0-2-.9-2-2Z" fill="#F4C14E" />
          <Path d="M8 29.2h32c.4 1.6-.7 2.8-2 2.8H10c-1.3 0-2.4-1.2-2-2.8Z" fill="#DE9B32" />
          <Path d="M13.5 23.5c2.4-4 6.2-6.3 10.5-6.3" fill="none" stroke="#FFE39A" strokeWidth="1.6" strokeLinecap="round" />
          <Ellipse cx="29.5" cy="20.5" rx="2.2" ry="1.4" fill="#D98E2B" opacity={0.55} />
          <Ellipse cx="18.5" cy="26.5" rx="1.8" ry="1.1" fill="#D98E2B" opacity={0.5} />
          <Ellipse cx="33.5" cy="26.5" rx="1.6" ry="1" fill="#D98E2B" opacity={0.5} />
          <Path d="M22.5 21.5l1.8-1M26.5 25.5l1.9.6M15.8 21.2l.6 1.8M34.4 22.2l-1.4 1.3M22 27.2l1.8.4" stroke="#4E9A55" strokeWidth="1.2" strokeLinecap="round" />
        </G>
      ) : (
        <>
          <Path d="M24 8C16.8 8 11.5 18.6 11.5 27.2 11.5 35.4 17 40.5 24 40.5S36.5 35.4 36.5 27.2C36.5 18.6 31.2 8 24 8Z" fill="#F3EBDD" />
          <Path d="M36.5 27.2c0 8.2-5.5 13.3-12.5 13.3-4.4 0-8.2-2-10.4-5.6 2.1 1.6 4.8 2.5 7.9 2.5 7 0 12.5-5.1 12.5-13.3 0-4-1.2-8.6-3.2-12.4 3.4 3.8 5.7 10 5.7 15.5Z" fill="#D9CAB2" />
          <Ellipse cx="19" cy="19.5" rx="2.2" ry="4" transform="rotate(22 19 19.5)" fill="#FFFFFF" opacity={0.8} />
        </>
      )}
    </Svg>
  );
}
