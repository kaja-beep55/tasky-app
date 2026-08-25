export function formatDateTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

export function actionLabel(actionType: string): string {
    switch (actionType) {
        case 'task_reward': return 'ADD';
        case 'admin_add': return 'ADD';
        case 'admin_deduct': return 'DEDUCT';
        case 'admin_reset': return 'RESET';
        case 'adjustment': return 'ADJUST';
        default: return actionType.toUpperCase();
    }
}
