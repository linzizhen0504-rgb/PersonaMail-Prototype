// src/components/ChatPage.jsx
import React, { useState } from 'react';
import { Row, Col, Input } from 'antd';
import styles from "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import avatarImg from '../Avatar.png'; // 引入图片
import avatarImg_u from '../avatarUser.png'; // 引入图片
import axios from 'axios';

import {
    MainContainer,
    ChatContainer,
    Avatar,
    MessageList,
    Message,
    MessageInput
} from "@chatscope/chat-ui-kit-react";
import { useNavigate } from 'react-router-dom';

const FirstPage = () => {
    const [userInput, setUserInput] = useState('');
    const [userName, setUserName] = useState(''); // 新增 UserName 状态
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [messages, setMessages] = useState([]);
    const navigate = useNavigate();

    const handleSendAsync = async (text) => {
        if (text.trim()) {
            setMessages([...messages, { sender: 'User', message: text, avatarSrc: avatarImg_u }]);
        
            setUserInput('');
        }
    };

    return (
        <div className="firstPage">
            <MainContainer style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh - 112px' }}>
                {messages.length === 0 ? (
                    <div className="firstPage-content" style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%'}}>
                        <p className="firstPage-content-text">🤖Hi, I am email writing assistant.</p>
                        <p className="firstPage-content-text-sub">What can I help with?</p>
                        <MessageInput
                            placeholder="Please input your task here..."
                            onChange={(innerHtml, textContent) => setUserInput(textContent)}
                            onSend={(text) => handleSendAsync(text)}
                            attachButton={false}
                            style={{
                                width: '100%',
                                height: '82px',
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
                    </div>
                    
                ) : (
                    <ChatContainer className="chatContainer" style={{paddingTop: '24px', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh - 112px' }}>
                        <MessageList>
                            {messages.map((msg, index) => (
                                <Message
                                    key={index}
                                    model={{
                                        ...msg,
                                    }}
                                >
                                    <Avatar
                                        name={msg.sender}
                                        src={msg.avatarSrc}
                                    />
                                </Message>
                            ))}
                            {isAnalyzing && (
                                <Message
                                    model={{
                                        direction: 'incoming',
                                        message: 'Analyzing...',
                                        sentTime: '',
                                        position: 'single',
                                        sender: 'AI Bot',
                                    }}
                                >
                                    <Avatar
                                        name="AI Bot"
                                        src={avatarImg}
                                    />
                                </Message>
                            )}
                        </MessageList>
                        <MessageInput
                            placeholder="Please input your task here..."
                            onChange={(innerHtml, textContent) => setUserInput(textContent)}
                            onSend={handleSendAsync}
                            attachButton={false}
                            style={{ width: '100%' }}
                        />
                    </ChatContainer>
                )}
            </MainContainer>
        </div>
    );
};

export default FirstPage;