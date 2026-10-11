import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Radio, Checkbox, Spin, message, Tag, Button, Typography, Input, Upload, Select, Tooltip } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { InboxOutlined } from '@ant-design/icons';

const { Text } = Typography;
const { Dragger } = Upload;

const SecondPage = () => {
    const location = useLocation();
    const { userTask, userName, taskId, anchors } = location.state || {};
    console.log('userName:', userName); // 检查 userName 是否正确传递
    console.log('userTask:', userTask); // 检查 userTask 是否正确传递
    console.log('taskId:', taskId); // 检查 taskId 是否正确传递
    console.log('anchors:', anchors); // 检查 anchors 是否正确传递
    const [factors, setFactors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedCards, setSelectedCards] = useState([]); // 存储多选的卡片
    const [selectedOptions, setSelectedOptions] = useState({}); // 存储每个卡片内的单选选项
    const [snippets, setSnippets] = useState({}); // 存储每个卡片的 snippet
    const [loadingSnippets, setLoadingSnippets] = useState({}); // 存储每个卡片的加载状态
    const [generatingEmail, setGeneratingEmail] = useState(false);
    const navigate = useNavigate();
    const [personaAnchors, setPersonaAnchors] = useState({});
    const [situationAnchors, setSituationAnchors] = useState({});
    const [selectedPersona, setSelectedPersona] = useState(null);
    const [selectedSituation, setSelectedSituation] = useState(null);
    const [fileList, setFileList] = useState([]);
    const [personaOptions, setPersonaOptions] = useState([]);
    const [situationOptions, setSituationOptions] = useState([]);

    useEffect(() => {
        console.log('userTask:', userTask); // 检查 userTask 是否有值
        const fetchRankedFactors = async () => {
            try {
                const response = await axios.post('http://localhost:3001/rank-and-revise-factors', {
                    userTask, // 使用从 FirstPage 传递过来的 userTask
                });
                setFactors(response.data);
            } catch (error) {
                console.error('获取 ranked factors 出错:', error);
                message.error('获取 ranked factors 出错，请稍后重试');
            } finally {
                setLoading(false);
            }
        };

        const fetchAnchors = async () => {
            try {
                const response = await axios.get(`http://localhost:3001/api/anchors/${userName}`);
                const anchors = response.data;

                // Store the full objects for persona and situation anchors
                setPersonaAnchors(anchors.persona || {});
                setSituationAnchors(anchors.situation || {});
            } catch (error) {
                console.error('Error fetching anchors:', error);
                message.error('Failed to fetch anchors. Please ensure the session data is initialized correctly.');
            }
        };

        if (userTask) {
            fetchRankedFactors();
        } else {
            message.error('userTask 未传递，请检查 FirstPage 的跳转逻辑');
            setLoading(false);
        }

        if (anchors) {
            setPersonaAnchors(anchors.persona || {});
            setSituationAnchors(anchors.situation || {});
        } else if (taskId) {
            fetchAnchors();
        }
    }, [userTask, taskId, userName, anchors]);

    useEffect(() => {
        // Fetch anchors data from the API
        const fetchAnchorsData = async () => {
            try {
                const response = await axios.get(`http://localhost:3001/api/anchors/${userName}`);
                console.log('API Response:', response.data); // Debugging: Log the API response

                const { persona, situation } = response.data;

                // Map persona and situation data to Select options
                const personaMapped = [
                    {
                        label: persona.title, // Ensure title is mapped to label
                        value: persona.description, // Ensure description is mapped to value
                    },
                ];

                const situationMapped = [
                    {
                        label: situation.title, // Ensure title is mapped to label
                        value: situation.description, // Ensure description is mapped to value
                    },
                ];

                console.log('Mapped Persona Options:', personaMapped); // Debugging: Log mapped persona options
                console.log('Mapped Situation Options:', situationMapped); // Debugging: Log mapped situation options

                setPersonaOptions(personaMapped);
                setSituationOptions(situationMapped);
            } catch (error) {
                console.error('Error fetching anchors data:', error);
                message.error('Failed to fetch anchors data.');
            }
        };

        fetchAnchorsData();
    }, [userName]);

    const handleCardSelect = (factorId) => {
        setSelectedCards((prevSelectedCards) => {
            if (prevSelectedCards.includes(factorId)) {
                return prevSelectedCards.filter((id) => id !== factorId);
            } else {
                return [...prevSelectedCards, factorId];
            }
        });
    };

    const handleOptionChange = async (factorId, selectedValues) => {
        setSelectedOptions((prevSelectedOptions) => ({
            ...prevSelectedOptions,
            [factorId]: selectedValues, // Store selected values as an array
        }));

        // 初始化 snippets 和 loading 状态
        setSnippets((prevSnippets) => ({
            ...prevSnippets,
            [factorId]: {}, // 每次重新选择时清空该 factor 的 snippets
        }));
        setLoadingSnippets((prevLoadingSnippets) => ({
            ...prevLoadingSnippets,
            [factorId]: true,
        }));

        // 遍历选中的每个选项，逐个调用 generate-snippet 接口
        const newSnippets = {};
        for (const option of selectedValues) {
            try {
                const factorChoices = selectedCards.map((id) => ({
                    id,
                    title: factors.find((factor) => factor.id === id)?.title || '',
                    options: selectedOptions[id] || [],
                }));

                const response = await axios.post('http://localhost:3001/generate-snippet', {
                    userTask,
                    factorName: factors.find((factor) => factor.id === factorId)?.title || '',
                    factorOption: option,
                    factorChoices, // Pass FACTOR_CHOICES
                });

                if (response.data && response.data.snippet) {
                    newSnippets[option] = response.data.snippet; // 将 snippet 存储到对应选项
                } else {
                    message.error(`未能生成 snippet for option: ${option}`);
                }
            } catch (error) {
                console.error(`生成 snippet 出错 for option: ${option}`, error);
                message.error(`生成 snippet 出错 for option: ${option}`);
            }
        }

        // 更新 snippets 和 loading 状态
        setSnippets((prevSnippets) => ({
            ...prevSnippets,
            [factorId]: newSnippets,
        }));
        setLoadingSnippets((prevLoadingSnippets) => ({
            ...prevLoadingSnippets,
            [factorId]: false,
        }));
    };

    const handleAddCustomOption = (factorId, customOption) => {
        if (!customOption) return;

        setFactors((prevFactors) =>
            prevFactors.map((factor) =>
                factor.id === factorId
                    ? {
                          ...factor,
                          options: [...factor.options, customOption],
                      }
                    : factor
            )
        );

        // Automatically select the new custom option
        setSelectedOptions((prevSelectedOptions) => ({
            ...prevSelectedOptions,
            [factorId]: [...(prevSelectedOptions[factorId] || []), customOption],
        }));
    };

    const getTagColor = (index) => {
        if (index < 4) return { color: 'green', text: 'Highly Recommend' };
        if (index >= factors.length - 3) return { color: 'yellow', text: 'Low Recommend' };
        return { color: 'blue', text: 'Recommend' };
    };

    const handleGenerateEmail = async () => {
        setGeneratingEmail(true);

        try {
            // Step 1: 将选中的 factors 和 options 写入后端
            const factorChoices = selectedCards.map((factorId) => ({
                id: factorId,
                title: factors.find((factor) => factor.id === factorId)?.title || '',
                options: selectedOptions[factorId] || [], // Use array of selected options
            }));

            await axios.post('http://localhost:3001/save-factor-choices', {
                userName,
                factorChoices,
                taskId,
            });

            // Step 2: 调用 Intent Analyzer
            const intentResponse = await axios.post('http://localhost:3001/analyze-intent', {
                userName,
                userTask,
                factorChoices,
                taskId,
            });

            if (!intentResponse.data || !Array.isArray(intentResponse.data)) {
                throw new Error('Intent Analyzer 返回数据格式错误');
            }

            // Step 3: 调用 First-Draft Composer
            const draftResponse = await axios.post('http://localhost:3001/generate-first-draft', {
                userName,
                userTask,
                factorChoices,
                intents: intentResponse.data,
                taskId,
            });

            if (!draftResponse.data || !draftResponse.data.draft) {
                throw new Error('First-Draft Composer 返回数据格式错误');
            }

            // 确保所有请求完成后再跳转
            navigate('/third', {
                state: {
                    taskId,
                    userTask,
                    userName
                },
            });

            message.success('Email draft generated successfully!');
        } catch (error) {
            console.error('生成邮件时出错:', error);
            message.error('生成邮件时出错，请稍后重试');
        } finally {
            setGeneratingEmail(false);
        }
    };

    const handleGenerateContextualDraft = async () => {
        if (!selectedPersona && !selectedSituation) {
            message.error('Please select at least one anchor (Persona or Situation).');
            return;
        }

        const formData = new FormData();
        formData.append('personaAnchor', JSON.stringify(personaAnchors[selectedPersona] || {}));
        formData.append('situationAnchor', JSON.stringify(situationAnchors[selectedSituation] || {}));
        if (fileList.length > 0) {
            const file = fileList[0];
            const fileContent = await file.originFileObj.text();
            formData.append('writingSample', fileContent);
        } else {
            formData.append('writingSample', '');
        }

        // 确保 taskId 和 userName 被正确传递
        if (!taskId || !userName) {
            message.error('Task ID or User Name is missing.');
            return;
        }
        formData.append('taskId', taskId);
        formData.append('userName', userName);

        try {
            const response = await axios.post('http://localhost:3001/generate-contextual-draft', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const { draft } = response.data;

            // Save the draft to the backend
            await axios.post(`http://localhost:3001/sessiondata/${taskId}/drafts/latest.md`, { content: draft });

            // Navigate to Final Email page with the draft content
            navigate('/final-email', { state: { draft } });
        } catch (error) {
            console.error('Error generating contextual draft:', error);
            message.error('Failed to generate contextual draft.');
        }
    };

    // 检查是否满足激活按钮的条件
    const isButtonDisabled = () => {
        if (selectedCards.length < 3) return true; // 至少选择三个卡片
        for (const cardId of selectedCards) {
            if (!selectedOptions[cardId]) return true; // 每个选中的卡片必须有选中的选项
        }
        return false;
    };

    return (
        <Spin spinning={loading || generatingEmail} tip="Loading...">
            <div style={{ height: '100vh' }}>
                <Row gutter={[16, 16]} style={{ height: '100vh', overflow: 'hidden' }}>
                    {/* 左侧栅格 */}
                    <Col span={4} style={{ borderRight: '1px solid #e9e9e9', padding: '16px' }}>
                        <h3>User Information:</h3>
                        <p style={{ wordBreak: 'break-word' }}>Name: {userName || 'No name provided'}</p>
                        <h3>Your Email Task:</h3>
                        <p style={{ wordBreak: 'break-word' }}>{userTask || 'No task provided'}</p>

                        {/* 新增 Contextual First-Draft Composer 卡片 */}
                        <Card title="Contextual First-Draft Composer" style={{ marginTop: '16px' }}>
                            <p>
                                You can compose an initial email draft by integrating your chosen Persona and Situation
                                anchors, and relevant previous email samples rather than selecting the tones.
                            </p>
                            <div style={{ marginBottom: '16px' }}>
                                <Select
                                    placeholder="Select Persona Anchor"
                                    style={{ width: '100%', marginBottom: '8px' }}
                                    options={personaOptions}
                                    onChange={(value) => setSelectedPersona(value)}
                                    optionLabelProp="label"
                                />
                                <Select
                                    placeholder="Select Situation Anchor"
                                    style={{ width: '100%' }}
                                    options={situationOptions}
                                    onChange={(value) => setSelectedSituation(value)}
                                    optionLabelProp="label"
                                />
                            </div>
                            <Dragger
                                fileList={fileList}
                                onChange={({ fileList }) => setFileList(fileList)}
                                beforeUpload={() => false} // Prevent automatic upload
                                multiple={false}
                                accept=".md" // Restrict file format to .md
                            >
                                <p className="ant-upload-drag-icon">
                                    <InboxOutlined />
                                </p>
                                <p className="ant-upload-text">Click or drag file to this area to upload</p>
                            </Dragger>
                            <Button
                                type="primary"
                                style={{ marginTop: '16px' }}
                                onClick={handleGenerateContextualDraft}
                                disabled={!selectedPersona && !selectedSituation} // Disable button if no anchor is selected
                            >
                                Generate Contextual Draft
                            </Button>
                        </Card>
                    </Col>

                    {/* 右侧栅格 */}
                    <Col span={20} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        {/* 顶部固定部分 */}
                        <div
                            style={{
                                padding: '16px',
                                background: '#fff',
                                borderBottom: '1px solid #e9e9e9',
                                position: 'sticky',
                                top: 0,
                                zIndex: 10,
                            }}
                        >
                            <p style={{ marginBottom: '8px' }}>
                                Please select at least 3 factors and its option to generate an email draft
                            </p>
                            <Button
                                type="primary"
                                disabled={isButtonDisabled()} // 根据条件激活按钮
                                onClick={handleGenerateEmail}
                            >
                                Generate Email
                            </Button>
                        </div>

                        {/* 下半部分卡片网格系统 */}
                        <div
                            style={{
                                flex: 1,
                                overflowY: 'auto',
                                padding: '16px',
                                background: '#f5f5f5',
                            }}
                        >
                            <Row gutter={[16, 16]}>
                                {factors.map((factor, index) => {
                                    const tagInfo = getTagColor(index);
                                    return (
                                        <Col span={12} key={factor.id}>
                                            <Card
                                                bordered
                                                style={{
                                                    borderColor: selectedCards.includes(factor.id) ? '#1890ff' : '#f0f0f0',
                                                }}
                                                title={
                                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                                        <Checkbox
                                                            checked={selectedCards.includes(factor.id)}
                                                            onChange={() => handleCardSelect(factor.id)}
                                                            style={{ marginRight: 8 }}
                                                        />
                                                        <div style={{ fontSize: '14px', wordBreak: 'break-word', flex: 1 }}>
                                                            {factor.title}
                                                        </div>
                                                        <Tag color={tagInfo.color}>{tagInfo.text}</Tag>
                                                    </div>
                                                }
                                            >
                                                <Checkbox.Group
                                                    options={factor.options.map((option) => ({ label: option, value: option }))}
                                                    value={selectedOptions[factor.id] || []}
                                                    onChange={(selectedValues) => handleOptionChange(factor.id, selectedValues)}
                                                    disabled={!selectedCards.includes(factor.id)}
                                                />
                                                {loadingSnippets[factor.id] ? (
                                                    <Spin
                                                        tip="loading the snippet"
                                                        style={{ display: 'block', marginTop: '8px' }}
                                                    />
                                                ) : (
                                                    selectedOptions[factor.id]?.map((option) => (
                                                        snippets[factor.id]?.[option] && (
                                                            <Text type="secondary" style={{ display: 'block', marginTop: '8px' }} key={option}>
                                                                Snippet for "{option}": "{snippets[factor.id][option]}"
                                                            </Text>
                                                        )
                                                    ))
                                                )}
                                                {/* 自定义选项输入框 */}
                                                <div style={{ marginTop: '16px' }}>
                                                    <Input.Search
                                                        placeholder="Add custom option"
                                                        enterButton="Add"
                                                        onSearch={(value) => handleAddCustomOption(factor.id, value)}
                                                        disabled={!selectedCards.includes(factor.id)}
                                                    />
                                                </div>
                                            </Card>
                                        </Col>
                                    );
                                })}
                            </Row>
                        </div>
                    </Col>
                </Row>
            </div>
        </Spin>
    );
};

export default SecondPage;    