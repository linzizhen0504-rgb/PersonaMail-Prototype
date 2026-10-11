const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const app = express();
const port = 3002;

const doubaoApiKey = 'ENTER YOUR KEY HERE';
const doubaoApiEndpoint = 'https://ark.cn-beijing.volces.com/api/v3/images/generations';

app.use(cors());
app.use(express.json());

const MAX_RETRIES = 3;

async function sendRequestToDoubao(prompt, options = {}) {
    let retries = 0;
    const { size = "1200x600", guidance_scale = 3 } = options;

    while (retries < MAX_RETRIES) {
        try {
            const requestBody = {
                model: "doubao-seedream-3-0-t2i-250415",
                prompt: prompt,
                response_format: "url",
                size: size,
                guidance_scale: guidance_scale,
                watermark: false
            };

            console.log('Request Body:', JSON.stringify(requestBody, null, 2));

            const response = await axios.post(doubaoApiEndpoint, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${doubaoApiKey}`
                }
            });

            console.log('Doubao API Response:', response.data);

            if (response.data && response.data.data && response.data.data.length > 0) {
                return response.data.data[0].url;
            } else {
                console.error('Invalid response structure from Doubao:', response.data);
                throw new Error('豆包响应结构无效');
            }
        } catch (error) {
            const errorMessage = error.response?.data?.error?.message || error.message;
            console.error(`豆包请求出错（第 ${retries + 1} 次尝试）:`, errorMessage, error.response?.data);
            retries++;
            if (retries === MAX_RETRIES) throw new Error(`达到最大重试次数: ${errorMessage}`);
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
        }
    }
    throw new Error('Doubao request failed after multiple retries.');
}

app.post('/generate-image', async (req, res) => {
    const { anchorType, anchorTitle, anchorDescription } = req.body;
    
    if (!anchorType || !anchorTitle || !anchorDescription) {
        return res.status(400).json({ error: "缺少 anchorType、anchorTitle 或 anchorDescription 参数" });
    }

    try {
        // 加载图像生成提示模板
        const promptPath = path.join(__dirname, '../../public/data/Prompts/12anchor_image_generation.md');
        let promptTemplate;
        try {
            promptTemplate = fs.readFileSync(promptPath, 'utf-8');
        } catch (error) {
            console.error('加载图像生成提示模板失败:', error);
            return res.status(500).json({ error: '加载提示模板失败' });
        }

        // 替换模板中的占位符
        const prompt = promptTemplate
            .replace('{{ANCHOR_TYPE}}', anchorType)
            .replace('{{ANCHOR_TITLE}}', anchorTitle)
            .replace('{{ANCHOR_DESCRIPTION}}', anchorDescription);

        const imageUrl = await sendRequestToDoubao(prompt);
        
        if (!imageUrl) {
            return res.status(500).json({ error: '豆包响应为空' });
        }
        
        res.json({ imageUrl: imageUrl });
    } catch (error) {
        console.error('生成图像出错:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取文件夹中下一个序号
function getNextImageNumber(folderPath, prefix) {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        return 1;
    }
    
    const files = fs.readdirSync(folderPath);
    const imageFiles = files.filter(file => file.startsWith(prefix) && file.endsWith('.png'));
    
    if (imageFiles.length === 0) return 1;
    
    const numbers = imageFiles.map(file => {
        const match = file.match(new RegExp(`${prefix}(\\d+)\\.png`));
        return match ? parseInt(match[1]) : 0;
    });
    
    return Math.max(...numbers) + 1;
}

// 下载并保存图片
function downloadImage(url, filePath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(filePath);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve(filePath);
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => {});
            reject(err);
        });
    });
}

app.post('/generate-and-save-images', async (req, res) => {
    const { userName, personaAnchor, situationAnchor, userTask, taskId } = req.body;
    
    if (!userName || !personaAnchor || !situationAnchor) {
        return res.status(400).json({ error: '缺少必要参数' });
    }
    
    try {
        // 生成PersonaAnchor图片
        const personaResponse = await axios.post('http://localhost:3002/generate-image', {
            anchorType: 'PersonaAnchor',
            anchorTitle: personaAnchor.title,
            anchorDescription: personaAnchor.description
        });
        
        // 生成SituationAnchor图片
        const situationResponse = await axios.post('http://localhost:3002/generate-image', {
            anchorType: 'SituationAnchor',
            anchorTitle: situationAnchor.title,
            anchorDescription: situationAnchor.description
        });
        
        // 设置保存路径
        const personaFolderPath = path.join(__dirname, '../data/SessionData', userName, 'PersonaAnchor');
        const situationFolderPath = path.join(__dirname, '../data/SessionData', userName, 'SituationAnchor');
        
        // 获取下一个序号
        const personaNumber = getNextImageNumber(personaFolderPath, 'PersonaAnchor');
        const situationNumber = getNextImageNumber(situationFolderPath, 'SituationAnchor');
        
        // 设置文件路径
        const personaImagePath = path.join(personaFolderPath, `PersonaAnchor${personaNumber}.png`);
        const situationImagePath = path.join(situationFolderPath, `SituationAnchor${situationNumber}.png`);
        
        // 下载并保存图片
        await downloadImage(personaResponse.data.imageUrl, personaImagePath);
        await downloadImage(situationResponse.data.imageUrl, situationImagePath);
        
        // 保存JSON文件
        const personaJsonPath = path.join(personaFolderPath, `PersonaAnchor${personaNumber}.json`);
        const situationJsonPath = path.join(situationFolderPath, `SituationAnchor${situationNumber}.json`);
        
        const personaData = { ...personaAnchor, userTask, taskId };
        const situationData = { ...situationAnchor, userTask, taskId };
        
        fs.writeFileSync(personaJsonPath, JSON.stringify(personaData, null, 2));
        fs.writeFileSync(situationJsonPath, JSON.stringify(situationData, null, 2));
        
        res.json({
            success: true,
            personaImage: `PersonaAnchor${personaNumber}.png`,
            situationImage: `SituationAnchor${situationNumber}.png`,
            personaImagePath: personaImagePath,
            situationImagePath: situationImagePath,
            personaJsonPath: personaJsonPath,
            situationJsonPath: situationJsonPath
        });
    } catch (error) {
        console.error('生成和保存图片出错:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/regenerate-image', async (req, res) => {
    const { anchorType, anchorTitle, anchorDescription, imagePath } = req.body;
    
    if (!anchorType || !anchorTitle || !anchorDescription || !imagePath) {
        return res.status(400).json({ error: '缺少必要参数' });
    }

    try {
        // 加载图像生成提示模板
        const promptPath = path.join(__dirname, '../../public/data/Prompts/12anchor_image_generation.md');
        let promptTemplate;
        try {
            promptTemplate = fs.readFileSync(promptPath, 'utf-8');
        } catch (error) {
            console.error('加载图像生成提示模板失败:', error);
            return res.status(500).json({ error: '加载提示模板失败' });
        }

        // 替换模板中的占位符
        const prompt = promptTemplate
            .replace('{{ANCHOR_TYPE}}', anchorType)
            .replace('{{ANCHOR_TITLE}}', anchorTitle)
            .replace('{{ANCHOR_DESCRIPTION}}', anchorDescription);

        const imageUrl = await sendRequestToDoubao(prompt);
        
        if (!imageUrl) {
            return res.status(500).json({ error: '豆包响应为空' });
        }
        
        // 覆盖现有图片
        await downloadImage(imageUrl, imagePath);
        
        res.json({ success: true, imageUrl: imageUrl });
    } catch (error) {
        console.error('重新生成图像出错:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`豆包图像生成服务运行在 http://localhost:${port}`);
});