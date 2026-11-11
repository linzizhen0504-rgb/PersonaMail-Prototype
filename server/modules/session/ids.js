// Names that end up in paths are checked here, once, before anything touches the disk.
const { ValidationError } = require('../../contracts/errors');

const MAX_NAME_LENGTH = 100;
const TASK_ID_PATTERN = /^(.+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/;

// A name may hold letters, digits, spaces, dots, underscores and so on, but nothing that would make it a path
function assertSafeName(value, field) {
    if (typeof value !== 'string' || value.trim() === '') throw new ValidationError(`${field} is required`);
    if (value.length > MAX_NAME_LENGTH) throw new ValidationError(`${field} is too long`);
    if (value === '.' || value === '..' || /[/\\\u0000]/.test(value)) throw new ValidationError(`${field} is not allowed`);
    return value;
}

// userName_2026-11-10T12-44-41-888Z
const newTaskId = (userName, now = new Date()) => `${userName}_${now.toISOString().replace(/[:.]/g, '-')}`;

// The user name is what comes before the time at the end, so a name with underscores in it is read correctly
function parseTaskId(taskId) {
    const match = typeof taskId === 'string' ? TASK_ID_PATTERN.exec(taskId) : null;
    if (!match) throw new ValidationError('taskId is not a task id');
    return { userName: assertSafeName(match[1], 'taskId'), taskId };
}

module.exports = { assertSafeName, newTaskId, parseTaskId };
