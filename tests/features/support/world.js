/**
 * Cucumber World - Shared context for step definitions
 */

import { setWorldConstructor, World } from '@cucumber/cucumber';

class SifterSearchWorld extends World {
  constructor(options) {
    super(options);

    // Base URLs for testing
    this.apiBaseUrl = process.env.API_URL || 'http://localhost:3000';
    this.uiBaseUrl = process.env.UI_URL || 'http://localhost:4321';

    // Test user credentials
    this.testUser = null;
    this.authToken = null;

    // Current response from API
    this.response = null;
    this.responseData = null;

    // Browser/Page for UI tests (set up in hooks)
    this.browser = null;
    this.page = null;
  }

  /**
   * Make an API request
   */
  async apiRequest(method, path, body = null, headers = {}) {
    const url = `${this.apiBaseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (this.authToken) {
      options.headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    if (body) {
      options.body = JSON.stringify(body);
    }

    this.response = await fetch(url, options);
    try {
      this.responseData = await this.response.json();
    } catch (e) {
      this.responseData = null;
    }

    return this.response;
  }

  /**
   * Login and store auth token
   */
  async login(email, password) {
    await this.apiRequest('POST', '/api/auth/login', { email, password });
    if (this.responseData?.token) {
      this.authToken = this.responseData.token;
    }
    return this.response.ok;
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    this.authToken = null;
    this.testUser = null;
    this.response = null;
    this.responseData = null;
  }
}

setWorldConstructor(SifterSearchWorld);
