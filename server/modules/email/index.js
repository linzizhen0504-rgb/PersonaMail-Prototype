// The email services: every step of writing an email with a model. They know the prompts, the rules for what a usable answer is and
// what to keep of a task; they do not know which model answers, where files live or how a request arrives.
const { ValidationError, NotFoundError, ModelOutputError } = require('../../contracts/errors');
const { createJsonRequester, parseModelJson } = require('../llm');
const { normalizeName, plainName } = require('./names');
const { styleExamplesSection } = require('./styleExamples');
const { cleanLinks, ensureEveryComponentLinked } = require('./links');
const { alignVariationValues, variationsMatchValues } = require('./variations');
const { filterFactorChoices, cleanFactorSelection } = require('./factors');

const isIntentList = (data) => Array.isArray(data) && data.length > 0 && data.every(intent =>
    intent && typeof intent.dimension === 'string' && intent.dimension.trim() &&
    typeof intent.current_value === 'string' && intent.current_value.trim());

const textOrEmpty = (value) => (value === null || value === undefined ? '' : value);

function createEmailServices({ llm, sessions, prompts, catalog }) {
    const requestJson = createJsonRequester(llm);
    const linkMissing = ensureEveryComponentLinked(requestJson);

    // The choices of a task as simple id -> value pairs; none when the task has no choices
    const filteredChoices = async (ref) => filterFactorChoices((await sessions.readChoices(ref)) || {});
    const failed = (message, cause) => Object.assign(new ModelOutputError(message), { cause });

    return {
        // Which factors matter for a request, and what their values are
        async selectFactors({ userTask }) {
            if (!userTask || !String(userTask).trim()) throw new ValidationError('userTask is required');
            const factors = await catalog.list();
            const prompt = prompts.render('18factor_selector.prompt.md', {
                USER_TASK: String(userTask),
                FACTOR_LIST: JSON.stringify(factors.map(({ id, title, select_type, options }) => ({ id, title, select_type, options: options.map(option => option.value) })), null, 2)
            });
            const isUsable = (data) => data && typeof data === 'object' && !Array.isArray(data)
                && Object.keys(cleanFactorSelection(data, factors).selectedFactors).length > 0;
            try {
                return cleanFactorSelection(await requestJson(prompt, { reasoning: false }, isUsable), factors);
            } catch (error) {
                throw failed('Failed to select factors', error);
            }
        },

        async generateFirstDraft({ userTask, factorChoices }) {
            if (!userTask || !factorChoices) throw new ValidationError('userTask and factorChoices are required');
            const prompt = prompts.render('4first_draft_composer.prompt.md', {
                USER_TASK: userTask,
                FACTOR_CHOICES: JSON.stringify(filterFactorChoices(factorChoices), null, 2)
            });
            try {
                const draft = await llm.generateText(prompt, { reasoning: true, timeoutMs: 120000 });
                if (!draft) throw new Error('AI response is empty');
                return draft.trim();
            } catch (error) {
                throw failed('Failed to generate first draft', error);
            }
        },

        // The components of the draft of a task, as the text the model gave (titles are made short)
        async extractComponents(ref) {
            const draft = await sessions.readDraft(ref);
            if (draft === null) throw new NotFoundError('latest.md not found');
            const prompt = prompts.render('5component_extractor.prompt.md', { DRAFT_LATEST: draft.trim() });
            let text;
            try {
                text = await llm.generateText(prompt);
            } catch (error) {
                throw failed('Error in Component Extractor', error);
            }
            if (!text) throw failed('AI response is empty');
            try {
                const parsed = parseModelJson(text);
                if (Array.isArray(parsed)) {
                    return JSON.stringify(parsed.map(component => (component && typeof component.title === 'string' ? { ...component, title: plainName(component.title) } : component)));
                }
            } catch (parseError) {
                // the caller reads the text on its own terms
            }
            return text;
        },

        async analyzeIntents({ userTask, ref }) {
            const choices = await sessions.readChoices(ref);
            if (choices === null) throw new Error('Failed to read factor choices');
            const draft = await sessions.readDraft(ref);
            if (draft === null) throw new Error('Failed to read latest draft');
            const prompt = prompts.render('3intent_analyzer_prompt.md', {
                USER_TASK: userTask,
                FACTOR_CHOICES: JSON.stringify(choices, null, 2),
                DRAFT_LATEST: draft
            });
            let parsed;
            try {
                parsed = await requestJson(prompt, { reasoning: false }, isIntentList);
            } catch (error) {
                throw failed('Failed to parse AI response as JSON', error);
            }
            const intents = parsed.map(intent => ({
                ...intent,
                dimension: plainName(intent.dimension),
                current_value: plainName(intent.current_value),
                other_values: Array.isArray(intent.other_values) ? intent.other_values.filter(value => typeof value === 'string' && value.trim()).map(plainName) : []
            }));
            await sessions.writeIntents(ref, intents);
            return intents;
        },

        // Which intent drives which component: only real components and intents, and every component at least once
        async linkComponents({ ref, componentList }) {
            const intents = await sessions.readIntents(ref);
            if (intents === null) throw new Error('Failed to read current intents');
            const prompt = prompts.render('6component_intent_link.prompt.md', {
                COMPONENT_LIST: JSON.stringify(componentList, null, 2),
                INTENT_CURRENT: JSON.stringify(intents, null, 2)
            });
            let links = [];
            try {
                links = await requestJson(prompt, {}, Array.isArray, 2);
            } catch (error) {
                console.error('Component-Intent Link output could not be parsed:', error.message);
            }
            return linkMissing(cleanLinks(links, componentList, intents), componentList, intents);
        },

        // The versions of one component under every value of one intent
        async rewriteForIntent({ ref, userTask, draftLatest, componentCurrent, intentSelected, intentOthers, styleExamples }) {
            const factorChoices = await sessions.readChoices(ref);
            if (!userTask || !factorChoices || !draftLatest || !componentCurrent || !intentSelected || !intentOthers) {
                throw new ValidationError('Missing required fields in the request body');
            }
            const prompt = prompts.render('7intent_change_rewriter.prompt.md', {
                USER_TASK: userTask,
                FACTOR_CHOICES: JSON.stringify(filterFactorChoices(factorChoices), null, 2),
                DRAFT_LATEST: draftLatest,
                COMPONENT_CURRENT: componentCurrent,
                INTENT_SELECTED: JSON.stringify(intentSelected, null, 2),
                INTENT_OTHERS: JSON.stringify(intentOthers, null, 2)
            });
            // Put the real intent values into the output template (instead of its placeholder names) and say exactly which labels are expected
            const expectedValues = [intentSelected.current_value, ...(intentSelected.other_values || [])];
            const placeholderNames = ['current_intent_value', 'first_alternative_intent_value', 'second_alternative_intent_value', 'third_alternative_intent_value'];
            let labelledPrompt = prompt;
            placeholderNames.forEach((placeholder, index) => {
                if (index < expectedValues.length) labelledPrompt = labelledPrompt.split(`"${placeholder}"`).join(JSON.stringify(String(expectedValues[index])));
            });
            labelledPrompt += styleExamplesSection(styleExamples);
            labelledPrompt += `\n\n**Important:** "component_variations" must contain exactly ${expectedValues.length} items, one for each of these intent values, and every "intent_value" must be copied exactly from this list (never a placeholder name): ${JSON.stringify(expectedValues)}.`;

            let parsedData = null;
            for (let attempt = 1; attempt <= 3 && !parsedData; attempt++) {
                const responseText = await llm.generateText(labelledPrompt);
                if (!responseText) continue;
                let candidate;
                try {
                    candidate = parseModelJson(responseText);
                } catch (parseError) {
                    console.warn(`Intent Change Rewriter: reply is not JSON (attempt ${attempt}/3)`);
                    continue;
                }
                if (!variationsMatchValues(candidate, expectedValues)) {
                    console.warn(`Intent Change Rewriter: versions do not match the requested values (attempt ${attempt}/3)`);
                    continue;
                }
                // Drop the versions that came back empty; the others are still shown. At least one version of another value has to be left
                candidate.component_variations = candidate.component_variations.filter(variation => variation.content.trim());
                if (candidate.component_variations.some(variation => normalizeName(variation.intent_value) !== normalizeName(expectedValues[0]))) {
                    parsedData = candidate;
                } else {
                    console.warn(`Intent Change Rewriter: no version of another value is left (attempt ${attempt}/3)`);
                }
            }
            if (!parsedData) throw new ModelOutputError('AI response did not match the requested intent values');
            return alignVariationValues(parsedData, intentSelected);
        },

        // After a version was used for an intent: which of the other units that share it no longer agree with the new value?
        // A unit the model does not answer for is reported as needing a change, so nothing is dropped silently
        async checkConsistency({ userTask, draftLatest, intentSelected, oldValue, source, targets }) {
            if (!intentSelected || !intentSelected.dimension || !source || !Array.isArray(targets) || targets.length === 0) {
                throw new ValidationError('intentSelected, source and targets are required');
            }
            const prompt = prompts.render('19intent_consistency_check.prompt.md', {
                USER_TASK: String(userTask || ''),
                DRAFT_LATEST: String(draftLatest || ''),
                INTENT: JSON.stringify({ dimension: intentSelected.dimension, old_value: oldValue || null, new_value: intentSelected.current_value }, null, 2),
                SOURCE: JSON.stringify({ title: source.title, text_before: source.oldContent, text_after: source.newContent }, null, 2),
                TARGETS: JSON.stringify(targets.map(({ id, title, content }) => ({ id, title, content })), null, 2)
            });
            const ids = new Set(targets.map(target => String(target.id)));
            const isUsable = (data) => Array.isArray(data) && data.length > 0
                && data.every(entry => entry && ids.has(String(entry.id)) && typeof entry.needs_change === 'boolean');
            let parsed;
            try {
                parsed = await requestJson(prompt, { reasoning: false }, isUsable);
            } catch (error) {
                throw failed('Failed to check consistency', error);
            }
            const answered = new Map(parsed.map(entry => [String(entry.id), entry]));
            return targets.map(target => {
                const entry = answered.get(String(target.id));
                return entry
                    ? { id: target.id, needs_change: entry.needs_change, reason: typeof entry.reason === 'string' ? entry.reason.trim() : '' }
                    : { id: target.id, needs_change: true, reason: '' };
            });
        },

        // Three new values for an intent after the writer rejected the ones shown
        async regenerateValues({ ref, userTask, draftLatest, intentDimension, currentValue, rejectedValues }) {
            if (!userTask || !draftLatest || !intentDimension || !currentValue || !Array.isArray(rejectedValues)) {
                throw new ValidationError('Missing required fields in the request body');
            }
            const choices = ref ? await filteredChoices(ref) : {};
            const prompt = prompts.render('17intent_regenerate_values.prompt.md', {
                USER_TASK: userTask,
                FACTOR_CHOICES: JSON.stringify(choices, null, 2),
                DRAFT_LATEST: draftLatest,
                INTENT_DIMENSION: intentDimension,
                CURRENT_VALUE: currentValue,
                REJECTED_VALUES: JSON.stringify(rejectedValues)
            });
            // Exactly 3 distinct, non-empty values that differ from the current and the rejected ones
            const normalizeValue = (value) => String(value).toLowerCase().replace(/^[\W_]+|[\W_]+$/g, '').replace(/\s+/g, ' ').trim();
            const excluded = new Set([currentValue, ...rejectedValues].map(normalizeValue));
            const isValidValues = (data) => {
                const list = data && data.other_values;
                if (!Array.isArray(list) || list.length !== 3) return false;
                if (!list.every(value => typeof value === 'string' && value.trim())) return false;
                const keys = list.map(normalizeValue);
                return new Set(keys).size === 3 && keys.every(key => !excluded.has(key));
            };
            try {
                const parsed = await requestJson(prompt, {}, isValidValues);
                return parsed.other_values.map(value => plainName(value));
            } catch (error) {
                throw failed('Failed to regenerate intent values', error);
            }
        },

        // The writer selected some words and said what to change
        async rewriteSelection({ userTask, ref, selectedContent, userPrompt }) {
            if (!userTask || !ref || !selectedContent || !userPrompt) throw new ValidationError('Missing required fields');
            const prompt = prompts.render('15prompt_AI_rewrite.prompt.md', {
                USER_TASK: userTask,
                DRAFT_LATEST: textOrEmpty(await sessions.readDraft(ref)),
                FACTOR_CHOICES: JSON.stringify(await filteredChoices(ref), null, 2),
                SELECTED_CONTENT: selectedContent,
                USER_PROMPT: userPrompt
            });
            let rewritten;
            try {
                rewritten = await llm.generateText(prompt);
            } catch (error) {
                throw failed(`Error generating rewrite: ${error.message}`, error);
            }
            if (!rewritten) throw failed('AI response is empty');
            return rewritten.trim();
        },

        // The writer asked for content to be added to the draft: the whole revised draft
        async addContent({ userTask, ref, currentDraft, userPrompt }) {
            if (!userTask || !ref || !currentDraft || !userPrompt) throw new ValidationError('Missing required fields');
            const prompt = prompts.render('16add_content.prompt.md', {
                USER_TASK: userTask,
                DRAFT_LATEST: currentDraft,
                FACTOR_CHOICES: JSON.stringify(await filteredChoices(ref), null, 2),
                USER_PROMPT: userPrompt
            });
            let revised;
            try {
                revised = await llm.generateText(prompt);
            } catch (error) {
                throw failed(`Error adding content: ${error.message}`, error);
            }
            if (!revised) throw failed('AI response is empty');
            return revised.trim();
        }
    };
}

module.exports = { createEmailServices };
