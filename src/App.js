// src/App.js
import React, { useState, createContext, useContext, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { EditOutlined } from '@ant-design/icons';
import { Layout, theme, Input, Button, Space, message } from 'antd';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import EmailEditorPage from './pages/EmailEditor';
import 'antd/dist/reset.css';
import './App.css'; // 引入自定义CSS文件
import logoImg from './Logo.png'; // 引入图片
import avatarImg from './avatarUser.png'; // 引入图片

const { Header, Content } = Layout;

// Create a context for global state
const GlobalContext = createContext();

export const useGlobalContext = () => useContext(GlobalContext);

const App = () => {
  const [username, setUsername] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [taskId, setTaskId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const location = useLocation();
  const navigate = useNavigate();

  // Use a ref to prevent the effect from running on every render
  const isInitialized = useRef(false);
  useEffect(() => {
    // Only run this effect once on the initial mount
    if (isInitialized.current) {
      return;
    }
    isInitialized.current = true;

    const storedUsername = localStorage.getItem('username');
    const storedTaskId = localStorage.getItem('taskId');

    if (storedUsername) {
      setUsername(storedUsername);
      console.log('Restored username:', storedUsername);
    }
    if (storedTaskId) {
      setTaskId(storedTaskId);
      console.log('Restored taskId:', storedTaskId);
    }
  }, []);
  const handleUsernameSubmit = useCallback(async (event) => {
    if (event) event.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    setIsLoading(true);
    
    try {
      const response = await axios.post('http://localhost:3001/create-session', {
        userName: inputValue.trim(),
        userInput: inputValue.trim(),
      });

      console.log('Session created successfully:', response.data);
      
      const newUsername = inputValue.trim();
      const { taskId: newTaskId, created_iso } = response.data;
      
      // 立即更新状态和localStorage
      setUsername(newUsername);
      setTaskId(newTaskId);
      setInputValue('');
      
      // 同步更新localStorage
      localStorage.setItem('username', newUsername);
      localStorage.setItem('taskId', newTaskId);
      
      // 使用replace而不是navigate，避免触发location变化
      if (location.pathname !== '/') {
        navigate('/', { 
          replace: true,
          state: { 
            userName: newUsername, 
            taskId: newTaskId, 
            created_iso 
          } 
        });
      }
      
      message.success('Successfully created user session', 2.5);
      
    } catch (error) {
      console.error('Error submitting username:', error);
      message.error('Failed to create user session', 2.5);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, location.pathname, navigate]);

  // 为当前用户新建一个任务（新的 taskId），页面回到任务输入界面
  const handleNewTask = useCallback(async () => {
    if (!username || isLoading) return;

    setIsLoading(true);

    try {
      const response = await axios.post('http://localhost:3001/create-session', {
        userName: username,
        userInput: username,
      });

      const { taskId: newTaskId } = response.data;
      setTaskId(newTaskId);
      localStorage.setItem('taskId', newTaskId);
    } catch (error) {
      console.error('Error creating new task:', error);
      message.error('Failed to create new task', 2.5);
    } finally {
      setIsLoading(false);
    }
  }, [username, isLoading]);

  // 处理用户名重置
  const handleUsernameReset = useCallback(() => {
    setUsername('');
    setTaskId('');
    setInputValue('');
    localStorage.removeItem('username');
    localStorage.removeItem('taskId');
    console.log('User data reset');
  }, []);

  // 全局状态对象
  const globalState = {
    username,
    taskId,
    setUsername,
    setTaskId
  };

  return (
    <GlobalContext.Provider value={{ globalState, setGlobalState: () => {} }}>
      <Layout style={{ minHeight: '100vh' }}>
          <Header style={{ paddingLeft: 0, background: colorBgContainer, display: 'flex', alignItems: 'center' }}>
            <img src={logoImg} alt="logo" style={{ width: '32px', marginLeft: '24px' }} />
            <span style={{ marginLeft: '12px', fontWeight: 500 }}>Persona Mail</span>
            <div style={{ marginLeft: 'auto', marginRight: '24px', display: 'flex', alignItems: 'center', gap: '8px', width: '280px' }}>
              <img src={avatarImg} alt="avatar" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
              <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                {username ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ color: '#1890ff', fontWeight: 500, fontSize: '14px' }}>
                      {username}
                    </span>
                    <Button
                      size="small"
                      onClick={handleNewTask}
                      title="Start a new email task"
                      style={{ marginLeft: 'auto', marginRight: '4px', fontSize: '12px' }}
                      disabled={isLoading}
                    >
                      New Task
                    </Button>
                    <Button 
                      type="text" 
                      size="small" 
                      onClick={handleUsernameReset}
                      title="Reset username"
                      style={{ padding: '0 4px', fontSize: '12px', opacity: 0.6 }}
                      disabled={isLoading}
                    >
                      ×
                    </Button>
                  </div>
                ) : (
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      placeholder="Enter username"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onPressEnter={handleUsernameSubmit}
                      style={{ flex: 1 }}
                      disabled={isLoading}
                    />
                    <Button 
                      type="primary" 
                      icon={<EditOutlined />} 
                      onClick={handleUsernameSubmit}
                      disabled={!inputValue.trim() || isLoading}
                      loading={isLoading}
                    />
                  </Space.Compact>
                )}
              </div>
            </div>
          </Header>
          <Content>
            <div
              style={{
                minHeight: 360,
                background: "#F8FAFC",
              }}
            >
              <Routes>
                  <Route path="/" element={<EmailEditorPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </Content>
      </Layout>
    </GlobalContext.Provider>
  );
};

export default App;