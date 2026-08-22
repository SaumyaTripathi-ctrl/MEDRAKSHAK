// Mock Authentication Service for Suraksha Frontend Demo

export const authService = {
  login(email, password) {
    if (!email || !email.includes('@')) {
      throw new Error('Please enter a valid email address.');
    }
    if (!password || password.length < 4) {
      throw new Error('Password must be at least 4 characters.');
    }

    const user = {
      email,
      name: email.split('@')[0],
      role: 'Admin',
    };

    localStorage.setItem('suraksha_user', JSON.stringify(user));
    return user;
  },

  logout() {
    localStorage.removeItem('suraksha_user');
  },

  getCurrentUser() {
    const userStr = localStorage.getItem('suraksha_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch (e) {
      localStorage.removeItem('suraksha_user');
      return null;
    }
  },

  isAuthenticated() {
    return this.getCurrentUser() !== null;
  }
};
