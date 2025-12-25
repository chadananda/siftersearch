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

    // Feature-specific state
    this.searchCount = 0;
    this.referralCount = 0;
    this.webhookSignature = null;
    this.activeSubscription = null;

    // Library browser state
    this.libraryData = null;
    this.pageState = null;
    this.currentPage = null;
    this.pageContext = null;

    // Navigation state
    this.navBarVisible = true;
    this.hamburgerMenuOpen = false;
    this.userMenuOpen = false;
    this.currentTheme = 'light';
  }

  /**
   * Get filtered documents based on current filter state
   */
  getFilteredDocuments() {
    if (!this.libraryData || !this.pageState) return [];

    return this.libraryData.documents.filter(doc => {
      const { religion, collection, language, status, author, search } = this.pageState.filters;

      if (religion && doc.religion !== religion) return false;
      if (collection && doc.collection !== collection) return false;
      if (language && doc.language !== language) return false;
      if (status && status !== 'all' && doc.status !== status) return false;
      if (author && !doc.author.toLowerCase().includes(author.toLowerCase())) return false;

      // Search filter - matches title or author
      if (search) {
        const searchable = `${doc.title} ${doc.author}`.toLowerCase();
        if (!searchable.includes(search.toLowerCase())) return false;
      }

      return true;
    });
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
    } catch (_e) {
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
   * Login as a specific tier user (for testing)
   */
  async loginAsTier(tier) {
    const email = `${tier}@test.com`;
    this.testUser = { email, tier, id: `user_${tier}` };
    this.authToken = `test_${tier}_token`;
    return true;
  }

  /**
   * Get profile data
   */
  async getProfile() {
    await this.apiRequest('GET', '/api/user/profile');
    return this.responseData;
  }

  /**
   * Update profile
   */
  async updateProfile(data) {
    await this.apiRequest('PATCH', '/api/user/profile', data);
    return this.responseData;
  }

  /**
   * Get forum posts
   */
  async getForumPosts(options = {}) {
    const params = new URLSearchParams();
    if (options.sort) params.set('sort', options.sort);
    if (options.category) params.set('category', options.category);
    const query = params.toString() ? `?${params}` : '';
    await this.apiRequest('GET', `/api/forum/posts${query}`);
    return this.responseData?.posts || [];
  }

  /**
   * Create forum post
   */
  async createForumPost(data) {
    await this.apiRequest('POST', '/api/forum/posts', data);
    return this.responseData;
  }

  /**
   * Get donation tiers
   */
  async getDonationTiers() {
    await this.apiRequest('GET', '/api/donations/tiers');
    return this.responseData?.tiers || [];
  }

  /**
   * Create checkout session
   */
  async createCheckoutSession(data) {
    await this.apiRequest('POST', '/api/donations/create-checkout', data);
    return this.responseData;
  }

  /**
   * Get referral info
   */
  async getReferralInfo() {
    await this.apiRequest('GET', '/api/user/referrals');
    return this.responseData;
  }

  /**
   * Clean up resources
   */
  async cleanup() {
    this.authToken = null;
    this.testUser = null;
    this.response = null;
    this.responseData = null;
    this.searchCount = 0;
    this.referralCount = 0;
    this.webhookSignature = null;
    this.activeSubscription = null;
  }
}

setWorldConstructor(SifterSearchWorld);
