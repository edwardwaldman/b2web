'use client';

import { useState } from 'react';
import { supabase } from '@/utils/supabase';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Function to handle Sign Up
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);
    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      setMessage('✅ Success! Check your email for a confirmation link.');
    }
  };

  // Function to handle Log In
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);
    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      setMessage(`🎉 Welcome back, ${data.user?.email}!`);
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '50px auto', padding: '20px', fontFamily: 'sans-serif', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h2>B2Web Authentication</h2>
      
      <form style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>Email Address</label>
          <input 
            type="email" 
            placeholder="you@example.com" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
            required 
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '5px' }}>Password</label>
          <input 
            type="password" 
            placeholder="••••••••" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
            required 
          />
        </div>

        {message && <p style={{ fontSize: '14px', fontWeight: 'bold' }}>{message}</p>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={handleLogin} 
            disabled={loading}
            style={{ flex: 1, padding: '10px', backgroundColor: '#0070f3', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            {loading ? 'Loading...' : 'Log In'}
          </button>
          
          <button 
            onClick={handleSignUp} 
            disabled={loading}
            style={{ flex: 1, padding: '10px', backgroundColor: '#24292e', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Sign Up
          </button>
        </div>
      </form>
    </div>
  );
}