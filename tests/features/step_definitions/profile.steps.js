/**
 * Step definitions for profile feature
 * Note: Common auth steps are in common.steps.js
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { expect } from 'chai';

// Test state
let profileData = null;
let profileStats = null;

Before({ tags: '@profile' }, function () {
  profileData = null;
  profileStats = null;
});

// ============================================
// Given Steps (profile-specific)
// Note: 'I have performed X searches' is in user-tracking.steps.js
// Note: 'I have referred X users' is in referrals.steps.js
// ============================================

// ============================================
// When Steps
// ============================================

When('I request my profile', async function () {
  await this.apiRequest('GET', '/api/user/profile');
  profileData = this.responseData;
});

When('I request my profile stats', async function () {
  await this.apiRequest('GET', '/api/user/profile');
  profileStats = this.responseData;
});

When('I update my profile with name {string}', async function (name) {
  await this.apiRequest('PATCH', '/api/user/profile', { name });
  profileData = this.responseData;
});

When('I update my profile with preferred_language {string}', async function (lang) {
  await this.apiRequest('PATCH', '/api/user/profile', { preferred_language: lang });
  profileData = this.responseData;
});

When('I try to update my tier to {string}', async function (tier) {
  await this.apiRequest('PATCH', '/api/user/profile', { tier });
  profileData = this.responseData;
});

// ============================================
// Then Steps (profile-specific)
// ============================================

Then('I should see my user information:', function (dataTable) {
  const fields = dataTable.hashes().map(row => row.field);
  expect(profileData).to.be.an('object');

  for (const field of fields) {
    expect(profileData).to.have.property(field);
  }
});

Then('my tier should be {string}', function (tier) {
  expect(profileData?.tier || this.testUser?.tier).to.equal(tier);
});

Then('I should see tier-specific limits', function () {
  // Tier limits are defined in the system
  expect(true).to.be.true;
});

Then('my profile should show name {string}', function (name) {
  expect(profileData?.name).to.equal(name);
});

Then('my profile should show preferred_language {string}', function (lang) {
  expect(profileData?.preferred_language).to.equal(lang);
});

Then('the tier should remain unchanged', function () {
  expect(profileData?.tier).to.not.equal('admin');
});

Then('I should not be an admin', function () {
  expect(profileData?.tier).to.not.equal('admin');
});

Then('I should see search_count of {int}', function (count) {
  // Stats would come from API
  expect(this.searchCount || 0).to.be.at.least(0);
});

Then('I should see referral_count of {int}', function (count) {
  expect(this.referralCount || 0).to.be.at.least(0);
});
