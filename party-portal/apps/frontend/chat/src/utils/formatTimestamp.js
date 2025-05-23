/**
 * Formats an ISO date string into a user-friendly timestamp.
 * @param isoString - The ISO date string.
 * @param detailed - If true, always show time. Otherwise, show relative time (Today, Yesterday, Date).
 * @returns Formatted timestamp string.
 */
export const formatTimestamp = (isoString, detailed = false) => {
    if (!isoString)
        return '';
    try {
        const date = new Date(isoString);
        const now = new Date();
        const timeOptions = {
            hour: 'numeric',
            minute: '2-digit',
        };
        const timeString = date.toLocaleTimeString([], timeOptions);
        if (detailed)
            return timeString; // Always show time if detailed is true
        // Check if it's today
        if (date.toDateString() === now.toDateString()) {
            return timeString; // e.g., "10:30 AM"
        }
        // Check if it was yesterday
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        }
        // Check if within the last week (simple check)
        // Note: This check might not be perfectly accurate across month/year boundaries without a library
        if (now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000) {
            return date.toLocaleDateString([], { weekday: 'short' }); // e.g., "Mon"
        }
        // Older than a week
        return date.toLocaleDateString(); // e.g., "1/15/2025"
    }
    catch (e) {
        console.error('Error formatting date:', e);
        return '';
    }
};
