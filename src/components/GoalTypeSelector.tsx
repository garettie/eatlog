import React from 'react';

import type { GoalType } from '../db/database';
import ChoiceCards, { type ChoiceCardOption } from './ChoiceCards';

const GOALS: ChoiceCardOption<GoalType>[] = [
  { value: 'cut', icon: 'trending-down', title: 'Cut', subtitle: 'Weight Loss' },
  { value: 'maintain', icon: 'drag-handle', title: 'Maintain', subtitle: 'Stay Steady' },
  { value: 'bulk', icon: 'trending-up', title: 'Bulk', subtitle: 'Gain Muscle' },
];

interface GoalTypeSelectorProps {
  value: GoalType;
  onChange: (goal: GoalType) => void;
}

function GoalTypeSelector({ value, onChange }: GoalTypeSelectorProps) {
  return <ChoiceCards options={GOALS} value={value} onChange={onChange} accessibilityLabel="Goal" />;
}

export default React.memo(GoalTypeSelector);
