export type FoodSource = 'usda' | 'off' | 'scan' | 'describe' | 'manual';
export type FoodEstimateConfidence = 'high' | 'medium' | 'low';

export interface FoodPortion {
  id: string;
  label: string;
  grams: number;
}

export interface FoodHistoryMetadata {
  representativeLogId: number;
  lastLoggedAt: string;
  timesLogged: number;
  lastGrams: number;
  pinKey: string;
  legacyPinKeys: string[];
  parentMealName: string | null;
  parentMealPhotoUri: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type DataType =
  | 'Survey (FNDDS)'
  | 'Foundation'
  | 'SR Legacy'
  | 'Branded'
  | 'off'
  | 'manual'
  | 'scan'
  | 'describe';

export interface FoodResult {
  id: string;
  name: string;
  source: FoodSource;
  sourceFoodId: string;
  dataType: DataType;
  brand: string | null;
  preparation: string | null;
  normalizedName: string;
  caloriesPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  portions: FoodPortion[];
  defaultPortionId: string;
  history?: FoodHistoryMetadata;
  isPinned?: boolean;
  estimatedGrams?: number | null;
  confidence?: FoodEstimateConfidence;
  confidenceReason?: string | null;
  alternateSourceIds: { source: FoodSource; id: string }[];
  searchText?: string;
  providerOrder?: number;
}

export type FoodSearchMode = 'common' | 'full';

export type FoodSearchOutcome =
  | { kind: 'success'; items: FoodResult[] }
  | { kind: 'partial'; items: FoodResult[] }
  | { kind: 'unavailable'; items: FoodResult[] };

export interface DedupNearMiss {
  first: Pick<FoodResult, 'id' | 'name' | 'sourceFoodId'>;
  second: Pick<FoodResult, 'id' | 'name' | 'sourceFoodId'>;
  differences: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  merged: boolean;
}
