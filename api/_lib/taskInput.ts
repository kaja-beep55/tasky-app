import type { Task, TaskStatus } from './db/types';
import { asEnum, asHttpsUrl, asInt, asOptionalString, asString, asTaskNumber } from './validate';

// Shared validation for admin task create/update payloads.

export interface TaskInput {
    taskNumber: string;
    title: string;
    imageUrl: string;
    rewardCoins: number;
    targetUrl: string;
    description: string;
    whatToDo: string;
    rules: string;
    status: TaskStatus;
}

const TASK_STATUSES: readonly TaskStatus[] = ['published', 'archived'];

export function validateTaskPayload(body: Record<string, unknown>): TaskInput {
    return {
        taskNumber: asTaskNumber(body.taskNumber),
        title: asString(body.title, 'title', { min: 2, max: 120 }),
        // Task images: https URLs, or local /task-images/… paths served by the app.
        imageUrl: asHttpsUrl(body.imageUrl, 'imageUrl', { allowRelative: true }),
        rewardCoins: asInt(body.rewardCoins, 'rewardCoins', { min: 1, max: 1_000_000 }),
        targetUrl: asHttpsUrl(body.targetUrl, 'targetUrl'),
        description: asString(body.description, 'description', { min: 5, max: 4000 }),
        whatToDo: asString(body.whatToDo, 'whatToDo', { min: 5, max: 4000 }),
        rules: asOptionalString(body.rules, 'rules', { max: 4000 }),
        status: asEnum<TaskStatus>(body.status ?? 'published', 'status', TASK_STATUSES),
    };
}

export function validateTaskPatch(body: Record<string, unknown>): Partial<Omit<Task, 'id' | 'taskNumber' | 'createdAt' | 'updatedAt'>> {
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = asString(body.title, 'title', { min: 2, max: 120 });
    if (body.imageUrl !== undefined) patch.imageUrl = asHttpsUrl(body.imageUrl, 'imageUrl', { allowRelative: true });
    if (body.rewardCoins !== undefined) patch.rewardCoins = asInt(body.rewardCoins, 'rewardCoins', { min: 1, max: 1_000_000 });
    if (body.targetUrl !== undefined) patch.targetUrl = asHttpsUrl(body.targetUrl, 'targetUrl');
    if (body.description !== undefined) patch.description = asString(body.description, 'description', { min: 5, max: 4000 });
    if (body.whatToDo !== undefined) patch.whatToDo = asString(body.whatToDo, 'whatToDo', { min: 5, max: 4000 });
    if (body.rules !== undefined) patch.rules = asOptionalString(body.rules, 'rules', { max: 4000 });
    if (body.status !== undefined) patch.status = asEnum<TaskStatus>(body.status, 'status', TASK_STATUSES);
    return patch as Partial<Omit<Task, 'id' | 'taskNumber' | 'createdAt' | 'updatedAt'>>;
}
