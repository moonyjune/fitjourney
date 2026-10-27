/** A photo kept inline (web): its bytes are the URI itself, so it must live in one place only or it fills the browser's small storage. */
export const isInlinePhoto = (uri: string | undefined | null): boolean => !!uri && uri.startsWith('data:');
