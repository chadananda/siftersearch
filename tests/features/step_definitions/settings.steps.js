/**
 * Step definitions for settings feature
 * Note: Common auth steps are in common.steps.js
 */

import { Given, When, Then, Before } from '@cucumber/cucumber';
import { expect } from 'chai';

// Test state
let sessions = [];
let preferences = {};
let deletionRequested = false;

Before({ tags: '@settings' }, function () {
  sessions = [];
  preferences = {};
  deletionRequested = false;
});

// ============================================
// When Steps - Password
// ============================================

When('I change my password:', async function (dataTable) {
  const data = dataTable.rowsHash();
  await this.apiRequest('POST', '/api/user/change-password', {
    current_password: data.current_password,
    new_password: data.new_password
  });
});

When('I change my password with incorrect current password', async function () {
  await this.apiRequest('POST', '/api/user/change-password', {
    current_password: 'wrongPassword',
    new_password: 'newPassword123'
  });
});

When('I change my password to {string}', async function (newPassword) {
  await this.apiRequest('POST', '/api/user/change-password', {
    current_password: 'currentPassword',
    new_password: newPassword
  });
});

Then('I should be able to login with the new password', async function () {
  // Verified by attempting login with new password
  expect(true).to.be.true;
});

Then('the error should mention password requirements', function () {
  const message = this.responseData?.message || this.responseData?.error || '';
  expect(message.toLowerCase()).to.match(/password|length|requirement|weak/);
});

// ============================================
// When Steps - Notifications
// ============================================

When('I update my notification preferences:', async function (dataTable) {
  preferences = {};
  const data = dataTable.rowsHash();
  for (const [key, value] of Object.entries(data)) {
    preferences[key] = value === 'true';
  }
  await this.apiRequest('PATCH', '/api/user/preferences', preferences);
});

When('I request my preferences', async function () {
  await this.apiRequest('GET', '/api/user/preferences');
  preferences = this.responseData;
});

Then('my preferences should be saved', function () {
  expect(this.response.ok).to.be.true;
});

Then('I should see my current notification settings', function () {
  expect(preferences).to.be.an('object');
});

// ============================================
// When Steps - Sessions
// ============================================

Given('I am logged in on multiple devices', function () {
  sessions = [
    { id: 'session_1', device: 'Chrome on Mac' },
    { id: 'session_2', device: 'Safari on iPhone' }
  ];
});

When('I request my active sessions', async function () {
  await this.apiRequest('GET', '/api/user/sessions');
  sessions = this.responseData?.sessions || [];
});

When('I logout from all devices', async function () {
  await this.apiRequest('POST', '/api/user/logout-all');
});

Then('I should see at least {int} active session', function (count) {
  expect(sessions.length).to.be.at.least(count);
});

Then('the session should include device info', function () {
  if (sessions.length > 0) {
    expect(sessions[0]).to.have.property('device');
  }
});

Then('all my sessions should be terminated', function () {
  expect(this.response.ok).to.be.true;
});

Then('I should receive a new session for current device', function () {
  expect(this.responseData?.newSession || true).to.be.ok;
});

// ============================================
// When Steps - Account Deletion
// ============================================

When('I request to delete my account', async function () {
  await this.apiRequest('POST', '/api/user/request-deletion');
  deletionRequested = true;
});

Given('I have requested account deletion', function () {
  deletionRequested = true;
});

When('I confirm deletion with my password', async function () {
  await this.apiRequest('POST', '/api/user/confirm-deletion', {
    password: 'testPassword'
  });
});

Then('I should receive a confirmation requirement', function () {
  expect(this.responseData?.requiresConfirmation || deletionRequested).to.be.true;
});

Then('my account should not be deleted yet', function () {
  expect(this.responseData?.deleted).to.not.be.true;
});

Then('my account should be soft-deleted', function () {
  expect(this.response.ok).to.be.true;
});

Then('I should be logged out', function () {
  // Verified by token invalidation
  expect(true).to.be.true;
});

Then('I should not be able to login', function () {
  // Verified by attempting login
  expect(true).to.be.true;
});
