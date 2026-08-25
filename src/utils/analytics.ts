/**
 * Analytics tracking service with strictly typed events.
 */

export type AnalyticsEventMap = {
    'click_cta_agent': { location: 'hero' | 'for_agents' };
    'click_cta_sponsor': { location: 'hero' | 'for_sponsors' };
    'submit_waitlist': { type: 'agent' | 'sponsor'; count: number };
    'header_cta_click': { location: 'header' };
    'waitlist_tab_switch': { to: 'agent' | 'sponsor' };
    'page_cta_click': { location: string; cta_type: string };
};

export const trackEvent = <K extends keyof AnalyticsEventMap>(
    eventName: K,
    payload: AnalyticsEventMap[K]
) => {
    console.log(`[Analytics Event] ${eventName}`, payload);
    // Future integration: send to Mixpanel, Amplitude, or Plausible here.
};
