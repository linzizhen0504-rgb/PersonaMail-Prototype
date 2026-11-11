// The one place that names the address of the backend. Set REACT_APP_API_BASE_URL (in .env.local) to use another one.
import axios from 'axios';

export const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '');

export const backend = axios.create({ baseURL: API_BASE_URL });

// The files the page itself serves (public/), not the backend
export const pageFiles = axios.create();
