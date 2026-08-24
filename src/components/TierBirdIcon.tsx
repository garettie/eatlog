import React from 'react';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

export type EatlogTier = 'pugo' | 'manok' | 'itik';

interface TierBirdIconProps {
  tier: EatlogTier;
  size?: number;
}

export default function TierBirdIcon({ tier, size = 48 }: TierBirdIconProps) {
  if (tier === 'pugo') {
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48" accessible={false}>
        <Circle cx="24" cy="24" r="24" fill="#3A302A" />
        <Ellipse cx="27" cy="29" rx="13" ry="10" fill="#D8B08C" />
        <Circle cx="16.5" cy="20" r="7" fill="#9A6745" />
        <Path d="M10.5 20.5 5 23l5.8 2.1Z" fill="#E7B24D" />
        <Ellipse cx="29" cy="29" rx="6.5" ry="4.7" fill="#84583F" />
        <Path d="M22 19.2c3.4 1.2 5.7 3.3 7 6.3-3.6-.2-6.5-1.2-8.8-3.1Z" fill="#F1D8BB" />
        <Circle cx="15" cy="18.8" r="1.15" fill="#111318" />
        <Path d="M22 38v3M31 38v3" stroke="#D8B08C" strokeWidth="1.8" strokeLinecap="round" />
      </Svg>
    );
  }

  if (tier === 'manok') {
    return (
      <Svg width={size} height={size} viewBox="0 0 48 48" accessible={false}>
        <Circle cx="24" cy="24" r="24" fill="#38292C" />
        <Path d="M35 24c5-4.5 7.3-4.1 8.6-2.8-2.2 1.5-3.1 3.4-3.5 5.8 2.3.2 3.9 1.2 4.8 3-3.4.9-5.8.6-8.2-.6Z" fill="#8B5F55" />
        <Ellipse cx="27" cy="30" rx="12.5" ry="9.5" fill="#EEDCC1" />
        <Circle cx="17" cy="20.5" r="7" fill="#EEDCC1" />
        <Circle cx="13.7" cy="13.9" r="2.5" fill="#E76F61" />
        <Circle cx="17.7" cy="12.7" r="2.8" fill="#E76F61" />
        <Circle cx="21.4" cy="14.5" r="2.4" fill="#E76F61" />
        <Path d="M11.2 20.2 5.2 23l6.2 2.1Z" fill="#E5B94F" />
        <Ellipse cx="28" cy="30" rx="6.2" ry="4.8" fill="#C88B65" />
        <Circle cx="15.4" cy="19.1" r="1.15" fill="#111318" />
        <Path d="M23 38v3M31 38v3" stroke="#EEDCC1" strokeWidth="1.8" strokeLinecap="round" />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessible={false}>
      <Circle cx="24" cy="24" r="24" fill="#203431" />
      <Ellipse cx="28" cy="31" rx="13" ry="8.5" fill="#D8D2B8" />
      <Path d="M19 21c0 4.1 1.3 7.2 4.1 9.4l6.1-2.8c-2.4-2.2-3.6-4.8-3.6-7.8Z" fill="#4E8C78" />
      <Circle cx="19.2" cy="18.3" r="7.4" fill="#4E8C78" />
      <Path d="M13 18.4 4 20.7l9.2 3.2c1.3-1.9 1.2-3.7-.2-5.5Z" fill="#EEA84F" />
      <Ellipse cx="30" cy="31" rx="6.8" ry="4.4" fill="#9A7A4F" />
      <Circle cx="17.5" cy="16.7" r="1.15" fill="#111318" />
      <Path d="M25 38.5v2.5M33 38.5v2.5" stroke="#D8D2B8" strokeWidth="1.8" strokeLinecap="round" />
    </Svg>
  );
}
