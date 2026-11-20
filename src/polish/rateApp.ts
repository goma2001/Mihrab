/**
 * "Rate صلاتي" — where a rating can be left, for this fork.
 *
 * صلاتي is distributed from its own GitHub releases only: there is no
 * Play listing and no App Store listing yet, so a rating is a GitHub
 * star — the signal open-source users read. (Upstream Mihrab offered
 * the Play listing and the App Store review page; both pointed at
 * listings this fork does not have, so they are not offered here.)
 * When a store listing exists, add its place back here and in
 * `ratingPlaces`, and update `__tests__/helpMihrab.test.ts` with it.
 */
import { Linking } from 'react-native';

const GITHUB_URL = 'https://github.com/goma2001/salaty';

/** A place a rating can be left. */
export type RatingPlace = 'github';

/**
 * Where to ask for a rating from this build: GitHub, on every
 * platform. No store listing exists for this fork yet.
 */
export function ratingPlaces(): RatingPlace[] {
  return ['github'];
}

export async function openRatingPlace(place: RatingPlace): Promise<void> {
  if (place === 'github') {
    await Linking.openURL(GITHUB_URL).catch(() => undefined);
  }
}

/** The one-button version: GitHub, on every platform. */
export async function rateApp(): Promise<void> {
  return openRatingPlace('github');
}
