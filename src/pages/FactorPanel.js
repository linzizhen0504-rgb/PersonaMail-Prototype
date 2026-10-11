// Factor selection panel (moved from EmailTask.js): shown in the chat step after the task is entered,
// and in the Email Editor sidebar. Both share one selection state through useFactorSelection.
import React, { useState, useEffect } from 'react';
import { Button, Input, Checkbox, Card, Collapse, Row, Col, Radio, Tag, Select, Modal, Popconfirm, message } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import relationshipIcon from '../relationship.png'; // 引入图片
import communicationIcon from '../commnuication.png'; // 引入图片
import demongraphyIcon from '../demography.png'; // 引入图片
import ristMitigationIcon from '../ristMitigation.png'; // 引入图片
import axios from 'axios';

export const useFactorSelection = ({ userTask, userName: globalUsername, taskId: globalTaskId, onDraftGenerated, onLoadingChange }) => {

    const [factorData, setFactorData] = useState([]);
    const [selectedValues, setSelectedValues] = useState({}); // To track selected values for each factor
    const [selectedFactors, setSelectedFactors] = useState({}); // To track which factors are selected
    const [userDefinedOptions, setUserDefinedOptions] = useState({}); // To track user-defined options for each factor
    const [editingOption, setEditingOption] = useState(null);
    const [editValue, setEditValue] = useState('');

    // Reset user-defined options when username changes
    useEffect(() => {
        setUserDefinedOptions({}); // Reset user-defined options
    }, [globalUsername]);

    // Initialize default selections when factorData is loaded
    useEffect(() => {
        if (Object.keys(factorData).length > 0) {
            // No default selections - let users choose manually
            // setSelectedFactors and setSelectedValues will remain empty initially
        }
    }, [factorData]);

    // Handle factor checkbox change
    const handleFactorChange = (factorId, checked) => {
        setSelectedFactors(prev => {
            const newSelectedFactors = { ...prev, [factorId]: checked };
            
            // If unchecking a factor, remove its selected values
            if (!checked) {
                setSelectedValues(prevValues => {
                    const newValues = { ...prevValues };
                    delete newValues[factorId];
                    return newValues;
                });
            } else {
                // If checking a factor, set default option only if none is selected
                const factor = Object.values(factorData).flat().find(f => f.id === factorId);
                if (factor && factor.options && factor.options.length > 0) {
                    const validOptions = factor.options.filter(option => option && option.value !== undefined);
                    const userOptions = userDefinedOptions[factorId] || [];
                    const allOptions = [...validOptions, ...userOptions];
                    
                    if (allOptions.length > 0) {
                        setSelectedValues(prevValues => ({
                            ...prevValues,
                            [factorId]: factor.select_type === 'single' 
                                ? allOptions[0].value 
                                : [allOptions[0].value]
                        }));
                    }
                }
            }
            
            return newSelectedFactors;
        });
    };

    const handleMultipleChange = (factorId, option, factorOptions) => {
        // Add safety checks for undefined option
        if (!option || option.value === undefined) {
            console.warn('Invalid option passed to handleMultipleChange:', option);
            return;
        }

        // Only allow changes if the factor is selected
        if (!selectedFactors[factorId]) {
            return;
        }

        setSelectedValues(prev => {
            // Ensure factorOptions exists and has at least one valid option
            const validFactorOptions = factorOptions?.filter(opt => opt && opt.value !== undefined) || [];
            if (validFactorOptions.length === 0) {
                console.warn('No valid factor options available for factorId:', factorId);
                return prev;
            }

            const currentValues = prev[factorId] || [];
            
            // Check if the option value is already selected
            const isSelected = currentValues.includes(option.value);
            
            let newValues;
            if (isSelected) {
                // Remove the option if it's already selected
                newValues = currentValues.filter(v => v !== option.value);
                // For multiple selection, allow empty selection
            } else {
                // Add the option if it's not selected
                newValues = [...currentValues, option.value];
            }

            return { ...prev, [factorId]: newValues };
        });
    };

    const handleSingleChange = (factorId, value) => {
        // Only allow changes if the factor is selected
        if (!selectedFactors[factorId]) {
            return;
        }
        setSelectedValues(prev => ({ ...prev, [factorId]: value }));
    };

    const [loading, setLoading] = useState(false);

    // Named templates: saved factor selections, stored per user in localStorage
    const templatesKey = `emailTask_templates_${globalUsername || ''}`;
    const loadTemplates = () => {
        try {
            const saved = JSON.parse(localStorage.getItem(templatesKey) || '[]');
            if (Array.isArray(saved) && saved.length > 0) return saved;
            // Carry over selections saved earlier with the old "Save as Default" button
            const oldDefault = JSON.parse(localStorage.getItem('emailTask_defaultData') || 'null');
            if (oldDefault) return [{ name: 'Default', ...oldDefault }];
        } catch (error) {
            console.error('Error loading templates:', error);
        }
        return [];
    };
    const [templates, setTemplates] = useState(loadTemplates);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [saveTemplateModal, setSaveTemplateModal] = useState(false);
    const [templateName, setTemplateName] = useState('');

    // Templates belong to the user; selections belong to the task
    useEffect(() => {
        setTemplates(loadTemplates());
        setSelectedTemplate(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [globalUsername]);

    useEffect(() => {
        setSelectedFactors({});
        setSelectedValues({});
        setSelectedTemplate(null);
    }, [globalTaskId]);

    const persistTemplates = (newTemplates) => {
        setTemplates(newTemplates);
        localStorage.setItem(templatesKey, JSON.stringify(newTemplates));
    };

    const buildTemplate = (name) => {
        // Unsaved text in the "Enter your options here..." inputs is not part of a template
        const values = Object.fromEntries(Object.entries(selectedValues).filter(([key]) => !key.startsWith('input_')));
        return {
            name,
            selectedFactors: selectedFactors,
            selectedValues: values,
            userDefinedOptions: userDefinedOptions,
            timestamp: new Date().toISOString()
        };
    };

    const templateNameTaken = templates.some(t => t.name === templateName.trim());

    // Save current selections as a new named template
    const handleAddTemplate = () => {
        const name = templateName.trim();
        if (!name || templateNameTaken) return;

        persistTemplates([...templates, buildTemplate(name)]);
        setSelectedTemplate(name);
        setSaveTemplateModal(false);
        setTemplateName('');
        message.success(`Template "${name}" added`);
    };

    // Overwrite the currently selected template with the current selections
    const handleUpdateTemplate = () => {
        if (!selectedTemplate) return;
        persistTemplates(templates.map(t => (t.name === selectedTemplate ? buildTemplate(selectedTemplate) : t)));
        message.success(`Template "${selectedTemplate}" updated`);
    };

    // Apply a previously saved template
    const handleApplyTemplate = (name) => {
        const template = templates.find(t => t.name === name);
        if (!template) return;
        setSelectedFactors(template.selectedFactors || {});
        setSelectedValues(template.selectedValues || {});
        setUserDefinedOptions(template.userDefinedOptions || {});
        setSelectedTemplate(name);
    };

    const handleDeleteTemplate = (name) => {
        persistTemplates(templates.filter(t => t.name !== name));
        if (selectedTemplate === name) setSelectedTemplate(null);
    };

    // Clear all current selections
    const handleClearAll = () => {
        setSelectedFactors({});
        setSelectedValues({});
        setUserDefinedOptions({});
        setSelectedTemplate(null);
        
        // Also clear any input fields
        const inputKeys = Object.keys(selectedValues).filter(key => key.startsWith('input_'));
        const clearedInputs = {};
        inputKeys.forEach(key => {
            clearedInputs[key] = '';
        });
        setSelectedValues(prev => ({ ...clearedInputs }));
        
        console.log('Cleared all selections');
        alert('All selections cleared!');
    };

    const handleGenerateDraft = async () => {
      setLoading(true); // Start loading
      if (onLoadingChange) onLoadingChange(true);
      try {
        console.log('Selected Values:', selectedValues);
        console.log('Selected Factors:', selectedFactors);
        
        // Only include factor choices for selected factors with actual values
        const factorChoices = Object.entries(selectedValues).reduce((acc, [factorId, selectedOption]) => {
          // Only include if the factor is selected AND has actual values
          if (selectedFactors[factorId] && selectedOption && 
              ((Array.isArray(selectedOption) && selectedOption.length > 0) || 
               (!Array.isArray(selectedOption) && selectedOption.trim()))) {
            const factor = Object.values(factorData).flat().find(f => f.id === factorId);
            if (factor) {
              acc[factorId] = {
                id: factor.id,
                select_type: factor.select_type,
                source: factor.source,
                title: factor.title,
                Category: factor.Category,
                options: Array.isArray(selectedOption) 
                  ? selectedOption.map(value => ({ value, type: 'user-defined' })) 
                  : [{ value: selectedOption, type: 'user-defined' }]
              };
            }
          }
          return acc;
        }, {});

        // Save factor choices
        await axios.post(`http://localhost:3001/save-factor-choices`, {
          userName: globalUsername,
          factorChoices,
          taskId: globalTaskId
        });

        const response = await axios.post('http://localhost:3001/generate-first-draft', { userTask, factorChoices });

        // Save the draft content to latest.md
        await axios.post(`http://localhost:3001/sessiondata/${globalTaskId}/drafts/latest.md`, {
          content: response.data.draft
        });

        onDraftGenerated(response.data.draft);
      } catch (error) {
        console.error('Error generating draft:', error);
        message.error('Failed to generate draft. Please try again.');
      } finally {
        setLoading(false); // End loading
        if (onLoadingChange) onLoadingChange(false);
      }
    };

    // Function to get icon for category
    const getCategoryIcon = (category) => {
        switch (category) {
            case 'Relationship between sender and receiver':
                return relationshipIcon;
            case 'Communication Context':
                return communicationIcon;
            case 'Demography':
                return demongraphyIcon;
            case 'Risk Mitigation':
                return ristMitigationIcon;
            default:
                return null;
        }
    };

    useEffect(() => {
        // Fetch the factor list JSON dynamically
        axios.get('/data/PredefinedData/factor_list.json')
            .then(response => {
                const groupedData = response.data.reduce((acc, item) => {
                    if (!acc[item.Category]) {
                        acc[item.Category] = [];
                    }
                    acc[item.Category].push(item);
                    return acc;
                }, {});
                setFactorData(groupedData);
            })
            .catch(error => console.error('Error fetching factor list:', error));
    }, []);

    return {
        factorData, setFactorData,
        selectedValues, setSelectedValues,
        selectedFactors,
        userDefinedOptions, setUserDefinedOptions,
        editingOption, setEditingOption,
        editValue, setEditValue,
        handleFactorChange, handleMultipleChange, handleSingleChange,
        templates, selectedTemplate, templateNameTaken,
        saveTemplateModal, setSaveTemplateModal,
        templateName, setTemplateName,
        handleAddTemplate, handleUpdateTemplate, handleApplyTemplate, handleDeleteTemplate,
        handleClearAll, handleGenerateDraft, getCategoryIcon,
        loading,
    };
};

// variant "chat": two-column factor cards inside the chat step; variant "sidebar": single column in the editor sidebar
const FactorPanel = ({ selection, variant = 'sidebar', userTask, hasDraft, canGenerate, onGenerate }) => {
    const {
        factorData, setFactorData,
        selectedValues, setSelectedValues,
        selectedFactors,
        userDefinedOptions, setUserDefinedOptions,
        editingOption, setEditingOption,
        editValue, setEditValue,
        handleFactorChange, handleMultipleChange, handleSingleChange,
        templates, selectedTemplate, templateNameTaken,
        saveTemplateModal, setSaveTemplateModal,
        templateName, setTemplateName,
        handleAddTemplate, handleUpdateTemplate, handleApplyTemplate, handleDeleteTemplate,
        handleClearAll, getCategoryIcon,
        loading,
    } = selection;
    const isChat = variant === 'chat';

    const templateSelect = (
                <div style={{ marginTop: '12px' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#333', marginBottom: '6px' }}>Template</div>
                    <Select
                        style={{ width: '100%' }}
                        placeholder={templates.length > 0 ? 'Select a saved template' : 'No saved templates yet'}
                        value={selectedTemplate}
                        onChange={handleApplyTemplate}
                        disabled={templates.length === 0}
                        optionLabelProp="label"
                        options={templates.map(t => ({
                            value: t.name,
                            label: t.name,
                            title: t.timestamp ? `Saved on ${new Date(t.timestamp).toLocaleString()}` : t.name
                        }))}
                        optionRender={(option) => (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{option.label}</span>
                                <span onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                                    <Popconfirm
                                        title={`Delete template "${option.value}"?`}
                                        okText="Delete"
                                        okButtonProps={{ danger: true }}
                                        onConfirm={() => handleDeleteTemplate(option.value)}
                                    >
                                        <Button type="text" size="small" icon={<DeleteOutlined />} title="Delete template" />
                                    </Popconfirm>
                                </span>
                            </div>
                        )}
                    />
                </div>
    );

    const factorGrid = (
                                    <div className="ChatMessage_Assistant_Content_Factors" style={{ width: '100%' }}>
                                        <Row gutter={[16, 16]} justify="space-between" style={{ width: '100%' }}>
                                            {Object.entries(factorData).map(([category, factors]) => (
                                                <Col span={variant === 'chat' ? 12 : 24} key={category}>
                                                    <Card 
                                                        title={
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                {getCategoryIcon(category) && (
                                                                    <img 
                                                                        src={getCategoryIcon(category)} 
                                                                        alt={category} 
                                                                        style={{ width: '48px', height: '48px' }} 
                                                                    />
                                                                )}
                                                                <span>{category}</span>
                                                            </div>
                                                        } 
                                                        variant="borderless"
                                                    >
                                                        <Collapse 
                                                            defaultActiveKey={[]} 
                                                            collapsible="icon"
                                                        >
                                                            {factors.map((factor, index) => {
                                                                // Ensure factor.options exists and filter out invalid options
                                                                const predefinedOptions = factor.options?.filter(option => option && option.value !== undefined) || [];
                                                                const userOptions = userDefinedOptions[factor.id] || [];
                                                                const validOptions = [...predefinedOptions, ...userOptions];
                                                                const isFactorSelected = selectedFactors[factor.id] || false;
                                                                
                                                                return (
                                                                    <Collapse.Panel
                                                                        header={
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                                                                    <Checkbox 
                                                                                        style={{ marginRight: '8px' }} 
                                                                                        checked={isFactorSelected}
                                                                                        onChange={(e) => {
                                                                                            e.stopPropagation(); // Prevent collapse toggle
                                                                                            handleFactorChange(factor.id, e.target.checked);
                                                                                        }}
                                                                                    />
                                                                                    {factor.title}
                                                                                </div>
                                                                                <div style={{ 
                                                                                    maxWidth: '150px', 
                                                                                    textOverflow: 'ellipsis', 
                                                                                    overflow: 'hidden', 
                                                                                    whiteSpace: 'nowrap', 
                                                                                    color: isFactorSelected ? '#4096ff' : '#ccc', 
                                                                                    fontSize: '12px' 
                                                                                }}>
                                                                                    {isFactorSelected ? (
                                                                                        selectedValues[factor.id] ? (
                                                                                            factor.select_type === 'single'
                                                                                                ? selectedValues[factor.id]
                                                                                                : selectedValues[factor.id].length > 1
                                                                                                    ? `${selectedValues[factor.id][0]}...`
                                                                                                    : selectedValues[factor.id][0]
                                                                                        ) : 'No selection'
                                                                                    ) : 'Not selected'}
                                                                                </div>
                                                                            </div>
                                                                        }
                                                                        key={factor.id}
                                                                    >
                                                                        <div style={{ opacity: isFactorSelected ? 1 : 0.5 }}>
                                                                            {factor.select_type === 'single' ? (
                                                                                <Radio.Group
                                                                                    onChange={e => handleSingleChange(factor.id, e.target.value)}
                                                                                    value={selectedValues[factor.id] || undefined}
                                                                                    disabled={!isFactorSelected}
                                                                                >
                                                                                    {validOptions.map(option => (
                                                                                        <Radio key={option.value} value={option.value}>
                                                                                            {option.value}
                                                                                        </Radio>
                                                                                    ))}
                                                                                </Radio.Group>
                                                                            ) : (
                                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                                                    {validOptions.length > 0 ? (
                                                                                        validOptions.map(option => {
                                                                                            const optionKey = `${factor.id}-${option.value}`;
                                                                                            const isEditing = editingOption === optionKey;
                                                                                            
                                                                                            return isEditing && option.type === 'adapted' ? (
                                                                                                <div key={optionKey} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                                    <Input
                                                                                                        size="small"
                                                                                                        value={editValue}
                                                                                                        onChange={e => setEditValue(e.target.value)}
                                                                                                        autoFocus
                                                                                                        style={{ minWidth: '400px', flex: 1 }}
                                                                                                    />
                                                                                                    <Button
                                                                                                        size="small"
                                                                                                        type="primary"
                                                                                                        onClick={() => {
                                                                                                            if (editValue.trim()) {
                                                                                                                // Check if this is a predefined option or user-defined option
                                                                                                                const predefinedOptions = factor.options?.filter(opt => opt && opt.value !== undefined) || [];
                                                                                                                const isPredefined = predefinedOptions.some(opt => opt.value === option.value);
                                                                                                                
                                                                                                                if (isPredefined) {
                                                                                                                    // Update predefined option in factorData
                                                                                                                    setFactorData(prev => {
                                                                                                                        const updated = { ...prev };
                                                                                                                        const categoryFactors = updated[factor.Category];
                                                                                                                        const factorIndex = categoryFactors.findIndex(f => f.id === factor.id);
                                                                                                                        const optionIndex = categoryFactors[factorIndex].options.findIndex(opt => opt.value === option.value);
                                                                                                                        categoryFactors[factorIndex].options[optionIndex].value = editValue.trim();
                                                                                                                        return updated;
                                                                                                                    });
                                                                                                                } else {
                                                                                                                    // Update user-defined option
                                                                                                                    setUserDefinedOptions(prev => {
                                                                                                                        const updated = { ...prev };
                                                                                                                        const userOptions = updated[factor.id] || [];
                                                                                                                        const optionIndex = userOptions.findIndex(opt => opt.value === option.value);
                                                                                                                        if (optionIndex !== -1) {
                                                                                                                            userOptions[optionIndex].value = editValue.trim();
                                                                                                                        }
                                                                                                                        return { ...updated, [factor.id]: userOptions };
                                                                                                                    });
                                                                                                                }
                                                                                                                
                                                                                                                setSelectedValues(prev => {
                                                                                                                    const currentValues = prev[factor.id] || [];
                                                                                                                    const updatedValues = currentValues.map(v => v === option.value ? editValue.trim() : v);
                                                                                                                    return { ...prev, [factor.id]: updatedValues };
                                                                                                                });
                                                                                                            }
                                                                                                            setEditingOption(null);
                                                                                                            setEditValue('');
                                                                                                        }}
                                                                                                    >
                                                                                                        Save
                                                                                                    </Button>
                                                                                                </div>
                                                                                            ) : (
                                                                                                <div key={optionKey} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                                    <Tag.CheckableTag
                                                                                                        checked={
                                                                                                            isFactorSelected && selectedValues[factor.id]?.includes(option.value)
                                                                                                        }
                                                                                                        onChange={() => handleMultipleChange(factor.id, option, validOptions)}
                                                                                                        style={{ 
                                                                                                            opacity: isFactorSelected ? 1 : 0.5,
                                                                                                            pointerEvents: isFactorSelected ? 'auto' : 'none',
                                                                                                            whiteSpace: 'normal',
                                                                                                            wordBreak: 'break-word',
                                                                                                            maxWidth: '100%'
                                                                                                        }}
                                                                                                    >
                                                                                                        {option.value}
                                                                                                    </Tag.CheckableTag>
                                                                                                    {option.type === 'adapted' && isFactorSelected && (
                                                                                                        <Button
                                                                                                            size="small"
                                                                                                            onClick={() => {
                                                                                                                setEditingOption(optionKey);
                                                                                                                setEditValue(option.value);
                                                                                                            }}
                                                                                                        >
                                                                                                            Edit
                                                                                                        </Button>
                                                                                                    )}
                                                                                                </div>
                                                                                            );
                                                                                        })
                                                                                    ) : (
                                                                                        <div>No options available</div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center' }}>
                                                                                <Input.TextArea
                                                                                    placeholder="Enter your options here..."
                                                                                    autoSize={{ minRows: 1, maxRows: 3 }}
                                                                                    value={selectedValues[`input_${factor.id}`] || ''}
                                                                                    onChange={e => setSelectedValues(prev => ({ ...prev, [`input_${factor.id}`]: e.target.value }))}
                                                                                    style={{ marginRight: '8px', flex: 1 }}
                                                                                    disabled={!isFactorSelected}
                                                                                />
                                                                                <Button
                                                                                    type="primary"
                                                                                    disabled={!isFactorSelected || !selectedValues[`input_${factor.id}`]?.trim()}
                                                                                    onClick={() => {
                                                                                        const newOptionValue = selectedValues[`input_${factor.id}`].trim();
                                                                                        const newOption = { value: newOptionValue, type: 'user-defined' };
                                                                                        
                                                                                        // Clear the input
                                                                                        setSelectedValues(prev => ({ ...prev, [`input_${factor.id}`]: '' }));
                                                                                        
                                                                                        // Add the new option to user-defined options
                                                                                        setUserDefinedOptions(prev => {
                                                                                            const existingUserOptions = prev[factor.id] || [];
                                                                                            const existingValues = existingUserOptions.map(option => option.value);
                                                                                            if (!existingValues.includes(newOption.value)) {
                                                                                                return {
                                                                                                    ...prev,
                                                                                                    [factor.id]: [...existingUserOptions, newOption]
                                                                                                };
                                                                                            }
                                                                                            return prev;
                                                                                        });
                                                                                        
                                                                                        // Update selected values
                                                                                        setSelectedValues(prev => {
                                                                                            if (factor.select_type === 'single') {
                                                                                                return { ...prev, [factor.id]: newOption.value };
                                                                                            } else {
                                                                                                const currentValues = prev[factor.id] || [];
                                                                                                return { ...prev, [factor.id]: [...currentValues, newOption.value] };
                                                                                            }
                                                                                        });
                                                                                    }}
                                                                                >
                                                                                    Add
                                                                                </Button>
                                                                            </div>
                                                                        </div>
                                                                    </Collapse.Panel>
                                                                );
                                                            })}
                                                        </Collapse>
                                                    </Card>
                                                </Col>
                                            ))}
                                        </Row>
                                    </div>
    );

    const templateButtons = (
        <>
                <Button
                    size={isChat ? 'large' : 'small'}
                    onClick={handleUpdateTemplate}
                    disabled={!selectedTemplate}
                    title={selectedTemplate ? `Save the current selections into "${selectedTemplate}"` : 'Select a template first'}
                    style={selectedTemplate ? {
                        backgroundColor: '#f6ffed',
                        borderColor: '#b7eb8f',
                        color: '#389e0d'
                    } : undefined}
                >
                    Update Template
                </Button>
                <Button
                    size={isChat ? 'large' : 'small'}
                    onClick={() => {
                        setTemplateName('');
                        setSaveTemplateModal(true);
                    }}
                    style={{
                        backgroundColor: '#e6f7ff',
                        borderColor: '#91d5ff',
                        color: '#0958d9'
                    }}
                >
                    Add as New Template
                </Button>
                <Button
                    size={isChat ? 'large' : 'small'}
                    onClick={handleClearAll}
                    style={{
                        backgroundColor: '#fff2f0',
                        borderColor: '#ffccc7',
                        color: '#ff4d4f'
                    }}
                >
                    🗑️ Clear All
                </Button>
        </>
    );

    const generateButton = (
                <Button
                    type="primary"
                    size={isChat ? 'large' : 'middle'}
                    onClick={onGenerate}
                    loading={loading}
                    disabled={!canGenerate}
                    block={!isChat}
                >
                    {hasDraft ? 'Regenerate with These Options' : 'Generate Email Draft'}
                </Button>
    );

    const templateModal = (
            <Modal
                title="Add as New Template"
                open={saveTemplateModal}
                onOk={handleAddTemplate}
                onCancel={() => setSaveTemplateModal(false)}
                okText="Add"
                okButtonProps={{ disabled: !templateName.trim() || templateNameTaken }}
                width={400}
            >
                <Input
                    value={templateName}
                    onChange={e => setTemplateName(e.target.value)}
                    onPressEnter={handleAddTemplate}
                    placeholder="Template name, e.g. Professor - formal"
                    maxLength={40}
                    autoFocus
                />
                {templateNameTaken && (
                    <div style={{ marginTop: '8px', color: '#d48806', fontSize: '13px' }}>
                        A template with this name already exists. Choose another name, or use "Update Template" to change it.
                    </div>
                )}
            </Modal>
    );

    if (isChat) {
        return (
            <div className="factor-panel factor-panel-chat" style={{ width: '100%' }}>
                                    <div className="ChatMessage_Assistant_Content_Text">
                                    Please select the following factors that you think are most important in setting the tone of this email.
                                    </div>
                <div style={{ maxWidth: '360px', marginBottom: '4px' }}>
                    {templateSelect}
                </div>
                {factorGrid}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
                    {templateButtons}
                    {generateButton}
                </div>
                {templateModal}
            </div>
        );
    }

    return (
        <div className="factor-panel factor-panel-sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '16px' }}>
                <div style={{ fontSize: '13px', color: '#666', marginBottom: '6px' }}>
                    Your request — the email is drafted from it and the options below.
                </div>
                <div className="ChatMessage_Assistant_Content_Text factor-panel-task" style={{ maxHeight: '140px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {userTask}
                </div>
                {templateSelect}
                {factorGrid}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '12px 16px', flexWrap: 'wrap', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
                {templateButtons}
                {generateButton}
            </div>
            {templateModal}
        </div>
    );
};

export default FactorPanel;
