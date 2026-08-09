import React from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '../components/Card';
import ResponsiveContent from '../components/ResponsiveContent';
import { serviceConfig } from '../config/services';
import { getDatabaseVersion } from '../db/database';
import { READING_MAX_WIDTH, useResponsiveLayout } from '../theme/layout';
import { M3 } from '../theme/tokens';
import { getApplicationInfo } from '../utils/applicationInfo';
import type { ProfileStackParamList } from './ProfilePlanScreens';

type MaterialIconName = keyof typeof MaterialIcons.glyphMap;

interface LinkRowProps {
    icon: MaterialIconName;
    title: string;
    detail: string;
    onPress: () => void;
    external?: boolean;
    last?: boolean;
}

const RESEARCH_LINKS = [
    {
        title: 'Resting energy equation',
        detail: 'Mifflin et al. · American Journal of Clinical Nutrition · 1990',
        url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
    },
    {
        title: 'Energy-to-weight convention',
        detail: 'Wishnofsky · American Journal of Clinical Nutrition · 1958',
        url: 'https://pubmed.ncbi.nlm.nih.gov/13594881/',
    },
    {
        title: 'Dynamic energy balance',
        detail: 'Hall et al. · The Lancet · 2011',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593/',
    },
    {
        title: 'Protein and resistance training',
        detail: 'Morton et al. · British Journal of Sports Medicine · 2018',
        url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/',
    },
    {
        title: 'Macronutrient reference ranges',
        detail: 'National Academies · Dietary Reference Intakes · 2005',
        url: 'https://nap.nationalacademies.org/catalog/10490/dietary-reference-intakes-for-energy-carbohydrate-fiber-fat-fatty-acids-cholesterol-protein-and-amino-acids',
    },
    {
        title: 'Exponential smoothing method',
        detail: 'NIST/SEMATECH · Engineering Statistics Handbook',
        url: 'https://www.itl.nist.gov/div898/handbook/pmc/section4/pmc43.htm',
    },
] as const;

function openExternalLink(title: string, url: string) {
    void Linking.openURL(url).catch(() => {
        Alert.alert('Could not open link', `${title} could not be opened. Check your browser and try again.`);
    });
}

function Screen({ children }: { children: React.ReactNode }) {
    const { horizontalPadding } = useResponsiveLayout();
    return (
        <SafeAreaView edges={['bottom', 'left', 'right']} className="flex-1 bg-m3-surface">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingHorizontal: horizontalPadding, paddingTop: 24, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                <ResponsiveContent className="gap-8" maxWidth={READING_MAX_WIDTH}>
                    {children}
                </ResponsiveContent>
            </ScrollView>
        </SafeAreaView>
    );
}

function LinkRow({ icon, title, detail, onPress, external = false, last = false }: LinkRowProps) {
    return (
        <Pressable
            accessibilityRole={external ? 'link' : 'button'}
            accessibilityLabel={`${title}. ${detail}`}
            accessibilityHint={external ? 'Opens in your browser' : undefined}
            android_ripple={{ color: M3.surfaceContainerHigh }}
            onPress={onPress}
            className="min-h-[72px] flex-row items-center gap-3 px-4 py-3 active:opacity-70"
        >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container-high">
                <MaterialIcons name={icon} size={20} color={M3.onSurfaceVariant} />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-sm font-semibold text-m3-on-surface">{title}</Text>
                <Text className="text-sm text-m3-on-surface-variant">{detail}</Text>
            </View>
            <MaterialIcons name={external ? 'open-in-new' : 'chevron-right'} size={20} color={M3.onSurfaceVariant} />
            {!last ? <View className="absolute bottom-0 left-[68px] right-4 h-px bg-m3-outline-variant/50" /> : null}
        </Pressable>
    );
}

function ArticleHeading({ icon, title }: { icon: MaterialIconName; title: string }) {
    return (
        <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container-high">
                <MaterialIcons name={icon} size={21} color={M3.expenditure} />
            </View>
            <Text accessibilityRole="header" className="min-w-0 flex-1 text-lg font-bold text-m3-on-surface">{title}</Text>
        </View>
    );
}

function FormulaRow({ label, value, detail, last = false }: { label: string; value: string; detail: string; last?: boolean }) {
    return (
        <View className={`gap-1 px-4 py-3.5 ${last ? '' : 'border-b border-m3-outline-variant/50'}`}>
            <Text className="text-xs font-semibold text-m3-expenditure">{label}</Text>
            <Text className="text-base font-semibold text-m3-on-surface tabular-nums">{value}</Text>
            <Text className="text-sm text-m3-on-surface-variant">{detail}</Text>
        </View>
    );
}

function EvidenceStat({ value, label }: { value: string; label: string }) {
    return (
        <View className="min-w-[132px] flex-1 gap-0.5 rounded-2xl bg-m3-surface-container-high p-4">
            <Text className="text-base font-bold text-m3-on-surface tabular-nums">{value}</Text>
            <Text className="text-xs text-m3-on-surface-variant">{label}</Text>
        </View>
    );
}

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
    return (
        <View className={`min-h-[52px] flex-row items-center justify-between gap-4 py-3 ${last ? '' : 'border-b border-m3-outline-variant/40'}`}>
            <Text className="text-sm text-m3-on-surface-variant">{label}</Text>
            <Text className="min-w-0 flex-1 text-right text-sm font-semibold text-m3-on-surface tabular-nums" numberOfLines={2}>{value}</Text>
        </View>
    );
}

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
    return (
        <View className="gap-1 px-1">
            <Text accessibilityRole="header" className="text-lg font-bold text-m3-on-surface">{title}</Text>
            {detail ? <Text className="text-sm text-m3-on-surface-variant">{detail}</Text> : null}
        </View>
    );
}

export function HowEatlogWorksScreen() {
    return (
        <Screen>
            <View className="gap-5">
                <View className="gap-2">
                    <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">A plan that gets less generic over time</Text>
                    <Text className="text-sm text-m3-on-surface-variant">Eatlog begins with a profile-based estimate, then uses the food and weight history you choose to log. A review can propose a new target, but only you can apply it.</Text>
                </View>
                <View className="flex-row items-stretch overflow-hidden rounded-2xl bg-m3-surface-container-high">
                    <View className="min-w-0 flex-1 gap-1 p-4">
                        <Text className="text-xs font-semibold text-m3-on-surface-variant">Starts with</Text>
                        <Text className="text-sm font-semibold text-m3-on-surface">Profile estimate</Text>
                    </View>
                    <View className="items-center justify-center px-1">
                        <MaterialIcons name="arrow-forward" size={20} color={M3.expenditure} />
                    </View>
                    <View className="min-w-0 flex-1 gap-1 p-4">
                        <Text className="text-xs font-semibold text-m3-on-surface-variant">Improves with</Text>
                        <Text className="text-sm font-semibold text-m3-on-surface">Logged evidence</Text>
                    </View>
                </View>
            </View>

            <View className="gap-5">
                <ArticleHeading icon="calculate" title="Estimate your starting calories" />
                <Text className="text-sm text-m3-on-surface-variant">Your starting target is a planning estimate—not a direct measurement of metabolism.</Text>
                <View className="overflow-hidden rounded-2xl bg-m3-surface-container-high">
                    <FormulaRow label="Resting energy" value="Mifflin–St Jeor" detail="Sex, age, height, and weight estimate resting energy, labeled BMR in Eatlog." />
                    <FormulaRow label="Daily expenditure" value="BMR × activity factor" detail="Sedentary 1.2 · Light 1.375 · Moderate 1.55 · Active 1.725 · Very active 1.9." />
                    <FormulaRow label="Goal adjustment" value="TDEE + weekly rate × 7,700 ÷ 7" detail="A linear planning convention turns your chosen weekly rate into daily calories." last />
                </View>
                <View className="flex-row gap-3 rounded-2xl bg-m3-surface-container-low p-4">
                    <MaterialIcons name="info-outline" size={20} color={M3.onSurfaceVariant} />
                    <Text className="min-w-0 flex-1 text-sm text-m3-on-surface-variant">Activity factors and the 7,700 kcal/kg conversion are approximations. Actual expenditure changes with body composition, activity, and time.</Text>
                </View>
            </View>

            <View className="h-px bg-m3-outline-variant/50" />

            <View className="gap-5">
                <ArticleHeading icon="restaurant-menu" title="Allocate protein, fat, and carbs" />
                <Text className="text-sm text-m3-on-surface-variant">Calories set the total. Eatlog then allocates macros with a consistent set of rules that you can replace with custom targets.</Text>
                <View className="overflow-hidden rounded-2xl bg-m3-surface-container-high">
                    <FormulaRow label="Protein" value="Cut 2.1 · Maintain 1.8 · Bulk 1.7 g/kg" detail="Your protein preference shifts that baseline from −0.2 to +0.4 g/kg." />
                    <FormulaRow label="Fat" value="25% of target calories" detail="Fat contributes 9 kcal per gram." />
                    <FormulaRow label="Carbohydrate" value="Calories remaining after protein and fat" detail="Protein and carbs contribute 4 kcal per gram; calculated plans keep at least 50 g of carbs." last />
                </View>
                <Text className="text-sm text-m3-on-surface-variant">The goal-specific protein presets, preference offsets, 25% fat allocation, and 50 g carb minimum are Eatlog rules informed by—but not prescribed by—the references below.</Text>
            </View>

            <View className="h-px bg-m3-outline-variant/50" />

            <View className="gap-5">
                <ArticleHeading icon="monitor-weight" title="Turn daily logs into steadier evidence" />
                <View className="gap-4">
                    <View className="flex-row gap-3">
                        <MaterialIcons name="photo-camera" size={20} color={M3.onSurfaceVariant} />
                        <View className="min-w-0 flex-1 gap-1">
                            <Text className="text-sm font-semibold text-m3-on-surface">Food stays editable</Text>
                            <Text className="text-sm text-m3-on-surface-variant">Photo, description, and search results are estimates. Review components and portions before saving, then edit them later in Diary.</Text>
                        </View>
                    </View>
                    <View className="flex-row gap-3">
                        <MaterialIcons name="show-chart" size={20} color={M3.expenditure} />
                        <View className="min-w-0 flex-1 gap-1">
                            <Text className="text-sm font-semibold text-m3-on-surface">Weight becomes a trend</Text>
                            <Text className="text-sm text-m3-on-surface-variant">Exponential smoothing with a seven-day half-life gives recent weigh-ins more influence while softening day-to-day noise.</Text>
                        </View>
                    </View>
                    <View className="flex-row gap-3">
                        <MaterialIcons name="date-range" size={20} color={M3.onSurfaceVariant} />
                        <View className="min-w-0 flex-1 gap-1">
                            <Text className="text-sm font-semibold text-m3-on-surface">Evidence stays aligned</Text>
                            <Text className="text-sm text-m3-on-surface-variant">A review only uses logged intake between its first and last eligible weight readings.</Text>
                        </View>
                    </View>
                </View>
            </View>

            <View className="h-px bg-m3-outline-variant/50" />

            <View className="gap-5">
                <ArticleHeading icon="insights" title="Review the evidence before anything changes" />
                <Text className="text-sm text-m3-on-surface-variant">Eatlog waits for enough recent history before it calculates an adaptive recommendation.</Text>
                <View className="flex-row flex-wrap gap-2">
                    <EvidenceStat value="28 days" label="Evidence window" />
                    <EvidenceStat value="10 days" label="Usable intake days" />
                    <EvidenceStat value="4 weights" label="Minimum readings" />
                    <EvidenceStat value="14 days" label="Minimum weight span" />
                </View>
                <View className="overflow-hidden rounded-2xl bg-m3-surface-container-high">
                    <FormulaRow label="Observed expenditure" value="Average intake − weight-change energy" detail="A linear slope across scale readings and the 7,700 kcal/kg convention estimate TDEE." />
                    <FormulaRow label="Stability blend" value="70% new estimate + 30% previous TDEE" detail="The new evidence updates the prior estimate instead of replacing it outright." />
                    <FormulaRow label="Guardrails" value="Maximum ±10% TDEE change" detail="The proposal also stays above BMR × 1.2 and requires a weight from the last seven days." last />
                </View>
                <View className="flex-row gap-3 rounded-2xl bg-m3-surface-container-low p-4">
                    <MaterialIcons name="verified-user" size={20} color={M3.expenditure} />
                    <Text className="min-w-0 flex-1 text-sm text-m3-on-surface-variant">The 28-day window, evidence minimums, 70/30 blend, and ±10% cap are Eatlog safeguards—not published clinical thresholds. Incomplete-looking days must be confirmed, and every review remains a proposal.</Text>
                </View>
            </View>

            <View className="gap-3">
                <SectionTitle title="Research and method links" detail="Research and technical references that informed the methods above." />
                <Card className="overflow-hidden">
                    {RESEARCH_LINKS.map((reference, index) => (
                        <LinkRow
                            key={reference.url}
                            icon="menu-book"
                            title={reference.title}
                            detail={reference.detail}
                            external
                            last={index === RESEARCH_LINKS.length - 1}
                            onPress={() => openExternalLink(reference.title, reference.url)}
                        />
                    ))}
                </Card>
            </View>
        </Screen>
    );
}

export function AboutScreen() {
    const navigation = useNavigation<NavigationProp<ProfileStackParamList>>();
    const application = getApplicationInfo();
    const geminiDetail = serviceConfig.availability.gemini
        ? 'Meal photos and descriptions · available in this build'
        : 'Meal estimates · not included in this build';
    const usdaDetail = serviceConfig.availability.usda
        ? 'Food search · available in this build'
        : 'Food search · not included in this build';

    return (
        <Screen>
            <Card className="items-center gap-3 p-6">
                <Image
                    accessible
                    accessibilityLabel="Eatlog egg and ruler mark"
                    fadeDuration={0}
                    resizeMode="contain"
                    source={require('../../assets/splash-scale-static.png')}
                    className="h-24 w-24"
                />
                <View className="items-center gap-1.5">
                    <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">Eatlog</Text>
                    <Text className="text-center text-sm text-m3-on-surface-variant">A local-first calorie and macro tracker that turns daily logs into better-informed targets.</Text>
                </View>
                <View className="rounded-full bg-m3-surface-container-high px-3 py-1.5">
                    <Text className="text-xs font-semibold text-m3-on-surface tabular-nums">Version {application.appVersion}</Text>
                </View>
            </Card>

            <View className="gap-3">
                <SectionTitle title="Build details" />
                <Card className="px-5">
                    <DetailRow label="Version" value={application.appVersion} />
                    <DetailRow label="Build" value={application.appBuild} />
                    <DetailRow label="Database schema" value={String(getDatabaseVersion())} />
                    <DetailRow label="Platform" value="Android" />
                    <DetailRow label="App license" value="0BSD" last />
                </Card>
            </View>

            <View className="gap-3">
                <SectionTitle title="Data sources" detail="Availability reflects this installed build." />
                <Card className="overflow-hidden">
                    <LinkRow
                        icon="auto-awesome"
                        title="Google Gemini"
                        detail={geminiDetail}
                        external
                        onPress={() => openExternalLink('Google Gemini', 'https://ai.google.dev/gemini-api/docs')}
                    />
                    <LinkRow
                        icon="science"
                        title="USDA FoodData Central"
                        detail={usdaDetail}
                        external
                        onPress={() => openExternalLink('USDA FoodData Central', 'https://fdc.nal.usda.gov/')}
                    />
                    <LinkRow
                        icon="public"
                        title="Open Food Facts"
                        detail="Food search · available in this build"
                        external
                        last
                        onPress={() => openExternalLink('Open Food Facts', 'https://world.openfoodfacts.org/')}
                    />
                </Card>
            </View>

            <View className="gap-3">
                <SectionTitle title="Open and transparent" />
                <Card className="overflow-hidden">
                    <LinkRow
                        icon="privacy-tip"
                        title="Privacy and data use"
                        detail="What stays local and when Eatlog uses the network"
                        onPress={() => navigation.navigate('Privacy')}
                    />
                    <LinkRow
                        icon="code"
                        title="Source code"
                        detail="github.com/garettie/eatlog"
                        external
                        onPress={() => openExternalLink('Eatlog source code', 'https://github.com/garettie/eatlog')}
                    />
                    <LinkRow
                        icon="description"
                        title="0BSD license"
                        detail="Permission to use, copy, modify, and distribute"
                        external
                        last
                        onPress={() => openExternalLink('0BSD license', 'https://opensource.org/license/0bsd')}
                    />
                </Card>
            </View>

            <View className="flex-row gap-3 rounded-2xl bg-m3-surface-container-low p-4">
                <MaterialIcons name="info-outline" size={20} color={M3.onSurfaceVariant} />
                <Text className="min-w-0 flex-1 text-sm text-m3-on-surface-variant">Meal nutrition, starting targets, and adaptive recommendations are estimates. Review entries and use your own judgment before changing a plan.</Text>
            </View>
        </Screen>
    );
}
