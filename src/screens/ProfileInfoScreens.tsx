import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import Card from '../components/Card';
import ResponsiveContent from '../components/ResponsiveContent';
import { getDatabaseVersion } from '../db/database';
import { serviceConfig } from '../config/services';
import { FORM_MAX_WIDTH } from '../theme/layout';
import { getApplicationInfo } from '../utils/applicationInfo';

function Screen({ children }: { children: React.ReactNode }) {
    return (
        <SafeAreaView edges={['bottom', 'left', 'right']} className="flex-1 bg-m3-surface">
            <ResponsiveContent className="flex-1" maxWidth={FORM_MAX_WIDTH}>{children}</ResponsiveContent>
        </SafeAreaView>
    );
}

function ArticleSection({ title, children }: { title: string; children: string }) {
    return (
        <View className="gap-1.5">
            <Text className="text-base font-semibold text-m3-on-surface">{title}</Text>
            <Text className="text-sm leading-5 text-m3-on-surface-variant">{children}</Text>
        </View>
    );
}

function DetailRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
    return (
        <View className={`flex-row justify-between gap-4 py-3 ${last ? '' : 'border-b border-m3-outline-variant/40'}`}>
            <Text className="text-sm text-m3-on-surface-variant">{label}</Text>
            <Text className="flex-1 text-right text-sm font-semibold text-m3-on-surface" numberOfLines={2}>{value}</Text>
        </View>
    );
}

export function HowEatlogWorksScreen() {
    return (
        <Screen>
            <ScrollView contentContainerClassName="p-6 gap-7" showsVerticalScrollIndicator={false}>
                <View className="gap-2">
                    <Text className="text-lg font-bold text-m3-on-surface">A plan that learns from your history</Text>
                    <Text className="text-sm leading-5 text-m3-on-surface-variant">Eatlog starts with an estimate, makes logging fast, and uses your food and weight history to keep the plan useful.</Text>
                </View>
                <ArticleSection title="Your starting targets">Eatlog uses your profile, activity, goal, rate, and protein preference to estimate daily calories and macros.</ArticleSection>
                <ArticleSection title="Log food your way">Scan a meal, describe it, search for a food, or enter it manually. Review the result and adjust portions before saving.</ArticleSection>
                <ArticleSection title="Track weight">Scale entries are smoothed into a trend so a single noisy weigh-in does not change the direction of your plan.</ArticleSection>
                <ArticleSection title="Review the evidence">With enough food and weight history, Eatlog can propose a target change based on what is happening—not just the starting estimate.</ArticleSection>
                <ArticleSection title="You stay in control">An adaptive review is only a proposal. Accept it to change your targets, or keep your current plan.</ArticleSection>
                <ArticleSection title="Estimates are editable">Scan and describe results are estimates. Check the components and portions; every saved entry can be edited later in your Diary.</ArticleSection>
            </ScrollView>
        </Screen>
    );
}

export function AboutScreen() {
    const application = getApplicationInfo();
    const foodSources = serviceConfig.availability.usda
        ? 'USDA and Open Food Facts'
        : 'Open Food Facts';

    return (
        <Screen>
            <ScrollView contentContainerClassName="p-6 gap-6" showsVerticalScrollIndicator={false}>
                <View className="gap-2">
                    <Text className="text-lg font-bold text-m3-on-surface">Eatlog</Text>
                    <Text className="text-sm leading-5 text-m3-on-surface-variant">A local-first calorie and macro tracker for fast meal logging and evidence-based targets.</Text>
                </View>
                <Card className="px-5">
                    <DetailRow label="Version" value={application.appVersion} />
                    <DetailRow label="Build" value={application.appBuild} />
                    <DetailRow label="Database" value={String(getDatabaseVersion())} />
                    <DetailRow label="Platform" value="Android" />
                    <DetailRow label="Food sources" value={foodSources} />
                    <DetailRow label="License" value="0BSD" last />
                </Card>
                <ArticleSection title="Meal estimates">Photos and descriptions are estimated only when you choose Scan or Describe. Review the result before saving it.</ArticleSection>
                <ArticleSection title="Privacy">Your local data stays in Eatlog unless you create a file or connect an optional service. See Privacy for the full data flow.</ArticleSection>
            </ScrollView>
        </Screen>
    );
}
