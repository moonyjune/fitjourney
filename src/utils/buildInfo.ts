/** Stamp of the web build (set by the build command as EXPO_PUBLIC_BUILD, UTC date and time); "dev" when running from the dev server.
 *  Shown at the bottom of Profile so it is easy to tell which version a phone is running. */
export const BUILD_ID: string = process.env.EXPO_PUBLIC_BUILD || 'dev';

/** The release number shown in Profile: A.B.C — a fix or small change raises C, a new feature raises B (C back to 0), a big update
 *  raises A (B and C back to 0). Every release has an entry in RELEASE_NOTES.md. */
export const APP_VERSION = '1.3.0';
