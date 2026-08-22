import React, { useState } from 'react';
import { Shield, Lock, Mail } from 'lucide-react';
import { authService } from '../services/authService.js';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    try {
      const user = authService.login(email, password);
      onLoginSuccess(user);
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    }
  };

  const handleGoogleLogin = () => {
    // Mock Google Login flow
    const user = authService.login('demo.user@gmail.com', 'demopassword');
    onLoginSuccess(user);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-logo-header">
          <Shield className="login-logo-icon" size={48} />
          <h1>SURAKSHA</h1>
          <p>Cold Chain Protection System</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error-alert">{error}</div>}

          <div className="input-group">
            <label htmlFor="email">Gmail / Email</label>
            <div className="input-with-icon">
              <Mail size={16} />
              <input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <Lock size={16} />
              <input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          </div>

          <button type="submit" className="login-submit-btn">
            LOGIN
          </button>
        </form>

        <div className="login-divider">
          <span>or</span>
        </div>

        <button className="google-login-btn" onClick={handleGoogleLogin}>
          <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v3.92h6.69a5.74 5.74 0 0 1-2.49 3.77v3.12h4.02c2.35-2.16 3.7-5.34 3.7-8.74z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.97-1.08 7.96-2.91l-4.02-3.12c-1.12.75-2.54 1.19-3.94 1.19-3.04 0-5.61-2.05-6.53-4.82H1.31v3.22A12 12 0 0 0 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.47 14.34a7.22 7.22 0 0 1 0-4.68V6.44H1.31a12 12 0 0 0 0 11.12l4.16-3.22z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A11.96 11.96 0 0 0 12 0 12 12 0 0 0 1.31 6.44l4.16 3.22c.92-2.77 3.49-4.91 6.53-4.91z"
            />
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
