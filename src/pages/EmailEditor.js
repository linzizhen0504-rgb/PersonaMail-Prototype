import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createEditor, Editor, Transforms, Range, Text } from 'slate';
import { Slate, Editable, withReact, useSlate, ReactEditor } from 'slate-react';
import { Card, Typography, message, Button, Row, Col, Tooltip, Tag, Radio, Checkbox, Flex, Modal, Input } from 'antd';
import axios from 'axios';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGlobalContext } from '../App';
import stylebookSVG from '../stylebook.svg';

const { Title } = Typography;

// Helper functions for text formatting
const toggleFormat = (editor, format) => {
    try {
        const isActive = isFormatActive(editor, format);
        if (isActive) {
            Editor.removeMark(editor, format);
        } else {
            Editor.addMark(editor, format, true);
        }
    } catch (error) {
        console.warn('Error toggling format:', error);
    }
};

const isFormatActive = (editor, format) => {
    try {
        const marks = Editor.marks(editor);
        return marks ? marks[format] === true : false;
    } catch (error) {
        console.warn('Error checking format active state:', error);
        return false;
    }
};

const toggleBlock = (editor, format) => {
    try {
        const isActive = isBlockActive(editor, format);
        const isList = ['numbered-list', 'bulleted-list'].includes(format);

        Transforms.unwrapNodes(editor, {
            match: n => ['numbered-list', 'bulleted-list'].includes(n.type),
            split: true,
        });

        Transforms.setNodes(editor, {
            type: isActive ? 'paragraph' : isList ? 'list-item' : format,
        });

        if (!isActive && isList) {
            const block = { type: format, children: [] };
            Transforms.wrapNodes(editor, block);
        }
    } catch (error) {
        console.warn('Error toggling block:', error);
    }
};

const isBlockActive = (editor, format) => {
    try {
        const [match] = Editor.nodes(editor, {
            match: n => n.type === format,
        });
        return !!match;
    } catch (error) {
        console.warn('Error checking block active state:', error);
        return false;
    }
};

// Safe node text extraction
const getNodeText = (editor, node) => {
    try {
        if (!node || typeof node !== 'object') {
            return '';
        }
        
        if (node.children && Array.isArray(node.children)) {
            return node.children.map(child => {
                if (typeof child === 'string') {
                    return child;
                } else if (child && typeof child === 'object' && child.text !== undefined) {
                    return child.text;
                } else if (child && child.children) {
                    return getNodeText(editor, child);
                }
                return '';
            }).join('');
        }
        
        if (node.text !== undefined) {
            return node.text;
        }
        
        return '';
    } catch (error) {
        console.error('Error processing node:', node, error);
        return '';
    }
};



const EmailEditor = () => {
    const location = useLocation();
    const { state } = location;
    // 刷新页面或从侧栏进入时路由 state 会丢失，此时从后端保存的 meta/task.json 恢复任务内容
    const [recoveredUserTask, setRecoveredUserTask] = useState('');
    const userTask = state?.userTask || recoveredUserTask;
    const navigate = useNavigate();
    const editor = useMemo(() => withReact(createEditor()), []);
    const { globalState } = useGlobalContext();
    const { username: globalUsername, taskId: globalTaskId, userTask: globalUserTask } = globalState;

    useEffect(() => {
        if (state?.userTask || !globalTaskId) return;
        axios.get(`http://localhost:3001/sessiondata/${globalTaskId}/meta/task.json`)
            .then(response => setRecoveredUserTask((response.data?.original_task || '').trim()))
            .catch(error => console.error('Failed to recover user task:', error));
    }, [state?.userTask, globalTaskId]);

    // Use global state
    const taskId = globalTaskId;
    const userName = globalUsername;
    // const userTask = globalUserTask;
    
    // Initial editor value
    const initialValue = useMemo(() => [
        {
            type: 'paragraph',
            children: [{ text: '' }],
        },
    ], []);

    const [value, setValue] = useState(initialValue);
    const [loading, setLoading] = useState(true);
    const [contentLoaded, setContentLoaded] = useState(false);
    const [editorKey, setEditorKey] = useState(0);
    const [components, setComponents] = useState([]);
    const [selectedComponentId, setSelectedComponentId] = useState(null);
    const [highlightedRanges, setHighlightedRanges] = useState([]);
    const [floatingToolbar, setFloatingToolbar] = useState({ visible: false, component: null, position: null });
    const editorRef = useRef(null);
    const [originalText, setOriginalText] = useState('');
    // Add this state near other useState declarations
    const [combinedResults, setCombinedResults] = useState([]);
    const [previewContent, setPreviewContent] = useState('');
    
    // Modal states for component change tracking
    const [changeModal, setChangeModal] = useState({
        visible: false,
        oldContent: '',
        newContent: '',
        componentId: null
    });
    const [modificationReason, setModificationReason] = useState('');
    const [lastModifiedComponent, setLastModifiedComponent] = useState(null);
    const [regenerateLoading, setRegenerateLoading] = useState(false);
    const [anchorLoading, setAnchorLoading] = useState(false);
    const [modalSaveLoading, setModalSaveLoading] = useState(false);
    
    // Utility function to safely reset editor state
    const safeResetEditor = () => {
        try {
            const defaultValue = [
                {
                    type: 'paragraph',
                    children: [{ text: 'Content reset due to error. Please reload.' }],
                },
            ];
            setValue(defaultValue);
            setSelectedComponentId(null);
            setComponents([]);
            setCombinedResults([]);
            setEditorKey(prev => prev + 1);
            console.log('Editor state safely reset');
        } catch (error) {
            console.error('Error resetting editor:', error);
        }
    };
    
    // Error boundary effect to catch and handle editor errors
    useEffect(() => {
        const handleError = (error) => {
            console.error('Global error caught:', error);
            if (error.message && error.message.includes('descendant at path')) {
                console.log('Slate path error detected, resetting editor state');
                safeResetEditor();
                message.error('Editor error detected. Content has been reset. Please try again.');
            }
        };
        
        window.addEventListener('error', handleError);
        window.addEventListener('unhandledrejection', handleError);
        
        return () => {
            window.removeEventListener('error', handleError);
            window.removeEventListener('unhandledrejection', handleError);
        };
    }, []);
    

    // Generate Anchors function with improved error handling and timeout
    const handleGenerateAnchors = async () => {
        // Prevent multiple simultaneous requests
        if (anchorLoading) {
            console.log('Anchor generation already in progress, ignoring duplicate request');
            return;
        }
        
        let timeoutId1, timeoutId2;
        
        try {
            setAnchorLoading(true);
            
            // Configure axios with timeout for this session
            const axiosConfig = {
                timeout: 115000, // 115 seconds for individual requests (本地 Ollama 较慢)
                headers: {
                    'Content-Type': 'application/json'
                }
            };
            
            // Create timeout promise for anchor generation (30 seconds)
            const createTimeoutPromise = (timeoutMs, errorMessage) => {
                return new Promise((_, reject) => {
                    const id = setTimeout(() => {
                        reject(new Error(errorMessage));
                    }, timeoutMs);
                    return id;
                });
            };
            
            // Step 1: Generate anchor data with timeout
            console.log('Step 1: Generating anchor data...');
            message.loading('Generating anchor data...', 0);
            
            const anchorPromise = axios.post('http://localhost:3001/generate-anchor-builder', {
                userTask: userTask,
                userName: globalUsername,
                taskId: globalTaskId
            }, axiosConfig);
            
            const timeout1 = createTimeoutPromise(120000, 'Timeout: Anchor generation is taking too long. Please check your network connection and try again.');
            
            let response;
            try {
                response = await Promise.race([anchorPromise, timeout1]);
                message.destroy(); // Clear loading message
                console.log('✓ Anchor data generated successfully');
            } catch (error) {
                message.destroy();
                if (error.message.includes('Timeout')) {
                    message.error(error.message, 5);
                } else if (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK') {
                    message.error('Network error: Unable to connect to anchor generation service. Please check your connection and try again.', 5);
                } else {
                    message.error('Failed to generate anchor data. Please try again.', 3);
                }
                console.error('Anchor generation failed:', error);
                return;
            }
            
            // Validate response
            if (!response.data || !response.data.anchorData) {
                message.error('Invalid response from anchor generation service. Please try again.');
                console.error('Invalid anchor response:', response.data);
                return;
            }
            
            // Parse anchor data as JSON
            let parsedAnchorData;
            try {
                const sanitizedContent = response.data.anchorData.replace(/```json|```/g, '');
                parsedAnchorData = JSON.parse(sanitizedContent);
                console.log('✓ Anchor data parsed successfully');
            } catch (error) {
                console.error('Failed to parse anchor data:', error);
                message.error('Failed to parse anchor data format. Please try regenerating.');
                return;
            }
            
            // Validate parsed data structure
            if (!parsedAnchorData.persona || !parsedAnchorData.situation) {
                message.error('Incomplete anchor data received. Missing persona or situation information.');
                console.error('Invalid anchor data structure:', parsedAnchorData);
                return;
            }
            
            // Step 2: Generate and save images with timeout
            console.log('Step 2: Generating images...');
            message.loading('Generating persona and situation images...', 0);
            
            const imageAxiosConfig = {
                ...axiosConfig,
                timeout: 55000 // 55 seconds for image generation (longer as it's more intensive)
            };
            
            const imagePromise = axios.post('http://localhost:3002/generate-and-save-images', {
                userName: globalUsername,
                personaAnchor: parsedAnchorData.persona,
                situationAnchor: parsedAnchorData.situation,
                userTask: userTask,
                taskId: globalTaskId
            }, imageAxiosConfig);
            
            const timeout2 = createTimeoutPromise(60000, 'Timeout: Image generation is taking too long. Please check your network connection and try again.');
            
            let imageResponse;
            try {
                imageResponse = await Promise.race([imagePromise, timeout2]);
                message.destroy(); // Clear loading message
                console.log('✓ Images generated successfully');
            } catch (error) {
                // 图片服务（serverDB.js，端口 3002）未启动时静默失败，继续后续流程
                message.destroy();
                console.warn('Image generation skipped:', error.message);
                imageResponse = { data: {} };
            }
            
            // Step 3: Combine data and navigate
            const anchorContentWithImages = {
                ...parsedAnchorData,
                personaImagePath: imageResponse.data.personaImagePath,
                situationImagePath: imageResponse.data.situationImagePath,
                personaJsonPath: imageResponse.data.personaJsonPath,
                situationJsonPath: imageResponse.data.situationJsonPath
            };
            
            console.log('✓ All anchor content prepared successfully');
            console.log('Passing to AnchorBuilder:', anchorContentWithImages);
            
            message.success('Anchors generated successfully! Navigating to Anchor Builder...', 2);
            
            // Navigate to AnchorBuilder page with the data
            navigate('/anchorBuilders', {
                state: {
                    anchorContent: anchorContentWithImages,
                    userTask: userTask,
                    userName: globalUsername,
                    taskId: globalTaskId
                }
            });
            
        } catch (error) {
            message.destroy(); // Clear any loading messages
            console.error('Unexpected error in generateAnchors:', error);
            
            // Provide specific error messages based on error type
            if (error.message?.includes('Network Error') || error.code === 'ERR_NETWORK') {
                message.error('Network connection error. Please check your internet connection and try again.', 5);
            } else if (error.message?.includes('timeout') || error.code === 'ECONNABORTED') {
                message.error('Request timeout. The service is taking too long to respond. Please try again.', 5);
            } else {
                message.error('An unexpected error occurred while generating anchors. Please try again.', 3);
            }
        } finally {
            // Ensure loading state is always reset
            setAnchorLoading(false);
            message.destroy(); // Clean up any remaining messages
            console.log('Generate anchors process completed, loading state reset');
        }
    };

    // Regenerate Draft function
    const handleRegenerateDraft = async () => {
        try {
            setRegenerateLoading(true);
            
            // Call the regenerate-draft endpoint with required parameters
            const response = await axios.post('http://localhost:3001/regenerate-draft', {
                taskId: globalTaskId,
                userTask: userTask,
                userName: globalUsername
            });
            
            if (response.data) {
                const newContent = response.data.draft || response.data;
                setOriginalText(newContent);
                
                // Save to drafts/latest.md
                await axios.post(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`, {
                    content: newContent
                });
                
                // Parse content into Slate format
                const slateContent = newContent
                    .split('\n\n')
                    .filter(paragraph => paragraph.trim())
                    .map((paragraph) => ({
                        type: 'paragraph',
                        children: [{ text: paragraph.trim() }],
                    }));

                if (slateContent.length === 0) {
                    slateContent.push({
                        type: 'paragraph',
                        children: [{ text: '' }],
                    });
                }

                setValue(slateContent);
                setEditorKey(prev => prev + 1);
                
                // Clear components and results
                setComponents([]);
                setCombinedResults([]);
                setSelectedComponentId(null);
                
                message.success('Draft regenerated successfully');
            }
        } catch (error) {
            console.error('Failed to regenerate draft:', error);
            message.error('Failed to regenerate draft');
        } finally {
            setRegenerateLoading(false);
        }
    };

    // Load draft content on component mount
    useEffect(() => {
        
        const fetchDraft = async () => {
            try {
                const response = await axios.get(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`);
                const draftContent = response.data || 'No content available.';
                setOriginalText(draftContent);
                
                // Parse content into Slate format - preserve original structure
                const slateContent = draftContent
                    .split('\n\n')
                    .filter(paragraph => paragraph.trim())
                    .map((paragraph) => ({
                        type: 'paragraph',
                        children: [{ text: paragraph.trim() }],
                    }));

                // Ensure at least one paragraph exists
                if (slateContent.length === 0) {
                    slateContent.push({
                        type: 'paragraph',
                        children: [{ text: 'No content available.' }],
                    });
                }

                // Validate the slate content structure
                const validatedContent = slateContent.map(node => {
                    if (!node || typeof node !== 'object') {
                        return { type: 'paragraph', children: [{ text: '' }] };
                    }
                    if (!node.children || !Array.isArray(node.children)) {
                        return { ...node, children: [{ text: node.text || '' }] };
                    }
                    return {
                        ...node,
                        children: node.children.map(child => {
                            if (typeof child === 'string') {
                                return { text: child };
                            }
                            if (!child || typeof child !== 'object') {
                                return { text: '' };
                            }
                            return { text: child.text || '', ...child };
                        })
                    };
                });

                setValue(validatedContent);
                setContentLoaded(true);
            } catch (error) {
                console.error('Failed to load draft:', error);
                setValue([
                    {
                        type: 'paragraph',
                        children: [{ text: 'Failed to load content.' }],
                    },
                ]);
                setContentLoaded(true);
            } finally {
                setLoading(false);
            }
        };

        if (taskId) {
            fetchDraft();
        } else {
            setValue([
                {
                    type: 'paragraph',
                    children: [{ text: 'No task selected.' }],
                },
            ]);
            setContentLoaded(true);
            setLoading(false);
        }
    }, [taskId, globalTaskId]);

    let commonComponents = [];
    let linkResults = null;
    let combinedResult = null;



        // 1. 新增：清除所有标记的函数
    const clearAllMarkers = () => {
        return safeEditorOperation(() => {
            if (!value || !Array.isArray(value)) {
                console.warn('Invalid editor value for clearing markers');
                return;
            }
            
            const cleanValue = value.map(node => {
                if (!node || typeof node !== 'object') {
                    return { type: 'paragraph', children: [{ text: '' }] };
                }
                return {
                    ...node,
                    children: Array.isArray(node.children) ? node.children.map(child => {
                        if (typeof child === 'string') {
                            return child;
                        }
                        if (!child || typeof child !== 'object') {
                            return { text: '' };
                        }
                        // 移除所有标记，只保留文本和基本格式
                        const { highlight, componentId, hasDimensions, linkedIntents, ...cleanChild } = child;
                        return cleanChild;
                    }) : [{ text: '' }]
                };
            });
            
            setValue(cleanValue);
            setEditorKey(prev => prev + 1);
        });
    };
    // Extract components using the component extractor
    const handleExtractComponents = async () => {
        try {
            setLoading(true);
            // 清除之前的所有dimension和highlight标记
            clearAllMarkers();
            const response = await axios.post('http://localhost:3001/component-extractor', {
                taskId: globalTaskId,
                userName: globalUsername,
            });

            let extractedComponents = [];
            try {
                extractedComponents = JSON.parse(response.data.components);
            } catch (e) {
                const jsonMatch = response.data.components.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    extractedComponents = JSON.parse(jsonMatch[0]);
                } else {
                    console.error('Could not parse components');
                    message.error('Failed to parse components');
                    return;
                }
            }

            setComponents(extractedComponents);
            setSelectedComponentId(null); // 清除选中状态
            setCombinedResults([]); // 清除之前的combined results
            message.success(`Extracted ${extractedComponents.length} components`);

            commonComponents = extractedComponents;
            console.log('Assigned Common Components:', commonComponents);

            // Call the new intent-analyzer-new endpoint
            try {
                console.log('Global State:', { globalUsername, globalTaskId, userTask });
                const intentResponse = await axios.post('http://localhost:3001/intent-analyzer-new', {
                    userTask: userTask,
                    userName: globalUsername,
                    taskId: globalTaskId,
                });
                console.log('Intent Analyzer New Response:', intentResponse.data);

                // Call the new component-intent-link endpoint
                const linkResponse = await axios.post('http://localhost:3001/component-intent-link', {
                    userName: globalUsername,
                    taskId: globalTaskId,
                    componentList: extractedComponents,
                });

                linkResults = typeof linkResponse.data.links === 'string' 
                    ? JSON.parse(linkResponse.data.links) 
                    : linkResponse.data.links;
                console.log('Component-Intent Link Results:', linkResults);
                handleCombinedResult();
            } catch (intentError) {
                console.error('Error calling intent-analyzer-new or component-intent-link:', intentError);
            }
        } catch (error) {
            console.error('Failed to extract components:', error);
            message.error('Failed to extract components');
        } finally {
            setLoading(false);
        }
    };

    // 改进的文本查找函数，支持精确匹配和跨段落搜索
    const findTextInEditor = (searchText, editorValue) => {
        if (!searchText || !editorValue) return null;

        // 构建完整的文本内容和位置映射
        let fullText = '';
        let nodeMap = [];
        let currentPos = 0;
        
        editorValue.forEach((node, nodeIndex) => {
            const nodeText = getNodeText(null, node);
            const nodeStart = currentPos;
            const nodeEnd = currentPos + nodeText.length;
            
            nodeMap.push({
                nodeIndex,
                nodeText,
                start: nodeStart,
                end: nodeEnd,
                node
            });
            
            fullText += nodeText;
            currentPos = nodeEnd;
            
            // 段落间添加分隔符
            if (nodeIndex < editorValue.length - 1) {
                fullText += '\n\n';
                currentPos += 2;
            }
        });
        
        // 更精确的文本标准化
        const normalizeForSearch = (text) => {
            return text
                .replace(/[\r\n]+/g, ' ')  // 换行转空格
                .replace(/\s+/g, ' ')      // 多空格转单空格
                .trim();
        };
        
        const searchNormalized = normalizeForSearch(searchText).toLowerCase();
        const fullNormalized = normalizeForSearch(fullText).toLowerCase();
        
        console.log('Searching for:', searchNormalized);
        console.log('In text:', fullNormalized.substring(0, 200) + '...');
        
        // 精确匹配
        let index = fullNormalized.indexOf(searchNormalized);
        
        // 如果精确匹配失败，尝试更宽松的匹配
        if (index === -1) {
            // 移除标点符号再试
            const searchClean = searchNormalized.replace(/[^\w\s]/g, '');
            const fullClean = fullNormalized.replace(/[^\w\s]/g, '');
            index = fullClean.indexOf(searchClean);
            
            if (index !== -1) {
                // 映射回原始位置
                let charCount = 0;
                for (let i = 0; i < fullNormalized.length; i++) {
                    if (fullNormalized[i].match(/[\w\s]/)) {
                        if (charCount === index) {
                            index = i;
                            break;
                        }
                        charCount++;
                    }
                }
            }
        }
        
        if (index === -1) {
            console.log('Text not found');
            return null;
        }
        
        const endIndex = index + searchNormalized.length;
        console.log('Found match at normalized position:', index, 'to', endIndex);
        
        return {
            start: index,
            end: endIndex,
            fullText: fullNormalized,
            originalText: fullText,
            nodeMap,
            originalSearchText: searchText
        };
    };

    const applyHighlightingToValue = (editorValue, componentContent, componentId) => {
        console.log('Applying highlighting for component:', componentId);
        console.log('Component content:', componentContent);
        
        // Validate inputs
        if (!editorValue || !Array.isArray(editorValue) || !componentContent || !componentId) {
            console.warn('Invalid inputs for highlighting');
            return editorValue;
        }
        // Clear editor selection before applying highlighting to prevent path errors
        try {
            if (editor.selection) {
                Transforms.deselect(editor);
            }
        } catch (error) {
            console.warn('Could not clear editor selection:', error);
        }

        // 获取该component的linkedIntents
        const combinedResult = combinedResults.find(result => result.id === componentId);
        const linkedIntents = combinedResult?.linkedIntents || [];
        
        // 清除所有highlight属性，保留dimension相关属性
        const cleanValue = editorValue.map(node => {
            if (!node || typeof node !== 'object') {
                return { type: 'paragraph', children: [{ text: '' }] };
            }
            return {
                ...node,
                children: Array.isArray(node.children) ? node.children.map(child => {
                    if (typeof child === 'string') {
                        return child;
                    }
                    if (!child || typeof child !== 'object') {
                        return { text: '' };
                    }
                    const { highlight, ...cleanChild } = child;
                    return cleanChild;
                }) : [{ text: '' }]
            };
        });
    
        const position = findTextInEditor(componentContent, cleanValue);
        if (!position) {
            console.log('Position not found, returning clean value');
            return cleanValue;
        }
    
        console.log('Found position:', position);
        
        // 使用新的nodeMap进行精确位置映射
        const { nodeMap, originalText } = position;
        const highlightStart = position.start;
        const highlightEnd = position.end;
        
        // 将标准化位置映射回原始文本位置
        const mapNormalizedToOriginal = (normalizedPos) => {
            let originalPos = 0;
            let normalizedCount = 0;
            
            for (let i = 0; i < originalText.length; i++) {
                const char = originalText[i];
                const normalizedChar = char.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
                
                if (normalizedCount === normalizedPos) {
                    return originalPos;
                }
                
                if (normalizedChar && normalizedChar !== ' ' || (normalizedChar === ' ' && position.fullText[normalizedCount] === ' ')) {
                    normalizedCount++;
                }
                originalPos++;
            }
            return originalPos;
        };
        
        const originalStart = mapNormalizedToOriginal(highlightStart);
        const originalEnd = mapNormalizedToOriginal(highlightEnd);
        
        console.log('Mapped positions - original:', originalStart, 'to', originalEnd);
        
        // 找到受影响的节点
        let currentPos = 0;
        const affectedNodes = [];
        
        nodeMap.forEach(nodeInfo => {
            const nodeStart = nodeInfo.start;
            const nodeEnd = nodeInfo.end;
            
            // 检查是否与高亮区域重叠
            if (!(nodeEnd <= originalStart || nodeStart >= originalEnd)) {
                const overlapStart = Math.max(nodeStart, originalStart);
                const overlapEnd = Math.min(nodeEnd, originalEnd);
                
                affectedNodes.push({
                    ...nodeInfo,
                    overlapStart: overlapStart - nodeStart,
                    overlapEnd: overlapEnd - nodeStart
                });
            }
        });
        
        console.log('Affected nodes:', affectedNodes);
        
        if (affectedNodes.length === 0) {
            return cleanValue;
        }
        
        // 应用高亮到受影响的节点
        const newValue = cleanValue.map((node, nodeIndex) => {
            const affectedNode = affectedNodes.find(n => n.nodeIndex === nodeIndex);
            if (!affectedNode) {
                return node;
            }
            
            const { nodeText, overlapStart, overlapEnd } = affectedNode;
            
            // 确保边界有效
            const validStart = Math.max(0, Math.min(overlapStart, nodeText.length));
            const validEnd = Math.max(validStart, Math.min(overlapEnd, nodeText.length));
            
            console.log(`Node ${nodeIndex}: highlighting from ${validStart} to ${validEnd} in "${nodeText}"`);
            
            // 分割文本
            const beforeText = nodeText.substring(0, validStart);
            const highlightText = nodeText.substring(validStart, validEnd);
            const afterText = nodeText.substring(validEnd);
            
            const newChildren = [];
            
            // 保留现有属性的辅助函数
            const preserveExistingProps = (text) => {
                const existingChild = node.children.find(child => 
                    child.text && child.text.includes(text)
                );
                return existingChild ? {
                    hasDimensions: existingChild.hasDimensions,
                    linkedIntents: existingChild.linkedIntents,
                    componentId: existingChild.componentId,
                    isFirstTextNode: existingChild.isFirstTextNode

                } : {};
            };
            
            if (beforeText) {
                newChildren.push({ 
                    text: beforeText,
                    ...preserveExistingProps(beforeText)
                });
            }
            
            if (highlightText) {
                // 判断是否为第一个文本节点（用于显示dimension圆圈）
                const isFirstTextNode = (affectedNode === affectedNodes[0]) && (validStart === 0) && (newChildren.length === 0);
                
                newChildren.push({ 
                    text: highlightText, 
                    highlight: true, 
                    componentId: componentId,
                    hasDimensions: linkedIntents.length > 0,
                    linkedIntents: linkedIntents,
                    isFirstTextNode: isFirstTextNode
                   
                });
            }
            
            if (afterText) {
                newChildren.push({ 
                    text: afterText,
                    ...preserveExistingProps(afterText)
                });
            }
            
            return {
                ...node,
                children: newChildren.length > 0 ? newChildren : [{ text: nodeText }]
            };
        });
        
        console.log('Applied highlighting, returning new value');
        return newValue;
    };
    // 修复后的高亮应用函数
    const applyHighlighting = (componentContent, componentId) => {
        console.log('Applying highlighting for:', componentContent);
        return safeEditorOperation(() => {
            // Validate editor state before applying highlighting
            if (!value || !Array.isArray(value) || value.length === 0) {
                console.warn('Invalid editor value, skipping highlighting');
                return;
            }
            
            const newValue = applyHighlightingToValue(value, componentContent, componentId);
            
            // Validate the new value before setting it
            if (newValue && Array.isArray(newValue) && newValue.length > 0) {
                setValue(newValue);
                setEditorKey(prev => prev + 1);
            } else {
                console.warn('Invalid new value generated, keeping current value');
            }
        });
    };

    const removeAllHighlighting = () => {
        return safeEditorOperation(() => {
            if (!value || !Array.isArray(value)) {
                console.warn('Invalid editor value for removing highlighting');
                return;
            }
            
            const cleanValue = value.map(node => {
                if (!node || typeof node !== 'object') {
                    return { type: 'paragraph', children: [{ text: '' }] };
                }
                return {
                    ...node,
                    children: Array.isArray(node.children) ? node.children.map(child => {
                        if (typeof child === 'string') {
                            return child;
                        }
                        if (!child || typeof child !== 'object') {
                            return { text: '' };
                        }
                        // 只移除highlight属性，保留dimension相关属性
                        const { highlight, ...cleanChild } = child;
                        return cleanChild;
                    }) : [{ text: '' }]
                };
            });
            
            setValue(cleanValue);
            setSelectedComponentId(null);
            setEditorKey(prev => prev + 1);
        });
    };

    // 改进后的组件选择处理函数，添加调试信息
    const handleComponentSelect = (component) => {
        try {
            console.log('Selecting component:', component);
            
            if (!component || !component.id) {
                console.warn('Invalid component for selection');
                return;
            }
            
            // 如果toolbar还显示，则关闭它
            if (floatingToolbar.visible) {
                closeFloatingToolbar();
            }
            
            if (selectedComponentId === component.id) {
                // 如果点击的是已选中的组件，则取消选择
                console.log('Deselecting component');
                removeAllHighlighting();
                return;
            }
            
            // Check if there was a previous modification and show modal
            if (lastModifiedComponent && lastModifiedComponent.componentId !== component.id) {
                setChangeModal({
                    visible: true,
                    oldContent: lastModifiedComponent.oldContent,
                    newContent: lastModifiedComponent.newContent,
                    componentId: lastModifiedComponent.componentId
                });
                return;
            }
            
            // 设置新的选中状态
            console.log('Setting selected component ID:', component.id);
            setSelectedComponentId(component.id);
            
            // 直接应用新的高亮（applyHighlighting函数会先清除所有高亮）
            applyHighlighting(component.content, component.id);
        } catch (error) {
            console.error('Error selecting component:', error);
        }
    };

        // Safe editor operation wrapper
    const safeEditorOperation = (operation) => {
        try {
            // Clear any existing selection to prevent path errors
            if (editor.selection) {
                Transforms.deselect(editor);
            }
            return operation();
        } catch (error) {
            console.error('Editor operation failed:', error);
            if (error.message && error.message.includes('descendant at path')) {
                console.log('Path error detected, resetting editor selection');
                try {
                    Transforms.deselect(editor);
                    // Reset to start of document
                    Transforms.select(editor, {
                        anchor: { path: [0, 0], offset: 0 },
                        focus: { path: [0, 0], offset: 0 }
                    });
                } catch (resetError) {
                    console.error('Failed to reset editor selection:', resetError);
                    safeResetEditor();
                }
            }
            return null;
        }
    };

    // Handle clicking on highlighted text
    const handleHighlightClick = (event, componentId) => {
        try {
            console.log('Highlight clicked for componentId:', componentId);
            if (!componentId) {
                console.warn('No componentId provided');
                return;
            }
            const component = components.find(c => c.id === componentId);
            if (!component) {
                console.warn('Component not found for id:', componentId);
                return;
            }

            // Calculate toolbar position
            const rect = event.target.getBoundingClientRect();
            const editorRect = editorRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
            // Clear editor selection before showing toolbar to prevent path conflicts
            safeEditorOperation(() => {
                if (editor.selection) {
                    Transforms.deselect(editor);
                }
            });

            setFloatingToolbar({
                visible: true,
                component: component,
                position: {
                    top: rect.top - editorRect.top,
                    left: rect.left - editorRect.left,
                },
            });
        } catch (error) {
            console.error('Error handling highlight click:', error);
        }
    };
    
    // Close floating toolbar safely
    const closeFloatingToolbar = () => {
        try {
            setFloatingToolbar({ visible: false, component: null, position: null });
            // Clear editor selection to prevent path conflicts
            safeEditorOperation(() => {
                if (editor.selection) {
                    Transforms.deselect(editor);
                }
            });
        } catch (error) {
            console.error('Error closing floating toolbar:', error);
        }
    };

    // Handle component replacement
    const handleComponentReplace = async (componentId, newContent) => {
        try {
            // Update components state
            const updatedComponents = components.map(comp => 
                comp.id === componentId ? { ...comp, content: newContent } : comp
            );
            setComponents(updatedComponents);

            // Update combinedResults
            setCombinedResults(prev => prev.map(result => 
                result.id === componentId 
                    ? { ...result, content: newContent }
                    : result
            ));
            
            // Components state is already updated above, no need to update commonComponents

            // Update the original text content
            let updatedText = originalText;
            const component = components.find(c => c.id === componentId);
            if (component) {
                updatedText = updatedText.replace(component.content, newContent);
                setOriginalText(updatedText);
                
                // Save to draft file
                await axios.post(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`, {
                    content: updatedText
                });
            }

            // Re-parse and update editor content
            const slateContent = updatedText
                .split('\n\n')
                .filter(paragraph => paragraph.trim())
                .map((paragraph) => ({
                    type: 'paragraph',
                    children: [{ text: paragraph.trim() }],
                }));

            setValue(slateContent);
            
            // Re-apply highlighting with new content and update range
            setTimeout(() => {
                // Clear existing highlighting first
                const cleanValue = slateContent.map(node => ({
                    ...node,
                    children: node.children.map(child => {
                        if (typeof child === 'string') {
                            return child;
                        }
                        const { highlight, componentId: childCompId, ...cleanChild } = child;
                        return cleanChild;
                    })
                }));
                setValue(cleanValue);
                
                // Apply new highlighting with updated content
                setTimeout(() => {
                    applyHighlighting(newContent, componentId);
                }, 50);
            }, 100);
            
            message.success('Component updated successfully');
        } catch (error) {
            console.error('Failed to update component:', error);
            message.error('Failed to save changes');
        }
    };
    // Component that appears when text is selected/highlighted
const FloatingToolbar = ({ component, onReplace, onClose, position, value, setValue, setEditorKey, combinedResults, setCombinedResults, setComponents, originalText, setOriginalText, components, globalTaskId, getNodeText, setLastModifiedComponent, safeEditorOperation }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [isRewriting, setIsRewriting] = useState(false);
    const [isQuickfixing, setIsQuickfixing] = useState(false);
    const [isQuickfixLoading, setIsQuickfixLoading] = useState(false);
    const [isExpanding, setIsExpanding] = useState(false);
    const [isExpandLoading, setIsExpandLoading] = useState(false);
    const [isShortening, setIsShortening] = useState(false);
    const [isShortenLoading, setIsShortenLoading] = useState(false);
    const [detailsModal, setDetailsModal] = useState({ visible: false, recommendation: null });
    const [quickfixRecommendations, setQuickfixRecommendations] = useState([]);
    const [selectedRecommendation, setSelectedRecommendation] = useState(null);
    const [editText, setEditText] = useState(component?.content || '');
    const [rewritePrompt, setRewritePrompt] = useState('');
    const [newContent, setNewContent] = useState('');
    const [expandedContent, setExpandedContent] = useState('');
    const [shortenedContent, setShortenedContent] = useState('');
    const [isRewriteLoading, setIsRewriteLoading] = useState(false);
    const [isManualEditing, setIsManualEditing] = useState(false);
    const [manualEditContent, setManualEditContent] = useState('');
    
    // States for modification record modal
    const [isModificationRecord, setIsModificationRecord] = useState(false);
    const [originalTextInput, setOriginalTextInput] = useState('');
    const [revisedTextInput, setRevisedTextInput] = useState('');
    const [modificationReasonInput, setModificationReasonInput] = useState('');
    const [modificationRecordLoading, setModificationRecordLoading] = useState(false);

    if (!component || !position) return null;

    const handleEdit = () => {
        setIsEditing(true);
    };

    const handleQuickfix = async () => {
        setIsQuickfixLoading(true);
        try {
            // Debug logging
            console.log('Debug - combinedResults:', combinedResults);
            console.log('Debug - components:', components);
            
            // Use combinedResults first, then fall back to components state
            const componentList = combinedResults.length > 0 ? combinedResults : components;
            console.log('Sending componentList to stylebook-recommend:', componentList);
            
            if (componentList.length === 0) {
                message.warning('No components available. Please generate components first.');
                return;
            }
            
            const response = await axios.post('http://localhost:3001/stylebook-recommend', {
                userTask: userTask,
                userName: globalUsername,
                taskId: globalTaskId,
                selectedContent: component.content
            });
            
            const recommendations = response.data.recommendations || [];
            
            if (recommendations.length === 0) {
                message.info('No stylebook recommendations available');
                return;
            }
            
            // Switch to quickfix mode
            setIsQuickfixing(true);
            setQuickfixRecommendations(recommendations);
        } catch (error) {
            console.error('Failed to get stylebook recommendations:', error);
            message.error('Failed to get recommendations');
        } finally {
            setIsQuickfixLoading(false);
        }
    };

    const handleAIRewrite = () => {
        setIsRewriting(true);
        setRewritePrompt('');
        setNewContent('');
    };

    const handleExpand = async () => {
        setIsExpandLoading(true);
        try {
            const response = await axios.post('http://localhost:3001/content-expand', {
                userName: globalUsername,
                taskId: globalTaskId,
                selectedContent: component.content
            });
            
            setExpandedContent(response.data.expandedContent);
            setIsExpanding(true);
        } catch (error) {
            console.error('Failed to expand content:', error);
            message.error('Failed to expand content');
        } finally {
            setIsExpandLoading(false);
        }
    };

    const handleShorten = async () => {
        setIsShortenLoading(true);
        try {
            const response = await axios.post('http://localhost:3001/content-shorten', {
                userName: globalUsername,
                taskId: globalTaskId,
                selectedContent: component.content
            });
            
            setShortenedContent(response.data.shortenedContent);
            setIsShortening(true);
        } catch (error) {
            console.error('Failed to shorten content:', error);
            message.error('Failed to shorten content');
        } finally {
            setIsShortenLoading(false);
        }
    };

    const handleManualEdit = () => {
        setManualEditContent(component.content);
        setIsManualEditing(true);
    };

    const handleModificationRecord = () => {
        setOriginalTextInput(component.content || '');
        setRevisedTextInput('');
        setModificationReasonInput('');
        setIsModificationRecord(true);
    };

    const handleSaveModificationRecord = async () => {
        if (!originalTextInput.trim() || !revisedTextInput.trim() || !modificationReasonInput.trim()) {
            message.warning('Please fill in all fields');
            return;
        }

        setModificationRecordLoading(true);
        try {
            // Prepare component data for the API call
            const componentBeforeEdit = {
                id: component.id,
                title: component.title,
                content: originalTextInput
            };

            const componentAfterEdit = {
                id: component.id,
                title: component.title,
                content: revisedTextInput
            };

            // Call the same API as handleModalSave
            const response = await axios.post('http://localhost:3001/save-manual-edit-tool', {
                userTask: userTask,
                userName: globalUsername,
                taskId: globalTaskId,
                userEditReason: modificationReasonInput,
                componentBeforeEdit: componentBeforeEdit,
                componentAfterEdit: componentAfterEdit
            });

            console.log('Manual modification record saved:', response.data);
            
            // Reset modal state
            setIsModificationRecord(false);
            setOriginalTextInput('');
            setRevisedTextInput('');
            setModificationReasonInput('');
            
            message.success('Modification record saved successfully');
        } catch (error) {
            console.error('Error saving modification record:', error);
            message.error('Failed to save modification record');
        } finally {
            setModificationRecordLoading(false);
        }
    };

    const handleCancelModificationRecord = () => {
        setIsModificationRecord(false);
        setOriginalTextInput('');
        setRevisedTextInput('');
        setModificationReasonInput('');
    };

    const handleGenerateRewrite = async () => {
        if (!rewritePrompt.trim()) {
            message.warning('Please enter a rewrite prompt');
            return;
        }
        
        setIsRewriteLoading(true);
        try {
            const response = await axios.post('http://localhost:3001/ai-generate-rewrite', {
                userTask: userTask,
                userName: globalUsername,
                taskId: globalTaskId,
                selectedContent: component.content,
                userPrompt: rewritePrompt
            });
            
            setNewContent(response.data.rewrittenContent);
        } catch (error) {
            console.error('Failed to rewrite content:', error);
            message.error('Failed to rewrite content');
        } finally {
            setIsRewriteLoading(false);
        }
    };

    const handleApplyManualEdit = async () => {
        if (manualEditContent && manualEditContent !== component.content) {
            try {
                // Get linkedIntents for this component
                const combinedResult = combinedResults?.find(result => result.id === component.id);
                const linkedIntents = combinedResult?.linkedIntents || [];
                
                // Update the editor value directly (same as other apply functions)
                const newValue = value.map(node => {
                    const nodeText = getNodeText(null, node);
                    if (nodeText.includes(component.content)) {
                        const updatedText = nodeText.replace(component.content, manualEditContent);
                        return {
                            ...node,
                            children: [{
                                text: updatedText,
                                highlight: true,
                                componentId: component.id,
                                hasDimensions: linkedIntents.length > 0,
                                linkedIntents: linkedIntents
                            }]
                        };
                    }
                    return node;
                });
                
                setValue(newValue);
                setEditorKey(prev => prev + 1);

                // Update component states
                setComponents(prevComponents => 
                    prevComponents.map(comp => 
                        comp.id === component.id ? { ...comp, content: manualEditContent } : comp
                    )
                );

                // Update combinedResults
                setCombinedResults(prevResults => 
                    prevResults.map(comp => 
                        comp.id === component.id 
                            ? { ...comp, content: manualEditContent }
                            : comp
                    )
                );

                // Update originalText and save to draft
                const updatedText = originalText.replace(component.content, manualEditContent);
                setOriginalText(updatedText);
                
                await axios.post(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`, {
                    content: updatedText
                });
                
                // Track this modification for potential modal display
                if (typeof setLastModifiedComponent === 'function') {
                    setLastModifiedComponent({
                        componentId: component.id,
                        oldContent: component.content,
                        newContent: manualEditContent
                    });
                }
                
                setIsManualEditing(false);
                onClose();
                
                message.success('Content applied and saved successfully');
            } catch (error) {
                console.error('Failed to apply manual edit:', error);
                message.error('Failed to save changes');
            }
        }
    };

    const handleCancelManualEdit = () => {
        setIsManualEditing(false);
        setManualEditContent('');
    };

    const handleApplyRewrite = async () => {
        if (newContent) {
            try {
                // Get linkedIntents for this component
                const combinedResult = combinedResults?.find(result => result.id === component.id);
                const linkedIntents = combinedResult?.linkedIntents || [];
                
                // Update the editor value directly (same as handleApplyToSelectedComponent)
                const newValue = value.map(node => {
                    const nodeText = getNodeText(null, node);
                    if (nodeText.includes(component.content)) {
                        const updatedText = nodeText.replace(component.content, newContent);
                        return {
                            ...node,
                            children: [{
                                text: updatedText,
                                highlight: true,
                                componentId: component.id,
                                hasDimensions: linkedIntents.length > 0,
                                linkedIntents: linkedIntents
                            }]
                        };
                    }
                    return node;
                });
                
                setValue(newValue);
                setEditorKey(prev => prev + 1);

                // Update component states
                setComponents(prevComponents => 
                    prevComponents.map(comp => 
                        comp.id === component.id ? { ...comp, content: newContent } : comp
                    )
                );

                // Update combinedResults
                setCombinedResults(prevResults => 
                    prevResults.map(comp => 
                        comp.id === component.id 
                            ? { ...comp, content: newContent }
                            : comp
                    )
                );
                
                // Update components array (no need to update commonComponents as it's not used)
                // The components state is already updated above

                // Update originalText and save to draft
                const updatedText = originalText.replace(component.content, newContent);
                setOriginalText(updatedText);
                
                await axios.post(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`, {
                    content: updatedText
                });
                
                // Track this modification for potential modal display
                if (typeof setLastModifiedComponent === 'function') {
                    setLastModifiedComponent({
                        componentId: component.id,
                        oldContent: component.content,
                        newContent: newContent
                    });
                }
                
                setIsRewriting(false);
                onClose();
                
                message.success('Content applied and saved successfully');
            } catch (error) {
                console.error('Failed to apply rewrite:', error);
                message.error('Failed to save changes');
            }
        }
    };

    const handleSave = () => {
        onReplace(component.id, editText);
        setIsEditing(false);
        onClose();
    };

    const handleCancel = () => {
        setEditText(component.content);
        setIsEditing(false);
    };

    const handleCancelRewrite = () => {
        setIsRewriting(false);
        setRewritePrompt('');
        setNewContent('');
    };

    const handleApplyExpand = async () => {
        if (expandedContent) {
            try {
                // Get linkedIntents for this component
                const combinedResult = combinedResults?.find(result => result.id === component.id);
                const linkedIntents = combinedResult?.linkedIntents || [];
                
                // Update the editor value directly (same as handleApplyRewrite)
                const newValue = value.map(node => {
                    const nodeText = getNodeText(null, node);
                    if (nodeText.includes(component.content)) {
                        const updatedText = nodeText.replace(component.content, expandedContent);
                        return {
                            ...node,
                            children: [{
                                text: updatedText,
                                highlight: true,
                                componentId: component.id,
                                hasDimensions: linkedIntents.length > 0,
                                linkedIntents: linkedIntents
                            }]
                        };
                    }
                    return node;
                });
                
                setValue(newValue);
                setEditorKey(prev => prev + 1);

                // Update component states
                setComponents(prevComponents => 
                    prevComponents.map(comp => 
                        comp.id === component.id ? { ...comp, content: expandedContent } : comp
                    )
                );

                // Update combinedResults
                setCombinedResults(prevResults => 
                    prevResults.map(comp => 
                        comp.id === component.id 
                            ? { ...comp, content: expandedContent }
                            : comp
                    )
                );

                // Update originalText and save to draft
                const updatedText = originalText.replace(component.content, expandedContent);
                setOriginalText(updatedText);
                
                await axios.post(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`, {
                    content: updatedText
                });
                
                // Track this modification for potential modal display
                if (typeof setLastModifiedComponent === 'function') {
                    setLastModifiedComponent({
                        componentId: component.id,
                        oldContent: component.content,
                        newContent: expandedContent
                    });
                }
                
                setIsExpanding(false);
                onClose();
                
                message.success('Content expanded and saved successfully');
            } catch (error) {
                console.error('Failed to apply expand:', error);
                message.error('Failed to save changes');
            }
        }
    };

    const handleCancelExpand = () => {
        setIsExpanding(false);
        setExpandedContent('');
    };

    const handleApplyShorten = async () => {
        if (shortenedContent) {
            try {
                // Get linkedIntents for this component
                const combinedResult = combinedResults?.find(result => result.id === component.id);
                const linkedIntents = combinedResult?.linkedIntents || [];
                
                // Update the editor value directly (same as handleApplyExpand)
                const newValue = value.map(node => {
                    const nodeText = getNodeText(null, node);
                    if (nodeText.includes(component.content)) {
                        const updatedText = nodeText.replace(component.content, shortenedContent);
                        return {
                            ...node,
                            children: [{
                                text: updatedText,
                                highlight: true,
                                componentId: component.id,
                                hasDimensions: linkedIntents.length > 0,
                                linkedIntents: linkedIntents
                            }]
                        };
                    }
                    return node;
                });
                
                setValue(newValue);
                setEditorKey(prev => prev + 1);

                // Update component states
                setComponents(prevComponents => 
                    prevComponents.map(comp => 
                        comp.id === component.id ? { ...comp, content: shortenedContent } : comp
                    )
                );

                // Update combinedResults
                setCombinedResults(prevResults => 
                    prevResults.map(comp => 
                        comp.id === component.id 
                            ? { ...comp, content: shortenedContent }
                            : comp
                    )
                );

                // Update originalText and save to draft
                const updatedText = originalText.replace(component.content, shortenedContent);
                setOriginalText(updatedText);
                
                await axios.post(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`, {
                    content: updatedText
                });
                
                // Track this modification for potential modal display
                if (typeof setLastModifiedComponent === 'function') {
                    setLastModifiedComponent({
                        componentId: component.id,
                        oldContent: component.content,
                        newContent: shortenedContent
                    });
                }
                
                setIsShortening(false);
                onClose();
                
                message.success('Content shortened and saved successfully');
            } catch (error) {
                console.error('Failed to apply shorten:', error);
                message.error('Failed to save changes');
            }
        }
    };

    const handleCancelShorten = () => {
        setIsShortening(false);
        setShortenedContent('');
    };

    const handleApplyQuickfix = async () => {
        if (selectedRecommendation) {
            try {
                // Get linkedIntents for this component
                const combinedResult = combinedResults?.find(result => result.id === component.id);
                const linkedIntents = combinedResult?.linkedIntents || [];
                
                // Update the editor value directly (same as handleApplyRewrite)
                const newValue = value.map(node => {
                    const nodeText = getNodeText(null, node);
                    if (nodeText.includes(component.content)) {
                        const updatedText = nodeText.replace(component.content, selectedRecommendation.recommended_revision);
                        return {
                            ...node,
                            children: [{
                                text: updatedText,
                                highlight: true,
                                componentId: component.id,
                                hasDimensions: linkedIntents.length > 0,
                                linkedIntents: linkedIntents
                            }]
                        };
                    }
                    return node;
                });
                
                setValue(newValue);
                setEditorKey(prev => prev + 1);

                // Update component states
                setComponents(prevComponents => 
                    prevComponents.map(comp => 
                        comp.id === component.id ? { ...comp, content: selectedRecommendation.recommended_revision } : comp
                    )
                );

                // Update combinedResults
                setCombinedResults(prevResults => 
                    prevResults.map(comp => 
                        comp.id === component.id 
                            ? { ...comp, content: selectedRecommendation.recommended_revision }
                            : comp
                    )
                );
                
                // Update components array (no need to update commonComponents as it's not used)
                // The components state is already updated above

                // Update originalText and save to draft
                const updatedText = originalText.replace(component.content, selectedRecommendation.recommended_revision);
                setOriginalText(updatedText);
                
                await axios.post(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`, {
                    content: updatedText
                });
                
                // Track this modification for potential modal display
                if (typeof setLastModifiedComponent === 'function') {
                    setLastModifiedComponent({
                        componentId: component.id,
                        oldContent: component.content,
                        newContent: selectedRecommendation.recommended_revision
                    });
                }
                
                setIsQuickfixing(false);
                onClose();
                
                message.success('Quickfix applied and saved successfully');
            } catch (error) {
                console.error('Failed to apply quickfix:', error);
                message.error('Failed to save changes');
            }
        }
    };

    const handleCancelQuickfix = () => {
        setIsQuickfixing(false);
        setQuickfixRecommendations([]);
        setSelectedRecommendation(null);
    };

    // Function button style
    const buttonStyle = {
        padding: '6px 12px',
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        borderRadius: '4px',
        fontSize: '12px',
        color: '#666',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        transition: 'all 0.2s',
        minWidth: '60px',
        justifyContent: 'center'
    };

    const buttonHoverStyle = {
        ...buttonStyle,
        background: '#f5f5f5',
        color: '#333'
    };

    return (
        <div
            style={{
                position: 'absolute',
                top: position.top - 60,
                left: position.left,
                background: 'white',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                zIndex: 1000,
                overflow: 'hidden'
            }}
        >
            {!isEditing && !isRewriting && !isQuickfixing && !isExpanding && !isShortening && !isManualEditing && !isModificationRecord ? (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    {/* <button
                        style={buttonStyle}
                        onMouseEnter={(e) => Object.assign(e.target.style, buttonHoverStyle)}
                        onMouseLeave={(e) => Object.assign(e.target.style, buttonStyle)}
                        onClick={handleEdit}
                        title="Edit"
                    >
                        ✏️ Edit
                    </button> */}
                    
                    <div style={{ width: '1px', height: '24px', background: '#e0e0e0' }} />
                    
                    <button
                        style={buttonStyle}
                        onMouseEnter={(e) => Object.assign(e.target.style, buttonHoverStyle)}
                        onMouseLeave={(e) => Object.assign(e.target.style, buttonStyle)}
                        onClick={handleQuickfix}
                        title="Quickfix"
                        disabled={isQuickfixLoading}
                    >
                        {isQuickfixLoading ? '⏳ Loading...' : '✨ Quickfix'}
                    </button>
                    
                    <div style={{ width: '1px', height: '24px', background: '#e0e0e0' }} />
                    
                    <button
                        style={buttonStyle}
                        onMouseEnter={(e) => Object.assign(e.target.style, buttonHoverStyle)}
                        onMouseLeave={(e) => Object.assign(e.target.style, buttonStyle)}
                        onClick={handleAIRewrite}
                        title="AI Rewrite"
                    >
                        🔄 AI Rewrite
                    </button>
                    
                    <div style={{ width: '1px', height: '24px', background: '#e0e0e0' }} />
                    
                    <button
                        style={buttonStyle}
                        onMouseEnter={(e) => Object.assign(e.target.style, buttonHoverStyle)}
                        onMouseLeave={(e) => Object.assign(e.target.style, buttonStyle)}
                        onClick={handleManualEdit}
                        title="Manual Edit"
                    >
                        ✏️ Manual Edit
                    </button>
                    
                    <div style={{ width: '1px', height: '24px', background: '#e0e0e0' }} />
                    
                    
                    
                    <div style={{ width: '1px', height: '24px', background: '#e0e0e0' }} />
                    
                    <button
                        style={buttonStyle}
                        onMouseEnter={(e) => Object.assign(e.target.style, buttonHoverStyle)}
                        onMouseLeave={(e) => Object.assign(e.target.style, buttonStyle)}
                        onClick={handleExpand}
                        title="Expand"
                        disabled={isExpandLoading}
                    >
                        {isExpandLoading ? '⏳ Loading...' : '📈 Expand'}
                    </button>
                    
                    <div style={{ width: '1px', height: '24px', background: '#e0e0e0' }} />
                    
                    <button
                        style={buttonStyle}
                        onMouseEnter={(e) => Object.assign(e.target.style, buttonHoverStyle)}
                        onMouseLeave={(e) => Object.assign(e.target.style, buttonStyle)}
                        onClick={handleShorten}
                        title="Shorten"
                        disabled={isShortenLoading}
                    >
                        {isShortenLoading ? '⏳ Loading...' : '📉 Shorten'}
                    </button>
                    
                    <div style={{ width: '1px', height: '24px', background: '#e0e0e0' }} />
                    
                    <div style={{ width: '1px', height: '24px', background: '#e0e0e0' }} />
                    
                    <button
                        style={buttonStyle}
                        onMouseEnter={(e) => Object.assign(e.target.style, buttonHoverStyle)}
                        onMouseLeave={(e) => Object.assign(e.target.style, buttonStyle)}
                        onClick={onClose}
                        title="Close"
                    >
                        ✕
                    </button>
                </div>
            ) : isEditing ? (
                <div style={{ padding: '12px', minWidth: '300px' }}>
                    <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        style={{
                            width: '100%',
                            minHeight: '80px',
                            marginBottom: '8px',
                            padding: '8px',
                            border: '1px solid #d9d9d9',
                            borderRadius: '4px',
                            resize: 'vertical',
                            fontSize: '13px',
                            fontFamily: 'inherit'
                        }}
                        placeholder="Edit component content..."
                        autoFocus
                    />
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <Button size="small" onClick={handleCancel}>
                            Cancel
                        </Button>
                        <Button size="small" type="primary" onClick={handleSave}>
                            Save
                        </Button>
                    </div>
                </div>
            ) : isQuickfixing ? (
                <div style={{ padding: '12px', minWidth: '600px', maxWidth: '1000px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#333' }}>
                        Stylebook Recommendations
                    </div>
                    
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Current Content:</div>
                        <div style={{
                            padding: '8px',
                            background: '#f5f5f5',
                            borderRadius: '4px',
                            fontSize: '12px',
                            lineHeight: '1.5',
                            maxHeight: '80px',
                            overflow: 'auto'
                        }}>
                            {component.content}
                        </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>Select a recommendation:</div>
                        <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
                            {quickfixRecommendations.map((rec, index) => (
                                <div
                                    key={index}
                                    onClick={() => setSelectedRecommendation(rec)}
                                    style={{
                                        minWidth: '180px',
                                        maxWidth: '400px',
                                        padding: '12px',
                                        border: selectedRecommendation === rec ? '2px solid #1890ff' : '1px solid #d9d9d9',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        background: selectedRecommendation === rec ? '#f0f9ff' : '#fff',
                                        flexShrink: 0,
                                        textAlign: 'center'
                                    }}
                                >
                                    <img 
                                        src={stylebookSVG} 
                                        alt="Stylebook" 
                                        style={{ width: '100px', height: '80px', marginBottom: '8px' }}
                                    />
                                    <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#1890ff', marginBottom: '8px', textAlign: 'left' }}>
                                        {rec.stylebook_reference}
                                    </div>
                                    <div style={{ fontSize: '13px', lineHeight: '1.4', textAlign: 'left', marginBottom: '12px' }}>
                                        {rec.recommended_revision}
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setDetailsModal({ visible: true, recommendation: rec });
                                        }}
                                        style={{
                                            background: 'none',
                                            border: '1px solid #d9d9d9',
                                            borderRadius: '4px',
                                            padding: '4px 8px',
                                            fontSize: '10px',
                                            color: '#666',
                                            cursor: 'pointer',
                                            display: 'block',
                                            margin: '0 auto'
                                        }}
                                    >
                                        View Details
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #e0e0e0', paddingTop: '12px' }}>
                        <Button size="small" onClick={handleCancelQuickfix}>
                            Cancel
                        </Button>
                        <Button 
                            size="small" 
                            type="primary" 
                            onClick={handleApplyQuickfix}
                            disabled={!selectedRecommendation}
                        >
                            Apply
                        </Button>
                    </div>
                </div>
            ) : isExpanding ? (
                <div style={{ padding: '12px', minWidth: '400px', maxWidth: '600px' }}>
                    <div style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 'bold' }}>Content Expansion</div>
                    
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Original Content:</div>
                        <div style={{ 
                            padding: '8px', 
                            background: '#f5f5f5', 
                            borderRadius: '4px', 
                            fontSize: '12px',
                            maxHeight: '100px',
                            overflow: 'auto'
                        }}>
                            {component.content}
                        </div>
                    </div>
                    
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Expanded Content:</div>
                        <div style={{ 
                            padding: '8px', 
                            background: '#e6f7ff', 
                            borderRadius: '4px', 
                            fontSize: '12px',
                            maxHeight: '150px',
                            overflow: 'auto'
                        }}>
                            {expandedContent}
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleCancelExpand}
                            style={{
                                padding: '6px 12px',
                                border: '1px solid #d9d9d9',
                                background: 'white',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApplyExpand}
                            style={{
                                padding: '6px 12px',
                                border: 'none',
                                background: '#1890ff',
                                color: 'white',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            Apply
                        </button>
                    </div>
                </div>
            ) : isShortening ? (
                <div style={{ padding: '12px', minWidth: '400px', maxWidth: '600px' }}>
                    <div style={{ marginBottom: '12px', fontSize: '14px', fontWeight: 'bold' }}>Content Shortening</div>
                    
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Original Content:</div>
                        <div style={{ 
                            padding: '8px', 
                            background: '#f5f5f5', 
                            borderRadius: '4px', 
                            fontSize: '12px',
                            maxHeight: '100px',
                            overflow: 'auto'
                        }}>
                            {component.content}
                        </div>
                    </div>
                    
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Shortened Content:</div>
                        <div style={{ 
                            padding: '8px', 
                            background: '#fff2e8', 
                            borderRadius: '4px', 
                            fontSize: '12px',
                            maxHeight: '150px',
                            overflow: 'auto'
                        }}>
                            {shortenedContent}
                        </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleCancelShorten}
                            style={{
                                padding: '6px 12px',
                                border: '1px solid #d9d9d9',
                                background: 'white',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleApplyShorten}
                            style={{
                                padding: '6px 12px',
                                border: 'none',
                                background: '#1890ff',
                                color: 'white',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px'
                            }}
                        >
                            Apply
                        </button>
                    </div>
                </div>
            ) : isManualEditing ? (
                <div style={{ padding: '12px', minWidth: '400px', maxWidth: '600px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#333' }}>
                        Manual Edit
                    </div>
                    
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Original Content:</div>
                        <div style={{
                            padding: '8px',
                            background: '#f5f5f5',
                            borderRadius: '4px',
                            fontSize: '13px',
                            lineHeight: '1.4',
                            maxHeight: '80px',
                            overflow: 'auto'
                        }}>
                            {component.content}
                        </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Edit Content:</div>
                        <Input.TextArea
                            value={manualEditContent}
                            onChange={(e) => setManualEditContent(e.target.value)}
                            placeholder="Edit the content as you wish..."
                            rows={6}
                            style={{ fontSize: '13px' }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #e0e0e0', paddingTop: '12px' }}>
                        <Button size="small" onClick={handleCancelManualEdit}>
                            Cancel
                        </Button>
                        <Button 
                            size="small" 
                            type="primary" 
                            onClick={handleApplyManualEdit}
                            disabled={!manualEditContent.trim() || manualEditContent === component.content}
                        >
                            Apply
                        </Button>
                    </div>
                </div>
            ) : isModificationRecord ? (
                <div style={{ padding: '12px', minWidth: '400px', maxWidth: '500px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#333' }}>
                        Adding Modification Record
                    </div>
                    
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Original Text:</div>
                        <Input.TextArea
                            value={originalTextInput}
                            onChange={(e) => setOriginalTextInput(e.target.value)}
                            placeholder="Enter the original text..."
                            rows={3}
                            style={{ fontSize: '13px' }}
                        />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Revised Text:</div>
                        <Input.TextArea
                            value={revisedTextInput}
                            onChange={(e) => setRevisedTextInput(e.target.value)}
                            placeholder="Enter the revised text..."
                            rows={3}
                            style={{ fontSize: '13px' }}
                        />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Modification Reason:</div>
                        <Input.TextArea
                            value={modificationReasonInput}
                            onChange={(e) => setModificationReasonInput(e.target.value)}
                            placeholder="Enter the reason for this modification..."
                            rows={2}
                            style={{ fontSize: '13px' }}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #e0e0e0', paddingTop: '12px' }}>
                        <Button size="small" onClick={handleCancelModificationRecord}>
                            Cancel
                        </Button>
                        <Button 
                            size="small" 
                            type="primary" 
                            onClick={handleSaveModificationRecord}
                            loading={modificationRecordLoading}
                            disabled={!originalTextInput.trim() || !revisedTextInput.trim() || !modificationReasonInput.trim()}
                        >
                            Save Record
                        </Button>
                    </div>
                </div>
            ) : (
                <div style={{ padding: '12px', minWidth: '400px', maxWidth: '500px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#333' }}>
                        AI Rewrite
                    </div>
                    
                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Current Content:</div>
                        <div style={{
                            padding: '8px',
                            background: '#f5f5f5',
                            borderRadius: '4px',
                            fontSize: '13px',
                            lineHeight: '1.4',
                            maxHeight: '80px',
                            overflow: 'auto'
                        }}>
                            {component.content}
                        </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                        <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>Rewrite Prompt:</div>
                        <Input.TextArea
                            value={rewritePrompt}
                            onChange={(e) => setRewritePrompt(e.target.value)}
                            placeholder="Enter your rewrite instructions (e.g., 'Make it more formal', 'Shorten this', 'Add more details')..."
                            rows={2}
                            style={{ fontSize: '13px' }}
                        />
                        <div style={{ marginTop: '8px', textAlign: 'right' }}>
                            <Button 
                                size="small" 
                                type="primary" 
                                onClick={handleGenerateRewrite}
                                loading={isRewriteLoading}
                                disabled={!rewritePrompt.trim()}
                            >
                                Rewrite
                            </Button>
                        </div>
                    </div>

                    {newContent && (
                        <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>New Content:</div>
                            <div style={{
                                padding: '8px',
                                background: '#f0f9ff',
                                border: '1px solid #bae6fd',
                                borderRadius: '4px',
                                fontSize: '13px',
                                lineHeight: '1.4',
                                maxHeight: '120px',
                                overflow: 'auto'
                            }}>
                                {newContent}
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #e0e0e0', paddingTop: '12px' }}>
                        <Button size="small" onClick={handleCancelRewrite}>
                            Cancel
                        </Button>
                        <Button 
                            size="small" 
                            type="primary" 
                            onClick={handleApplyRewrite}
                            disabled={!newContent}
                        >
                            Apply
                        </Button>
                    </div>
                </div>
            )}
            
            <Modal
                title="Stylebook Details"
                open={detailsModal.visible}
                onCancel={() => setDetailsModal({ visible: false, recommendation: null })}
                footer={[
                    <Button key="back" onClick={() => setDetailsModal({ visible: false, recommendation: null })}>
                        Back
                    </Button>
                ]}
                width={1000}
            >
                {detailsModal.recommendation && (
                    <DetailsModalContent 
                        recommendation={detailsModal.recommendation} 
                        globalTaskId={globalTaskId}
                        globalUsername={globalUsername}
                    />
                )}
            </Modal>
        </div>
    );
};

// Details Modal Content Component
const DetailsModalContent = ({ recommendation, globalTaskId, globalUsername }) => {
    const [stylebookData, setStylebookData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStylebookData = async () => {
            try {
                const response = await axios.get(`http://localhost:3001/user-data/${globalUsername}/AdaptiveStylebook/AdaptiveStylebook.json`);
                const stylebook = response.data;
                const matchingRecord = stylebook.revision_records?.find(record => 
                    record.modification_name === recommendation.stylebook_reference ||
                    record.modification_name.toLowerCase().includes(recommendation.stylebook_reference.toLowerCase()) ||
                    recommendation.stylebook_reference.toLowerCase().includes(record.modification_name.toLowerCase())
                );
                setStylebookData(matchingRecord);
            } catch (error) {
                console.error('Failed to load stylebook details:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchStylebookData();
    }, [recommendation, globalUsername]);

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '20px' }}>Loading...</div>;
    }

    return (
        <div>
            <div style={{ marginBottom: '20px', padding: '12px', background: '#f0f9ff', borderRadius: '6px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#1890ff' }}>Revision Reason</h4>
                <p style={{ margin: 0, lineHeight: '1.5' }}>
                    {recommendation.revision_reason || 'No revision reason provided'}
                </p>
            </div>
            
            <div style={{ padding: '12px', background: '#f9f9f9', borderRadius: '6px' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#333' }}>Stylebook Information</h4>
                {stylebookData ? (
                    <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                        <div style={{ marginBottom: '12px' }}>
                            <strong>Modification Name:</strong>
                            <div style={{ marginTop: '4px', padding: '8px', background: '#fff', borderRadius: '4px' }}>
                                {stylebookData.modification_name}
                            </div>
                        </div>
                        
                        <div style={{ marginBottom: '12px' }}>
                            <strong>Original Text:</strong>
                            <div style={{ marginTop: '4px', padding: '8px', background: '#fff', borderRadius: '4px' }}>
                                {stylebookData.original_text}
                            </div>
                        </div>
                        
                        <div style={{ marginBottom: '12px' }}>
                            <strong>Revised Text:</strong>
                            <div style={{ marginTop: '4px', padding: '8px', background: '#fff', borderRadius: '4px' }}>
                                {stylebookData.revised_text}
                            </div>
                        </div>
                        
                        <div style={{ marginBottom: '12px' }}>
                            <strong>Modification Reason:</strong>
                            <div style={{ marginTop: '4px', padding: '8px', background: '#fff', borderRadius: '4px' }}>
                                {stylebookData.modification_reason}
                            </div>
                        </div>
                        
                        <div style={{ marginBottom: '12px' }}>
                            <strong>Receiver Description:</strong>
                            <div style={{ marginTop: '4px', padding: '8px', background: '#fff', borderRadius: '4px' }}>
                                {stylebookData.receiver_description}
                            </div>
                        </div>
                        
                        <div style={{ marginBottom: '0' }}>
                            <strong>Occasion Description:</strong>
                            <div style={{ marginTop: '4px', padding: '8px', background: '#fff', borderRadius: '4px' }}>
                                {stylebookData.occasion_description}
                            </div>
                        </div>
                    </div>
                ) : (
                    <p style={{ color: '#666', fontStyle: 'italic' }}>
                        No detailed stylebook information found for "{recommendation.stylebook_reference}"
                    </p>
                )}
            </div>
        </div>
    );
};

// Toolbar Button Component
const ToolbarButton = ({ format, children, isActive, onMouseDown }) => {
    return (
        <button
            onMouseDown={onMouseDown}
            style={{
                padding: '8px 12px',
                border: '1px solid #d9d9d9',
                background: isActive ? '#1890ff' : '#fff',
                color: isActive ? '#fff' : '#000',
                cursor: 'pointer',
                borderRadius: '4px',
                marginRight: '4px',
                fontSize: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                minWidth: '32px',
                justifyContent: 'center',
            }}
        >
            {children}
        </button>
    );
};

// Toolbar Component
const Toolbar = () => {
    const editor = useSlate();

    return (
        <div style={{
            padding: '8px',
            borderBottom: '1px solid #d9d9d9',
            background: '#fafafa',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
        }}>
            {/* Text formatting buttons */}
            <ToolbarButton
                format="bold"
                isActive={isFormatActive(editor, 'bold')}
                onMouseDown={(event) => {
                    event.preventDefault();
                    toggleFormat(editor, 'bold');
                }}
            >
                <strong>B</strong>
            </ToolbarButton>
            
            <ToolbarButton
                format="italic"
                isActive={isFormatActive(editor, 'italic')}
                onMouseDown={(event) => {
                    event.preventDefault();
                    toggleFormat(editor, 'italic');
                }}
            >
                <em>I</em>
            </ToolbarButton>
            
            <ToolbarButton
                format="underline"
                isActive={isFormatActive(editor, 'underline')}
                onMouseDown={(event) => {
                    event.preventDefault();
                    toggleFormat(editor, 'underline');
                }}
            >
                <u>U</u>
            </ToolbarButton>

            <div style={{ width: '1px', height: '24px', background: '#d9d9d9', margin: '0 8px' }} />

            {/* Block element buttons */}
            <ToolbarButton
                format="heading-one"
                isActive={isBlockActive(editor, 'heading-one')}
                onMouseDown={(event) => {
                    event.preventDefault();
                    toggleBlock(editor, 'heading-one');
                }}
            >
                H1
            </ToolbarButton>
            
            <ToolbarButton
                format="heading-two"
                isActive={isBlockActive(editor, 'heading-two')}
                onMouseDown={(event) => {
                    event.preventDefault();
                    toggleBlock(editor, 'heading-two');
                }}
            >
                H2
            </ToolbarButton>

            <div style={{ width: '1px', height: '24px', background: '#d9d9d9', margin: '0 8px' }} />

            {/* List buttons */}
            <ToolbarButton
                format="bulleted-list"
                isActive={isBlockActive(editor, 'bulleted-list')}
                onMouseDown={(event) => {
                    event.preventDefault();
                    toggleBlock(editor, 'bulleted-list');
                }}
            >
                • List
            </ToolbarButton>
            
            <ToolbarButton
                format="numbered-list"
                isActive={isBlockActive(editor, 'numbered-list')}
                onMouseDown={(event) => {
                    event.preventDefault();
                    toggleBlock(editor, 'numbered-list');
                }}
            >
                1. List
            </ToolbarButton>
        </div>
    );
};


    // Custom render functions for rich text elements
    const renderElement = ({ attributes, children, element }) => {
        const paragraphStyle = {
            marginBottom: '20px', // 增加段间距
            marginTop: '0'
        };
        switch (element.type) {
            case 'heading-one':
                return <h1 {...attributes}>{children}</h1>;
            case 'heading-two':
                return <h2 {...attributes}>{children}</h2>;
            case 'bulleted-list':
                return <ul {...attributes}>{children}</ul>;
            case 'numbered-list':
                return <ol {...attributes}>{children}</ol>;
            case 'list-item':
                return <li {...attributes}>{children}</li>;
            default:
                return <p {...attributes}>{children}</p>;
        }
    };

// New function to apply dimension markers to all components at once
const applyAllDimensions = () => {
    if (!combinedResults || combinedResults.length === 0) {
        console.log('No combined results available');
        return;
    }

    let newValue = [...value];
    
    // Apply dimensions for each component
    combinedResults.forEach(component => {
        if (component.linkedIntents && component.linkedIntents.length > 0) {
            newValue = applyDimensionsToValue(newValue, component.content, component.id, component.linkedIntents);
        }
    });
    
    setValue(newValue);
    setEditorKey(prev => prev + 1);
};

// Modified function to apply dimensions without removing existing ones
const applyDimensionsToValue = (editorValue, componentContent, componentId, linkedIntents) => {
    console.log('Applying dimensions for component:', componentId);
    console.log('Component content:', componentContent);
    
    const position = findTextInEditor(componentContent, editorValue);
    if (!position) {
        console.log('Position not found for component:', componentId);
        return editorValue;
    }

    console.log('Found position:', position);

    // Build position mapping: from normalized text position to actual node positions
    let currentNormalizedPos = 0;
    let nodePositions = [];
    
    editorValue.forEach((node, nodeIndex) => {
        const nodeText = getNodeText(null, node);
        const normalizedNodeText = nodeText.replace(/\s+/g, ' ').trim().toLowerCase();
        
        nodePositions.push({
            nodeIndex,
            originalText: nodeText,
            normalizedText: normalizedNodeText,
            normalizedStart: currentNormalizedPos,
            normalizedEnd: currentNormalizedPos + normalizedNodeText.length,
            node
        });
        
        currentNormalizedPos += normalizedNodeText.length;
        if (nodeIndex < editorValue.length - 1) {
            currentNormalizedPos += 1; // Space between paragraphs
        }
    });

    // Find nodes that need dimension markers
    const highlightStart = position.start;
    const highlightEnd = position.end;
    
    const affectedNodes = nodePositions.filter(pos => 
        !(pos.normalizedEnd <= highlightStart || pos.normalizedStart >= highlightEnd)
    );

    if (affectedNodes.length === 0) {
        return editorValue;
    }

    // Apply dimension markers to affected nodes
    const newValue = editorValue.map((node, nodeIndex) => {
        const nodePos = nodePositions.find(pos => pos.nodeIndex === nodeIndex);
        if (!nodePos || !affectedNodes.includes(nodePos)) {
            return node;
        }

        // Calculate highlight range within current node
        const nodeStart = Math.max(0, highlightStart - nodePos.normalizedStart);
        const nodeEnd = Math.min(nodePos.normalizedText.length, highlightEnd - nodePos.normalizedStart);

        if (nodeStart >= nodeEnd) {
            return node;
        }

        // Map to original text positions
        const originalText = nodePos.originalText;
        let originalStart = 0;
        let originalEnd = originalText.length;

        // For partial matches, estimate positions
        if (nodeStart > 0 || nodeEnd < nodePos.normalizedText.length) {
            const startRatio = nodeStart / nodePos.normalizedText.length;
            const endRatio = nodeEnd / nodePos.normalizedText.length;
            
            originalStart = Math.floor(originalText.length * startRatio);
            originalEnd = Math.ceil(originalText.length * endRatio);
        }

        // Ensure valid boundaries
        originalStart = Math.max(0, Math.min(originalStart, originalText.length));
        originalEnd = Math.max(originalStart, Math.min(originalEnd, originalText.length));

        // Split text and apply dimension markers
        const beforeText = originalText.substring(0, originalStart);
        const dimensionText = originalText.substring(originalStart, originalEnd);
        const afterText = originalText.substring(originalEnd);

        const newChildren = [];
        if (beforeText) {
            newChildren.push({ text: beforeText });
        }
        if (dimensionText) {
            newChildren.push({ 
                text: dimensionText, 
                hasDimensions: true, 
                componentId: componentId,
                linkedIntents: linkedIntents
            });
        }
        if (afterText) {
            newChildren.push({ text: afterText });
        }

        return {
            ...node,
            children: newChildren.length > 0 ? newChildren : [{ text: originalText }]
        };
    });

    return newValue;
};
// 2. 新增：为所有components初始化dimension标记的函数
const initializeAllDimensions = () => {
    if (!combinedResults || combinedResults.length === 0) {
        console.log('No combined results available');
        return;
    }

    let newValue = [...value];
    
    // 为每个component添加dimension标记
    combinedResults.forEach(component => {
        if (component.linkedIntents && component.linkedIntents.length > 0) {
            newValue = addDimensionsToValue(newValue, component.content, component.id, component.linkedIntents);
        }
    });
    
    setValue(newValue);
    setEditorKey(prev => prev + 1);
};

// 3. 新增：为特定component内容添加dimension标记的函数
const addDimensionsToValue = (editorValue, componentContent, componentId, linkedIntents) => {
    const position = findTextInEditor(componentContent, editorValue);
    if (!position) {
        console.log('Position not found for component:', componentId);
        return editorValue;
    }

    // 使用新的精确位置映射
    const { nodeMap, originalText } = position;
    const highlightStart = position.start;
    const highlightEnd = position.end;
    
    // 将标准化位置映射回原始文本位置
    const mapNormalizedToOriginal = (normalizedPos) => {
        let originalPos = 0;
        let normalizedCount = 0;
        
        for (let i = 0; i < originalText.length; i++) {
            const char = originalText[i];
            const normalizedChar = char.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');
            
            if (normalizedCount === normalizedPos) {
                return originalPos;
            }
            
            if (normalizedChar && normalizedChar !== ' ' || (normalizedChar === ' ' && position.fullText[normalizedCount] === ' ')) {
                normalizedCount++;
            }
            originalPos++;
        }
        return originalPos;
    };
    
    const originalStart = mapNormalizedToOriginal(highlightStart);
    const originalEnd = mapNormalizedToOriginal(highlightEnd);
    
    // 找到受影响的节点
    const affectedNodes = [];
    
    nodeMap.forEach(nodeInfo => {
        const nodeStart = nodeInfo.start;
        const nodeEnd = nodeInfo.end;
        
        if (!(nodeEnd <= originalStart || nodeStart >= originalEnd)) {
            const overlapStart = Math.max(nodeStart, originalStart);
            const overlapEnd = Math.min(nodeEnd, originalEnd);
            
            affectedNodes.push({
                ...nodeInfo,
                overlapStart: overlapStart - nodeStart,
                overlapEnd: overlapEnd - nodeStart
            });
        }
    });

    if (affectedNodes.length === 0) {
        return editorValue;
    }

    // 为受影响的节点添加dimension标记
    const newValue = editorValue.map((node, nodeIndex) => {
        const affectedNode = affectedNodes.find(n => n.nodeIndex === nodeIndex);
        if (!affectedNode) {
            return node;
        }
        
        const { nodeText, overlapStart, overlapEnd } = affectedNode;
        
        // 确保边界有效
        const validStart = Math.max(0, Math.min(overlapStart, nodeText.length));
        const validEnd = Math.max(validStart, Math.min(overlapEnd, nodeText.length));
        
        // 分割文本并添加dimension标记
        const beforeText = nodeText.substring(0, validStart);
        const dimensionText = nodeText.substring(validStart, validEnd);
        const afterText = nodeText.substring(validEnd);

        const newChildren = [];
        if (beforeText) {
            newChildren.push({ text: beforeText });
        }
        if (dimensionText) {
            // 判断是否为第一个文本节点（用于显示dimension圆圈）
            const isFirstTextNode = (affectedNode === affectedNodes[0]) && (validStart === 0) && (newChildren.length === 0);
            
            newChildren.push({ 
                text: dimensionText,
                hasDimensions: true,
                componentId: componentId,
                linkedIntents: linkedIntents,
                isFirstTextNode: isFirstTextNode
            });
        }
        if (afterText) {
            newChildren.push({ text: afterText });
        }

        return {
            ...node,
            children: newChildren.length > 0 ? newChildren : [{ text: nodeText }]
        };
    });

    return newValue;
};
    // Color palette for dimension circles
    const colorPalette = ['#ff7875', '#ff9c6e', '#ffc069', '#d3f261', '#ffd666', '#fff566', '#95de64', '#5cdbd3', '#b37feb', '#ff85c0','#ffa39e','#ffbb96','#ffd591','#eaff8f','#ffe58f','#fffb8f','#b7eb8f','#87e8de','#d3adf7','#ffadd2'];
    
    // Track dimension-to-color mapping to prevent duplicates
    const dimensionColorMapRef = useRef(new Map());
    
    // Helper function to get unique dimension color from palette
    const getDimensionColor = (dimension) => {
        if (dimensionColorMapRef.current.has(dimension)) {
            return dimensionColorMapRef.current.get(dimension);
        }
        
        const usedColors = new Set(dimensionColorMapRef.current.values());
        const availableColor = colorPalette.find(color => !usedColors.has(color)) || colorPalette[0];
        
        dimensionColorMapRef.current.set(dimension, availableColor);
        return availableColor;
    };

    // 4. 修改后的renderLeaf函数 - 每个component都显示dimension圆圈
    const renderLeaf = ({ attributes, children, leaf }) => {
        let element = children;
        
        if (leaf.bold) {
            element = <strong>{element}</strong>;
        }
        if (leaf.italic) {
            element = <em>{element}</em>;
        }
        if (leaf.underline) {
            element = <u>{element}</u>;
        }
        
        // // 检查是否有dimension标记或高亮
        const hasDimensions = leaf.hasDimensions && leaf.linkedIntents && leaf.linkedIntents.length > 0;
        const isHighlighted = leaf.highlight;
        const isFirstTextNode = leaf.isFirstTextNode;

        if (hasDimensions || isHighlighted) {
            // 获取dimension信息
            let dimensions = [];
            if (leaf.linkedIntents) {
                dimensions = leaf.linkedIntents;
            } else if (leaf.componentId) {
                // 如果没有直接的linkedIntents，从combinedResults中查找
                const combinedResult = combinedResults.find(result => result.id === leaf.componentId);
                dimensions = combinedResult?.linkedIntents || [];
            }
            
            // 根据是否高亮设置不同的文本样式
            const textStyle = isHighlighted ? {
                backgroundColor: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: '2px',
                padding: '1px 2px',
                cursor: 'pointer'
            } : {
                cursor: 'pointer'
            };
            
            element = (
                <span style={{ position: 'relative' }}>
                    {/* 每个component的第一个文本节点都显示dimension圆圈 */}
                    {dimensions.length > 0 && isFirstTextNode && (
                        <div style={{
                            position: 'absolute',
                            top: '-12px',
                            left: '0',
                            display: 'flex',
                            gap: '4px',
                            zIndex: 10,
                            flexWrap: 'wrap'
                        }}>
                            {dimensions.map((intent, index) => (
                                <Button
                                    key={`${leaf.componentId}-${index}`}
                                    size="small"
                                    shape="circle"
                                    style={{
                                        width: '10px',
                                        height: '10px',
                                        minWidth: '10px',
                                        padding: '0',
                                        fontSize: '8px',
                                        backgroundColor: getDimensionColor(intent.dimension),
                                        border: 'none',
                                        cursor: 'pointer'
                                    }}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleDimensionClick(intent, leaf.componentId);
                                    }}
                                    title={`${intent.dimension}: ${intent.current_value}`}
                                />
                            ))}
                        </div>
                    )}
                    
                    <span
                        {...attributes}
                        style={textStyle}
                        onClick={leaf.componentId ? (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleHighlightClick(e, leaf.componentId);
                        } : undefined}
                    >
                        {element}
                    </span>
                </span>
            );
        }
        
        return <span {...attributes}>{element}</span>;
    };




    const handleDimensionClick = (intent, componentId) => {
        console.log('Dimension clicked:', intent.dimension, 'for component:', componentId);
        
        // 如果toolbar还显示，则关闭它
        if (floatingToolbar.visible) {
            closeFloatingToolbar();
        }
        
        // 查找对应的组件
        const component = components.find(c => c.id === componentId);
        if (!component) {
            console.log('Component not found:', componentId);
            return;
        }

        // 检查当前组件是否已经被选中和高亮
        const isCurrentlySelected = selectedComponentId === componentId;
        const isCurrentlyHighlighted = value.some(node => 
            node.children.some(child => 
                child.highlight && child.componentId === componentId
            )
        );

        // 如枟已经选中且高亮，则不执行任何操作
        if (isCurrentlySelected && isCurrentlyHighlighted) {
            console.log('Component already selected and highlighted, no action needed');
            return;
        }

        // Check if there was a previous modification and show modal
        if (lastModifiedComponent && lastModifiedComponent.componentId !== componentId) {
            setChangeModal({
                visible: true,
                oldContent: lastModifiedComponent.oldContent,
                newContent: lastModifiedComponent.newContent,
                componentId: lastModifiedComponent.componentId
            });
            return;
        }

        // 选中对应的组件
        console.log('Selecting component:', component.id);
        setSelectedComponentId(component.id);
        
        // 高亮对应的内容
        console.log('Highlighting component content:', component.content);
        applyHighlighting(component.content, component.id);
        
        // 可选：显示提示信息
        message.info(`Selected dimension: ${intent.dimension}`);
    };

    // Handle applying preview content to selected component
    const handleApplyToSelectedComponent = (intentSelected) => {
        if (!selectedComponentId || !previewContent) {
            message.warning('No component selected or no preview content available');
            return;
        }

        // Find the selected component
        const selectedComponent = components.find(comp => comp.id === selectedComponentId);
        if (!selectedComponent) {
            message.error('Selected component not found');
            return;
        }

        console.log('Applying preview content:', previewContent);
        console.log('To component:', selectedComponent);
        console.log('With intent selected:', intentSelected);

        // Find the component text in the current editor value
        const position = findTextInEditor(selectedComponent.content, value);
        if (!position) {
            message.error('Could not locate component in editor');
            return;
        }

        // Simply replace the component content using a more direct approach
        const combinedResult = combinedResults.find(result => result.id === selectedComponentId);
        let linkedIntents = combinedResult?.linkedIntents || [];
        
        // Update linkedIntents with new intentSelected values if provided
        if (intentSelected) {
            linkedIntents = linkedIntents.map(intent => 
                intent.dimension === intentSelected.dimension 
                    ? {
                        ...intent,
                        current_value: intentSelected.current_value,
                        other_values: intentSelected.other_values
                    }
                    : intent
            );
        }
        
        // Update the editor value directly
        const newValue = value.map(node => {
            const nodeText = getNodeText(null, node);
            if (nodeText.includes(selectedComponent.content)) {
                // Replace the component content in this node
                const updatedText = nodeText.replace(selectedComponent.content, previewContent);
                return {
                    ...node,
                    children: [{
                        text: updatedText,
                        highlight: true,
                        componentId: selectedComponentId,
                        hasDimensions: linkedIntents.length > 0,
                        linkedIntents: linkedIntents
                    }]
                };
            }
            return node;
        });
        
        setValue(newValue);
        setEditorKey(prev => prev + 1);

        // Update component states
        setComponents(prevComponents => 
            prevComponents.map(comp => 
                comp.id === selectedComponentId ? { ...comp, content: previewContent } : comp
            )
        );

        // Update combinedResults with new content and updated linkedIntents
        setCombinedResults(prevResults => 
            prevResults.map(comp => 
                comp.id === selectedComponentId 
                    ? { 
                        ...comp, 
                        content: previewContent,
                        linkedIntents: linkedIntents
                    } 
                    : comp
            )
        );

        // Update originalText
        const updatedText = originalText.replace(selectedComponent.content, previewContent);
        setOriginalText(updatedText);
        
        // Save updated content to sessionData
        const saveDraft = async () => {
            try {
                await axios.post(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`, {
                    content: updatedText,
                });
                console.log('Draft saved to sessionData');
            } catch (error) {
                console.error('Error saving draft to sessionData:', error);
            }
        };
        saveDraft();
        
        // Clear preview content
        setPreviewContent('');
        
        // Track this modification for potential modal display
        setLastModifiedComponent({
            componentId: selectedComponentId,
            oldContent: selectedComponent.content,
            newContent: previewContent
        });
        
        message.success('Component content updated successfully');
    };

    // Modal handlers
    const handleModalSave = async () => {
        console.log('Saving modification with reason:', modificationReason);
        
        try {
            setModalSaveLoading(true);
            
            // Find the component details
            const component = components.find(c => c.id === changeModal.componentId);
            if (!component) {
                message.error('Component not found');
                return;
            }

            // Prepare component data
            const componentBeforeEdit = {
                id: component.id,
                title: component.title,
                content: changeModal.oldContent
            };

            const componentAfterEdit = {
                id: component.id,
                title: component.title,
                content: changeModal.newContent
            };

            // Call the API
            const response = await axios.post('http://localhost:3001/save-manual-edit-tool', {
                userTask: userTask,
                userName: globalUsername,
                taskId: globalTaskId,
                userEditReason: modificationReason,
                componentBeforeEdit: componentBeforeEdit,
                componentAfterEdit: componentAfterEdit
            });

            console.log('Manual edit analysis response:', response.data);
            
            setChangeModal({ visible: false, oldContent: '', newContent: '', componentId: null });
            setModificationReason('');
            setLastModifiedComponent(null);
            
            message.success('Modification saved successfully');
        } catch (error) {
            console.error('Error saving manual edit:', error);
            message.error('Failed to save modification');
        } finally {
            setModalSaveLoading(false);
        }
    };

    const handleModalCancel = () => {
        setChangeModal({ visible: false, oldContent: '', newContent: '', componentId: null });
        setModificationReason('');
        setLastModifiedComponent(null); // Clear lastModifiedComponent to prevent modal from showing again
        
        message.info('Modification cancelled');
    };

    // Add state update logic and debugging logs to handleRadioChange
    const handleRadioChange = async (dimension, newValue) => {
        try {
            console.log('Radio change detected:', { dimension, newValue });
    
            const selectedComponent = combinedResults.find(component => component.id === selectedComponentId);
            if (!selectedComponent) {
                console.error('No selected component found');
                return;
            }
    
            // Find the intent being changed
            const targetIntent = selectedComponent.linkedIntents.find(intent => intent.dimension === dimension);
            if (!targetIntent) {
                console.error('Target intent not found');
                return;
            }
    
            // Construct INTENT_SELECTED with the new value as current_value
            // and all other options (including the previous current_value) as other_values
            const allValues = [targetIntent.current_value, ...targetIntent.other_values];
            const otherValues = allValues.filter(value => value !== newValue);
    
            const intentSelected = {
                dimension,
                current_value: newValue,
                other_values: otherValues
            };
    
            // Construct INTENT_OTHERS from other intents of the same component
            const intentOthers = selectedComponent.linkedIntents
                .filter(intent => intent.dimension !== dimension)
                .map(intent => ({
                    dimension: intent.dimension,
                    current_value: intent.current_value
                }));
    
            console.log('INTENT_SELECTED:', intentSelected);
            console.log('INTENT_OTHERS:', intentOthers);
    
            // Update state to reflect the new selection
            setCombinedResults(prevResults => {
                return prevResults.map(component => {
                    if (component.id === selectedComponentId) {
                        return {
                            ...component,
                            linkedIntents: component.linkedIntents.map(intent => {
                                if (intent.dimension === dimension) {
                                    // Preserve the original order by swapping values instead of reordering
                                    const newOtherValues = [...intent.other_values];
                                    const oldCurrentValue = intent.current_value;
                                    
                                    // Find the index of the new value in other_values
                                    const newValueIndex = newOtherValues.indexOf(newValue);
                                    
                                    if (newValueIndex !== -1) {
                                        // Replace the new value with the old current value
                                        newOtherValues[newValueIndex] = oldCurrentValue;
                                    } else {
                                        // If new value is not in other_values, add old current value to the end
                                        newOtherValues.push(oldCurrentValue);
                                    }
                                    
                                    return {
                                        ...intent,
                                        current_value: newValue,
                                        other_values: newOtherValues
                                    };
                                }
                                return intent;
                            })
                        };
                    }
                    return component;
                });
            });
    
            // Call the API with the correct data structure
            const response = await axios.post('http://localhost:3001/intent-change-rewriter', {
                userName: globalUsername,
                taskId: globalTaskId,
                userTask,
        
                draftLatest: originalText,
                componentCurrent: selectedComponent.content,
                intentSelected,
                intentOthers
            });
    
            if (response.data && response.data.component_variations) {
                console.log('Component variations received:', response.data.component_variations);
                // Find the content that matches the selected intent value
                const matchingVariation = response.data.component_variations.find(
                    variation => variation.intent_value === newValue
                );
                console.log('Matching variation:', matchingVariation);
                if (matchingVariation) {
                    setPreviewContent(matchingVariation.content);
                }
                // Handle the response as needed
            }
        } catch (error) {
            console.error('Error calling /intent-change-rewriter:', error);
            message.error('Failed to process intent change');
        }
    };

    // Handle keyboard shortcuts
    const handleKeyDown = (event) => {
        if (!event.ctrlKey && !event.metaKey) {
            return;
        }

        switch (event.key) {
            case 'b': {
                event.preventDefault();
                toggleFormat(editor, 'bold');
                break;
            }
            case 'i': {
                event.preventDefault();
                toggleFormat(editor, 'italic');
                break;
            }
            case 'u': {
                event.preventDefault();
                toggleFormat(editor, 'underline');
                break;
            }
            default:
                break;
        }
    };

    // Save draft function - extract current editor content and save
    const handleSaveDraft = async () => {
        try {
            // Validate editor state
            if (!value || !Array.isArray(value)) {
                message.error('Invalid editor content. Please refresh and try again.');
                return;
            }
            
            // Extract current text content from editor
            const currentContent = value.map(node => {
                return getNodeText(null, node);
            }).filter(text => text.trim()).join('\n\n');
            
            if (!currentContent.trim()) {
                message.warning('No content to save.');
                return;
            }
            
            // Update originalText with current editor content
            setOriginalText(currentContent);
            
            // Save to drafts/latest.md
            await axios.post(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`, {
                content: currentContent,
            });
            
            // Clear component-related states
            setComponents([]);
            setCombinedResults([]);
            setSelectedComponentId(null);
            
            // Clear any highlighting or markers
            clearAllMarkers();
            
            message.success('Draft saved successfully.');
        } catch (error) {
            console.error('Error saving draft:', error);
            message.error('Failed to save draft. Please try again.');
        }
    };

    const handleCombinedResult = async () => {
        try {
            // Fetch current intents from session data
            const response = await axios.get(`http://localhost:3001/sessiondata/${globalTaskId}/intents/current.json`);
            const currentIntents = response.data;

            // Ensure commonComponents is an array
            if (!Array.isArray(commonComponents)) {
                throw new Error('commonComponents is not an array');
            }

            console.log('Link Results:', linkResults);
            console.log('Current Intents:', currentIntents);

            // Process linkResults, commonComponents, and currentIntents
            combinedResult = commonComponents.map(component => {
                // Find all linkResults related to this component
                const linkedIntents = linkResults
                    .filter(link => link.component_id === component.id)
                    .map(link => {
                        // Find the corresponding intent in currentIntents
                        const intent = currentIntents.find(intent => {
                            const normalizedDimension = intent.dimension.trim().toLowerCase();
                            const normalizedIntentDimension = link.intent_dimension.trim().toLowerCase();
                            return normalizedDimension === normalizedIntentDimension;
                        });

                        // Reconstruct the intent data
                        return intent ? {
                            dimension: intent.dimension,
                            current_value: intent.current_value || 'N/A',
                            other_values: intent.other_values || []
                        } : null;
                    })
                    .filter(Boolean); // Remove null values

                // Combine component details with its linked intents
                return {
                    id: component.id,
                    title: component.title,
                    content: component.content,
                    linkedIntents
                };
            });

            console.log('Combined Result:', combinedResult);
            setCombinedResults(combinedResult); // Store in state
             // 初始化所有dimension标记
            setTimeout(() => {
                if (combinedResult.length > 0) {
                    initializeAllDimensionsWithResults(combinedResult);
                }
            }, 100);
        } catch (error) {
            console.error('Error processing combined result:', error);
        }
    };

    // 新增：使用传入的results初始化dimension标记
    const initializeAllDimensionsWithResults = (results) => {
        if (!results || results.length === 0) {
            console.log('No results provided');
            return;
        }

        let newValue = [...value];
        
        // 为每个component添加dimension标记
        results.forEach(component => {
            if (component.linkedIntents && component.linkedIntents.length > 0) {
                newValue = addDimensionsToValue(newValue, component.content, component.id, component.linkedIntents);
            }
        });
        
        setValue(newValue);
        setEditorKey(prev => prev + 1);
    };

    return (
        <div
            className='emailEditor'
            style={{
                height: '100%',
                overflow: 'auto !important'
            }}
        >
        <div
            style={{
                height: '100%',
                overflow: 'auto',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>Email Draft Editor</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button onClick={handleRegenerateDraft} loading={regenerateLoading}>Regenerate Draft</Button>
                    <Button
                        onClick={handleSaveDraft}
                    >
                        Save Draft
                    </Button>
                    <Button onClick={handleExtractComponents} loading={loading}>
                        Generate Components
                    </Button>
                    <Button onClick={removeAllHighlighting}>
                        Clear Highlighting
                    </Button>
                    <Button onClick={safeResetEditor} danger>
                        Reset Editor
                    </Button>
                    <Button type="primary" onClick={handleGenerateAnchors} loading={anchorLoading} disabled={anchorLoading}>
                        {anchorLoading ? 'Generating Anchors...' : 'Generate Anchors'}
                    </Button>
                    {anchorLoading && (
                        <Button 
                            onClick={() => {
                                setAnchorLoading(false);
                                message.destroy();
                                message.warning('Anchor generation cancelled. You can try again.');
                            }}
                            danger
                            style={{ marginLeft: 8 }}
                        >
                            Cancel
                        </Button>
                    )}
                </div>
            </div>
            
            <Card
            className="email-editor-card"
                size="small"
                style={{
                    flex: 1,
                    minHeight: 0,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    overflow:'auto !important'
                }}
                bodyStyle={{
                    padding: 0,
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {contentLoaded ? (
                    <div>
                    <Row style={{ 
                        borderBottom: '1px solid #d9d9d9',
                        height: '500px',
                        overflow: 'auto'
                    }}>
                        <Col span={18} style={{ height: '100%' }}>
                            <div 
                                ref={editorRef}
                                style={{
                                    background: '#fff',
                                    position: 'relative',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    height: '100%'
                                }}
                            >
                                <Slate
                                    key={editorKey}
                                    editor={editor}
                                    initialValue={value}
                                    onChange={(newValue) => {
                                        try {
                                            // Validate the new value before setting it
                                            if (newValue && Array.isArray(newValue) && newValue.length > 0) {
                                                // Ensure all nodes have valid structure
                                                const validatedValue = newValue.map(node => {
                                                    if (!node || typeof node !== 'object') {
                                                        return { type: 'paragraph', children: [{ text: '' }] };
                                                    }
                                                    if (!node.children || !Array.isArray(node.children)) {
                                                        return { ...node, children: [{ text: '' }] };
                                                    }
                                                    return {
                                                        ...node,
                                                        children: node.children.map(child => {
                                                            if (typeof child === 'string') {
                                                                return { text: child };
                                                            }
                                                            if (!child || typeof child !== 'object') {
                                                                return { text: '' };
                                                            }
                                                            if (child.text === undefined) {
                                                                return { ...child, text: '' };
                                                            }
                                                            return child;
                                                        })
                                                    };
                                                });
                                                setValue(validatedValue);
                                            }
                                        } catch (error) {
                                            console.error('Error updating editor value:', error);
                                            // Don't update if there's an error
                                        }
                                    }}
                                >
                                    <Toolbar />
                                    <div style={{ 
                                        flex: 1, 
                                        overflow: 'auto',
                                        maxHeight: 'calc(60vh - 50px)'
                                    }}>
                                        <Editable
                                            renderElement={renderElement}
                                            renderLeaf={renderLeaf}
                                            onKeyDown={handleKeyDown}
                                            placeholder={loading ? 'Loading...' : 'Start typing...'}
                                            style={{
                                                padding: '16px',
                                                minHeight: '400px',
                                                outline: 'none',
                                                lineHeight: '2.0',
                                            }}
                                            onError={(error) => {
                                                console.error('Slate editor error:', error);
                                            }}
                                        />
                                    </div>
                                </Slate>
                                
                                {/* Floating Toolbar */}
                                {floatingToolbar.visible && (
                                    <FloatingToolbar
                                        component={floatingToolbar.component}
                                        onReplace={handleComponentReplace}
                                        onClose={closeFloatingToolbar}
                                        position={floatingToolbar.position}
                                        value={value}
                                        setValue={setValue}
                                        setEditorKey={setEditorKey}
                                        combinedResults={combinedResults}
                                        setCombinedResults={setCombinedResults}
                                        setComponents={setComponents}
                                        originalText={originalText}
                                        setOriginalText={setOriginalText}
                                        components={components}
                                        globalTaskId={globalTaskId}
                                        globalUsername={globalUsername}
                                        userTask={userTask}
                                        getNodeText={getNodeText}
                                        setLastModifiedComponent={setLastModifiedComponent}
                                        safeEditorOperation={safeEditorOperation}
                                    />
                                )}
                            </div>
                        </Col>
                        
                        <Col span={6} style={{ height: '100%' }}>
                            <div 
                                style={{
                                    padding: '16px',
                                    borderLeft: '1px solid #f0f0f0',
                                    background: '#fff',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    height: '100%'
                                }}
                            >
                                <div style={{ 
                                    fontWeight: 'bold', 
                                    marginBottom: '16px',
                                    fontSize: '14px',
                                    color: '#333'
                                }}>
                                    Email Components ({components.length})
                                </div>
                                
                                <div style={{
                                    flex: 1,
                                    overflow: 'auto',
                                    maxHeight: 'calc(60vh - 80px)'
                                }}>
                                    {components.length === 0 ? (
                                        <div style={{ 
                                            color: '#999', 
                                            fontStyle: 'italic',
                                            textAlign: 'center',
                                            marginTop: '20px',
                                            fontSize: '13px'
                                        }}>
                                            Click "Generate Components" to analyze email structure
                                        </div>
                                    ) : (
                                        components.map((component, index) => (
                                            <div
                                                key={component.id}
                                                style={{
                                                    marginBottom: '8px',
                                                    cursor: 'pointer',
                                                    padding: '12px',
                                                    backgroundColor: selectedComponentId === component.id ? '#e6f7ff' : 'white',
                                                    border: selectedComponentId === component.id ? '1px solid #1890ff' : '1px solid #e8e8e8',
                                                    borderLeft: selectedComponentId === component.id ? '4px solid #1890ff' : '1px solid #e8e8e8',
                                                    borderRadius: '4px',
                                                    transition: 'all 0.2s',
                                                }}
                                                onClick={() => handleComponentSelect(component)}
                                            >
                                                <div style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'center',
                                                    marginBottom: '6px'
                                                }}>
                                                    {/* <Button 
                                                        size="small" 
                                                        type={selectedComponentId === component.id ? 'primary' : 'default'}
                                                        style={{ 
                                                            marginRight: '8px',
                                                            minWidth: '24px',
                                                            height: '24px',
                                                            padding: '0',
                                                            fontSize: '12px',
                                                        }}
                                                    >
                                                        {index + 1}
                                                    </Button> */}
                                                    <div style={{ 
                                                        fontSize: '12px',
                                                        fontWeight: 'bold',
                                                        color: selectedComponentId === component.id ? '#1890ff' : '#333',
                                                        lineHeight: '1.3'
                                                    }}>
                                                        {component.title}
                                                    </div>
                                                </div>
                                                
                                                {/* <div style={{
                                                    fontSize: '11px',
                                                    color: '#666',
                                                    lineHeight: '1.3',
                                                    marginLeft: '32px',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                }}>
                                                    {component.content}
                                                </div> */}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </Col>
                    </Row>
                    <Row style={{width:'100%',height: '40%',overflow: 'auto'}}>
                    <Col span={24} style={{ height: '100%' }}>
                        {/* Header section - fixed height */}
                        <div style={{
                            padding: '8px 16px', 
                            display: 'flex', 
                            alignItems: 'center',
                            
                            flexShrink: 0
                        }}>
                            <div style={{fontWeight: 'bold', fontSize: '16px', marginRight: '16px'}}>Intents</div> 
                            <Button 
                                size="small" 
                                color="primary" 
                                variant="outlined" 
                                style={{marginRight:'16px'}}
                                onClick={handleApplyToSelectedComponent}
                                disabled={!selectedComponentId || !previewContent}
                            >
                                Apply to Selected Component
                            </Button>
                        </div>
                        
                        {/* Preview section - fixed height */}
                        <div className='intentModificationPreview' style={{
                            padding:'8px 16px',
                            borderRadius:'8px',
                            margin:'0 16px',
                            backgroundColor:'#fafafa', 
                            flexShrink: 0,
                            minHeight: '60px',
                            maxHeight: '120px',
                            overflow: 'auto'
                        }}>
                            <p style={{fontWeight: '600', margin: '0 0 8px 0', fontSize: '14px'}}>Modification Preview:</p>
                            <div className="intentModificationPreviewContent" style={{
                                fontSize: '13px',
                                lineHeight: '1.4',
                                color: '#666'
                            }}>
                                {previewContent || 'No preview available'}
                            </div>
                        </div>
                        
                        {/* Scrollable cards section */}
                        <div className='intentCards' style={{
                            flex: 1,
                            overflow: 'auto',
                            padding: '8px 16px',
                            height: '200px'
                        }}>
                            <div style={{ 
                                display: 'flex', 
                                flexWrap: 'wrap', 
                                gap: '12px',
                                alignItems: 'flex-start'
                            }}>
                                {selectedComponentId && combinedResults.length > 0 ? (
                                    combinedResults
                                        .find(component => component.id === selectedComponentId)?.linkedIntents
                                        .map((intent, i) => (
                                            <Card 
                                                title={
                                                    <div style={{ 
                                                        display: 'flex', 
                                                        alignItems: 'center', 
                                                        gap: '8px',
                                                        fontSize: '14px',
                                                        fontWeight: '600'
                                                    }}>
                                                        {intent.dimension}
                                                    </div>
                                                }
                                                key={i}
                                                size="small"
                                                style={{ 
                                                    borderTop: `4px solid ${getDimensionColor(intent.dimension)}`,
                                                    minWidth: '220px',
                                                    maxWidth: '280px',
                                                    flex: '0 0 auto',
                                                    marginBottom: '8px'
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                }}
                                            >
                                                <Radio.Group
                                                    style={{ 
                                                        display: 'flex', 
                                                        flexDirection: 'column', 
                                                        gap: '8px',
                                                        width: '100%'
                                                    }}
                                                    value={intent.current_value}
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        handleRadioChange(intent.dimension, e.target.value);
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                    }}
                                                >
                                                    <Radio 
                                                        value={intent.current_value}
                                                        style={{ fontSize: '13px' }}
                                                    >
                                                        {intent.current_value}
                                                    </Radio>
                                                    {intent.other_values.map((value, index) => (
                                                        <Radio 
                                                            key={index} 
                                                            value={value}
                                                            style={{ fontSize: '13px' }}
                                                        >
                                                            {value}
                                                        </Radio>
                                                    ))}
                                                </Radio.Group>
                                            </Card>
                                        ))
                                ) : (
                                    <div style={{ 
                                        color: '#999', 
                                        fontStyle: 'italic', 
                                        textAlign: 'center', 
                                        width: '100%',
                                        padding: '40px 20px',
                                        fontSize: '14px' 
                                    }}>
                                        No intents available. Select a component to view its intents.
                                    </div>
                                )}
                            </div>
                        </div>
                    </Col>
                    </Row>
                    </div>
                ) : (
                    <div
                        style={{
                            padding: '16px',
                            minHeight: '500px',
                            background: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#999',
                        }}
                    >
                        Loading content...
                    </div>
                )}
            </Card>
            
            {/* Component Change Modal */}
            <Modal
                title="Component Modification Record"
                open={changeModal.visible}
                onCancel={handleModalCancel}
                footer={[
                    <Button key="cancel" onClick={handleModalCancel}>
                        Cancel
                    </Button>,
                    <Button key="save" type="primary" onClick={handleModalSave} loading={modalSaveLoading}>
                        Save
                    </Button>
                ]}
                width={600}
            >
                <div style={{ marginBottom: '16px' }}>
                    <Typography.Text strong>Old Content:</Typography.Text>
                    <div style={{ 
                        background: '#f5f5f5', 
                        padding: '8px', 
                        borderRadius: '4px', 
                        marginTop: '4px',
                        marginBottom: '12px'
                    }}>
                        {changeModal.oldContent}
                    </div>
                    
                    <Typography.Text strong>New Content:</Typography.Text>
                    <div style={{ 
                        background: '#e6f7ff', 
                        padding: '8px', 
                        borderRadius: '4px', 
                        marginTop: '4px',
                        marginBottom: '16px'
                    }}>
                        {changeModal.newContent}
                    </div>
                    
                    <Typography.Text strong>Modification Reason:</Typography.Text>
                    <Input.TextArea
                        value={modificationReason}
                        onChange={(e) => setModificationReason(e.target.value)}
                        placeholder="Please enter the reason for this modification..."
                        rows={3}
                        style={{ marginTop: '4px' }}
                    />
                </div>
            </Modal>
        </div>
        </div>
    );
};

export default EmailEditor;