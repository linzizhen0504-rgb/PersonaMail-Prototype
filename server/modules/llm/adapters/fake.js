// A model for tests: answers with the replies it was given, in order, and remembers what it was asked.
const { ModelUnavailableError } = require('../../../contracts/errors');

function createFakeLlm(replies = []) {
    const queue = [...replies];
    const prompts = [];
    const options = [];
    return {
        prompts,
        options,
        queue: (...more) => { queue.push(...more); },
        async generateText(prompt, callOptions) {
            prompts.push(prompt);
            options.push(callOptions);
            if (queue.length === 0) throw new ModelUnavailableError('no reply was queued');
            const reply = queue.shift();
            if (reply instanceof Error) throw reply;
            return typeof reply === 'string' ? reply : JSON.stringify(reply);
        }
    };
}

module.exports = { createFakeLlm };
