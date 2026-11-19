/**
 * The addresses the app points people at, in one place.
 *
 * They were literals scattered across screens, and they drifted: the shared
 * month image was still printing the GitHub repo — with a QR code carrying
 * the app's old mosque icon — months after there was a website to send
 * people to, and Settings sent everyone to the source tree rather than to
 * the page written for them.
 *
 * This fork (صلاتي) has no website yet, so the front door is its own
 * repository: the releases page is where the app is downloaded from,
 * and the source is where issues are filed. When a site exists, point
 * SALATY_WEBSITE at it and keep SALATY_REPO for the source.
 *
 * The upstream project (Mihrab, MihrabHQ/Mihrab) is named only in the
 * About screen's lineage note — nowhere else does the app point at it.
 */

/** The project's own front door. What a stranger should be handed. */
export const SALATY_WEBSITE = 'https://github.com/goma2001/Mihrab';

/** Shown rather than linked — a bare host reads better than a URL. */
export const SALATY_WEBSITE_LABEL = 'github.com/goma2001/Mihrab';

/** The source. Still linked from the attributions, where it belongs. */
export const SALATY_REPO = 'https://github.com/goma2001/Mihrab';

/**
 * The upstream project this fork is built on. Used ONLY for the lineage
 * note on the About screen — nowhere else does the app point at upstream.
 */
export const UPSTREAM_MIHRAB_REPO = 'https://github.com/MihrabHQ/Mihrab';
