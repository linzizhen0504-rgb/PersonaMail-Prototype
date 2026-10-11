// src/App.js
import React, { useState, createContext, useContext, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  DesktopOutlined,
  HomeOutlined,
  FileTextOutlined,
  TeamOutlined,
  AppstoreOutlined,
  EditOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { Breadcrumb, Layout, Menu, theme, Input, Button, Space, message } from 'antd';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import FirstPage from './pages/EmailTask';
import SecondPage from './pages/EmailEditor';
import ThirdPage from './pages/AnchorBuilder';
import 'antd/dist/reset.css';
import './App.css'; // 引入自定义CSS文件
import logoImg from './Logo.png'; // 引入图片
import avatarImg from './avatarUser.png'; // 引入图片

const { Header, Content, Footer, Sider } = Layout;

function getItem(label, key, icon, children) {
  return {
    key,
    icon,
    children,
    label,
  };
}

const items = [
  getItem('Email Task', '1', <HomeOutlined />),
  getItem('Email Editor', '2', <FileTextOutlined />),
  getItem('Anchors', '3', <TeamOutlined />),
  // getItem('Situation Anchors', 'sub2', <AppstoreOutlined />, [getItem('Team 1', '6'), getItem('Team 2', '8')]),
];

// Create a context for global state
const GlobalContext = createContext();

export const useGlobalContext = () => useContext(GlobalContext);

const App = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [username, setUsername] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [taskId, setTaskId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const {
    token: { colorBgContainer, borderRadiusLG },
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
  const getSelectedKey = () => {
      switch (location.pathname) {
          case '/':
              return '1';
          case '/emailEditor':
              return '2';
          case '/anchorBuilders':
              return '3';
          default:
              return '1';
      }
  };

  const getBreadcrumbItems = () => {
    switch (location.pathname) {
      case '/':
        return [{ title: 'Email Task' }];
      case '/emailEditor':
        return [{ title: 'Email Editor' }];
      case '/anchorBuilders':
        return [{ title: 'AnchorBuilders' }];
      default:
        return [{ title: 'Home' }];
    }
  };

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
        <Sider width="312px" theme="light" collapsible collapsed={collapsed} trigger={null}>
          <div className="demo-logo-vertical" style={{ textAlign: 'center', padding: collapsed ? '16px 0' : '16px' }}>
            <img src={logoImg} alt="logo" style={{ width: collapsed ? '32px' : 'auto', transition: 'width 0.3s' }} />
            {!collapsed && <span style={{ marginLeft: '16px' }}>Persona Mail</span>}
          </div>
          <Menu 
            theme="light" 
            selectedKeys={[getSelectedKey()]} 
            mode="inline" 
            items={items}
            onClick={({ key }) => {
              switch(key) {
                case '1':
                  navigate('/');
                  break;
                case '2':
                  navigate('/emailEditor');
                  break;
                case '3':
                  navigate('/anchorBuilders');
                  break;
                default:
                  break;
              }
            }}
          />
          <div style={{ 
            position: 'absolute', 
            bottom: '64px', 
            width: '100%', 
            padding: '0 16px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px' 
          }}>
            <img src={avatarImg} alt="avatar" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
            {!collapsed && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                {username ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <span style={{ color: '#1890ff', fontWeight: 500, fontSize: '14px' }}>
                      {username}
                    </span>
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
            )}
          </div>
        </Sider>
        <Layout>
          <Header style={{ paddingLeft: 0, background: colorBgContainer, display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{
                fontSize: '16px',
                width: 64,
                height: 64,
              }}
            />
            <Breadcrumb style={{ margin: '0 16px' }} items={getBreadcrumbItems()} />
            {username && (
              <div style={{ marginLeft: 'auto', marginRight: '24px', fontSize: '14px', color: '#666' }}>
                Welcome, {username}
              </div>
            )}
          </Header>
          <Content>
            <div
              style={{
                padding: 24,
                minHeight: 360,
                background: "#F8FAFC",
                borderRadius: borderRadiusLG,
              }}
            >
              <Routes>
                  <Route path="/" element={<FirstPage />} />
                  <Route path="/emailEditor" element={<SecondPage />} />
                  <Route path="/anchorBuilders" element={<ThirdPage />} />
              </Routes>
            </div>
          </Content>
          <Footer style={{ textAlign: 'center' }}>
          </Footer>
        </Layout>
      </Layout>
    </GlobalContext.Provider>
  );
};

export default App;