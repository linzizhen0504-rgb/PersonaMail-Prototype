const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3001;

require('dotenv').config({ path: path.join(__dirname, '../../.env') }); // 从项目根目录的 .env 读取环境变量
const geminiApiKey = process.env.GEMINI_API_KEY; // Gemini API Key
// 在 .env 中设置 OLLAMA_MODEL 后改用本地 Ollama；留空则使用 Gemini
const ollamaModel = process.env.OLLAMA_MODEL;
const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
if (!geminiApiKey && !ollamaModel) {
    console.error('缺少环境变量 GEMINI_API_KEY 或 OLLAMA_MODEL，请在项目根目录的 .env 文件中设置');
    process.exit(1);
}
const geminiApiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiApiKey}`;

 // 引用 factor_list.json

app.use(cors());
app.use(express.json());

const MAX_RETRIES = 5;

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'api_logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// API Monitoring Middleware
const apiLogger = (req, res, next) => {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Log request data
    const requestLog = {
        requestId,
        timestamp,
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: req.body,
        query: req.query,
        params: req.params
    };
    
    console.log(`\n🔵 [${timestamp}] ${req.method} ${req.url} - Request ID: ${requestId}`);
    console.log('📤 Request Data:', JSON.stringify(requestLog, null, 2));
    
    // Capture the original res.json method
    const originalJson = res.json;
    const originalSend = res.send;
    
    // Override res.json to capture response data
    res.json = function(data) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        const responseLog = {
            requestId,
            timestamp: new Date().toISOString(),
            statusCode: res.statusCode,
            data: data,
            duration: `${duration}ms`
        };
        
        console.log(`\n🟢 [${new Date().toISOString()}] ${req.method} ${req.url} - Response (${duration}ms)`);
        console.log('📥 Response Data:', JSON.stringify(responseLog, null, 2));
        
        // Save to log file
        saveApiLog(req.url, requestLog, responseLog);
        
        return originalJson.call(this, data);
    };
    
    // Override res.send to capture non-JSON responses
    res.send = function(data) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        const responseLog = {
            requestId,
            timestamp: new Date().toISOString(),
            statusCode: res.statusCode,
            data: data,
            duration: `${duration}ms`
        };
        
        console.log(`\n🟢 [${new Date().toISOString()}] ${req.method} ${req.url} - Response (${duration}ms)`);
        console.log('📥 Response Data:', JSON.stringify(responseLog, null, 2));
        
        // Save to log file
        saveApiLog(req.url, requestLog, responseLog);
        
        return originalSend.call(this, data);
    };
    
    next();
};

// Function to save API logs to file
const saveApiLog = (endpoint, requestLog, responseLog) => {
    try {
        const date = new Date().toISOString().split('T')[0];
        const logFileName = `api-logs-${date}.json`;
        const logFilePath = path.join(logsDir, logFileName);
        
        const logEntry = {
            endpoint: endpoint.replace(/[^a-zA-Z0-9-_]/g, '_'),
            request: requestLog,
            response: responseLog
        };
        
        let existingLogs = [];
        if (fs.existsSync(logFilePath)) {
            try {
                const fileContent = fs.readFileSync(logFilePath, 'utf-8');
                existingLogs = JSON.parse(fileContent);
            } catch (error) {
                console.warn('Could not parse existing log file:', error);
            }
        }
        
        existingLogs.push(logEntry);
        fs.writeFileSync(logFilePath, JSON.stringify(existingLogs, null, 2));
        
        console.log(`💾 Log saved to: ${logFilePath}`);
    } catch (error) {
        console.error('Error saving API log:', error);
    }
};

// Apply the logging middleware to all routes
app.use(apiLogger);

// Route to view API logs
app.get('/api-logs', (req, res) => {
    try {
        const { date, type } = req.query;
        const logDate = date || new Date().toISOString().split('T')[0];
        
        let logFileName;
        if (type === 'gemini') {
            logFileName = `gemini-logs-${logDate}.json`;
        } else {
            logFileName = `api-logs-${logDate}.json`;
        }
        
        const logFilePath = path.join(logsDir, logFileName);
        
        if (!fs.existsSync(logFilePath)) {
            return res.json({ 
                message: `No logs found for ${logDate}`,
                availableDates: getAvailableLogDates()
            });
        }
        
        const logs = JSON.parse(fs.readFileSync(logFilePath, 'utf-8'));
        
        res.json({
            date: logDate,
            type: type || 'api',
            totalEntries: logs.length,
            logs: logs,
            availableDates: getAvailableLogDates()
        });
    } catch (error) {
        console.error('Error reading logs:', error);
        res.status(500).json({ error: 'Error reading logs' });
    }
});

// Route to get available log dates
app.get('/api-logs/dates', (req, res) => {
    try {
        const dates = getAvailableLogDates();
        res.json({ availableDates: dates });
    } catch (error) {
        console.error('Error getting log dates:', error);
        res.status(500).json({ error: 'Error getting log dates' });
    }
});

// Helper function to get available log dates
const getAvailableLogDates = () => {
    try {
        const files = fs.readdirSync(logsDir);
        const dates = new Set();
        
        files.forEach(file => {
            if (file.match(/^(api|gemini)-logs-(\d{4}-\d{2}-\d{2})\.json$/)) {
                const match = file.match(/(\d{4}-\d{2}-\d{2})/);
                if (match) {
                    dates.add(match[1]);
                }
            }
        });
        
        return Array.from(dates).sort().reverse();
    } catch (error) {
        console.error('Error getting available dates:', error);
        return [];
    }
};

// Route to clear logs (for cleanup)
app.delete('/api-logs', (req, res) => {
    try {
        const { date, type } = req.query;
        
        if (date) {
            // Delete specific date logs
            let logFileName;
            if (type === 'gemini') {
                logFileName = `gemini-logs-${date}.json`;
            } else if (type === 'api') {
                logFileName = `api-logs-${date}.json`;
            } else {
                // Delete both types for the date
                const apiLogFile = `api-logs-${date}.json`;
                const geminiLogFile = `gemini-logs-${date}.json`;
                
                let deletedFiles = [];
                if (fs.existsSync(path.join(logsDir, apiLogFile))) {
                    fs.unlinkSync(path.join(logsDir, apiLogFile));
                    deletedFiles.push(apiLogFile);
                }
                if (fs.existsSync(path.join(logsDir, geminiLogFile))) {
                    fs.unlinkSync(path.join(logsDir, geminiLogFile));
                    deletedFiles.push(geminiLogFile);
                }
                
                return res.json({ 
                    message: `Deleted log files for ${date}`,
                    deletedFiles
                });
            }
            
            const logFilePath = path.join(logsDir, logFileName);
            if (fs.existsSync(logFilePath)) {
                fs.unlinkSync(logFilePath);
                res.json({ message: `Deleted ${logFileName}` });
            } else {
                res.status(404).json({ error: `Log file ${logFileName} not found` });
            }
        } else {
            // Clear all logs
            const files = fs.readdirSync(logsDir);
            const deletedFiles = [];
            
            files.forEach(file => {
                if (file.match(/^(api|gemini)-logs-.*\.json$/)) {
                    fs.unlinkSync(path.join(logsDir, file));
                    deletedFiles.push(file);
                }
            });
            
            res.json({ 
                message: 'All logs cleared',
                deletedFiles
            });
        }
    } catch (error) {
        console.error('Error clearing logs:', error);
        res.status(500).json({ error: 'Error clearing logs' });
    }
});


// 调用本地 Ollama，并把结果包装成 Gemini 的响应结构，供 sendRequestToGemini 复用后续逻辑
async function sendRequestToOllama(prompt, timeout) {
    const response = await axios.post(`${ollamaHost}/api/chat`, {
        model: ollamaModel,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        keep_alive: '30m',
        options: { num_ctx: 8192 }
    }, { timeout: timeout });
    return {
        status: response.status,
        data: {
            candidates: [{
                content: { parts: [{ text: response.data.message.content }] },
                finishReason: 'STOP'
            }]
        }
    };
}

// 本地小模型常把名称改写（下划线、大小写）或照抄提示词里的占位符，前端按原文精确匹配会失败。
// 以下两个函数仅在使用 Ollama 时调用，把模型输出对齐回原始的 intent 名称和取值。
const normalizeName = (name) => String(name).toLowerCase().replace(/[_\s]+/g, ' ').trim();

// Parse JSON from a model reply that may be wrapped in code fences, surrounded by prose,
// or markdown-escaped (e.g. `\[` and `current\_value`)
function parseModelJson(text) {
    const cleaned = String(text).replace(/```json|```/g, '').trim();
    const unescaped = cleaned.replace(/\\([\[\]_*])/g, '$1');
    const candidates = [];
    for (const candidate of [cleaned, unescaped]) {
        candidates.push(candidate);
        const start = candidate.search(/[\[{]/);
        const end = Math.max(candidate.lastIndexOf(']'), candidate.lastIndexOf('}'));
        if (start !== -1 && end > start) candidates.push(candidate.slice(start, end + 1));
    }
    let lastError;
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

// Ask the model and parse its reply as JSON, asking again when the reply is not usable
async function requestModelJson(prompt, options, validate, attempts = 3) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const responseText = await sendRequestToGemini(prompt, options);
            if (!responseText) throw new Error('AI response is empty');
            const parsed = parseModelJson(responseText);
            if (validate && !validate(parsed)) throw new Error('AI response has an unexpected shape');
            return parsed;
        } catch (error) {
            lastError = error;
            console.error(`Model JSON request failed (attempt ${attempt}/${attempts}):`, error.message);
        }
    }
    throw lastError;
}

// Keep only links that point at a real component and a real intent, with exact ids and names
function cleanLinks(links, componentList, intents) {
    if (!Array.isArray(links)) return [];
    const componentIds = new Map();
    componentList.forEach(component => {
        componentIds.set(normalizeName(component.id), component.id);
        if (component.title) componentIds.set(normalizeName(component.title), component.id);
    });
    const dimensions = new Map(intents.map(intent => [normalizeName(intent.dimension), intent.dimension]));
    const seen = new Set();
    const cleaned = [];
    links.forEach(link => {
        if (!link || !link.component_id || !link.intent_dimension) return;
        const componentId = componentIds.get(normalizeName(link.component_id));
        const dimension = dimensions.get(normalizeName(link.intent_dimension));
        if (!componentId || !dimension || seen.has(`${componentId}|${dimension}`)) return;
        seen.add(`${componentId}|${dimension}`);
        cleaned.push({ intent_dimension: dimension, component_id: componentId });
    });
    return cleaned;
}

// Make sure every component has at least one intent: ask the model again for the components it left out,
// then fall back to the most widely used intent for any that are still missing
async function ensureEveryComponentLinked(links, componentList, intents) {
    if (intents.length === 0) return links;
    const missing = () => componentList.filter(component => !links.some(link => link.component_id === component.id));

    if (missing().length > 0) {
        const prompt = `You are an AI assistant specializing in email communication strategy.

Each email component below must be linked to the writing intents that most influence how it is written.

Components:
${JSON.stringify(missing(), null, 2)}

Intents:
${JSON.stringify(intents.map(intent => ({ dimension: intent.dimension, current_value: intent.current_value })), null, 2)}

For EVERY component, choose the 1 or 2 intents whose strategy most affects that component's wording. Every component must appear at least once. Use the exact "id" of the component and the exact "dimension" of the intent.

Return ONLY a JSON array, with no commentary:
[{"intent_dimension": "...", "component_id": "..."}]`;
        try {
            const extra = await requestModelJson(prompt, {}, Array.isArray, 2);
            links = cleanLinks([...links, ...extra], componentList, intents);
        } catch (error) {
            console.error('Could not link the remaining components:', error.message);
        }
    }

    const stillMissing = missing();
    if (stillMissing.length > 0) {
        const counts = new Map(intents.map(intent => [intent.dimension, 0]));
        links.forEach(link => counts.set(link.intent_dimension, (counts.get(link.intent_dimension) || 0) + 1));
        const fallback = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
        stillMissing.forEach(component => links.push({ intent_dimension: fallback, component_id: component.id }));
    }
    return links;
}

const isIntentList = (data) => Array.isArray(data) && data.length > 0 && data.every(intent =>
    intent && typeof intent.dimension === 'string' && intent.dimension.trim() &&
    typeof intent.current_value === 'string' && intent.current_value.trim());

function alignVariationValues(parsedData, intentSelected) {
    const variations = parsedData?.component_variations;
    if (!Array.isArray(variations) || !intentSelected) return parsedData;
    const expected = [intentSelected.current_value, ...(intentSelected.other_values || [])];
    const byName = new Map(expected.map(value => [normalizeName(value), value]));
    variations.forEach(variation => {
        variation.intent_value = byName.get(normalizeName(variation.intent_value)) || variation.intent_value;
    });
    return parsedData;
}

// The model has to label every version with exactly one of the intent values it was asked about. Small local models
// often copy the template's placeholder names instead; guessing the value from the position then attaches a version
// to the wrong value, so such replies are rejected. A version may be empty (a value that says to leave the sentence out has
// nothing to show); the caller drops such versions.
function variationsMatchValues(parsedData, expectedValues) {
    const variations = parsedData && parsedData.component_variations;
    if (!Array.isArray(variations) || variations.length !== expectedValues.length) return false;
    const wanted = new Set(expectedValues.map(normalizeName));
    const seen = new Set();
    return variations.every(variation => {
        if (!variation || typeof variation.content !== 'string') return false;
        const key = normalizeName(variation.intent_value);
        if (!wanted.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

async function sendRequestToGemini(prompt, options = {}) {
    let retries = 0;
    const { enableThinking = false, timeout = 300000 } = options; // Default to 5 minutes timeout
    const geminiRequestId = `gemini-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    while (retries < MAX_RETRIES) {
        try {
            const requestBody = {
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    thinkingConfig: {
                        thinkingBudget: enableThinking ? 1000 : 0 
                    }
                }
            };

            console.log(`\n🤖 [${new Date().toISOString()}] Gemini API Request - ID: ${geminiRequestId}`);
            console.log('📤 Gemini Request Body:', JSON.stringify({
                ...requestBody,
                prompt_preview: prompt.substring(0, 200) + (prompt.length > 200 ? '...' : ''),
                full_prompt_length: prompt.length
            }, null, 2));

            const response = ollamaModel ? await sendRequestToOllama(prompt, timeout) : await axios.post(geminiApiEndpoint, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: timeout, // Use custom timeout from options
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                // Add connection timeout and keep-alive settings
                httpAgent: new (require('http').Agent)({ 
                    keepAlive: true, 
                    timeout: 60000 // 1 minute connection timeout
                }),
                httpsAgent: new (require('https').Agent)({ 
                    keepAlive: true, 
                    timeout: 60000 // 1 minute connection timeout
                })
            });

            console.log(`\n🟢 [${new Date().toISOString()}] Gemini API Response - ID: ${geminiRequestId}`);
            console.log('📥 Gemini Response:', JSON.stringify({
                status: response.status,
                candidates_count: response.data?.candidates?.length || 0,
                finish_reason: response.data?.candidates?.[0]?.finishReason || 'unknown',
                response_preview: response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.substring(0, 200) + '...' || 'No content',
                full_response_length: response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0
            }, null, 2));

            // Save Gemini interaction to log file
            saveGeminiLog(geminiRequestId, {
                prompt,
                requestBody,
                response: response.data,
                retryAttempt: retries
            });

            if (response.data && response.data.candidates && response.data.candidates.length > 0 &&
                response.data.candidates[0].content && response.data.candidates[0].content.parts &&
                response.data.candidates[0].content.parts.length > 0) {
                const finishReason = response.data.candidates[0].finishReason;
                if (finishReason && finishReason !== 'STOP') {
                     console.warn(`⚠️ Gemini response finished with reason: ${finishReason}`);
                }
                return response.data.candidates[0].content.parts[0].text;
            } else if (response.data?.promptFeedback?.blockReason) {
                 console.error(`❌ Gemini request blocked: ${response.data.promptFeedback.blockReason}`, response.data.promptFeedback);
                 throw new Error(`Gemini request blocked due to: ${response.data.promptFeedback.blockReason}`);
            } else {
                console.error('❌ Invalid response structure from Gemini:', response.data);
                throw new Error('Gemini 响应结构无效');
            }
        } catch (error) {
            const errorMessage = error.response?.data?.error?.message || error.message;
            const isSocketError = error.code === 'ECONNABORTED' || errorMessage.includes('socket hang up') || errorMessage.includes('timeout');
            
            console.error(`❌ Gemini 请求出错（第 ${retries + 1} 次尝试）:`, errorMessage, error.response?.data);
            
            // Log the error
            saveGeminiLog(geminiRequestId, {
                prompt,
                error: errorMessage,
                retryAttempt: retries,
                errorDetails: error.response?.data,
                errorCode: error.code
            });
            
            retries++;
            if (retries === MAX_RETRIES) throw new Error(`达到最大重试次数: ${errorMessage}`);
            
            // For socket errors, use longer delays: 10s, 20s, 40s, 80s between retries
            const baseDelay = isSocketError ? 5000 : 2500;
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * baseDelay));
        }
    }
    throw new Error('Gemini request failed after multiple retries.');
}

// Function to save Gemini-specific logs
const saveGeminiLog = (geminiRequestId, logData) => {
    try {
        const date = new Date().toISOString().split('T')[0];
        const logFileName = `gemini-logs-${date}.json`;
        const logFilePath = path.join(logsDir, logFileName);
        
        const logEntry = {
            timestamp: new Date().toISOString(),
            requestId: geminiRequestId,
            ...logData
        };
        
        let existingLogs = [];
        if (fs.existsSync(logFilePath)) {
            try {
                const fileContent = fs.readFileSync(logFilePath, 'utf-8');
                existingLogs = JSON.parse(fileContent);
            } catch (error) {
                console.warn('Could not parse existing Gemini log file:', error);
            }
        }
        
        existingLogs.push(logEntry);
        fs.writeFileSync(logFilePath, JSON.stringify(existingLogs, null, 2));
        
        console.log(`💾 Gemini log saved to: ${logFilePath}`);
    } catch (error) {
        console.error('Error saving Gemini log:', error);
    }
};





// 创建会话接口
app.post('/create-session', (req, res) => {
    const { userName, userInput } = req.body;

    if (!userName || !userInput) {
        return res.status(400).json({ error: 'userName 和 userInput 是必需的' });
    }

    const sessionDataPath = path.join(__dirname, '../data/SessionData');
    const userPath = path.join(sessionDataPath, userName);
    const taskId = `${userName}_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const taskPath = path.join(userPath, taskId);

    try {
        // 确保 SessionData 根目录存在
        if (!fs.existsSync(sessionDataPath)) {
            fs.mkdirSync(sessionDataPath, { recursive: true });
        }

        // 创建用户目录（如果不存在）
        if (!fs.existsSync(userPath)) {
            fs.mkdirSync(userPath, { recursive: true });
        }

        // 创建任务目录
        if (!fs.existsSync(taskPath)) {
            fs.mkdirSync(taskPath, { recursive: true });
        }

        // 创建子目录
        const subDirs = ['meta', 'factors', 'intents', 'drafts', 'localized', 'logs'];
        subDirs.forEach((subDir) => {
            const subDirPath = path.join(taskPath, subDir);
            if (!fs.existsSync(subDirPath)) {
                fs.mkdirSync(subDirPath, { recursive: true });
            }
        });

        // 创建 task.json 在 meta 目录中
        const taskJsonPath = path.join(taskPath, 'meta', 'task.json');
        const taskJsonContent = {
            user: userName,
            task_id: taskId,
            created_iso: new Date().toISOString(),
            original_task: "", // Set original_task to an empty string
        };
        fs.writeFileSync(taskJsonPath, JSON.stringify(taskJsonContent, null, 2));

        // 创建 intents/history.json
        const historyPath = path.join(taskPath, 'intents', 'history.json');
        fs.writeFileSync(historyPath, JSON.stringify([], null, 2));

        // 创建 intents/current.json
        const currentPath = path.join(taskPath, 'intents', 'current.json');
        fs.writeFileSync(currentPath, JSON.stringify([], null, 2));

        // 创建 factors/choices.json
        const choicesPath = path.join(taskPath, 'factors', 'choices.json');
        fs.writeFileSync(choicesPath, JSON.stringify({}, null, 2));

        // 创建 drafts/00_first.md, drafts/01_regen.md, drafts/latest.md
        const draftsPath = path.join(taskPath, 'drafts');
        fs.writeFileSync(path.join(draftsPath, '00_first.md'), '');
        fs.writeFileSync(path.join(draftsPath, '01_regen.md'), '');
        fs.writeFileSync(path.join(draftsPath, 'latest.md'), '');

        // 创建 localized/001_variation.json, localized/002_direct_rewrite.json
        const localizedPath = path.join(taskPath, 'localized');
        fs.writeFileSync(path.join(localizedPath, '001_variation.json'), JSON.stringify({}, null, 2));
        fs.writeFileSync(path.join(localizedPath, '002_direct_rewrite.json'), JSON.stringify({}, null, 2));

        // 创建 logs/regen_01.json
        const logsPath = path.join(taskPath, 'logs');
        fs.writeFileSync(path.join(logsPath, 'regen_01.json'), JSON.stringify({}, null, 2));

        res.status(200).json({ message: 'Session 数据已创建', taskId });
    } catch (error) {
        console.error('创建 SessionData 目录或文件时出错:', error);
        res.status(500).json({ error: '创建 SessionData 目录或文件时出错' });
    }
});

// 保存factor choices接口 - 修复重复定义问题
app.post('/save-factor-choices', (req, res) => {
    const { userName, factorChoices, taskId } = req.body;

    if (!userName || !factorChoices || !taskId) {
        return res.status(400).json({ error: 'userName、factorChoices 和 taskId 是必需的' });
    }

    // 使用传入的taskId构建路径
    const factorChoicesPath = path.join(__dirname, '../data/SessionData', userName, taskId, 'factors', 'choices.json');
    console.log('Saving factor choices to:', factorChoicesPath);

    try {
        // 确保目录存在
        const factorsDir = path.dirname(factorChoicesPath);
        if (!fs.existsSync(factorsDir)) {
            fs.mkdirSync(factorsDir, { recursive: true });
        }

        fs.writeFileSync(factorChoicesPath, JSON.stringify(factorChoices, null, 2));
        res.status(200).json({ message: 'Factor choices saved successfully' });
    } catch (error) {
        console.error('Error saving factor choices:', error);
        res.status(500).json({ error: 'Error saving factor choices' });
    }
});

// Function to filter factorChoices into simple id-value pairs
function filterFactorChoices(factorChoices) {
    const filtered = {};
    
    for (const [factorId, factorData] of Object.entries(factorChoices)) {
        if (factorData.options && factorData.options.length > 0) {
            // Extract the first option's value (since most factors seem to have single selection)
            filtered[factorId] = factorData.options[0].value;
        }
    }
    
    return filtered;
}



app.post('/generate-first-draft', async (req, res) => {
    const { userTask, factorChoices } = req.body;
    // Debug: Print variable type and value of factorChoices

    if (!userTask || !factorChoices) {
        return res.status(400).json({ error: 'userTask and factorChoices are required' });
    }

    const promptPath = path.join(__dirname, '../../public/data/Prompts/4first_draft_composer.prompt.md');
    let promptTemplate;

    try {
        promptTemplate = fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
        console.error('Failed to load 4first_draft_composer.prompt.md:', error);
        return res.status(500).json({ error: 'Failed to load prompt template' });
    }
    const filteredFactorChoices = filterFactorChoices(factorChoices);
    const prompt = promptTemplate
        .replace('{{USER_TASK}}', userTask)
        .replace('{{FACTOR_CHOICES}}', JSON.stringify(filteredFactorChoices, null, 2));

    try {
        const draftContent = await sendRequestToGemini(prompt, { enableThinking: true, timeout: 120000 }); // 2 minutes timeout

        if (!draftContent) {
            throw new Error('AI response is empty');
        }

        res.json({ draft: draftContent.trim() });
    } catch (error) {
        console.error('Error generating first draft:', error);
        res.status(500).json({ error: 'Failed to generate first draft' });
    }
});


// 提供 SessionData 文件的静态访问
app.get('/sessiondata/:taskId/*', (req, res) => {
    const { taskId } = req.params;
    const filePath = req.params[0]; // 获取剩余的路径部分
    
    // 从 taskId 中提取用户名（假设格式为 userName_timestamp）
    const userName = taskId.split('_')[0];
    
    const fullPath = path.join(__dirname, '../data/SessionData', userName, taskId, filePath);
    
    console.log('请求文件路径:', fullPath);
    
    // 检查文件是否存在
    if (!fs.existsSync(fullPath)) {
        console.error('文件不存在:', fullPath);
        return res.status(404).json({ error: '文件不存在' });
    }
    
    try {
        // 根据文件扩展名设置正确的 Content-Type
        const ext = path.extname(fullPath).toLowerCase();
        if (ext === '.json') {
            res.setHeader('Content-Type', 'application/json');
            const content = fs.readFileSync(fullPath, 'utf-8');
            res.send(content);
        } else if (ext === '.md') {
            res.setHeader('Content-Type', 'text/plain');
            const content = fs.readFileSync(fullPath, 'utf-8');
            res.send(content);
        } else {
            res.sendFile(fullPath);
        }
    } catch (error) {
        console.error('读取文件时出错:', error);
        res.status(500).json({ error: '读取文件时出错' });
    }
});





app.post('/sessiondata/:taskId/drafts/latest.md', (req, res) => {
    const { taskId } = req.params;
    if (!taskId) {
        console.error('Missing taskId in request');
        return res.status(400).json({ error: 'Missing taskId' });
    }
    const { content } = req.body;

    console.log('Received taskId:', taskId); // Log taskId
    console.log('Received content:', content); // Log content
    if (!content) {
        return res.status(400).json({ error: 'Content is required' });
    }

    // Extract the username from the taskId
    const userName = taskId.split('_')[0];
    const filePath = path.join(__dirname, '../data/SessionData', userName, taskId, 'drafts', 'latest.md');
    console.log('Generated filePath:', filePath); // Log filePath

    try {
        // Ensure the drafts directory exists
        const draftsDir = path.dirname(filePath);
        if (!fs.existsSync(draftsDir)) {
            fs.mkdirSync(draftsDir, { recursive: true });
        }

        fs.writeFileSync(filePath, content, 'utf-8');
        // Log the content written to the file
        const writtenContent = fs.readFileSync(filePath, 'utf-8');
        console.log('Content written to file:', writtenContent);
        res.status(200).json({ message: 'Content saved successfully.' });
    } catch (error) {
        console.error('Error saving content to latest.md:', error);
        res.status(500).json({ error: 'Failed to save content.' });
    }
});





// ... existing code ...

// ... existing code ...









app.post('/component-extractor', async (req, res) => {
    const { taskId, userName } = req.body;

    if (!taskId || !userName) {
        return res.status(400).json({ error: 'Missing required fields: taskId or userName' });
    }

    const promptPath = path.join(__dirname, '../../public/data/Prompts/5component_extractor.prompt.md');
    const latestDraftPath = path.join(__dirname, '../data/SessionData', userName, taskId, 'drafts', 'latest.md');

    let promptTemplate;
    try {
        promptTemplate = fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
        console.error('Failed to load 5component_extractor.prompt.md:', error);
        return res.status(500).json({ error: 'Failed to load prompt template' });
    }

    let draftContent;
    try {
        if (fs.existsSync(latestDraftPath)) {
            draftContent = fs.readFileSync(latestDraftPath, 'utf-8').trim();
        } else {
            return res.status(404).json({ error: 'latest.md not found' });
        }
    } catch (error) {
        console.error('Failed to read latest.md:', error);
        return res.status(500).json({ error: 'Failed to read latest.md' });
    }

    const prompt = promptTemplate.replace('{{DRAFT_LATEST}}', draftContent);

    try {
        const responseText = await sendRequestToGemini(prompt);

        if (!responseText) {
            return res.status(500).json({ error: 'AI response is empty' });
        }

        console.log('Component Extractor Output:', responseText);
        res.json({ components: responseText });
    } catch (error) {
        console.error('Error in Component Extractor:', error);
        res.status(500).json({ error: 'Error in Component Extractor' });
    }
});

app.post('/intent-analyzer-new', async (req, res) => {
    const { userTask, userName, taskId } = req.body;

    if (!userTask || !userName || !taskId) {
        return res.status(400).json({ error: 'Missing required fields: userTask, userName, or taskId' });
    }

    const promptPath = path.join(__dirname, '../../public/data/Prompts/3intent_analyzer_prompt.md');
    const factorChoicesPath = path.join(__dirname, '../data/SessionData', userName, taskId, 'factors', 'choices.json');
    const latestDraftPath = path.join(__dirname, '../data/SessionData', userName, taskId, 'drafts', 'latest.md');
    const intentsPath = path.join(__dirname, '../data/SessionData', userName, taskId, 'intents', 'current.json');

    let promptTemplate;
    try {
        promptTemplate = fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
        console.error('Failed to load 3intent_analyzer_prompt.md:', error);
        return res.status(500).json({ error: 'Failed to load prompt template' });
    }

    let factorChoices;
    try {
        factorChoices = fs.readFileSync(factorChoicesPath, 'utf-8');
    } catch (error) {
        console.error('Failed to read factor choices:', error);
        return res.status(500).json({ error: 'Failed to read factor choices' });
    }

    let latestDraft;
    try {
        latestDraft = fs.readFileSync(latestDraftPath, 'utf-8');
    } catch (error) {
        console.error('Failed to read latest draft:', error);
        return res.status(500).json({ error: 'Failed to read latest draft' });
    }
    
    const prompt = promptTemplate
        .replace('{{USER_TASK}}', userTask)
        .replace('{{FACTOR_CHOICES}}', factorChoices)
        .replace('{{DRAFT_LATEST}}', latestDraft);

    try {
        let parsedData;
        try {
            parsedData = await requestModelJson(prompt, { enableThinking: false }, isIntentList);
        } catch (error) {
            console.error('Failed to get intents as JSON:', error);
            return res.status(500).json({ error: 'Failed to parse AI response as JSON' });
        }
        parsedData = parsedData.map(intent => ({
            ...intent,
            other_values: Array.isArray(intent.other_values) ? intent.other_values.filter(value => typeof value === 'string' && value.trim()) : []
        }));

        // Ensure the intents directory exists
        const intentsDir = path.dirname(intentsPath);
        if (!fs.existsSync(intentsDir)) {
            fs.mkdirSync(intentsDir, { recursive: true });
        }

        // Save the parsed data to current.json
        try {
            fs.writeFileSync(intentsPath, JSON.stringify(parsedData, null, 2), 'utf-8');
        } catch (error) {
            console.error('Failed to write to current.json:', error);
            return res.status(500).json({ error: 'Failed to save intents to current.json' });
        }

        res.json({ message: 'Intents saved successfully', intents: parsedData });
    } catch (error) {
        console.error('Error in Intent Analyzer New:', error);
        res.status(500).json({ error: 'Error in Intent Analyzer New' });
    }
});



app.post('/component-intent-link', async (req, res) => {
    const { userName, taskId, componentList } = req.body;

    if (!userName || !taskId || !componentList) {
        return res.status(400).json({ error: 'Missing required fields: userName, taskId, or componentList' });
    }

    const promptPath = path.join(__dirname, '../../public/data/Prompts/6component_intent_link.prompt.md');
    const intentsPath = path.join(__dirname, '../data/SessionData', userName, taskId, 'intents', 'current.json');

    let promptTemplate;
    try {
        promptTemplate = fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
        console.error('Failed to load 6component_intent_link.prompt.md:', error);
        return res.status(500).json({ error: 'Failed to load prompt template' });
    }

    let intentCurrent;
    try {
        intentCurrent = fs.readFileSync(intentsPath, 'utf-8');
    } catch (error) {
        console.error('Failed to read current intents:', error);
        return res.status(500).json({ error: 'Failed to read current intents' });
    }

    const prompt = promptTemplate
        .replace('{{COMPONENT_LIST}}', JSON.stringify(componentList, null, 2))
        .replace('{{INTENT_CURRENT}}', intentCurrent);

    try {
        const intents = JSON.parse(intentCurrent);
        let links = [];
        try {
            links = await requestModelJson(prompt, {}, Array.isArray, 2);
        } catch (error) {
            console.error('Component-Intent Link output could not be parsed:', error.message);
        }
        links = cleanLinks(links, componentList, intents);
        links = await ensureEveryComponentLinked(links, componentList, intents);
        console.log('Component-Intent Link Output:', JSON.stringify(links, null, 2));
        res.json({ links });
    } catch (error) {
        console.error('Error in Component-Intent Link:', error);
        res.status(500).json({ error: 'Error in Component-Intent Link' });
    }
});


app.post('/intent-change-rewriter', async (req, res) => {
    const {
        userName,
        taskId,
        userTask,

        draftLatest,
        componentCurrent,
        intentSelected,
        intentOthers
    } = req.body;
    const factorChoicesPath = path.join(__dirname, '../data/SessionData', userName, taskId, 'factors', 'choices.json');
    // declared here: without it the assignment made a global shared by all requests, so a failed read kept another request's choices
    let factorChoices;
    try {
    factorChoices = JSON.parse(fs.readFileSync(factorChoicesPath, 'utf-8'));
        } catch (error) {
            console.warn('Could not load factor choices:', error);
        }

    if (!userTask || !factorChoices || !draftLatest || !componentCurrent || !intentSelected || !intentOthers) {
        return res.status(400).json({ error: 'Missing required fields in the request body' });
    }

    const promptPath = path.join(__dirname, '../../public/data/Prompts/7intent_change_rewriter.prompt.md');

    let promptTemplate;
    try {
        promptTemplate = fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
        console.error('Failed to load 7intent_change_rewriter.prompt.md:', error);
        return res.status(500).json({ error: 'Failed to load prompt template' });
    }
    const filteredFactorChoices = filterFactorChoices(factorChoices)
    const prompt = promptTemplate
        .replace('{{USER_TASK}}', userTask)
        .replace('{{FACTOR_CHOICES}}', JSON.stringify(filteredFactorChoices, null, 2))
        .replace('{{DRAFT_LATEST}}', draftLatest)
        .replace('{{COMPONENT_CURRENT}}', componentCurrent)
        .replace('{{INTENT_SELECTED}}', JSON.stringify(intentSelected, null, 2))
        .replace('{{INTENT_OTHERS}}', JSON.stringify(intentOthers, null, 2));

    // Put the real intent values into the output template (instead of its placeholder names) and say exactly which
    // labels are expected
    const expectedValues = [intentSelected.current_value, ...(intentSelected.other_values || [])];
    const placeholders = ['current_intent_value', 'first_alternative_intent_value', 'second_alternative_intent_value', 'third_alternative_intent_value'];
    let labelledPrompt = prompt;
    placeholders.forEach((placeholder, index) => {
        if (index < expectedValues.length) {
            labelledPrompt = labelledPrompt.split(`"${placeholder}"`).join(JSON.stringify(String(expectedValues[index])));
        }
    });
    labelledPrompt += `\n\n**Important:** "component_variations" must contain exactly ${expectedValues.length} items, one for each of these intent values, and every "intent_value" must be copied exactly from this list (never a placeholder name): ${JSON.stringify(expectedValues)}.`;

    try {
        let parsedData = null;
        for (let attempt = 1; attempt <= 3 && !parsedData; attempt++) {
            const responseText = await sendRequestToGemini(labelledPrompt);
            if (!responseText) continue;
            let candidate;
            try {
                candidate = parseModelJson(responseText);
            } catch (parseError) {
                console.warn(`Intent Change Rewriter: reply is not JSON (attempt ${attempt}/3)`);
                continue;
            }
            if (variationsMatchValues(candidate, expectedValues)) {
                // Drop the versions that came back empty; the others are still shown. At least one version of another value has to be left
                const kept = candidate.component_variations.filter(variation => variation.content.trim());
                if (kept.length < candidate.component_variations.length) {
                    console.warn(`Intent Change Rewriter: dropped ${candidate.component_variations.length - kept.length} empty version(s)`);
                }
                candidate.component_variations = kept;
                if (kept.some(variation => normalizeName(variation.intent_value) !== normalizeName(expectedValues[0]))) {
                    parsedData = candidate;
                } else {
                    console.warn(`Intent Change Rewriter: no version of another value is left (attempt ${attempt}/3)`);
                }
            } else {
                console.warn(`Intent Change Rewriter: versions do not match the requested values (attempt ${attempt}/3)`);
            }
        }
        if (!parsedData) {
            return res.status(500).json({ error: 'AI response did not match the requested intent values' });
        }

        res.json(alignVariationValues(parsedData, intentSelected));
    } catch (error) {
        console.error('Error in Intent Change Rewriter:', error);
        res.status(500).json({ error: 'Error in Intent Change Rewriter' });
    }
});


// Propose new alternative values for one intent after the user rejected every version shown for it
app.post('/intent-regenerate-values', async (req, res) => {
    const { userName, taskId, userTask, draftLatest, intentDimension, currentValue, rejectedValues } = req.body;

    if (!userTask || !draftLatest || !intentDimension || !currentValue || !Array.isArray(rejectedValues)) {
        return res.status(400).json({ error: 'Missing required fields in the request body' });
    }

    const promptPath = path.join(__dirname, '../../public/data/Prompts/17intent_regenerate_values.prompt.md');
    let promptTemplate;
    try {
        promptTemplate = fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
        console.error('Failed to load 17intent_regenerate_values.prompt.md:', error);
        return res.status(500).json({ error: 'Failed to load prompt template' });
    }

    let factorChoices = {};
    if (userName && taskId) {
        try {
            const factorChoicesPath = path.join(__dirname, '../data/SessionData', userName, taskId, 'factors', 'choices.json');
            factorChoices = JSON.parse(fs.readFileSync(factorChoicesPath, 'utf-8'));
        } catch (error) {
            console.warn('Could not load factor choices:', error.message);
        }
    }

    const values = {
        USER_TASK: userTask,
        FACTOR_CHOICES: JSON.stringify(filterFactorChoices(factorChoices), null, 2),
        DRAFT_LATEST: draftLatest,
        INTENT_DIMENSION: intentDimension,
        CURRENT_VALUE: currentValue,
        REJECTED_VALUES: JSON.stringify(rejectedValues)
    };
    const prompt = promptTemplate.replace(/\{\{([A-Z_]+)\}\}/g, (match, key) => (key in values ? values[key] : match));

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
        const parsed = await requestModelJson(prompt, {}, isValidValues);
        res.json({ other_values: parsed.other_values.map(value => value.trim()) });
    } catch (error) {
        console.error('Error in Intent Regenerate Values:', error);
        res.status(500).json({ error: 'Failed to regenerate intent values' });
    }
});

app.post('/ai-generate-rewrite', async (req, res) => {
    const { userTask, userName, taskId, selectedContent, userPrompt } = req.body;

    if (!userTask || !userName || !taskId || !selectedContent || !userPrompt) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Load the prompt template
        const promptPath = path.join(__dirname, '../../public/data/Prompts/15prompt_AI_rewrite.prompt.md');
        const promptTemplate = fs.readFileSync(promptPath, 'utf-8');

        // Load draft latest
        const draftPath = path.join(__dirname, '../data/SessionData', userName, taskId, 'drafts', 'latest.md');
        const draftLatest = fs.existsSync(draftPath) ? fs.readFileSync(draftPath, 'utf-8') : '';

        // Load factor choices
        const factorChoicesPath = path.join(__dirname, '../data/SessionData', userName, taskId, 'factors', 'choices.json');
        const factorChoices = fs.existsSync(factorChoicesPath) ? JSON.parse(fs.readFileSync(factorChoicesPath, 'utf-8')) : {};
        const filteredFactorChoices = filterFactorChoices(factorChoices)
        // Replace placeholders in the prompt
        const prompt = promptTemplate
            .replace('{{USER_TASK}}', userTask)
            .replace('{{DRAFT_LATEST}}', draftLatest)
            .replace('{{FACTOR_CHOICES}}', JSON.stringify(filteredFactorChoices, null, 2))
            .replace('{{SELECTED_CONTENT}}', selectedContent)
            .replace('{{USER_PROMPT}}', userPrompt);

        // Call Gemini API
        const rewrittenContent = await sendRequestToGemini(prompt);

        if (!rewrittenContent) {
            return res.status(500).json({ error: 'AI response is empty' });
        }

        res.json({ rewrittenContent: rewrittenContent.trim() });
    } catch (error) {
        console.error('Error in AI generate rewrite:', error);
        res.status(500).json({ error: 'Error generating rewrite: ' + error.message });
    }
});

// Experiment event log: append one JSON line per event to src/data/logs/{pid}.jsonl
app.post('/log-event', (req, res) => {
    try {
        const record = req.body || {};
        const pid = String(record.pid || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown';
        const logDir = path.join(__dirname, '../data/logs');
        fs.mkdirSync(logDir, { recursive: true });
        fs.appendFileSync(path.join(logDir, `${pid}.jsonl`), JSON.stringify(record) + '\n');
        res.json({ ok: true });
    } catch (error) {
        console.error('Error writing experiment log:', error);
        res.status(500).json({ error: 'Failed to write log' });
    }
});

app.post('/ai-add-content', async (req, res) => {
    const { userTask, userName, taskId, currentDraft, userPrompt } = req.body;

    if (!userTask || !userName || !taskId || !currentDraft || !userPrompt) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // Load the prompt template
        const promptPath = path.join(__dirname, '../../public/data/Prompts/16add_content.prompt.md');
        const promptTemplate = fs.readFileSync(promptPath, 'utf-8');

        // Load factor choices
        const factorChoicesPath = path.join(__dirname, '../data/SessionData', userName, taskId, 'factors', 'choices.json');
        const factorChoices = fs.existsSync(factorChoicesPath) ? JSON.parse(fs.readFileSync(factorChoicesPath, 'utf-8')) : {};
        const filteredFactorChoices = filterFactorChoices(factorChoices)
        // Replace placeholders in the prompt (function replacements keep `$` in user text literal)
        const prompt = promptTemplate
            .replace('{{USER_TASK}}', () => userTask)
            .replace('{{DRAFT_LATEST}}', () => currentDraft)
            .replace('{{FACTOR_CHOICES}}', () => JSON.stringify(filteredFactorChoices, null, 2))
            .replace('{{USER_PROMPT}}', () => userPrompt);

        // Call Gemini API
        const revisedDraft = await sendRequestToGemini(prompt);

        if (!revisedDraft) {
            return res.status(500).json({ error: 'AI response is empty' });
        }

        res.json({ revisedDraft: revisedDraft.trim() });
    } catch (error) {
        console.error('Error in AI add content:', error);
        res.status(500).json({ error: 'Error adding content: ' + error.message });
    }
});


// 更新任务元数据接口
app.post('/update-task-meta', (req, res) => {
    const { userName, taskId, originalTask } = req.body;

    if (!userName || !taskId || originalTask === undefined) {
        return res.status(400).json({ error: 'userName, taskId, and originalTask are required' });
    }

    const taskMetaPath = path.join(__dirname, '../data/SessionData', userName, taskId, 'meta', 'task.json');

    try {
        // 读取现有的 task.json
        let taskMeta = {};
        if (fs.existsSync(taskMetaPath)) {
            taskMeta = JSON.parse(fs.readFileSync(taskMetaPath, 'utf-8'));
        }

        // 更新 original_task 字段
        taskMeta.original_task = originalTask;

        // 确保目录存在
        const metaDir = path.dirname(taskMetaPath);
        if (!fs.existsSync(metaDir)) {
            fs.mkdirSync(metaDir, { recursive: true });
        }

        // 写入更新后的内容
        fs.writeFileSync(taskMetaPath, JSON.stringify(taskMeta, null, 2));
        
        res.status(200).json({ message: 'Task meta updated successfully' });
    } catch (error) {
        console.error('Error updating task meta:', error);
        res.status(500).json({ error: 'Error updating task meta' });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});