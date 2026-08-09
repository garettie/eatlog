import React from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '../components/Card';
import ResponsiveContent from '../components/ResponsiveContent';
import { serviceConfig } from '../config/services';
import { getDatabaseVersion } from '../db/database';
import { FORM_MAX_WIDTH, useResponsiveLayout } from '../theme/layout';
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

interface InfoRowProps {
    icon: MaterialIconName;
    title: string;
    detail: string;
    iconColor?: string;
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
        Alert.alert('Could not open link', `Android could not open ${title}. Check your browser and try again.`);
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
                <ResponsiveContent className="gap-8" maxWidth={FORM_MAX_WIDTH}>
                    {children}
                </ResponsiveContent>
            </ScrollView>
        </SafeAreaView>
    );
}

function PageIntro({ title, detail }: { title: string; detail: string }) {
    return (
        <View className="gap-2">
            <Text accessibilityRole="header" className="text-2xl font-bold text-m3-on-surface">{title}</Text>
            <Text className="text-sm text-m3-on-surface-variant">{detail}</Text>
        </View>
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

function InfoRow({ icon, title, detail, iconColor = M3.onSurfaceVariant, last = false }: InfoRowProps) {
    return (
        <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${title}. ${detail}`}
            className="min-h-[72px] flex-row items-start gap-3 px-4 py-4"
        >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container-high">
                <MaterialIcons name={icon} size={20} color={iconColor} />
            </View>
            <View className="min-w-0 flex-1 gap-1 pt-0.5">
                <Text className="text-sm font-semibold text-m3-on-surface">{title}</Text>
                <Text className="text-sm text-m3-on-surface-variant">{detail}</Text>
            </View>
            {!last ? <View className="absolute bottom-0 left-[68px] right-4 h-px bg-m3-outline-variant/50" /> : null}
        </View>
    );
}

function ArticleHeading({ icon, title, iconColor = M3.expenditure }: { icon: MaterialIconName; title: string; iconColor?: string }) {
    return (
        <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container-high">
                <MaterialIcons name={icon} size={21} color={iconColor} />
            </View>
            <Text accessibilityRole="header" className="min-w-0 flex-1 text-lg font-bold text-m3-on-surface">{title}</Text>
        </View>
    );
}

function FormulaRow({
    label,
    value,
    detail,
    labelClassName = 'text-m3-expenditure',
    last = false,
}: {
    label: string;
    value: string;
    detail: string;
    labelClassName?: string;
    last?: boolean;
}) {
    return (
        <View className={`gap-1 px-4 py-3.5 ${last ? '' : 'border-b border-m3-outline-variant/50'}`}>
            <Text className={`text-xs font-semibold ${labelClassName}`}>{label}</Text>
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

function Callout({ icon, title, detail, iconColor = M3.onSurfaceVariant }: {
    icon: MaterialIconName;
    title: string;
    detail: string;
    iconColor?: string;
}) {
    return (
        <View className="flex-row gap-3 rounded-2xl bg-m3-surface-container-low p-4">
            <MaterialIcons name={icon} size={20} color={iconColor} />
            <View className="min-w-0 flex-1 gap-1">
                <Text className="text-sm font-semibold text-m3-on-surface">{title}</Text>
                <Text className="text-sm text-m3-on-surface-variant">{detail}</Text>
            </View>
        </View>
    );
}

export function HowEatlogWorksScreen() {
    return (
        <Screen>
            <PageIntro
                title="Plan calculations"
                detail="Eatlog calculates a starting target from your profile. With enough food and weight history, it can suggest an update for you to accept or keep."
            />

            <View className="gap-5">
                <ArticleHeading icon="calculate" title="Starting target" />
                <Text className="text-sm text-m3-on-surface-variant">Use the result as a planning estimate.</Text>
                <View className="overflow-hidden rounded-2xl bg-m3-surface-container-high">
                    <FormulaRow label="Resting energy" value="Mifflin–St Jeor" detail="Eatlog applies the equation to sex, age, height, and weight. The app labels this value BMR." />
                    <FormulaRow label="Daily expenditure" value="BMR × activity factor" detail="Eatlog uses your activity choice: 1.2, 1.375, 1.55, 1.725, or 1.9." />
                    <FormulaRow label="Goal adjustment" labelClassName="text-m3-calories" value="TDEE + weekly rate × 7,700 ÷ 7" detail="Eatlog converts your weekly rate into a daily calorie adjustment." last />
                </View>
                <Callout
                    icon="info-outline"
                    title="Estimate limits"
                    detail="Your expenditure varies with body composition and daily activity. Eatlog uses the activity factors and 7,700 kcal/kg value to set the first target."
                />
            </View>

            <View className="h-px bg-m3-outline-variant/50" />

            <View className="gap-5">
                <ArticleHeading icon="restaurant-menu" title="Macro targets" iconColor={M3.onSurfaceVariant} />
                <Text className="text-sm text-m3-on-surface-variant">Eatlog sets protein from your goal and body weight, assigns 25% of calories to fat, then gives the remaining calories to carbs. You can replace the result with custom targets.</Text>
                <View className="overflow-hidden rounded-2xl bg-m3-surface-container-high">
                    <FormulaRow label="Protein" labelClassName="text-m3-protein" value="Cut 2.1 · Maintain 1.8 · Bulk 1.7 g/kg" detail="Your preference adjusts the baseline by −0.2 to +0.4 g/kg." />
                    <FormulaRow label="Fat" labelClassName="text-m3-fat" value="25% of target calories" detail="Each gram contributes 9 kcal." />
                    <FormulaRow label="Carbohydrate" labelClassName="text-m3-carbs" value="Calories left after protein and fat" detail="Protein and carbs contribute 4 kcal per gram. Calculated plans keep at least 50 g of carbs." last />
                </View>
                <Text className="text-sm text-m3-on-surface-variant">Eatlog uses these protein presets, preference offsets, fat share, and carb floor as product rules. Read the linked research for broader reference ranges.</Text>
            </View>

            <View className="h-px bg-m3-outline-variant/50" />

            <View className="gap-5">
                <ArticleHeading icon="monitor-weight" title="Food estimates and trend weight" />
                <Card className="overflow-hidden">
                    <InfoRow icon="photo-camera" title="Review food estimates" detail="Check components and portions from photos, descriptions, and search before you save. You can edit saved entries in Diary." />
                    <InfoRow icon="show-chart" iconColor={M3.expenditure} title="Smooth scale noise" detail="Eatlog uses exponential smoothing with a seven-day half-life. Recent weigh-ins carry more weight than older ones." />
                    <InfoRow icon="date-range" title="Align the evidence" detail="Eatlog uses intake logged between the first and last weight readings in a review window." last />
                </Card>
            </View>

            <View className="h-px bg-m3-outline-variant/50" />

            <View className="gap-5">
                <ArticleHeading icon="insights" title="Adaptive reviews" />
                <Text className="text-sm text-m3-on-surface-variant">Eatlog waits for recent evidence before it calculates a recommendation.</Text>
                <View className="flex-row flex-wrap gap-2">
                    <EvidenceStat value="28 days" label="Evidence window" />
                    <EvidenceStat value="10 days" label="Usable intake days" />
                    <EvidenceStat value="4 weights" label="Minimum readings" />
                    <EvidenceStat value="14 days" label="Minimum weight span" />
                </View>
                <View className="overflow-hidden rounded-2xl bg-m3-surface-container-high">
                    <FormulaRow label="Observed expenditure" value="Average intake − weight-change energy" detail="Eatlog fits a linear slope to scale readings, then applies the 7,700 kcal/kg convention." />
                    <FormulaRow label="Stability blend" value="70% new estimate + 30% previous TDEE" detail="Eatlog combines the new estimate with the previous TDEE." />
                    <FormulaRow label="Guardrails" value="Maximum ±10% TDEE change" detail="Eatlog requires a weight from the past seven days and keeps the result above BMR × 1.2." last />
                </View>
                <Callout
                    icon="verified-user"
                    iconColor={M3.expenditure}
                    title="You approve each change"
                    detail="The evidence window, minimums, 70/30 blend, and ±10% cap are product safeguards. If a day looks incomplete, Eatlog asks you to confirm it."
                />
            </View>

            <View className="gap-3">
                <SectionTitle title="Research and method links" detail="Open a study or technical reference in your browser." />
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

export function PrivacyScreen() {
    const estimateCopy = serviceConfig.availability.gemini
        ? 'When you choose Scan or Describe, Eatlog sends the selected photo or text through its service to Google Gemini.'
        : 'This build cannot send photos or descriptions for meal estimates.';
    const searchCopy = serviceConfig.availability.usda
        ? 'Eatlog sends search terms to USDA through its service and to Open Food Facts. It may cache results on this phone.'
        : 'Eatlog sends search terms to Open Food Facts and may cache results on this phone.';

    return (
        <Screen>
            <PageIntro
                title="Data storage and sharing"
                detail="Eatlog stores your profile and history on this phone, along with meal photos. It works without an account or cloud sync."
            />

            <Callout
                icon="verified-user"
                title="Local by default"
                detail="Eatlog contacts remote services after you choose a network feature. You choose where backup and CSV files go and whether to connect Health Connect."
            />

            <View className="gap-3">
                <SectionTitle title="Network requests" detail="Eatlog contacts a service after you choose a feature that needs it." />
                <Card className="overflow-hidden">
                    <InfoRow icon="photo-camera" title="Meal estimates" detail={estimateCopy} />
                    <InfoRow icon="search" title="Food search" detail={searchCopy} last />
                </Card>
            </View>

            <View className="gap-3">
                <SectionTitle title="Connected service" />
                <Card className="overflow-hidden">
                    <InfoRow
                        icon="health-and-safety"
                        title="Health Connect"
                        detail="After you connect Health Connect, Eatlog reads weight records and writes the weights you log. Android limits access to the permissions you grant."
                        last
                    />
                </Card>
            </View>

            <View className="gap-3">
                <SectionTitle title="Files and deletion" />
                <Card className="overflow-hidden">
                    <InfoRow icon="backup" title="Backups" detail="Eatlog puts your database and saved meal photos in a restorable backup." />
                    <InfoRow icon="file-download" title="CSV exports" detail="Eatlog writes readable history to CSV and excludes photos, caches, and Health Connect sync metadata." />
                    <InfoRow icon="delete-outline" title="Delete all data" detail="After you confirm deletion, Eatlog removes its local data and meal photos. It also attempts to remove the weights it wrote to Health Connect." last />
                </Card>
            </View>
        </Screen>
    );
}

export function AboutScreen() {
    const navigation = useNavigation<NavigationProp<ProfileStackParamList>>();
    const application = getApplicationInfo();
    const geminiDetail = serviceConfig.availability.gemini
        ? 'Meal estimates · Available'
        : 'Meal estimates · Unavailable in this build';
    const usdaDetail = serviceConfig.availability.usda
        ? 'Food search · Available'
        : 'Food search · Unavailable in this build';

    return (
        <Screen>
            <View className="items-center gap-3 py-1">
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
                    <Text className="text-center text-sm text-m3-on-surface-variant">Track nutrition and weight on your phone. Eatlog uses your history to suggest target changes.</Text>
                </View>
            </View>

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
                <SectionTitle title="Data sources" detail="See which services this build can use." />
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
                        detail="Food search · Available"
                        external
                        last
                        onPress={() => openExternalLink('Open Food Facts', 'https://world.openfoodfacts.org/')}
                    />
                </Card>
            </View>

            <View className="gap-3">
                <SectionTitle title="Project and privacy" />
                <Card className="overflow-hidden">
                    <LinkRow
                        icon="privacy-tip"
                        title="Privacy and data use"
                        detail="Review on-device storage and data sharing"
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
        </Screen>
    );
}
