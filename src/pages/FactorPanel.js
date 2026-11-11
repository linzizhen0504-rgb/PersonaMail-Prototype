// Factor selection (moved from EmailTask.js): the model chooses the factors for the request, and the user can change them in the
// Email Editor sidebar. The selection state lives in useFactorSelection.
import React, { useState, useEffect } from 'react';
import { Button, Input, Checkbox, Card, Collapse, Row, Col, Radio, Tag, Spin, message } from 'antd';
import { ClearOutlined, DownOutlined, CopyOutlined } from '@ant-design/icons';
import relationshipIcon from '../relationship.png'; // 引入图片
import communicationIcon from '../commnuication.png'; // 引入图片
import demongraphyIcon from '../demography.png'; // 引入图片
import ristMitigationIcon from '../ristMitigation.png'; // 引入图片
import { api } from '../api';
import { SIDEBAR_TOP_PADDING } from '../layout';

export const useFactorSelection = ({ userTask, userName: globalUsername, taskId: globalTaskId, onDraftGenerated, onLoadingChange, getExtraRequest, logEvent }) => {

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

    // Selections belong to the task
    useEffect(() => {
        setSelectedFactors({});
        setSelectedValues({});
    }, [globalTaskId]);

    // Clear all current selections (the options the user added stay out of the way too)
    const handleClearAll = () => {
        setSelectedFactors({});
        setSelectedValues({});
        setUserDefinedOptions({});
    };

    // The choices the writer gets: only factors that are selected and have a value
    const buildFactorChoices = (chosenFactors, chosenValues) => Object.entries(chosenValues).reduce((acc, [factorId, selectedOption]) => {
        if (chosenFactors[factorId] && selectedOption &&
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

    const generateDraft = async (chosenFactors, chosenValues, task) => {
      setLoading(true); // Start loading
      if (onLoadingChange) onLoadingChange(true);
      try {
        // Only include factor choices for selected factors with actual values
        const factorChoices = buildFactorChoices(chosenFactors, chosenValues);

        // Save factor choices
        await api.session.saveFactorChoices({
          userName: globalUsername,
          factorChoices,
          taskId: globalTaskId
        });

        // Details the writer already typed in (the "Information to fill" table) go to the writer with the request
        const extraRequest = getExtraRequest ? getExtraRequest() : '';
        const { draft } = await api.drafts.generateFirst({
          userTask: extraRequest ? `${task}\n\n${extraRequest}` : task,
          factorChoices
        });

        // Save the draft content to latest.md
        await api.drafts.save(globalTaskId, draft);

        // The caller may still be busy with the new draft (the components are made from it): the loading state lasts until it is done
        await onDraftGenerated(draft);
      } catch (error) {
        console.error('Error generating draft:', error);
        message.error('Failed to generate draft. Please try again.');
      } finally {
        setLoading(false); // End loading
        if (onLoadingChange) onLoadingChange(false);
      }
    };

    const handleGenerateDraft = () => generateDraft(selectedFactors, selectedValues, userTask);

    // A new request: the model chooses the factors, the sidebar shows them, and the first draft is written with them. When the choice
    // fails the draft is still written, without options, and the user can choose in the sidebar and regenerate
    const [selecting, setSelecting] = useState(false);
    const autoSelectAndGenerate = async (task) => {
        setSelecting(true);
        if (onLoadingChange) onLoadingChange(true);
        const startedAt = Date.now();
        let chosenFactors = {};
        let chosenValues = {};
        try {
            const selection = await api.drafts.selectFactors({ userTask: task });
            chosenFactors = selection.selectedFactors || {};
            chosenValues = selection.selectedValues || {};
            if (logEvent) logEvent({ event: 'factors_auto_selected', factors: chosenValues, count: Object.keys(chosenFactors).length, duration_ms: Date.now() - startedAt });
        } catch (error) {
            console.error('Error choosing the factors:', error);
            message.warning('Could not choose the options automatically. You can choose them in the sidebar.');
            if (logEvent) logEvent({ event: 'factors_auto_select_failed', duration_ms: Date.now() - startedAt });
        }
        setSelectedFactors(chosenFactors);
        setSelectedValues(chosenValues);
        setSelecting(false);
        await generateDraft(chosenFactors, chosenValues, task);
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
        api.static.loadFactorList()
            .then(factors => {
                const groupedData = factors.reduce((acc, item) => {
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
        handleClearAll, handleGenerateDraft, autoSelectAndGenerate, getCategoryIcon,
        loading, selecting,
    };
};

// The sidebar of the editor: Information to fill (topSlot), the request, and the factor options (Tone Factors).
// Section titles of the cards sidebar: lighter than the option text below them
export const SIDEBAR_TITLE_STYLE = { fontWeight: 400, fontSize: '14px', color: '#8a9099' };

// Space between the sidebar sections (Information to fill, Request, Tone Factors): one value so the gaps stay equal
export const SIDEBAR_SECTION_GAP = '28px';

// Small buttons on the title rows of the cards sidebar (Clear All, Copy): only the icon shows; the name slides out
// to the right of the icon while the mouse is over the button or it has the keyboard focus. The buttons are right-aligned, so the one
// that opens pushes the buttons on its left aside. The name stays as the accessible name (aria-label).
export const SIDEBAR_SMALL_BUTTON_STYLE = { height: '20px', minWidth: '20px', padding: '0 5px', fontSize: '12px', lineHeight: '18px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0, overflow: 'hidden' };
export const HoverIconButton = ({ icon, label, onClick, disabled, title }) => (
    <Button size="small" className="hover-icon-button" style={SIDEBAR_SMALL_BUTTON_STYLE} aria-label={label} title={title} disabled={disabled} onClick={onClick}>
        <style>{`
            .hover-icon-button .hib-label { max-width: 0; margin-left: 0; opacity: 0; white-space: nowrap; overflow: hidden;
                transition: max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin-left 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease 0.05s; }
            .hover-icon-button:hover .hib-label, .hover-icon-button:focus-visible .hib-label { max-width: 80px; margin-left: 4px; opacity: 1; }
        `}</style>
        {icon}
        <span className="hib-label">{label}</span>
    </Button>
);

// The small arrow right of a sidebar title that shows or hides the section below it
export const SidebarToggle = ({ open, onClick, what }) => (
    <Button
        size="small"
        type="text"
        aria-label={`${open ? 'Hide' : 'Show'} ${what}`}
        aria-expanded={open}
        title={`${open ? 'Hide' : 'Show'} ${what}`}
        icon={<DownOutlined rotate={open ? 180 : 0} />}
        style={{ width: '20px', height: '20px', minWidth: 0, padding: 0, marginLeft: '2px', color: '#8a9099', fontSize: '11px' }}
        onClick={onClick}
    />
);

const FactorPanel = ({ selection, userTask, canGenerate, onGenerate, topSlot = null }) => {
    const {
        factorData, setFactorData,
        selectedValues, setSelectedValues,
        selectedFactors,
        userDefinedOptions, setUserDefinedOptions,
        editingOption, setEditingOption,
        editValue, setEditValue,
        handleFactorChange, handleMultipleChange, handleSingleChange,
        handleClearAll, getCategoryIcon,
        loading, selecting,
    } = selection;
    // The sections of the cards sidebar are open at first; the arrow next to a title folds one away
    const [factorsOpen, setFactorsOpen] = useState(true);
    const [requestOpen, setRequestOpen] = useState(true);

    const factorGrid = (
                                    <div className="ChatMessage_Assistant_Content_Factors" style={{ width: '100%' }}>
                                        <Row gutter={[16, 16]} justify="space-between" style={{ width: '100%' }}>
                                            {Object.entries(factorData).map(([category, factors]) => (
                                                <Col span={24} key={category}>
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

    const generateButton = (
                <Button
                    type="primary"
                    onClick={onGenerate}
                    loading={loading}
                    disabled={!canGenerate || selecting}
                    block
                >
                    Regenerate with These Options
                </Button>
    );

    return (
        <div className="factor-panel factor-panel-sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* The top padding is worked out in src/layout.js so that the "Information to fill" title is on the same centre line as the "Email Draft Editor" title */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: `${SIDEBAR_TOP_PADDING}px 16px 16px` }}>
                {topSlot}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={SIDEBAR_TITLE_STYLE}>Request</div>
                        <SidebarToggle open={requestOpen} onClick={() => setRequestOpen(open => !open)} what="request" />
                    </div>
                    <HoverIconButton
                        icon={<CopyOutlined />}
                        label="Copy"
                        disabled={!userTask}
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(userTask || '');
                                message.success('Request copied');
                            } catch (error) {
                                message.error('Could not copy to the clipboard');
                            }
                        }}
                    />
                </div>
                {requestOpen && (
                    // The same white card as the table of Information to fill
                    <Card variant="borderless" styles={{ body: { padding: 0 } }} style={{ overflow: 'hidden' }}>
                        <div className="factor-panel-task" style={{ maxHeight: '140px', overflowY: 'auto', padding: '8px 16px', fontSize: '14px', lineHeight: 1.5715, color: 'rgba(0, 0, 0, 0.88)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {userTask}
                        </div>
                    </Card>
                )}
                <div style={{ marginTop: SIDEBAR_SECTION_GAP }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <div style={SIDEBAR_TITLE_STYLE}>Tone Factors</div>
                            <SidebarToggle open={factorsOpen} onClick={() => setFactorsOpen(open => !open)} what="options" />
                        </div>
                        <HoverIconButton icon={<ClearOutlined />} label="Clear All" onClick={handleClearAll} disabled={selecting} title="Set every option back to Not selected" />
                    </div>
                    {factorsOpen && (
                        <div>
                            <style>{`
                                .factor-grid-cards .ant-card-head-title { font-size: 14px; }
                                .factor-grid-cards .ant-row { width: calc(100% + 16px) !important; }
                            `}</style>
                            {selecting ? (
                                <Card variant="borderless" styles={{ body: { padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', color: 'rgba(0, 0, 0, 0.65)' } }}>
                                    <Spin size="small" />
                                    <span>Choosing options for your request…</span>
                                </Card>
                            ) : (
                                <div className="factor-grid-cards">{factorGrid}</div>
                            )}
                        </div>
                    )}
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 16px', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
                {generateButton}
            </div>
        </div>
    );
};

export default FactorPanel;
