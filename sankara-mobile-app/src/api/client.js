import axios from 'axios';
import { Platform } from 'react-native';

// Use localhost for iOS simulator, and 10.0.2.2 for Android emulator
// For real device, use your machine's IP address
const getBaseUrl = () => {
  if (__DEV__) {
    if (Platform.OS === 'android') return 'http://10.0.2.2:3001/api';
    return 'http://localhost:3001/api';
  }
  // Production URL
  return 'https://learn.sankaraeye.in/api';
};

export const api = axios.create({
  baseURL: getBaseUrl(),
  timeout: 10000,
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'Network Error';
    return Promise.reject(message);
  }
);
