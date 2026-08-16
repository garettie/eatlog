import React, { useState } from 'react';
import { Alert, Image, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '../components/Card';
import ResponsiveContent from '../components/ResponsiveContent';
import { serviceConfig } from '../config/services';
import { getDatabaseVersion } from '../db/database';
import { useRemoteEstimateConsent } from '../context/RemoteEstimateConsentContext';
import { LEGAL_ATTRIBUTIONS } from '../services/legalAttributions';
import { supportsHealthConnect } from '../services/platformFeatures';
import { FORM_MAX_WIDTH, useResponsiveLayout } from '../theme/layout';
import { M3 } from '../theme/tokens';
import { getApplicationInfo } from '../utils/applicationInfo';
import { WELLNESS_DISCLAIMER } from '../utils/nutritionSafety';

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
        Alert.alert('Could not open link', `This device could not open ${title}. Check your browser and try again.`);
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

function RemoteEstimateRow({
    detail,
    enabled,
    busy,
    onPress,
    last = false,
}: {
    detail: string;
    enabled: boolean;
    busy: boolean;
    onPress: () => void;
    last?: boolean;
}) {
    return (
        <View className={`min-h-[72px] gap-3 px-4 py-4 ${last ? '' : 'border-b border-m3-outline-variant/40'}`}>
            <View className="flex-row items-start gap-3">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-m3-surface-container-high">
                    <MaterialIcons name="photo-camera" size={20} color={M3.onSurfaceVariant} />
                </View>
                <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-sm font-semibold text-m3-on-surface">Meal estimates</Text>
                    <Text className="text-sm text-m3-on-surface-variant">{detail}</Text>
                </View>
            </View>
            <View className="flex-row items-center justify-between gap-3 pl-[52px]">
                <Text className="text-sm font-semibold text-m3-on-surface">{enabled ? 'Enabled' : 'Off'}</Text>
                <Pressable
                    onPress={onPress}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={enabled ? 'Turn off online estimates' : 'Enable online estimates'}
                    accessibilityState={{ disabled: busy, busy }}
                    className={`min-h-[48px] justify-center rounded-full bg-m3-surface-container-high px-4 active:opacity-60 ${busy ? 'opacity-50' : ''}`}
                >
                    <Text className="text-xs font-semibold text-m3-on-surface">
                        {enabled ? 'Turn off online estimates' : 'Enable online estimates'}
                    </Text>
                </Pressable>
            </View>
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
                detail="Eatlog estimates your starting targets, then uses your logs to suggest updates. You choose whether to apply them."
            />

            <View className="gap-3">
                <SectionTitle title="From setup to review" />
                <Card className="overflow-hidden">
                    <InfoRow
                        icon="person-outline"
                        iconColor={M3.calories}
                        title="Start with a personal estimate"
                        detail="Eatlog uses your profile, activity, and goal to estimate your first calorie and macro targets."
                    />
                    <InfoRow
                        icon="restaurant-menu"
                        title="Log food and weight"
                        detail="Check meal estimates before saving. Eatlog uses your weigh-ins to show a steadier trend."
                    />
                    <InfoRow
                        icon="insights"
                        iconColor={M3.expenditure}
                        title="Review a suggestion"
                        detail="Eatlog may suggest a calorie change after you log enough food and weight data."
                        last
                    />
                </Card>
            </View>

            <Callout
                icon="verified-user"
                title="You choose what changes"
                detail="Eatlog updates your plan after you accept a suggestion."
            />

            <Callout
                icon="health-and-safety"
                title="General wellness estimates"
                detail={WELLNESS_DISCLAIMER}
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
    const healthConnectAvailable = supportsHealthConnect(Platform.OS);
    const { decision, requestConsent, decline } = useRemoteEstimateConsent();
    const [consentBusy, setConsentBusy] = useState(false);
    const estimateEnabled = decision === 'accepted';
    const estimateCopy = serviceConfig.availability.gemini
        ? 'When you scan, describe, or re-estimate a meal, Eatlog sends the photo and any meal title you add, or the text you enter, to Google Gemini through Eatlog’s online service to create the estimate. The request uses an app-specific token and your IP address to prevent abuse.'
        : 'This version of Eatlog can’t estimate meals.';

    const handleEstimatePrivacyAction = async () => {
        if (consentBusy) return;
        setConsentBusy(true);
        try {
            if (estimateEnabled) await decline();
            else await requestConsent();
        } finally {
            setConsentBusy(false);
        }
    };
    const searchCopy = serviceConfig.availability.usda && serviceConfig.availability.openFoodFacts
        ? 'As you type, Eatlog looks for matches from USDA. Tap Search to include Open Food Facts. Eatlog keeps recent results in memory for a short time.'
        : serviceConfig.availability.usda
            ? 'As you type, Eatlog looks for matches from USDA and keeps recent results in memory for a short time.'
            : serviceConfig.availability.openFoodFacts
                ? 'Eatlog searches Open Food Facts only after you tap Search, not while you type.'
                : 'This version of Eatlog can’t search for food online.';

    return (
        <Screen>
            <PageIntro
                title="Data storage and sharing"
                detail="Your profile, logs, and meal photos stay on this phone. You don’t need an account to use Eatlog."
            />

            <Callout
                icon="verified-user"
                title="Local by default"
                detail={healthConnectAvailable
                    ? 'Eatlog goes online only when you scan, describe, or search for food. You decide what to export and whether to connect Health Connect.'
                    : 'Eatlog goes online only when you scan, describe, or search for food. You decide what to export or delete.'}
            />

            <View className="gap-3">
                <SectionTitle title="Network requests" />
                <Card className="overflow-hidden">
                    {serviceConfig.availability.gemini ? (
                        <RemoteEstimateRow
                            detail={estimateCopy}
                            enabled={estimateEnabled}
                            busy={consentBusy}
                            onPress={() => { void handleEstimatePrivacyAction(); }}
                        />
                    ) : (
                        <InfoRow icon="photo-camera" title="Meal estimates" detail={estimateCopy} />
                    )}
                    <InfoRow icon="search" title="Food search" detail={searchCopy} last />
                </Card>
            </View>

            {healthConnectAvailable ? (
                <View className="gap-3">
                    <SectionTitle title="Connected service" />
                    <Card className="overflow-hidden">
                        <InfoRow
                            icon="health-and-safety"
                            title="Health Connect"
                            detail="If you connect Health Connect, Eatlog can read weight records and add your weigh-ins. It only uses the permissions you approve."
                            last
                        />
                    </Card>
                </View>
            ) : null}

            <View className="gap-3">
                <SectionTitle title="Files and deletion" />
                <Card className="overflow-hidden">
                    <InfoRow icon="backup" title="Backups" detail="Your backup contains your Eatlog database and saved meal photos." />
                    <InfoRow icon="file-download" title="CSV exports" detail="A CSV gives you a readable copy of your history. It doesn’t include photos or sync data." />
                    <InfoRow
                        icon="delete-outline"
                        title="Delete all data"
                        detail={healthConnectAvailable
                            ? 'Delete all data removes everything Eatlog stores on this phone, including meal photos. Eatlog will also try to remove the entries it added to Health Connect.'
                            : 'Delete all data removes everything Eatlog stores on this phone, including meal photos.'}
                        last
                    />
                </Card>
            </View>
        </Screen>
    );
}

export function AboutScreen() {
    const application = getApplicationInfo();
    const usdaDetail = serviceConfig.availability.usda
        ? 'Food search · Available'
        : 'Food search · Unavailable in this build';
    const openFoodFactsDetail = serviceConfig.availability.openFoodFacts
        ? 'Explicit full search · Available'
        : 'Explicit full search · Unavailable in this build';

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
                    <DetailRow label="Platform" value={Platform.OS === 'ios' ? 'iOS' : 'Android'} />
                    <DetailRow label="App license" value="0BSD" last />
                </Card>
            </View>

            <View className="gap-3">
                <SectionTitle title="Data sources" detail="See which services this build can use." />
                <Card className="overflow-hidden">
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
                        detail={openFoodFactsDetail}
                        external
                        last
                        onPress={() => openExternalLink('Open Food Facts', 'https://world.openfoodfacts.org/')}
                    />
                </Card>
            </View>

        </Screen>
    );
}

export function AttributionsScreen() {
    return (
        <Screen>
            <PageIntro
                title="Licenses and attributions"
                detail="The data, services, fonts, and open-source projects that help Eatlog work."
            />

            <Card className="overflow-hidden">
                {LEGAL_ATTRIBUTIONS.map((item, index) => (
                    <InfoRow
                        key={item.title}
                        icon={item.title === 'Open Food Facts' ? 'public' : item.title === 'Onest' ? 'font-download' : 'info-outline'}
                        title={item.title}
                        detail={item.detail}
                        last={index === LEGAL_ATTRIBUTIONS.length - 1}
                    />
                ))}
            </Card>

            <View className="gap-3">
                <SectionTitle title="License sources" />
                <Card className="overflow-hidden">
                    <LinkRow
                        icon="public"
                        title="Open Food Facts reuse terms"
                        detail="See how its database, content, and images may be reused"
                        external
                        onPress={() => openExternalLink('Open Food Facts reuse terms', 'https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/')}
                    />
                    <LinkRow
                        icon="science"
                        title="USDA FoodData Central"
                        detail="Learn about its food data and API"
                        external
                        onPress={() => openExternalLink('USDA FoodData Central', 'https://fdc.nal.usda.gov/data-documentation.html')}
                    />
                    <LinkRow
                        icon="font-download"
                        title="Onest license"
                        detail="Read the SIL Open Font License 1.1"
                        external
                        last
                        onPress={() => openExternalLink('Onest license', 'https://github.com/simpals/onest/blob/main/OFL.txt')}
                    />
                </Card>
            </View>
        </Screen>
    );
}
