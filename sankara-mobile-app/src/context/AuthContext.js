import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '../api/client';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStorageData();
  }, []);

  async function loadStorageData() {
    try {
      const authDataSerialized = await SecureStore.getItemAsync('@AuthData');
      if (authDataSerialized) {
        const authData = JSON.parse(authDataSerialized);
        setUser(authData);
        // Set axios header
        api.defaults.headers.common['Authorization'] = `Bearer ${authData.token}`;
      }
    } catch (error) {
    } finally {
      setLoading(false);
    }
  }

  const signIn = async (email, password) => {
    let networkIp = "";
    try {
      const ipRes = await fetch("https://api.ipify.org?format=json").then((r) => r.json());
      if (ipRes && ipRes.ip) {
        networkIp = ipRes.ip;
      }
    } catch (e) {
      console.warn("Failed to fetch public network IP:", e);
    }

    const deviceName = Platform.OS === 'ios' ? (Platform.isPad ? 'iPad' : 'iPhone') : 'Android Device';
    const deviceInfo = `${deviceName} (App)`;

    const response = await api.post('/auth/login', { email, password, networkIp, deviceInfo });
    const authData = response.data;
    
    // Check if role is allowed for mobile
    const allowedRoles = ['super_admin', 'program_admin', 'central_exam_coordinator', 'doctor', 'display_operator'];
    if (!allowedRoles.includes(authData.user.role)) {
      throw new Error('Access restricted: Only staff can use this app.');
    }

    const userData = {
      token: authData.token,
      name: authData.user.fullName,
      email: authData.user.email,
      role: authData.user.role,
    };

    setUser(userData);
    api.defaults.headers.common['Authorization'] = `Bearer ${userData.token}`;
    await SecureStore.setItemAsync('@AuthData', JSON.stringify(userData));
  };

  const signOut = async () => {
    setUser(null);
    delete api.defaults.headers.common['Authorization'];
    await SecureStore.deleteItemAsync('@AuthData');
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
