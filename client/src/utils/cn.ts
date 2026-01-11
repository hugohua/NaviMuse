/**
 * Simple utility for combining class names.
 * Replacement for tailwind-merge's cn() function.
 * Filters out falsy values and joins class names with space.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ');
}
