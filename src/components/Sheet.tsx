import type React from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { BackHandler, Keyboard, useWindowDimensions, View } from "react-native";
import BottomSheet, {
	BottomSheetBackdrop,
	type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
	SheetDialogContext,
	type SheetDialogHost,
	SheetDialogOverlay,
	useSheetDialogHost,
} from "./SheetDialog";
import { DURATION } from "../theme/motion";
import { M3 } from "../theme/tokens";

const SHEET_HANDLE_HEIGHT = 24;

interface SheetProps {
	visible: boolean;
	snapPoints: (string | number)[];
	stateKey: string | number;
	canCloseRef: React.MutableRefObject<() => boolean>;
	children: React.ReactNode;
	contentHeight?: number | null;
	enablePanDownToClose?: boolean;
	onGoBack?: () => boolean;
	onSheetClosed?: () => void;
	sheetCloseRef?: React.MutableRefObject<() => void>;
	forceClose?: boolean;
	/** Pass a host when something outside the sheet, such as a close guard, must open its dialogs. */
	dialogHost?: SheetDialogHost;
}

export default function Sheet({
	visible,
	snapPoints,
	stateKey,
	canCloseRef,
	children,
	contentHeight,
	enablePanDownToClose = true,
	onGoBack,
	onSheetClosed,
	sheetCloseRef,
	forceClose = false,
	dialogHost,
}: SheetProps) {
	const sheetRef = useRef<BottomSheet>(null);
	const insets = useSafeAreaInsets();
	const { width: windowWidth, height: windowHeight } = useWindowDimensions();
	const reduced = useReducedMotion();
	const lastIndexRef = useRef(0);
	const wasVisible = useRef(false);
	const prevStateKeyRef = useRef(stateKey);
	const wasSizingReady = useRef(false);
	const lastContentSnapPointRef = useRef<number | null>(null);
	const forceCloseRef = useRef(forceClose);
	forceCloseRef.current = forceClose;
	const ownDialogHost = useSheetDialogHost();
	const dialog = dialogHost ?? ownDialogHost;
	const closeDialog = dialog.close;

	useEffect(() => {
		if (!visible) closeDialog();
	}, [closeDialog, visible]);

	useEffect(() => {
		if (sheetCloseRef) {
			sheetCloseRef.current = () => sheetRef.current?.close();
		}
		return () => {
			if (sheetCloseRef) {
				sheetCloseRef.current = () => {};
			}
		};
	}, [sheetCloseRef]);

	useEffect(() => {
		const sizingReady = contentHeight !== null;
		const openedNow = visible && !wasVisible.current;
		const stateChanged = visible && prevStateKeyRef.current !== stateKey;
		const becameReady = visible && sizingReady && !wasSizingReady.current;
		let firstFrame: number | null = null;
		let secondFrame: number | null = null;

		if (sizingReady && (openedNow || stateChanged || becameReady)) {
			const snapToCurrentDetent = () => {
				prevStateKeyRef.current = stateKey;
				sheetRef.current?.snapToIndex(0);
			};
			if (stateChanged || becameReady) {
				firstFrame = requestAnimationFrame(() => {
					secondFrame = requestAnimationFrame(() => {
						snapToCurrentDetent();
					});
				});
			} else {
				snapToCurrentDetent();
			}
		}

		wasVisible.current = visible;
		wasSizingReady.current = sizingReady;
		return () => {
			if (firstFrame !== null) cancelAnimationFrame(firstFrame);
			if (secondFrame !== null) cancelAnimationFrame(secondFrame);
		};
	}, [contentHeight, visible, stateKey]);

	useEffect(() => {
		if (!visible) {
			sheetRef.current?.close();
		}
	}, [visible]);

	useEffect(() => {
		if (!visible) return;
		const backHandler = BackHandler.addEventListener(
			"hardwareBackPress",
			() => {
				if (onGoBack?.()) return true;
				handleClose();
				return true;
			},
		);
		return () => backHandler.remove();
	}, [visible, onGoBack]);

	const handleClose = useCallback(() => {
		if (forceCloseRef.current) {
			Keyboard.dismiss();
			sheetRef.current?.close();
			return;
		}
		const allowed = canCloseRef.current();
		if (allowed) {
			Keyboard.dismiss();
			sheetRef.current?.close();
		} else {
			sheetRef.current?.snapToIndex(lastIndexRef.current);
		}
	}, [canCloseRef]);

	const handleChange = useCallback(
		(index: number) => {
			if (index >= 0) lastIndexRef.current = index;
			if (index === -1) {
				if (forceCloseRef.current) {
					onSheetClosed?.();
					return;
				}
				const allowed = canCloseRef.current();
				if (allowed) {
					onSheetClosed?.();
				} else {
					sheetRef.current?.snapToIndex(lastIndexRef.current);
				}
			}
		},
		[canCloseRef, onSheetClosed],
	);

	const backdrop = useCallback(
		(props: BottomSheetBackdropProps) => (
			<BottomSheetBackdrop
				{...props}
				appearsOnIndex={0}
				disappearsOnIndex={-1}
				opacity={M3.scrimOpacityDefault}
				pressBehavior="close"
			/>
		),
		[],
	);

	const containerStyle = useMemo(
		() => ({
			overflow: "hidden" as const,
			borderTopLeftRadius: 28,
			borderTopRightRadius: 28,
		}),
		[],
	);
	const animationConfigs = useMemo(
		() => ({ duration: reduced ? 0 : DURATION.short }),
		[reduced],
	);
	const backgroundStyle = useMemo(
		() => ({
			...styles.background,
			// Gorhom resizes the sheet body as snap points change. Keep the surface
			// extended beneath the clipped container so its bottom edge never lifts.
			bottom: -windowHeight,
		}),
		[windowHeight],
	);
	const sheetStyle = useMemo(
		() => ({
			alignSelf: "center" as const,
			width: windowWidth >= 600 ? Math.min(windowWidth - 64, 720) : windowWidth,
		}),
		[windowWidth],
	);
	const bottomInset = Math.max(insets.bottom, 8);
	const resolvedSnapPoints = useMemo(() => {
		const maxSheetHeight = Math.max(
			SHEET_HANDLE_HEIGHT + 1,
			windowHeight - insets.top - bottomInset,
		);
		if (typeof contentHeight === "number") {
			const contentSnapPoint = Math.min(
				contentHeight + SHEET_HANDLE_HEIGHT,
				maxSheetHeight,
			);
			lastContentSnapPointRef.current = contentSnapPoint;
			return [contentSnapPoint];
		}
		if (contentHeight === null && lastContentSnapPointRef.current !== null) {
			return [Math.min(lastContentSnapPointRef.current, maxSheetHeight)];
		}
		return snapPoints;
	}, [bottomInset, contentHeight, insets.top, snapPoints, windowHeight]);

	return (
		<BottomSheet
			ref={sheetRef}
			index={-1}
			snapPoints={resolvedSnapPoints}
			animateOnMount={false}
			enableDynamicSizing={false}
			enablePanDownToClose={enablePanDownToClose}
			enableContentPanningGesture={false}
			onChange={handleChange}
			backdropComponent={backdrop}
			handleIndicatorStyle={styles.handle}
			backgroundStyle={backgroundStyle}
			handleStyle={styles.handleArea}
			keyboardBehavior={contentHeight === undefined ? "fillParent" : "interactive"}
			keyboardBlurBehavior="restore"
			topInset={insets.top}
			bottomInset={bottomInset}
			containerStyle={containerStyle}
			style={sheetStyle}
			animationConfigs={animationConfigs}
		>
			<Animated.View
				style={styles.content}
				accessibilityViewIsModal={visible}
				importantForAccessibility={visible ? "yes" : "no-hide-descendants"}
			>
				<View
					className="flex-1"
					importantForAccessibility={dialog.request ? "no-hide-descendants" : "auto"}
				>
					<SheetDialogContext.Provider value={dialog.show}>
						{children}
					</SheetDialogContext.Provider>
				</View>
				<SheetDialogOverlay host={dialog} />
			</Animated.View>
		</BottomSheet>
	);
}

const styles = {
	content: {
		flex: 1 as const,
	},
	handle: {
		backgroundColor: M3.outlineVariant,
		width: 32,
		height: 4,
		borderRadius: 4,
	},
	handleArea: {
		paddingTop: 12,
		paddingBottom: 8,
	},
	background: {
		backgroundColor: M3.surfaceContainer,
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		borderBottomLeftRadius: 0,
		borderBottomRightRadius: 0,
		borderTopWidth: 1,
		borderTopColor: M3.outlineVariant,
	},
};
