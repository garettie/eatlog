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
        title: 'Starting calorie estimate',
        detail: 'Mifflin et al. · American Journal of Clinical Nutrition · 1990',
        url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
    },
    {
        title: 'Energy and weight change',
        detail: 'Wishnofsky · American Journal of Clinical Nutrition · 1958',
        url: 'https://pubmed.ncbi.nlm.nih.gov/13594881/',
    },
    {
        title: 'Energy balance over time',
        detail: 'Hall et al. · The Lancet · 2011',
        url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3880593/',
    },
    {
        title: 'Protein targets',
        detail: 'Morton et al. · British Journal of Sports Medicine · 2018',
        url: 'https://pubmed.ncbi.nlm.nih.gov/28698222/',
    },
    {
        title: 'Macronutrient ranges',
        detail: 'National Academies · Dietary Reference Intakes · 2005',
        url: 'https://nap.nationalacademies.org/catalog/10490/dietary-reference-intakes-for-energy-carbohydrate-fiber-fat-fatty-acids-cholesterol-protein-and-amino-acids',
    },
    {
        title: 'Weight trend smoothing',
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
            className="min-h-[72px] flex-row items-center gap-3 px-4 py-3"
        >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container-high">
                <MaterialIcons name={icon} size={20} color={iconColor} />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-sm font-semibold text-m3-on-surface">{title}</Text>
                <Text className="text-sm text-m3-on-surface-variant">{detail}</Text>
            </View>
            {!last ? <View className="absolute bottom-0 left-[68px] right-4 h-px bg-m3-outline-variant/50" /> : null}
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
        <View className="flex-row items-center gap-3 rounded-2xl bg-m3-surface-container-low p-4">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container-high">
                <MaterialIcons name={icon} size={20} color={iconColor} />
            </View>
            <View className="min-w-0 flex-1 gap-0.5">
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
                title="How Eatlog sets your targets"
                detail="Eatlog starts with your profile, then uses the food and weight history you log to suggest adjustments. You decide whether to apply them."
            />

            <View className="gap-3">
                <SectionTitle title="From setup to review" />
                <Card className="overflow-hidden">
                    <InfoRow
                        icon="person-outline"
                        iconColor={M3.calories}
                        title="Start with a personal estimate"
                        detail="Eatlog uses your profile, activity, and goal to set your first calorie and macro targets."
                    />
                    <InfoRow
                        icon="restaurant-menu"
                        title="Log food and weight"
                        detail="Review food estimates before saving. Eatlog smooths day-to-day scale changes into a weight trend."
                    />
                    <InfoRow
                        icon="insights"
                        iconColor={M3.expenditure}
                        title="Review a suggestion"
                        detail="Once you have enough history, Eatlog compares your food logs with your weight trend and may suggest a new calorie target."
                        last
                    />
                </Card>
            </View>

            <Callout
                icon="verified-user"
                title="You choose what changes"
                detail="Eatlog waits for your approval before updating the plan. You can accept a suggestion or keep your current target."
            />

            <View className="gap-3">
                <SectionTitle title="Research sources" detail="Read the studies and technical references Eatlog uses." />
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
                <View className="h-32 w-32 items-center justify-center rounded-3xl border border-m3-outline-variant/50 bg-m3-surface-container-high">
                    <Image
                        accessible
                        accessibilityLabel="Eatlog logo"
                        fadeDuration={0}
                        resizeMode="contain"
                        source={require('../../assets/icon.png')}
                        className="h-28 w-28 rounded-2xl"
                    />
                </View>
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
