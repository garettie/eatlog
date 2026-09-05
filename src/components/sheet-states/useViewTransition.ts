import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withTiming,
} from "react-native-reanimated";

import { EASING } from "../../theme/motion";

/** The sheet's state-change choreography: exit, swap, enter from the opposite side. */
const EXIT_MS = 90;
const ENTER_MS = 150;
const OFFSET = 20;

interface ViewTransitionOptions<T extends string> {
	/** The view the caller wants on screen. */
	target: T;
	reducedMotion: boolean;
	/**
	 * Whether moving `from` -> `to` goes deeper. Forward views leave to the left and
	 * arrive from the right; going back reverses both, so the direction reads as
	 * navigation rather than a generic swap. Must be stable across renders.
	 */
	isForward?: (from: T, to: T) => boolean;
	/** Runs once the new view is committed, before it animates in. Must be stable. */
	onCommit?: (view: T) => void;
}

/**
 * Drives an internal view swap inside one sheet state: the committed view lags the
 * target by one exit animation (90ms, emphasizedAccelerate), then the new view enters
 * from the opposite side (150ms, emphasizedDecelerate). Reduced motion commits
 * immediately with no offset.
 */
export function useViewTransition<T extends string>({
	target,
	reducedMotion,
	isForward,
	onCommit,
}: ViewTransitionOptions<T>) {
	const [rendered, setRendered] = useState<T>(target);
	const enteringRef = useRef(false);
	const enterOffsetRef = useRef(OFFSET);
	const requestRef = useRef(0);
	const offset = useSharedValue(0);
	const opacity = useSharedValue(1);

	const commit = useCallback(
		(view: T, requestId: number) => {
			if (requestId !== requestRef.current) return;
			enteringRef.current = true;
			setRendered(view);
			onCommit?.(view);
		},
		[onCommit],
	);

	useEffect(() => {
		const requestId = ++requestRef.current;
		if (target === rendered) {
			offset.value = withTiming(0, {
				duration: reducedMotion ? 0 : ENTER_MS,
				easing: EASING.emphasizedDecelerate,
			});
			opacity.value = withTiming(1, { duration: reducedMotion ? 0 : ENTER_MS });
			return;
		}
		if (reducedMotion) {
			enteringRef.current = false;
			offset.value = 0;
			opacity.value = 1;
			setRendered(target);
			onCommit?.(target);
			return;
		}
		const forward = isForward ? isForward(rendered, target) : true;
		enterOffsetRef.current = forward ? OFFSET : -OFFSET;
		offset.value = withTiming(forward ? -OFFSET : OFFSET, {
			duration: EXIT_MS,
			easing: EASING.emphasizedAccelerate,
		});
		opacity.value = withTiming(0, { duration: EXIT_MS }, (finished) => {
			if (finished) runOnJS(commit)(target, requestId);
		});
	}, [
		target,
		rendered,
		reducedMotion,
		isForward,
		commit,
		onCommit,
		offset,
		opacity,
	]);

	useLayoutEffect(() => {
		if (!enteringRef.current || reducedMotion) return;
		enteringRef.current = false;
		offset.value = enterOffsetRef.current;
		opacity.value = 0;
		offset.value = withTiming(0, {
			duration: ENTER_MS,
			easing: EASING.emphasizedDecelerate,
		});
		opacity.value = withTiming(1, { duration: ENTER_MS });
	}, [reducedMotion, rendered, offset, opacity]);

	/** Drops a pending transition and shows `view` at rest, for content resets. */
	const jumpTo = useCallback(
		(view: T) => {
			requestRef.current += 1;
			enteringRef.current = false;
			offset.value = 0;
			opacity.value = 1;
			setRendered(view);
		},
		[offset, opacity],
	);

	const style = useAnimatedStyle(() => ({
		opacity: opacity.value,
		transform: [{ translateX: offset.value }],
	}));

	return { rendered, style, jumpTo };
}
