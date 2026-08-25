import mixpanel from 'mixpanel-browser';

const MIXPANEL_TOKEN = import.meta.env.VITE_MIXPANEL_TOKEN;

// Initialize Mixpanel
if (MIXPANEL_TOKEN) {
    mixpanel.init(MIXPANEL_TOKEN, {
        debug: import.meta.env.DEV,
        track_pageview: true,
        persistence: 'localStorage',
        ignore_dnt: true
    });
} else {
    console.warn('Mixpanel token is missing. Analytics will only log to console.');
}

// Event map to ensure type safety
export interface AnalyticsEventMap {
    'page_view': { path: string; title: string };
    'header_cta_click': { from_path: string };
    'page_cta_click': { cta_id: string; target?: string };
    'docs_nav_click': { section: string };
    'mobile_menu_toggle': { action: 'open' | 'close' };
    // Tasks & Submissions
    'tasks_list_view': { total_tasks: number; filters_active: boolean };
    'task_detail_view': { task_id: string; task_slug: string };
    'task_filter_change': { filter_type: string; value: string };
    'task_cta_click': { task_id: string; cta_type: 'submit_proof' | 'browse_tasks' };
    'submission_submit_attempt': { task_id: string };
    'submission_submit_success': { task_id: string };
    'submission_submit_error': { task_id: string; error: string };
}

// Utility to grab safe UTM parameters from URL
export const getSafeUTMs = () => {
    if (typeof window === 'undefined') return {};
    const params = new URLSearchParams(window.location.search);
    return {
        utm_source: params.get('utm_source') || undefined,
        utm_medium: params.get('utm_medium') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined,
        utm_content: params.get('utm_content') || undefined,
        utm_term: params.get('utm_term') || undefined,
    };
};

// Main tracking function
export const trackEvent = <K extends keyof AnalyticsEventMap>(
    eventName: K,
    properties?: AnalyticsEventMap[K]
) => {
    const safeProps = {
        ...properties,
        ...getSafeUTMs(),
        viewport_width: window.innerWidth,
    };

    if (MIXPANEL_TOKEN) {
        mixpanel.track(eventName, safeProps);
    } else {
        console.log(`[Analytics Stub] ${eventName}`, safeProps);
    }
};
