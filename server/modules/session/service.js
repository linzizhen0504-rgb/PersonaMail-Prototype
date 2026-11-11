// What the http layer asks about sessions: the checks of what a caller sent, then the repository.
const { ValidationError, NotFoundError } = require('../../contracts/errors');
const { parseTaskId } = require('./ids');

function createSessionService({ sessions }) {
    const refOf = (userName, taskId) => {
        if (!userName || !taskId) throw new ValidationError('userName and taskId are required');
        return { userName, taskId };
    };
    return {
        async createSession({ userName, userInput }) {
            if (!userName || !userInput) throw new ValidationError('userName 和 userInput 是必需的');
            return sessions.createSession(userName);
        },
        async saveFactorChoices({ userName, taskId, factorChoices }) {
            if (!userName || !factorChoices || !taskId) throw new ValidationError('userName、factorChoices 和 taskId 是必需的');
            await sessions.writeChoices({ userName, taskId }, factorChoices);
        },
        async updateTaskMeta({ userName, taskId, originalTask }) {
            if (!userName || !taskId || originalTask === undefined) throw new ValidationError('userName, taskId, and originalTask are required');
            await sessions.updateMeta({ userName, taskId }, { original_task: originalTask });
        },
        // The user is read from the task id itself
        async saveDraft({ taskId, content }) {
            if (!taskId) throw new ValidationError('Missing taskId');
            if (!content) throw new ValidationError('Content is required');
            await sessions.writeDraft(parseTaskId(taskId), content);
        },
        async readFile({ taskId, relativePath }) {
            const file = await sessions.readFile(parseTaskId(taskId), relativePath);
            if (!file) throw new NotFoundError('文件不存在');
            return file;
        },
        refOf
    };
}

module.exports = { createSessionService };
