import { Alert } from 'react-native';

import { requestDefaultRemoteEstimateDisclosure } from './remoteEstimateDisclosure';

let activePrompt: Promise<boolean> | null = null;

function confirmRemoteEstimateTransmission(): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    Alert.alert(
      'Send this meal for an estimate?',
      'Eatlog will send this photo or description to its service and Google Gemini. Not now keeps it on this device and sends nothing.',
      [
        { text: 'Not now', style: 'cancel', onPress: () => finish(false) },
        { text: 'Send to estimate', onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    );
  });
}

export function requestRemoteEstimateDisclosureAlert(): Promise<boolean> {
  if (!activePrompt) {
    activePrompt = requestDefaultRemoteEstimateDisclosure(confirmRemoteEstimateTransmission)
      .catch((error) => {
        console.error('[Privacy] estimate disclosure could not be saved', error);
        Alert.alert('Estimate unavailable', 'Eatlog could not save your privacy choice. Nothing was sent. Try again.');
        return false;
      })
      .finally(() => { activePrompt = null; });
  }
  return activePrompt;
}
