// App icons in one style: single-colour outline glyphs (same family as the antd icons used on buttons)
import React from 'react';
import { Avatar } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import logoIconImg from './logoIcon.png';
import botIconImg from './botIcon.png';

const INK = '#475569';
const SOFT = '#f1f5f9';

// Bot icon image (icons8 "Bot"), sized by the surrounding font size
const BotImage = ({ style }) => (
  <img src={botIconImg} alt="bot" style={{ width: '1em', height: '1em', display: 'block', flexShrink: 0, ...style }} />
);

export const LogoIcon = ({ size = 32, style }) => (
  <img src={logoIconImg} alt="Persona Mail logo" style={{ width: size, height: size, display: 'block', flexShrink: 0, ...style }} />
);

export const UserAvatarIcon = ({ size = 32, style }) => (
  <Avatar size={size} icon={<UserOutlined />} style={{ background: SOFT, color: INK, flexShrink: 0, ...style }} />
);

export const BotAvatarIcon = ({ size = 40, style }) => (
  <Avatar size={size} icon={<BotImage />} style={{ background: SOFT, fontSize: size * 0.65, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, ...style }} />
);

export const RobotIcon = ({ style }) => <BotImage style={style} />;
