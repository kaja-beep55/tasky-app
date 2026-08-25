// WhatsApp deep-link helper.
// Tasky NEVER receives, stores, or uploads the video. The button
// simply opens WhatsApp with a pre-filled message; the user sends
// their screen recording manually inside WhatsApp.

export function buildWhatsAppUrl(taskNumber: string, taskTitle: string): string {
    const number = (import.meta.env.VITE_WHATSAPP_NUMBER || '').replace(/\D/g, '');
    const text = encodeURIComponent(
        `Hello Tasky Admin, I completed Task #${taskNumber} — "${taskTitle}". ` +
        `Here is my proof video.`,
    );
    return number
        ? `https://wa.me/${number}?text=${text}`
        : `https://wa.me/?text=${text}`;
}
