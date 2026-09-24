import React from 'react';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

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
        <>
          <Ellipse cx="24" cy="28" rx="19" ry="13" fill="#FFFFFF" />
          <Path d="M7.5 28C9.5 19.5 16.5 14 24 14s14.5 5.5 16.5 14C37 34 31 37 24 37S11 34 7.5 28Z" fill="#F2B94F" />
          <Path d="M8.5 28c9-5.5 22-5.5 31 0" fill="none" stroke="#D68A34" strokeWidth="1.8" strokeLinecap="round" />
          <Path d="m22.6 19.5 2.8 0-1.4 2.5Z" fill="#ED4D43" />
        </>
      ) : (
        <>
          <Path d="M24 6C15 6 9 18.5 9 28.5 9 38 15.5 43 24 43s15-5 15-14.5C39 18.5 33 6 24 6Z" fill="#FFFFFF" />
          <Path d="M9 28.5c10 1.3 20 1.3 30 0M13 29.2v3.4M18 29.7v3.4M24 29.8v4.5M30 29.7v3.4M35 29.2v3.4" fill="none" stroke="#1A1A1A" strokeWidth="1.1" strokeLinecap="round" />
          <Path d="m22.5 25.5 3 0-1.5 2.7Z" fill="#ED4D43" />
        </>
      )}
    </Svg>
  );
}
