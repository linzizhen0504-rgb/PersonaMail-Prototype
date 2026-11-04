import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createEditor, Editor, Transforms, Range, Text } from 'slate';
import { Slate, Editable, withReact, useSlate, ReactEditor } from 'slate-react';
import { Card, Typography, message, Button, Row, Col, Tooltip, Tag, Radio, Checkbox, Flex, Modal, Input, Spin, Tour } from 'antd';
import axios from 'axios';
import { diffWords } from 'diff';
import { SendOutlined, LeftOutlined, RightOutlined, ReloadOutlined } from '@ant-design/icons';
import { useGlobalContext } from '../App';
import stylebookSVG from '../stylebook.svg';
import FactorPanel, { useFactorSelection } from './FactorPanel';
import { RobotIcon, UserAvatarIcon, BotAvatarIcon } from '../icons';

const { Title } = Typography;

// Ask AI box is hidden in both experiment conditions; the handlers and backend endpoint stay in place
const SHOW_ASK_AI = false;

// Experiment condition (?cond=baseline|cards&pid=P01). URL values override and refresh the sessionStorage
// cache, which keeps them when the app navigates and drops the query string.
const EXPERIMENT_STORAGE_KEY = 'personamail_experiment';
const getExperimentParams = () => {
    let cached = {};
    try {
        cached = JSON.parse(sessionStorage.getItem(EXPERIMENT_STORAGE_KEY)) || {};
    } catch (error) {
        cached = {};
    }
    let params = new URLSearchParams();
    try {
        params = new URLSearchParams(window.location.search);
    } catch (error) {
        console.warn('Could not read URL params:', error);
    }
    const isCond = (c) => c === 'cards' || c === 'baseline';
    const cond = isCond(params.get('cond')) ? params.get('cond') : (isCond(cached.cond) ? cached.cond : 'baseline');
    const pid = params.get('pid') || cached.pid || 'unknown';
    try {
        sessionStorage.setItem(EXPERIMENT_STORAGE_KEY, JSON.stringify({ cond, pid }));
    } catch (error) {
        console.warn('Could not cache experiment params:', error);
    }
    return { cond, pid };
};
const EXPERIMENT = getExperimentParams();

// Preference model service (cards condition only); every request gets a short timeout
const MODEL_SERVICE_URL = 'http://localhost:3003';
const MODEL_TIMEOUT_MS = 2000;
const callModel = (path, payload) => axios.post(`${MODEL_SERVICE_URL}${path}`, payload, { timeout: MODEL_TIMEOUT_MS });

// Context of the current task: the participant's choice for the power/status factor, or "unknown"
const POWER_FACTOR_ID = 'power_difference';
let logContext = 'unknown';


// Append one experiment event to src/data/logs/{pid}.jsonl through the backend
const logEvent = (fields) => {
    const record = {
        timestamp: new Date().toISOString(),
        pid: EXPERIMENT.pid,
        cond: EXPERIMENT.cond,
        context: logContext,
        unit_id: null,
        unit_title: null,
        intent_dimension: null,
        event: null,
        shown_values: null,
        positions: null,
        chosen_value: null,
        edit_distance: null,
        duration_ms: null,
        ...fields
    };
    axios.post('http://localhost:3001/log-event', record).catch(error => {
        console.warn('Failed to log event:', error);
    });
};

// Character-level Levenshtein edit distance
const levenshtein = (a, b) => {
    const s = a || '';
    const t = b || '';
    if (s === t) return 0;
    if (!s.length) return t.length;
    if (!t.length) return s.length;
    let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
    for (let i = 1; i <= s.length; i++) {
        const curr = [i];
        for (let j = 1; j <= t.length; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        prev = curr;
    }
    return prev[t.length];
};

const shuffle = (items) => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

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

// Find a unit's text inside a paragraph: exact match first, then tolerant of whitespace and quote-style differences.
// Returns {start, end} or null.
const locateUnitText = (text, content) => {
    if (!content) return null;
    const exact = text.indexOf(content);
    if (exact !== -1) return { start: exact, end: exact + content.length };
    const escaped = content.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        .replace(/[\u2018\u2019']/g, "['\u2018\u2019]")
        .replace(/[\u201c\u201d"]/g, '["\u201c\u201d]')
        .replace(/\s+/g, '\\s+');
    try {
        const match = new RegExp(escaped).exec(text);
        return match ? { start: match.index, end: match.index + match[0].length } : null;
    } catch (error) {
        return null;
    }
};

// Plain form of a text for comparing: lower case, no punctuation, single spaces
const plainText = (text) => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

// How often each longer sentence occurs in the given paragraphs
const sentenceCounts = (texts) => {
    const counts = new Map();
    texts.forEach(text => {
        String(text || '').split(/(?<=[.!?\u3002\uff01\uff1f])\s*/).forEach(sentence => {
            const key = plainText(sentence);
            if (key.length >= 20) counts.set(key, (counts.get(key) || 0) + 1);
        });
    });
    return counts;
};

// Does a rewritten unit text break the email? It must not contain another unit's text, and putting it into the
// paragraphs must not make any sentence appear more than once. Returns a reason, or null when it is fine.
// `paragraphs` are the editor paragraph texts, `index` the paragraph that holds the unit's old text.
const rewriteProblem = ({ unit, oldContent, newContent, otherUnits, paragraphs, index }) => {
    const plainNew = plainText(newContent);
    if (plainNew.length > plainText(oldContent).length * 3 + 60) return 'is much longer than the part it replaces';
    const leaked = otherUnits.find(other => {
        const plainOther = plainText(other.content);
        return plainOther.length >= 12 && plainNew.includes(plainOther);
    });
    if (leaked) return `includes the text of another part (${leaked.title || leaked.id})`;
    const span = locateUnitText(paragraphs[index], oldContent);
    if (!span) return 'text not found in the editor';
    const after = paragraphs.slice();
    after[index] = paragraphs[index].slice(0, span.start) + newContent + paragraphs[index].slice(span.end);
    const before = sentenceCounts(paragraphs);
    for (const [key, count] of sentenceCounts(after)) {
        if (count > 1 && count > (before.get(key) || 0)) return 'repeats text that is already in the email';
    }
    return null;
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
    const editor = useMemo(() => withReact(createEditor()), []);
    const { globalState } = useGlobalContext();
    const { username: globalUsername, taskId: globalTaskId, userTask: globalUserTask } = globalState;

    // 任务输入与编辑器是同一个页面：还没有任务内容时显示输入框，提交后显示编辑器
    const [taskInput, setTaskInput] = useState('');
    const [submittedTask, setSubmittedTask] = useState({ taskId: null, text: '' });
    // 刷新页面后从后端保存的 meta/task.json 恢复任务内容
    const [recoveredUserTask, setRecoveredUserTask] = useState('');
    const [taskChecked, setTaskChecked] = useState(false);
    const userTask = (submittedTask.taskId === globalTaskId && submittedTask.text) || recoveredUserTask;

    useEffect(() => {
        let cancelled = false;
        setRecoveredUserTask('');
        if (!globalTaskId) {
            setTaskChecked(true);
            return;
        }
        setTaskChecked(false);
        axios.get(`http://localhost:3001/sessiondata/${globalTaskId}/meta/task.json`)
            .then(response => {
                if (!cancelled) setRecoveredUserTask((response.data?.original_task || '').trim());
            })
            .catch(error => console.error('Failed to recover user task:', error))
            .finally(() => {
                if (!cancelled) setTaskChecked(true);
            });
        return () => {
            cancelled = true;
        };
    }, [globalTaskId]);

    const handleSubmitTask = async () => {
        const text = taskInput.trim();
        if (!text || !globalTaskId) return;
        try {
            // Update meta/task.json with original_task
            await axios.post(`http://localhost:3001/update-task-meta`, {
                userName: globalUsername,
                taskId: globalTaskId,
                originalTask: text
            });
        } catch (error) {
            console.error('Error updating task meta:', error);
        }
        setSubmittedTask({ taskId: globalTaskId, text });
        setTaskInput('');
    };

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
    const valueRef = useRef(value);
    valueRef.current = value;
    // Latest data for the async reject flow (state captured by a click handler goes stale while it waits)
    const combinedResultsRef = useRef([]);
    const componentsRef = useRef([]);
    const originalTextRef = useRef('');
    // Version Cards (cond=cards) and experiment logging state
    const [cardsState, setCardsState] = useState(null);
    const cardsRef = useRef(null);
    const [notice, setNotice] = useState(null);
    const versionCardsRef = useRef(null);
    const cardsRequestIdRef = useRef(0);
    const previewSessionRef = useRef(null);
    const editWatchRef = useRef(null);
    combinedResultsRef.current = combinedResults;
    componentsRef.current = components;
    originalTextRef.current = originalText;
    
    // Modal states for component change tracking
    const [changeModal, setChangeModal] = useState({
        visible: false,
        oldContent: '',
        newContent: '',
        componentId: null
    });
    const [modificationReason, setModificationReason] = useState('');
    const [lastModifiedComponent, setLastModifiedComponent] = useState(null);
    // The editor stays blank until a draft has been generated from the factor panel
    const [hasDraft, setHasDraft] = useState(false);
    const [draftGenerating, setDraftGenerating] = useState(false);
    // First-use guide (cards condition): after the first draft, point the user to "Generate Components".
    // Shown once per username; the flag lives in localStorage (without storage it shows once per page load).
    const generateButtonRef = useRef(null);
    const guideKey = `personamail_guide_components_seen:${globalUsername || ''}`;
    const [guideSeen, setGuideSeen] = useState(true);
    useEffect(() => {
        try {
            setGuideSeen(localStorage.getItem(guideKey) === '1');
        } catch (error) {
            setGuideSeen(false);
        }
    }, [guideKey]);
    const markGuideSeen = () => {
        setGuideSeen(true);
        try {
            localStorage.setItem(guideKey, '1');
        } catch (error) {
            console.warn('Could not remember the guide state:', error);
        }
    };
    // The style preference is learned within one email: every newly generated draft starts a fresh session id, so a
    // late event of a display from the previous draft cannot leak into it; the old session is cleared afterwards.
    const draftVersionRef = useRef(0);
    const styleSessionId = () => `${globalTaskId}:${draftVersionRef.current}`;
    const startNewStyleSession = () => {
        if (EXPERIMENT.cond !== 'cards' || !globalTaskId) return;
        const previous = styleSessionId();
        draftVersionRef.current += 1;
        callModel('/reset-session', { pid: EXPERIMENT.pid, session_id: previous }).catch((resetError) => {
            console.warn('Preference model unavailable for /reset-session:', resetError.message);
            logEvent({ event: 'model_unavailable', endpoint: 'reset-session' });
        });
    };
    // Factor selections are made in the chat step first, then stay editable in the editor sidebar
    const factorSelection = useFactorSelection({
        userTask,
        userName: globalUsername,
        taskId: globalTaskId,
        onDraftGenerated: (draft) => { startNewStyleSession(); applyDraftText(draft); },
        onLoadingChange: setDraftGenerating
    });
    const powerChoice = factorSelection.selectedFactors && factorSelection.selectedFactors[POWER_FACTOR_ID]
        ? (factorSelection.selectedValues || {})[POWER_FACTOR_ID] : null;
    const powerValue = Array.isArray(powerChoice) ? powerChoice[0] : powerChoice;
    logContext = (typeof powerValue === 'string' && powerValue.trim()) || 'unknown';
    // The editor opens once the user confirms their choices in the chat step (or a draft already exists)
    const [confirmedTaskId, setConfirmedTaskId] = useState(null);
    const inEditor = hasDraft || confirmedTaskId === globalTaskId;
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    const handleConfirmAndGenerate = () => {
        setConfirmedTaskId(globalTaskId);
        setSidebarCollapsed(false);
        factorSelection.handleGenerateDraft();
    };
    // "Ask AI to add content" states
    const [aiPrompt, setAiPrompt] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiPreview, setAiPreview] = useState({ visible: false, content: '' });
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
            try {
                if (editor.selection) Transforms.deselect(editor); // a stale selection would crash the reset content
            } catch (selectionError) {
                console.warn('Could not clear the editor selection:', selectionError);
            }
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
    

    // Replace the whole editor content with a new draft text
    const applyDraftText = (newContent) => {
        setOriginalText(newContent);

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
        setFloatingToolbar({ visible: false, component: null, position: null });
        setHasDraft(Boolean(newContent.trim()));
    };

    // Current plain text of the editor, including unsaved manual edits
    const getCurrentDraftText = () => {
        if (!value || !Array.isArray(value)) return '';
        return value.map(node => getNodeText(null, node)).filter(text => text.trim()).join('\n\n');
    };

    // Ask AI to add content: request a revised full draft and show it for confirmation
    const handleAiAddContent = async () => {
        const userPrompt = aiPrompt.trim();
        const currentDraft = getCurrentDraftText();
        if (!userPrompt || !currentDraft.trim() || aiLoading) return;
        try {
            setAiLoading(true);
            const response = await axios.post('http://localhost:3001/ai-add-content', {
                userTask: userTask,
                userName: globalUsername,
                taskId: globalTaskId,
                currentDraft,
                userPrompt
            });
            setAiPreview({ visible: true, content: response.data.revisedDraft });
        } catch (error) {
            console.error('Failed to add content with AI:', error);
            message.error('Failed to generate the revised draft. Please try again.');
        } finally {
            setAiLoading(false);
        }
    };

    const handleApplyAiPreview = async () => {
        const newContent = aiPreview.content;
        applyDraftText(newContent);
        setAiPreview({ visible: false, content: '' });
        setAiPrompt('');
        try {
            await axios.post(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`, {
                content: newContent
            });
            message.success('Draft updated');
        } catch (error) {
            console.error('Failed to save updated draft:', error);
            message.error('Draft updated in the editor, but saving it failed');
        }
    };

    const handleDiscardAiPreview = () => {
        setAiPreview({ visible: false, content: '' });
    };

    // Load draft content on component mount
    useEffect(() => {
        
        const fetchDraft = async () => {
            try {
                const response = await axios.get(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`);
                const draftContent = typeof response.data === 'string' ? response.data : '';
                setOriginalText(draftContent);
                setHasDraft(Boolean(draftContent.trim()));
                setComponents([]);
                setCombinedResults([]);
                setSelectedComponentId(null);
                
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
                        children: [{ text: '' }],
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
                setEditorKey(prev => prev + 1);
                setContentLoaded(true);
            } catch (error) {
                console.error('Failed to load draft:', error);
                setHasDraft(false);
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
                message.error('Failed to generate intents. Please click "Generate Components" again.');
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
    
        // The position search below maps normalised text back to the editor and can drift or miss. As a safety net,
        // find the unit's text inside a single paragraph (tolerant of whitespace and quote style) and highlight that.
        const highlightWithinParagraph = () => {
            let found = -1;
            let span = null;
            cleanValue.forEach((node, i) => {
                if (found !== -1) return;
                const match = locateUnitText(getNodeText(null, node), componentContent);
                if (match) { found = i; span = match; }
            });
            if (found === -1) return null;
            return cleanValue.map((node, i) => {
                if (i !== found) return node;
                const text = getNodeText(null, node);
                const meta = { hasDimensions: linkedIntents.length > 0, linkedIntents, componentId };
                const children = [];
                if (text.slice(0, span.start)) children.push({ text: text.slice(0, span.start), ...meta });
                children.push({ text: text.slice(span.start, span.end), highlight: true, ...meta });
                if (text.slice(span.end)) children.push({ text: text.slice(span.end), ...meta });
                return { ...node, children };
            });
        };
        // Is the highlighted text really the unit's text?
        const highlightMatches = (candidate) => {
            const highlighted = candidate.map(node => (Array.isArray(node.children)
                ? node.children.filter(child => child && child.highlight).map(child => child.text).join('') : '')).join('');
            const plainHighlighted = plainText(highlighted);
            const plainUnit = plainText(componentContent);
            return plainHighlighted.length > 0 && (plainHighlighted === plainUnit
                || plainHighlighted.includes(plainUnit) || plainUnit.includes(plainHighlighted));
        };

        const position = findTextInEditor(componentContent, cleanValue);
        if (!position) {
            console.log('Position not found, trying within paragraphs');
            return highlightWithinParagraph() || cleanValue;
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
            return highlightWithinParagraph() || cleanValue;
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
        
        if (!highlightMatches(newValue)) {
            console.log('Highlight does not match the unit text, trying within paragraphs');
            return highlightWithinParagraph() || newValue;
        }
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
    // Replacing the text of a unit rebuilds its paragraph, so a selection pointing into the old leaves would be invalid
    const deselectEditor = () => {
        try {
            if (editor.selection) Transforms.deselect(editor);
        } catch (error) {
            console.warn('Could not clear the editor selection:', error);
        }
    };
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
            alignItems: 'center',
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

    // Keep each intent's options in the order they were first shown, so selecting one does not move it
    const intentOptionOrderRef = useRef(new Map());
    const getIntentOptions = (intent) => {
        const values = [intent.current_value, ...intent.other_values];
        const saved = intentOptionOrderRef.current.get(intent.dimension);
        if (saved && saved.length === values.length && values.every(value => saved.includes(value))) {
            return saved;
        }
        intentOptionOrderRef.current.set(intent.dimension, values);
        return values;
    };
    
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

    const showGuide = EXPERIMENT.cond === 'cards' && !!globalUsername && hasDraft && !draftGenerating
        && components.length === 0 && !guideSeen;

    // cards condition: intent pills, version cards and the follow-up notice
    const renderCardsIntents = () => {
        const unit = selectedComponentId ? combinedResults.find(component => component.id === selectedComponentId) : null;
        const intents = (unit && unit.linkedIntents) || [];
        const activeDimension = cardsState ? cardsState.dimension : null;
        const diffRemoved = { background: '#fde8e8', color: '#b42318', textDecoration: 'line-through' };
        const diffAdded = { background: '#e3f5ea', color: '#137a3e' };
        const retry = () => {
            const intent = intents.find(i => i.dimension === activeDimension);
            if (intent) handleDimensionSelect(intent);
        };
        return (
            <div className='intentCards' style={{ padding: '8px 16px 16px' }}>
                <style>{`
                    .vc-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
                    @media (max-width: 900px) { .vc-grid { grid-template-columns: 1fr; } }
                    .vc-card { display: flex; flex-direction: column; background: #fff; border: 1px solid #e3e5e8; border-radius: 10px; padding: 14px; }
                    .vc-card:hover { border-color: #b9c7e6; }
                `}</style>
                {intents.length === 0 ? (
                    <div style={{ color: '#999', fontStyle: 'italic', textAlign: 'center', width: '100%', padding: '40px 20px', fontSize: '14px' }}>
                        No intents available. Select a component to view its intents.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                        {intents.map((intent) => {
                            const active = intent.dimension === activeDimension;
                            return (
                                <Tag
                                    key={intent.dimension}
                                    onClick={(e) => { e.stopPropagation(); handleDimensionSelect(intent); }}
                                    style={{
                                        margin: 0,
                                        cursor: 'pointer',
                                        borderRadius: '10px',
                                        padding: '5px 12px',
                                        fontSize: '13px',
                                        border: active ? '1px solid #2f6fde' : '1px solid #e3e5e8',
                                        background: active ? '#2f6fde' : '#f6f8fb',
                                        color: active ? '#ffffff' : '#333'
                                    }}
                                >
                                    {intent.dimension}
                                    <span style={{ marginLeft: '8px', fontSize: '11px', color: active ? 'rgba(255,255,255,0.75)' : '#8a9099' }}>
                                        {intent.current_value}
                                    </span>
                                </Tag>
                            );
                        })}
                    </div>
                )}

                {cardsState && (
                    <div className='versionCards' ref={versionCardsRef}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ color: '#8a9099', fontSize: '13px' }}>
                                {cardsState.loading || cardsState.error || cardsState.regenerating
                                    ? `Versions for ${cardsState.dimension} (current: ${cardsState.currentValue})`
                                    : `${cardsState.items.length} versions for ${cardsState.dimension} (current: ${cardsState.currentValue})`}
                            </div>
                            <Button
                                size="small"
                                icon={<ReloadOutlined />}
                                onClick={handleRegenerate}
                                disabled={cardsState.loading || cardsState.error || cardsState.regenerating}
                            >
                                Regenerate
                            </Button>
                        </div>
                        {cardsState.loading || cardsState.regenerating ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#666', fontSize: '14px', padding: '16px 0' }}>
                                <Spin size="small" />
                                <span>{cardsState.regenerating ? 'Generating new versions…' : 'Generating versions…'}</span>
                            </div>
                        ) : cardsState.error ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#b42318', fontSize: '14px', padding: '16px 0' }}>
                                <span>Couldn't generate versions. Try again.</span>
                                <Button size="small" onClick={retry}>Retry</Button>
                            </div>
                        ) : (
                            <>
                                {cardsState.regenError && (
                                    <div style={{ color: '#b42318', fontSize: '14px', marginBottom: '8px' }}>
                                        Couldn't generate new versions. Try again.
                                    </div>
                                )}
                                <div className='vc-grid'>
                                    {cardsState.items.map((item) => (
                                        <div key={item.value} className='vc-card'>
                                            <div style={{ marginBottom: '10px' }}>
                                                <Tag style={{ margin: 0, border: 'none', background: '#eaf1fd', color: '#2f6fde', fontSize: '12px', borderRadius: '5px' }}>
                                                    {item.value}
                                                </Tag>
                                            </div>
                                            <div style={{ flex: 1, fontSize: '14px', lineHeight: 1.65, whiteSpace: 'pre-wrap', marginBottom: '14px' }}>
                                                {item.parts.map((part, index) => (
                                                    <span key={index} style={part.removed ? diffRemoved : part.added ? diffAdded : undefined}>{part.value}</span>
                                                ))}
                                            </div>
                                            <Button type="primary" block onClick={() => handleCardUse(item)}>Use</Button>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}

                {!cardsState && notice && (
                    <div style={{ background: '#f6f8fb', borderRadius: '8px', padding: '12px 14px', fontSize: '14px', color: '#333' }}>
                        {notice}
                    </div>
                )}
            </div>
        );
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

        if (hasDimensions || isHighlighted) {
            // 根据是否高亮设置不同的文本样式
            const isCards = EXPERIMENT.cond === 'cards';
            const textStyle = isHighlighted && isCards ? {
                backgroundColor: '#fff3c4',
                borderRadius: '4px',
                padding: '1px 2px',
                cursor: 'pointer'
            } : isHighlighted ? {
                backgroundColor: '#fff3cd',
                borderRadius: '2px',
                padding: '1px 2px',
                cursor: 'pointer'
            } : {
                cursor: 'pointer'
            };
            
            element = (
                <span style={{ position: 'relative' }}>
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

    // Replace a component's text in the editor and sync all dependent state; returns true on success
    const replaceComponentText = (selectedComponentId, previewContent, intentSelected) => {
        // Find the selected component
        const selectedComponent = components.find(comp => comp.id === selectedComponentId);
        if (!selectedComponent) {
            message.error('Selected component not found');
            return false;
        }

        console.log('Applying preview content:', previewContent);
        console.log('To component:', selectedComponent);
        console.log('With intent selected:', intentSelected);

        // Find the component text in the current editor value
        const position = findTextInEditor(selectedComponent.content, value);
        if (!position) {
            message.error('Could not locate component in editor');
            return false;
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
        return true;
    };

    // Handle applying preview content to selected component
    const handleApplyToSelectedComponent = (intentSelected) => {
        if (!selectedComponentId || !previewContent) {
            message.warning('No component selected or no preview content available');
            return;
        }

        const appliedContent = previewContent;
        const applied = replaceComponentText(selectedComponentId, appliedContent, intentSelected);
        if (applied && EXPERIMENT.cond === 'baseline') {
            const session = previewSessionRef.current;
            if (session) {
                logEvent({
                    unit_id: session.unitId,
                    unit_title: session.unitTitle,
                    intent_dimension: session.dimension,
                    event: 'apply',
                    shown_values: session.shownValues,
                    chosen_value: session.lastValue,
                    duration_ms: Date.now() - session.firstPreviewAt
                });
                previewSessionRef.current = null;
            }
        }
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

    // cards: tell the preference model how a display ended (once per display)
    const sendModelUpdate = (cards, event, chosenValue) => callModel('/update', {
        pid: EXPERIMENT.pid,
        context: cards.context,
        intent_dimension: cards.dimension,
        event,
        chosen_value: chosenValue,
        shown_values: cards.items.map(i => i.value),
        session_id: cards.sessionId,
        current_text: cards.currentText,
        shown_texts: cards.items.map(i => i.content)
    }).catch((updateError) => {
        console.warn('Preference model unavailable for /update:', updateError.message);
        logEvent({
            unit_id: cards.unitId,
            unit_title: cards.unitTitle,
            intent_dimension: cards.dimension,
            event: 'model_unavailable',
            endpoint: 'update'
        });
        throw updateError;
    });

    // cards: a display ends exactly once, as pick, regenerate or leave. The event is logged and the model
    // is updated with the same event. Returns the /update promise (rejects if the model is unavailable).
    const endDisplay = (cards, event, extra = {}) => {
        if (!cards || cards.ended) return null;
        cards.ended = true;
        logEvent({
            unit_id: cards.unitId,
            unit_title: cards.unitTitle,
            intent_dimension: cards.dimension,
            event,
            shown_values: cards.items.map(item => item.value),
            positions: cards.items.map((item, index) => index + 1),
            duration_ms: Date.now() - cards.shownAt,
            ...extra
        });
        return sendModelUpdate(cards, event, extra.chosen_value || null);
    };

    // Log a leave when a preview (baseline) or cards (cards) were shown but the user moved on without acting
    const flushLeave = () => {
        if (EXPERIMENT.cond === 'cards') {
            const cards = cardsRef.current;
            if (cards && !cards.loading && !cards.error && cards.items.length > 0 && !cards.ended) {
                const update = endDisplay(cards, 'leave');
                if (update) update.catch(() => {});
            }
            cardsRef.current = null;
            cardsRequestIdRef.current += 1;
            setCardsState(null);
        } else {
            const session = previewSessionRef.current;
            if (session) {
                logEvent({
                    unit_id: session.unitId,
                    unit_title: session.unitTitle,
                    intent_dimension: session.dimension,
                    event: 'leave',
                    shown_values: session.shownValues,
                    duration_ms: Date.now() - session.firstPreviewAt
                });
            }
            previewSessionRef.current = null;
        }
    };

    // Switching to another unit while cards / a preview are open counts as leaving
    useEffect(() => {
        const cardsUnit = cardsRef.current && cardsRef.current.unitId;
        const sessionUnit = previewSessionRef.current && previewSessionRef.current.unitId;
        if ((cardsUnit && cardsUnit !== selectedComponentId) || (sessionUnit && sessionUnit !== selectedComponentId)) {
            flushLeave();
        }
        if (editWatchRef.current && editWatchRef.current.unitId !== selectedComponentId) {
            finishEditWatch();
        }
        setNotice(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedComponentId]);

    // cards: clicking one of the top buttons while cards are showing counts as leaving. The listener runs in the
    // capture phase, so the leave is logged before the button's own handler changes anything.
    useEffect(() => {
        if (EXPERIMENT.cond !== 'cards') return undefined;
        const leaveButtons = ['Generate Components', 'Reset Editor', 'New Task'];
        const handleClick = (event) => {
            const button = event.target && event.target.closest ? event.target.closest('button') : null;
            if (!button || !leaveButtons.includes((button.innerText || '').trim())) return;
            if (cardsRef.current) flushLeave();
        };
        document.addEventListener('click', handleClick, true);
        return () => document.removeEventListener('click', handleClick, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Keep the version cards (and their buttons) in view inside the scrollable Intents area
    useEffect(() => {
        if (cardsState && versionCardsRef.current && versionCardsRef.current.scrollIntoView) {
            versionCardsRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }, [cardsState]);

    // The node holding a unit's text in the current editor value
    const getUnitNodeText = (unitId, editorValue) => {
        const node = (editorValue || []).find(n => Array.isArray(n.children) && n.children.some(child => child && child.componentId === unitId));
        return node ? getNodeText(null, node) : null;
    };

    // cards: ask the rewriter for the version of the unit under every value of the intent, without the current value.
    // Versions that would duplicate or swallow other parts of the email when used (the model sometimes returns
    // neighbouring sentences) are left out; if none is usable the rewriter is asked once more.
    const fetchVersions = async (unit, intent) => {
        const intentOthers = (unit.linkedIntents || [])
            .filter(other => other.dimension !== intent.dimension)
            .map(other => ({ dimension: other.dimension, current_value: other.current_value }));
        let filtered = 0;
        for (let attempt = 0; attempt < 2; attempt++) {
            const response = await axios.post('http://localhost:3001/intent-change-rewriter', {
                userName: globalUsername,
                taskId: globalTaskId,
                userTask,
                draftLatest: originalTextRef.current,
                componentCurrent: unit.content,
                intentSelected: {
                    dimension: intent.dimension,
                    current_value: intent.current_value,
                    other_values: intent.other_values
                },
                intentOthers
            });
            const variations = response.data && response.data.component_variations;
            if (!Array.isArray(variations)) throw new Error('No versions returned');
            const seenValues = new Set();
            const versions = variations.filter(v => {
                if (!v || v.intent_value === intent.current_value || typeof v.content !== 'string' || seenValues.has(v.intent_value)) return false;
                seenValues.add(v.intent_value);
                return true;
            });
            const paragraphs = valueRef.current.map(node => getNodeText(null, node));
            const index = paragraphs.findIndex(text => !!locateUnitText(text, unit.content));
            const otherUnits = combinedResultsRef.current.filter(u => u.id !== unit.id);
            const sound = index === -1 ? versions : versions.filter(v =>
                !rewriteProblem({ unit, oldContent: unit.content, newContent: v.content, otherUnits, paragraphs, index }));
            filtered += versions.length - sound.length;
            if (sound.length > 0 || versions.length === 0) {
                sound.filtered = filtered;
                return sound;
            }
        }
        const none = [];
        none.filtered = filtered;
        return none;
    };

    // cards: rank the candidates with the preference model (random order if it is unavailable), show the
    // top 3 as cards and log cards_shown. Returns the display, 'empty' when there is nothing to show, or null
    // when the user moved on in the meantime.
    const showDisplay = async ({ unit, unitTitle, intent, candidates, trigger, requestId }) => {
        const context = logContext;
        const sessionId = styleSessionId();
        let chosenVersions;
        let ordering;
        let mmrUsed;
        let styleStrength = null;
        try {
            const ranked = await callModel('/rank', {
                pid: EXPERIMENT.pid,
                context,
                intent_dimension: intent.dimension,
                candidates: candidates.map(v => ({ value: v.intent_value, text: v.content })),
                k: 3,
                session_id: sessionId,
                current_text: unit.content
            });
            const byValue = new Map(candidates.map(v => [v.intent_value, v]));
            chosenVersions = ((ranked.data && ranked.data.values) || []).map(name => byValue.get(name)).filter(Boolean);
            if (candidates.length > 0 && chosenVersions.length === 0) throw new Error('empty ranking');
            ordering = ranked.data.ordering;
            mmrUsed = !!ranked.data.mmr_used;
            styleStrength = ranked.data.style_strength;
        } catch (rankError) {
            console.warn('Preference model unavailable for /rank:', rankError.message);
            logEvent({
                unit_id: unit.id,
                unit_title: unitTitle,
                intent_dimension: intent.dimension,
                event: 'model_unavailable',
                endpoint: 'rank'
            });
            chosenVersions = shuffle(candidates).slice(0, 3);
            ordering = 'fallback_random';
            mmrUsed = false;
        }
        if (cardsRequestIdRef.current !== requestId) return null; // user already moved on
        const items = chosenVersions.map(v => ({
            value: v.intent_value,
            content: v.content,
            parts: diffWords(unit.content, v.content)
        }));
        if (items.length === 0) return 'empty';
        const display = {
            unitId: unit.id, unitTitle, dimension: intent.dimension, currentValue: intent.current_value, context,
            sessionId, currentText: unit.content, styleStrength,
            items, ordering, mmrUsed, trigger,
            loading: false, error: false, regenerating: false, regenError: false, ended: false, shownAt: Date.now()
        };
        cardsRef.current = display;
        setCardsState(display);
        logEvent({
            unit_id: display.unitId,
            unit_title: display.unitTitle,
            intent_dimension: display.dimension,
            event: 'cards_shown',
            shown_values: items.map(item => item.value),
            positions: items.map((item, index) => index + 1),
            ordering,
            mmr_used: mmrUsed,
            trigger,
            style_strength: styleStrength,
            filtered_candidates: candidates.filtered || 0
        });
        return display;
    };

    // cards: an intent dimension was selected, fetch the rewritten versions of every value
    const handleDimensionSelect = async (intent) => {
        if (EXPERIMENT.cond !== 'cards' || !selectedComponentId) return;
        const unit = combinedResults.find(component => component.id === selectedComponentId);
        if (!unit) return;
        const open = cardsRef.current;
        if (open && !open.error && open.unitId === selectedComponentId && open.dimension === intent.dimension) return;

        flushLeave();
        setNotice(null);
        const unitTitle = unit.title || (components.find(c => c.id === selectedComponentId) || {}).title || null;
        const requestId = cardsRequestIdRef.current + 1;
        cardsRequestIdRef.current = requestId;
        const loadingState = {
            unitId: selectedComponentId, unitTitle, dimension: intent.dimension, currentValue: intent.current_value,
            items: [], loading: true, error: false, regenerating: false, regenError: false, ended: false, shownAt: null
        };
        cardsRef.current = loadingState;
        setCardsState(loadingState);

        const showError = () => {
            if (cardsRequestIdRef.current !== requestId) return;
            const failed = { ...loadingState, loading: false, error: true };
            cardsRef.current = failed;
            setCardsState(failed);
        };
        try {
            const candidates = await fetchVersions(unit, intent);
            if (cardsRequestIdRef.current !== requestId) return;
            const shown = await showDisplay({ unit, unitTitle, intent, candidates, trigger: 'intent_click', requestId });
            if (shown === 'empty') showError();
        } catch (error) {
            console.error('Error calling /intent-change-rewriter:', error);
            showError();
        }
    };

    // cards: after Use, log edit_done when the cursor leaves the unit and its text was changed (analysis only)
    const finishEditWatch = () => {
        const watch = editWatchRef.current;
        if (!watch) return;
        editWatchRef.current = null;
        const finalText = getUnitNodeText(watch.unitId, valueRef.current);
        if (finalText === null || finalText === watch.replacedText) return;
        logEvent({
            unit_id: watch.unitId,
            unit_title: watch.unitTitle,
            intent_dimension: watch.dimension,
            event: 'edit_done',
            shown_values: watch.shownValues,
            positions: watch.positions,
            chosen_value: watch.chosenValue,
            edit_distance: levenshtein(watch.replacedText, finalText),
            duration_ms: Date.now() - watch.startedAt,
            replaced_text: watch.replacedText,
            final_text: finalText
        });
    };

    // The editor selection moved: leaving the used unit ends the edit watch
    const checkEditWatchSelection = () => {
        const watch = editWatchRef.current;
        if (!watch || !editor.selection) return;
        const node = editor.children[editor.selection.anchor.path[0]];
        const inUnit = !!node && Array.isArray(node.children) && node.children.some(child => child && child.componentId === watch.unitId);
        if (inUnit) {
            watch.entered = true;
        } else if (watch.entered) {
            finishEditWatch();
        }
    };

    useEffect(() => {
        const handleMouseDown = (event) => {
            if (!editWatchRef.current) return;
            const target = event.target;
            if (target && target.closest && target.closest('[data-slate-editor="true"]')) return;
            finishEditWatch();
        };
        document.addEventListener('mousedown', handleMouseDown, true);
        return () => document.removeEventListener('mousedown', handleMouseDown, true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // cards: Use
    const handleCardUse = (item) => {
        const cards = cardsRef.current;
        if (!cards || cards.loading || cards.error || cards.regenerating || cards.ended) return;
        const unit = combinedResults.find(component => component.id === cards.unitId);
        const intent = unit && unit.linkedIntents.find(i => i.dimension === cards.dimension);
        const component = components.find(c => c.id === cards.unitId);
        if (!unit || !intent || !component) return;

        if (editWatchRef.current) finishEditWatch();

        // Same value swap as the radio buttons: the chosen value becomes current, the old current takes its slot
        const otherValues = [...intent.other_values];
        const slot = otherValues.indexOf(item.value);
        if (slot !== -1) {
            otherValues[slot] = intent.current_value;
        } else {
            otherValues.push(intent.current_value);
        }
        const intentSelected = { dimension: cards.dimension, current_value: item.value, other_values: otherValues };

        // Line breaks inside a unit would throw off the position search; paragraphs stay as they are
        const newContent = item.content.replace(/\s*\n+\s*/g, ' ').trim();
        const oldNodeText = getUnitNodeText(cards.unitId, value);
        const replacedText = oldNodeText === null ? newContent : oldNodeText.replace(component.content, newContent);

        deselectEditor();
        const applied = replaceComponentText(cards.unitId, newContent, intentSelected);
        if (!applied) return;

        const shownValues = cards.items.map(i => i.value);
        const positions = cards.items.map((i, index) => index + 1);
        const update = endDisplay(cards, 'pick', { chosen_value: item.value });
        if (update) update.catch(() => {});
        cardsRef.current = null;
        setCardsState(null);
        setNotice(`Applied "${item.value}" to ${cards.unitTitle}.`);

        // Any later change to this text is logged as edit_done once the cursor leaves the unit
        editWatchRef.current = {
            unitId: cards.unitId,
            unitTitle: cards.unitTitle,
            dimension: cards.dimension,
            shownValues,
            positions,
            chosenValue: item.value,
            replacedText,
            startedAt: Date.now(),
            entered: false
        };

        // The same intent can drive other units too: bring them in line with the new value
        propagateIntentChange({
            sourceUnitId: cards.unitId,
            sourceTitle: cards.unitTitle,
            sourceOldContent: component.content,
            sourceNewContent: newContent,
            intentSelected,
            chosenValue: item.value
        });
    };

    // cards: write the rewritten texts of the other units into the editor and sync their intent state.
    // Works from the latest data (refs) in one pass, because it runs after an async wait.
    const applyOtherUnitTexts = (updates, intentSelected) => {
        // The user may be typing in the editor while the rewrites arrive: remember the caret as an offset in its
        // paragraph so it can be put back after the paragraphs are rebuilt (a stale selection would crash Slate).
        let cursor = null;
        let wasFocused = false;
        try {
            const sel = editor.selection;
            if (sel && Range.isCollapsed(sel) && sel.anchor.path.length === 2) {
                const node = editor.children[sel.anchor.path[0]];
                if (node && Array.isArray(node.children)) {
                    const before = node.children.slice(0, sel.anchor.path[1]).reduce((n, child) => n + ((child && child.text) || '').length, 0);
                    cursor = { index: sel.anchor.path[0], offset: before + sel.anchor.offset };
                    wasFocused = ReactEditor.isFocused(editor);
                }
            }
        } catch (cursorError) {
            cursor = null;
        }
        let workingValue = valueRef.current;
        let draft = originalTextRef.current;
        const applied = [];
        const rejected = {};
        updates.forEach(({ unit, newContent }) => {
            const current = componentsRef.current.find(c => c.id === unit.id);
            const oldContent = current ? current.content : unit.content;
            let span = null;
            const index = workingValue.findIndex(node => {
                span = locateUnitText(getNodeText(null, node), oldContent);
                return !!span;
            });
            if (index === -1) { // the text was edited away or overwritten in the meantime
                rejected[unit.id] = 'locate: text not found in the editor';
                return;
            }
            const problem = rewriteProblem({
                unit, oldContent, newContent,
                otherUnits: combinedResultsRef.current.filter(u => u.id !== unit.id),
                paragraphs: workingValue.map(node => getNodeText(null, node)),
                index
            });
            if (problem) { // never write a rewrite that would duplicate or swallow other parts of the email
                rejected[unit.id] = `check: ${problem}`;
                return;
            }
            const latestUnit = combinedResultsRef.current.find(u => u.id === unit.id) || unit;
            const linkedIntents = (latestUnit.linkedIntents || []).map(i => i.dimension === intentSelected.dimension
                ? { ...i, current_value: intentSelected.current_value, other_values: intentSelected.other_values } : i);
            if (cursor && cursor.index === index) {
                if (span.end <= cursor.offset) {
                    cursor.offset += newContent.length - (span.end - span.start);
                } else if (span.start < cursor.offset) {
                    cursor.offset = span.start + Math.min(cursor.offset - span.start, newContent.length);
                }
            }
            workingValue = workingValue.map((node, i) => {
                if (i !== index) return node;
                const keep = Array.isArray(node.children) ? node.children.find(child => child && child.highlight) : null;
                return {
                    ...node,
                    children: [{
                        text: getNodeText(null, node).slice(0, span.start) + newContent + getNodeText(null, node).slice(span.end),
                        componentId: keep ? keep.componentId : unit.id,
                        ...(keep ? { highlight: true } : {}),
                        hasDimensions: linkedIntents.length > 0,
                        linkedIntents
                    }]
                };
            });
            const draftSpan = locateUnitText(draft, oldContent);
            if (draftSpan) draft = draft.slice(0, draftSpan.start) + newContent + draft.slice(draftSpan.end);
            applied.push({ id: unit.id, title: unit.title, oldContent, newContent });
        });
        applied.rejected = rejected;
        if (applied.length === 0) return applied;

        deselectEditor();
        setValue(workingValue);
        setEditorKey(prev => prev + 1);
        if (cursor && wasFocused) {
            setTimeout(() => {
                try {
                    const node = workingValue[cursor.index];
                    if (!node || !Array.isArray(node.children)) return;
                    let remaining = cursor.offset;
                    let leaf = 0;
                    while (leaf < node.children.length - 1 && remaining > ((node.children[leaf] && node.children[leaf].text) || '').length) {
                        remaining -= ((node.children[leaf] && node.children[leaf].text) || '').length;
                        leaf += 1;
                    }
                    const point = { path: [cursor.index, leaf], offset: Math.min(remaining, ((node.children[leaf] && node.children[leaf].text) || '').length) };
                    ReactEditor.focus(editor);
                    Transforms.select(editor, { anchor: point, focus: point });
                } catch (restoreError) {
                    console.warn('Could not restore the caret:', restoreError);
                }
            }, 150);
        }
        setComponents(prev => prev.map(c => {
            const a = applied.find(x => x.id === c.id);
            return a ? { ...c, content: a.newContent } : c;
        }));
        setCombinedResults(prev => prev.map(u => {
            const a = applied.find(x => x.id === u.id);
            if (!a) return u;
            return {
                ...u,
                content: a.newContent,
                linkedIntents: (u.linkedIntents || []).map(i => i.dimension === intentSelected.dimension
                    ? { ...i, current_value: intentSelected.current_value, other_values: intentSelected.other_values } : i)
            };
        }));
        setOriginalText(draft);
        axios.post(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`, { content: draft })
            .catch(error => console.error('Error saving draft to sessionData:', error));
        // Keep the edit watch of the used unit consistent when its paragraph also held one of these units
        const watch = editWatchRef.current;
        if (watch) {
            applied.forEach(a => {
                const watchSpan = locateUnitText(watch.replacedText, a.oldContent);
                if (watchSpan) watch.replacedText = watch.replacedText.slice(0, watchSpan.start) + a.newContent + watch.replacedText.slice(watchSpan.end);
            });
        }
        return applied;
    };

    // cards: after Use, every other unit linked to the same intent gets the new intent value too: its text is
    // rewritten for that value (in parallel) and written into the editor, so nothing has to be redone unit by unit.
    const propagateIntentChange = async ({ sourceUnitId, sourceTitle, sourceOldContent, sourceNewContent, intentSelected, chosenValue }) => {
        const started = Date.now();
        const targets = combinedResultsRef.current.filter(unit => unit.id !== sourceUnitId
            && (unit.linkedIntents || []).some(i => i.dimension === intentSelected.dimension && i.current_value !== intentSelected.current_value));
        if (targets.length === 0) return;
        const appliedNotice = `Applied "${chosenValue}" to ${sourceTitle}.`;
        setNotice(`${appliedNotice} Updating ${targets.length} other part${targets.length > 1 ? 's' : ''} that use this intent…`);
        const draftBase = originalTextRef.current.replace(sourceOldContent, sourceNewContent);
        const results = await Promise.allSettled(targets.map(async (unit) => {
            const intentOthers = (unit.linkedIntents || [])
                .filter(i => i.dimension !== intentSelected.dimension)
                .map(i => ({ dimension: i.dimension, current_value: i.current_value }));
            // The model sometimes returns more than the unit (neighbouring sentences); ask again once if so
            let lastProblem = 'No version returned';
            for (let attempt = 0; attempt < 2; attempt++) {
                const response = await axios.post('http://localhost:3001/intent-change-rewriter', {
                    userName: globalUsername,
                    taskId: globalTaskId,
                    userTask,
                    draftLatest: draftBase,
                    componentCurrent: unit.content,
                    intentSelected: {
                        dimension: intentSelected.dimension,
                        current_value: intentSelected.current_value,
                        other_values: intentSelected.other_values
                    },
                    intentOthers
                });
                const variation = ((response.data && response.data.component_variations) || [])
                    .find(v => v && v.intent_value === intentSelected.current_value);
                if (!variation || typeof variation.content !== 'string' || !variation.content.trim()) continue;
                const cleaned = variation.content.replace(/\s*\n+\s*/g, ' ').trim(); // keep it inside its paragraph
                const paragraphs = valueRef.current.map(node => getNodeText(null, node));
                const current = componentsRef.current.find(c => c.id === unit.id);
                const oldContent = current ? current.content : unit.content;
                const index = paragraphs.findIndex(text => !!locateUnitText(text, oldContent));
                if (index === -1) { lastProblem = 'locate: text not found in the editor'; break; }
                const problem = rewriteProblem({
                    unit, oldContent, newContent: cleaned,
                    otherUnits: combinedResultsRef.current.filter(u => u.id !== unit.id),
                    paragraphs, index
                });
                if (!problem) return { unit, newContent: cleaned };
                lastProblem = `check: ${problem}`;
            }
            throw new Error(lastProblem);
        }));
        const rewritten = results.filter(r => r.status === 'fulfilled').map(r => r.value);
        const applied = applyOtherUnitTexts(rewritten, intentSelected);
        const appliedIds = new Set(applied.map(a => a.id));
        const failed = targets.filter(unit => !appliedIds.has(unit.id));
        const failedReasons = {};
        targets.forEach((unit, i) => {
            if (appliedIds.has(unit.id)) return;
            failedReasons[unit.id] = results[i].status === 'rejected'
                ? String((results[i].reason && results[i].reason.message) || results[i].reason)
                : (applied.rejected && applied.rejected[unit.id]) || 'locate: text not found in the editor';
        });
        logEvent({
            unit_id: sourceUnitId,
            unit_title: sourceTitle,
            intent_dimension: intentSelected.dimension,
            event: 'intent_propagated',
            chosen_value: chosenValue,
            updated_units: applied.map(a => a.id),
            failed_units: failed.map(unit => unit.id),
            failed_reasons: failedReasons,
            duration_ms: Date.now() - started
        });
        const names = (list) => list.map(x => x.title || x.id).join(', ');
        setNotice(prev => (prev && prev.startsWith(appliedNotice)
            ? `${appliedNotice}${applied.length ? ` Also updated: ${names(applied)}.` : ''}${failed.length ? ` Couldn't update: ${names(failed)}.` : ''}`
            : prev));
    };

    // cards: Regenerate. Ends the display, then asks the model whether the intent keeps being passed over:
    // if so the intent gets new values, otherwise the same values are rewritten again.
    const handleRegenerate = async () => {
        const cards = cardsRef.current;
        if (!cards || cards.loading || cards.error || cards.regenerating || cards.ended) return;
        const requestId = cardsRequestIdRef.current + 1;
        cardsRequestIdRef.current = requestId;
        const stale = () => cardsRequestIdRef.current !== requestId;
        const base = { unit_id: cards.unitId, unit_title: cards.unitTitle, intent_dimension: cards.dimension };

        const updating = endDisplay(cards, 'regenerate');
        const working = { ...cards, regenerating: true, regenError: false };
        cardsRef.current = working;
        setCardsState(working);

        let modelOk = true;
        try {
            await updating;
        } catch (updateError) {
            modelOk = false; // already logged as model_unavailable
        }
        let rejectMean = null;
        let exceeds = false;
        if (modelOk) {
            try {
                const response = await callModel('/reject-check', {
                    pid: EXPERIMENT.pid,
                    context: cards.context,
                    intent_dimension: cards.dimension
                });
                rejectMean = response.data.reject_mean;
                exceeds = !!response.data.exceeds;
            } catch (checkError) {
                console.warn('Preference model unavailable for /reject-check:', checkError.message);
                logEvent({ ...base, event: 'model_unavailable', endpoint: 'reject-check' });
                modelOk = false;
            }
        }

        // The old cards come back (as a new display) when a step fails
        const restore = (step) => {
            logEvent({ ...base, event: 'regenerate_failed', step, reject_mean: rejectMean });
            if (stale()) return;
            const restored = { ...cards, regenerating: false, regenError: true, ended: false, shownAt: Date.now() };
            cardsRef.current = restored;
            setCardsState(restored);
            logEvent({
                ...base,
                event: 'cards_shown',
                shown_values: restored.items.map(item => item.value),
                positions: restored.items.map((item, index) => index + 1),
                ordering: restored.ordering,
                mmr_used: restored.mmrUsed,
                trigger: 'regenerate',
                style_strength: restored.styleStrength
            });
        };

        const unit = combinedResultsRef.current.find(component => component.id === cards.unitId);
        const currentIntent = unit && unit.linkedIntents.find(i => i.dimension === cards.dimension);
        if (!unit || !currentIntent) {
            restore('rewrite');
            return;
        }
        let intent = { ...currentIntent, current_value: cards.currentValue };

        if (exceeds) {
            try {
                const response = await axios.post('http://localhost:3001/intent-regenerate-values', {
                    userName: globalUsername,
                    taskId: globalTaskId,
                    userTask,
                    draftLatest: originalTextRef.current,
                    intentDimension: cards.dimension,
                    currentValue: cards.currentValue,
                    rejectedValues: cards.items.map(item => item.value)
                });
                const newValues = response.data && response.data.other_values;
                if (!Array.isArray(newValues) || newValues.length === 0) throw new Error('No new values returned');
                // Intents and units are many-to-many: every unit linked to this intent gets the new values
                setCombinedResults(prev => prev.map(component => ({
                    ...component,
                    linkedIntents: (component.linkedIntents || []).map(i =>
                        i.dimension === cards.dimension ? { ...i, other_values: newValues } : i)
                })));
                logEvent({
                    ...base,
                    event: 'values_regenerated',
                    old_other_values: currentIntent.other_values,
                    new_other_values: newValues,
                    reject_mean: rejectMean
                });
                intent = { ...intent, other_values: newValues };
            } catch (valuesError) {
                console.warn('Could not regenerate intent values:', valuesError.message);
                restore('values');
                return;
            }
        }

        let candidates;
        try {
            candidates = await fetchVersions(unit, intent);
        } catch (rewriteError) {
            console.warn('Could not rewrite the versions:', rewriteError.message);
            restore('rewrite');
            return;
        }
        if (!exceeds && modelOk) {
            logEvent({ ...base, event: 'versions_regenerated', reject_mean: rejectMean });
        }
        if (stale()) return;
        const shown = await showDisplay({ unit, unitTitle: cards.unitTitle, intent, candidates, trigger: 'regenerate', requestId });
        if (shown === 'empty') restore('rewrite');
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

            // Baseline logging: a preview of another dimension that was never applied counts as a leave
            if (EXPERIMENT.cond === 'baseline' && previewSessionRef.current && previewSessionRef.current.dimension !== dimension) {
                flushLeave();
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
                    if (EXPERIMENT.cond === 'baseline') {
                        const now = Date.now();
                        const session = previewSessionRef.current;
                        if (!session || session.unitId !== selectedComponentId || session.dimension !== dimension) {
                            previewSessionRef.current = {
                                unitId: selectedComponentId,
                                unitTitle: selectedComponent.title || null,
                                dimension,
                                firstPreviewAt: now,
                                shownValues: [],
                                lastValue: null
                            };
                        }
                        const activeSession = previewSessionRef.current;
                        activeSession.lastValue = newValue;
                        if (!activeSession.shownValues.includes(newValue)) {
                            activeSession.shownValues.push(newValue);
                        }
                        logEvent({
                            unit_id: selectedComponentId,
                            unit_title: activeSession.unitTitle,
                            intent_dimension: dimension,
                            event: 'preview_shown',
                            shown_values: [newValue]
                        });
                    }
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

    if (!userTask) {
        if (!taskChecked) return null;
        return (
            <div className="firstPage">
                <div style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh - 112px', backgroundColor: '#F8FAFC' }}>
                    <div className="firstPage-content" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', position: 'absolute', top: '50%', transform: 'translateY(-50%)' }}>
                        <p className="firstPage-content-text" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}><RobotIcon /><span>Hi, I am email writing assistant.</span></p>
                        <p className="firstPage-content-text-sub">What can I help with?</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}>
                          {/* Spacer as wide as the send button, so the input box itself sits in the centre */}
                          <div style={{ width: '40px', flexShrink: 0 }} />
                          <Input.TextArea
                            value={taskInput}
                            onChange={e => setTaskInput(e.target.value)}
                            placeholder="Please input your Email task here..."
                            autoSize={{ minRows: 2, maxRows: 6 }}
                            style={{
                              flex: 1,
                              minWidth: 0,
                              minHeight: '82px',
                              borderRadius: '48px',
                              border: '2px solid var(--Color-2, #475569)',
                              background: '#FFF',
                              display: 'flex',
                              padding: '8px 16px',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              alignSelf: 'stretch',
                            }}
                          />
                          <Button size="large" type="primary" shape="circle" icon={<SendOutlined />} onClick={handleSubmitTask} disabled={!taskInput.trim() || !globalTaskId}></Button>
                        </div>
                        {!globalTaskId && (
                            <p style={{ marginTop: '12px', color: '#999' }}>Please enter a username at the top right first.</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (!inEditor) {
        if (!contentLoaded) return null;
        return (
            <div className="firstPage" style={{ height: 'calc(100vh - 64px)' }}>
                        <div className="chatContainer" style={{ padding: '24px 24px', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', height: '100vh - 112px' }}>
                            <div className="ChatMessage_User" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <UserAvatarIcon size={40} style={{ marginRight: '8px' }} />
                                <div className="ChatMessage_User_Content">
                                    <p className="ChatMessage_User_Content_Label" style={{ color: '#000', fontSize: '16px', fontWeight: 'bold' }}>You</p>
                                    <div className="ChatMessage_User_Content_Text">
                                        {userTask}
                                    </div>
                                </div>
                            </div>
                            <div className="ChatMessage_Assistant" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '16px', width: '100%' }}>
                                <BotAvatarIcon size={40} style={{ marginRight: '8px', alignSelf: 'flex-start' }} />
                                <div className="ChatMessage_Assistant_Content" style={{ flex: 1, minWidth: 0 }}>
                                <p className="ChatMessage_User_Content_Label" style={{ color: '#000', fontSize: '16px', fontWeight: 'bold' }}>PersonaMail Bot</p>
                                    <FactorPanel
                                        variant="chat"
                                        selection={factorSelection}
                                        userTask={userTask}
                                        hasDraft={false}
                                        canGenerate={Boolean(userTask && globalTaskId)}
                                        onGenerate={handleConfirmAndGenerate}
                                    />
                                </div>
                            </div>
                        </div>
            </div>
        );
    }

    return (
        <div
            className='emailEditor'
            style={{
                display: 'flex',
                alignItems: 'flex-start',
                overflow: 'visible'
            }}
        >
        {/* Factor sidebar: full height on the left */}
        <div
            style={{
                display: sidebarCollapsed ? 'none' : 'block',
                width: '360px',
                flexShrink: 0,
                height: 'calc(100vh - 64px)',
                position: 'sticky',
                top: 0,
                background: '#fff',
                borderRight: '1px solid #f0f0f0'
            }}
        >
            <FactorPanel
                variant="sidebar"
                selection={factorSelection}
                userTask={userTask}
                hasDraft={hasDraft}
                canGenerate={Boolean(userTask && globalTaskId)}
                onGenerate={factorSelection.handleGenerateDraft}
            />
        </div>
        {/* Arrow between the sidebar and the editor: hides / shows the sidebar */}
        <div style={{ position: 'sticky', top: 0, height: 'calc(100vh - 64px)', width: 0, flexShrink: 0, zIndex: 10 }}>
            <Button
                shape="circle"
                size="small"
                icon={sidebarCollapsed ? <RightOutlined /> : <LeftOutlined />}
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: sidebarCollapsed ? '4px' : '-12px',
                    transform: 'translateY(-50%)',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                }}
            />
        </div>
        <div
            style={{
                flex: 1,
                minWidth: 0,
                height: 'calc(100vh - 64px)',
                overflowY: 'auto',
                padding: '24px',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold' }}>Email Draft Editor</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <Button
                        ref={generateButtonRef}
                        onClick={() => {
                            if (showGuide) markGuideSeen();
                            handleExtractComponents();
                        }}
                        loading={loading}
                        disabled={!hasDraft}
                    >
                        Generate Components
                    </Button>
                    <Button onClick={safeResetEditor} danger>
                        Reset Editor
                    </Button>
                </div>
            </div>
            
            <style>{`
                .components-guide .ant-tour,
                .components-guide .ant-tour-content,
                .components-guide .ant-tour-inner { width: max-content; min-width: 0; max-width: none; }
                .components-guide .ant-tour-description { white-space: nowrap; }
            `}</style>
            <Tour
                rootClassName='components-guide'
                open={showGuide}
                onClose={markGuideSeen}
                onFinish={markGuideSeen}
                mask={{ color: 'rgba(0, 0, 0, 0.25)' }}
                steps={[{
                    target: () => generateButtonRef.current,
                    description: 'Click to split your email into parts and see the writing choices behind each part.',
                    placement: 'bottomRight',
                    closeIcon: false,
                    nextButtonProps: { children: 'Got it' }
                }]}
            />

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
                                        checkEditWatchSelection();
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
                                        minHeight: 0,
                                        overflow: 'auto',
                                        position: 'relative'
                                    }}>
                                        {draftGenerating && (
                                            <div className='draft-generating' role='status' aria-live='polite'>
                                                <style>{`
                                                    .draft-generating { position: absolute; inset: 0; z-index: 5; display: flex; align-items: center;
                                                        justify-content: center; gap: 14px; background: rgba(255, 255, 255, 0.85); color: #1677ff;
                                                        font-size: 18px; font-weight: 600; }
                                                    .draft-generating .dot { width: 12px; height: 12px; border-radius: 50%; background: #1677ff;
                                                        display: inline-block; animation: draft-bounce 1s infinite ease-in-out; }
                                                    .draft-generating .dot:nth-child(2) { animation-delay: 0.15s; }
                                                    .draft-generating .dot:nth-child(3) { animation-delay: 0.3s; }
                                                    @keyframes draft-bounce {
                                                        0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
                                                        40% { transform: translateY(-12px); opacity: 1; }
                                                    }
                                                `}</style>
                                                <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'flex-end', height: '24px' }}>
                                                    <span className='dot' />
                                                    <span className='dot' />
                                                    <span className='dot' />
                                                </span>
                                                <span>Generating email…</span>
                                            </div>
                                        )}
                                        <Editable
                                            renderElement={renderElement}
                                            renderLeaf={renderLeaf}
                                            onKeyDown={handleKeyDown}
                                            placeholder={loading ? 'Loading...' : draftGenerating ? '' : hasDraft ? 'Start typing...' : 'Select your options in the left sidebar, then click "Generate Email Draft".'}
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

                                {/* Ask AI to add content */}
                                {SHOW_ASK_AI && (
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', padding: '8px 16px', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
                                    <Input.TextArea
                                        value={aiPrompt}
                                        onChange={e => setAiPrompt(e.target.value)}
                                        placeholder="Tell AI what to add, e.g. mention that I can meet next Tuesday"
                                        autoSize={{ minRows: 1, maxRows: 3 }}
                                        disabled={!hasDraft || aiLoading}
                                    />
                                    <Button
                                        type="primary"
                                        icon={<SendOutlined />}
                                        onClick={handleAiAddContent}
                                        loading={aiLoading}
                                        disabled={!hasDraft || !aiPrompt.trim()}
                                    >
                                        Ask AI
                                    </Button>
                                </div>
                                
                                )}

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
                                    minHeight: 0,
                                    overflow: 'auto'
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
                                                    backgroundColor: selectedComponentId === component.id ? (EXPERIMENT.cond === 'cards' ? '#eaf1fd' : '#e6f7ff') : 'white',
                                                    border: selectedComponentId === component.id ? `1px solid ${EXPERIMENT.cond === 'cards' ? '#2f6fde' : '#1890ff'}` : '1px solid #e8e8e8',
                                                    borderLeft: selectedComponentId === component.id ? `4px solid ${EXPERIMENT.cond === 'cards' ? '#2f6fde' : '#1890ff'}` : '1px solid #e8e8e8',
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
                                                        color: selectedComponentId === component.id ? (EXPERIMENT.cond === 'cards' ? '#2f6fde' : '#1890ff') : '#333',
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
                            {EXPERIMENT.cond !== 'cards' && (
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
                            )}
                        </div>
                        
                        {/* Preview section - fixed height */}
                        {EXPERIMENT.cond !== 'cards' && (
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
                        )}
                        
                        {/* Scrollable cards section */}
                        {EXPERIMENT.cond === 'cards' ? renderCardsIntents() : (
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
                                                    {getIntentOptions(intent).map((value, index) => (
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
                        )}
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
            
            {/* AI Add Content Preview Modal */}
            {SHOW_ASK_AI && (
            <Modal
                title="Preview: Revised Email"
                open={aiPreview.visible}
                onCancel={handleDiscardAiPreview}
                footer={[
                    <Button key="discard" onClick={handleDiscardAiPreview}>
                        Discard
                    </Button>,
                    <Button key="apply" type="primary" onClick={handleApplyAiPreview}>
                        Apply
                    </Button>
                ]}
                width={720}
            >
                <div style={{
                    background: '#e6f7ff',
                    padding: '12px',
                    borderRadius: '4px',
                    whiteSpace: 'pre-wrap',
                    lineHeight: '1.8',
                    maxHeight: '60vh',
                    overflow: 'auto'
                }}>
                    {aiPreview.content}
                </div>
            </Modal>
            )}

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