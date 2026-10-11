import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGlobalContext } from '../App';
import { Card, Input, Row, Col, Button, message, Radio } from 'antd';
import axios from 'axios';

const AnchorBuilder = () => {
    const location = useLocation();
    const [personaData, setPersonaData] = useState(null);
    const [situationData, setSituationData] = useState(null);
    const [personaEditorPrompt, setPersonaEditorPrompt] = useState('');
    const [situationEditorPrompt, setSituationEditorPrompt] = useState('');
    const [regeneratingPersona, setRegeneratingPersona] = useState(false);
    const [regeneratingSituation, setRegeneratingSituation] = useState(false);
    const [regeneratingPersonaAnchor, setRegeneratingPersonaAnchor] = useState(false);
    const [regeneratingSituationAnchor, setRegeneratingSituationAnchor] = useState(false);
    const { state } = location;
    const userTask = state?.userTask || '';
    const anchorContent = state?.anchorContent || {};
    console.log('Full anchorContent:', anchorContent);
    console.log('personaImagePath:', anchorContent?.personaImagePath);
    console.log('situationImagePath:', anchorContent?.situationImagePath);
    const navigate = useNavigate();
    const { globalState } = useGlobalContext();
    const { username: globalUsername, taskId: globalTaskId, userTask: globalUserTask } = globalState;

    // Use global state
    const taskId = globalTaskId;
    const userName = globalUsername;

    // Load anchor data from JSON files
    useEffect(() => {
        const loadAnchorData = async () => {
            try {
                if (anchorContent.personaJsonPath) {
                    const personaResponse = await axios.get(`http://localhost:3001/user-data/${userName}/PersonaAnchor/${anchorContent.personaJsonPath.split('\\').pop().split('/').pop()}`);
                    setPersonaData(personaResponse.data);
                    console.log('Loaded persona data:', personaResponse.data);
                }
                if (anchorContent.situationJsonPath) {
                    const situationResponse = await axios.get(`http://localhost:3001/user-data/${userName}/SituationAnchor/${anchorContent.situationJsonPath.split('\\').pop().split('/').pop()}`);
                    setSituationData(situationResponse.data);
                    console.log('Loaded situation data:', situationResponse.data);
                }
            } catch (error) {
                console.error('Failed to load anchor data:', error);
                message.error('Failed to load anchor data');
            }
        };
        
        if (anchorContent.personaJsonPath || anchorContent.situationJsonPath) {
            loadAnchorData();
        }
    }, [anchorContent, userName]);

    const handleRegenerateImage = async (anchorType, anchorData) => {
        if (!anchorData) {
            message.error('Anchor data not loaded');
            return;
        }

        const isPersona = anchorType === 'PersonaAnchor';
        const setLoading = isPersona ? setRegeneratingPersona : setRegeneratingSituation;
        const imagePath = isPersona ? anchorContent.personaImagePath : anchorContent.situationImagePath;

        try {
            setLoading(true);
            
            await axios.post('http://localhost:3002/regenerate-image', {
                anchorType: anchorType,
                anchorTitle: anchorData.title,
                anchorDescription: anchorData.description,
                imagePath: imagePath
            });
            
            message.success('Image regenerated successfully');
            
            // 不刷新页面，只更新图片显示
            const timestamp = new Date().getTime();
            const imgElements = document.querySelectorAll('img');
            imgElements.forEach(img => {
                if (img.src.includes(anchorType)) {
                    img.src = img.src.split('?')[0] + '?' + timestamp;
                }
            });
        } catch (error) {
            console.error('Failed to regenerate image:', error);
            message.error('Failed to regenerate image');
        } finally {
            setLoading(false);
        }
    };

    const handleRegenerateAnchor = async (anchorType, userPrompt) => {
        if (!userPrompt.trim()) {
            message.error('Please enter a prompt for regeneration');
            return;
        }

        const isPersona = anchorType === 'persona';
        const setLoading = isPersona ? setRegeneratingPersonaAnchor : setRegeneratingSituationAnchor;
        const setData = isPersona ? setPersonaData : setSituationData;
        const setPrompt = isPersona ? setPersonaEditorPrompt : setSituationEditorPrompt;
        const anchorJsonPath = isPersona ? anchorContent.personaJsonPath : anchorContent.situationJsonPath;

        try {
            setLoading(true);
            
            const response = await axios.post('http://localhost:3001/regenerate-anchor', {
                userName: userName,
                taskId: taskId,
                anchorJsonPath: anchorJsonPath,
                userPrompt: userPrompt,
                userTask: globalUserTask || userTask
            });
            
            message.success('Anchor regenerated successfully');
            setData(response.data.updatedAnchor);
            setPrompt(''); // Clear the prompt after successful regeneration
        } catch (error) {
            console.error('Failed to regenerate anchor:', error);
            message.error('Failed to regenerate anchor');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className='anchor-builder-container' style={{ padding: '20px' ,width: '100% !important'}}>
            <Row gutter={[16, 16]} style={{ height: 'calc(100vh - 64px - 94px)' }}>
                <Col span={12} style={{ height: '100%' ,display: 'flex', flexDirection: 'column'}}>
                    <Card bordered style={{ width: '100%', minHeight: '700px'}} title="Persona Anchor">
                        <div style={{ textAlign: 'center', marginBottom: '10px' ,borderBottom: '1px solid #eee', paddingBottom: '10px'}}>
                        <img src={anchorContent?.personaImagePath ? `http://localhost:3001/user-data/${userName}/PersonaAnchor/${anchorContent.personaImagePath.split('\\').pop().split('/').pop()}` : ''} alt="Persona" style={{ width: '600px', height: '300px', objectFit: 'cover', display: 'block', margin: '0 auto' }} />
                        <Button 
                            color="primary" 
                            variant="outlined" 
                            style={{ marginTop: '10px' }}
                            loading={regeneratingPersona}
                            onClick={() => handleRegenerateImage('PersonaAnchor', personaData)}
                        >
                            ✨ Regenerate Image
                        </Button>
                        </div>
                        <div className='personaAnchor'>
                            <h3>{personaData?.title || 'No title available.'}</h3>
                            <p>{personaData?.description || 'No description available.'}</p>
                        </div>
                        <div className='personaAnchorRegenerate' style={{ textAlign: 'center', marginTop: '20px' }}>
                            <Input.TextArea
                                rows={4}
                                value={personaEditorPrompt}
                                onChange={(e) => setPersonaEditorPrompt(e.target.value)}
                                placeholder="Enter your prompt here..."
                            />
                            <Button 
                                type="primary" 
                                style={{marginTop: '10px'}}
                                loading={regeneratingPersonaAnchor}
                                onClick={() => handleRegenerateAnchor('persona', personaEditorPrompt)}
                            >
                                🪄 Regenerate Anchor
                            </Button>
                        </div>
                    </Card>
                </Col>
                <Col span={12} style={{ height: '100%' ,display: 'flex', flexDirection: 'column'}}>
                    <Card bordered style={{ width: '100%', minHeight: '700px'}} title="Situation Anchor">
                        <div style={{ textAlign: 'center', marginBottom: '10px' ,borderBottom: '1px solid #eee', paddingBottom: '10px'}}>
                        <img src={anchorContent?.situationImagePath ? `http://localhost:3001/user-data/${userName}/SituationAnchor/${anchorContent.situationImagePath.split('\\').pop().split('/').pop()}` : ''} alt="Situation" style={{ width: '600px', height: '300px', objectFit: 'cover', display: 'block', margin: '0 auto' }} />
                        <Button 
                            color="primary" 
                            variant="outlined" 
                            style={{ marginTop: '10px' }}
                            loading={regeneratingSituation}
                            onClick={() => handleRegenerateImage('SituationAnchor', situationData)}
                        >
                            ✨ Regenerate Image
                        </Button>
                        </div>
                        <div className='situationAnchor'>
                            <h3>{situationData?.title || 'No title available.'}</h3>
                            <p>{situationData?.description || 'No description available.'}</p>
                        </div>
                        <div className='situationAnchorRegenerate' style={{ textAlign: 'center', marginTop: '20px' }}>
                            <Input.TextArea
                                rows={4}
                                value={situationEditorPrompt}
                                onChange={(e) => setSituationEditorPrompt(e.target.value)}
                                placeholder="Enter your prompt here..."
                            />
                            <Button 
                                type="primary" 
                                style={{marginTop: '10px'}}
                                loading={regeneratingSituationAnchor}
                                onClick={() => handleRegenerateAnchor('situation', situationEditorPrompt)}
                            >
                                🪄 Regenerate Anchor
                            </Button>
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default AnchorBuilder;