/**
 * Common step definitions shared across features
 */

import { Given, Then } from '@cucumber/cucumber';
import { expect } from 'chai';

// ============================================
// Authentication Steps (shared across features)
// ============================================

Given('I am logged in as an approved user', async function () {
  this.testUser = { email: 'approved@test.com', tier: 'approved', id: 'user_approved' };
  this.authToken = 'test_approved_token';
});

Given('I am logged in as a verified user', async function () {
  this.testUser = { email: 'verified@test.com', tier: 'verified', id: 'user_verified' };
  this.authToken = 'test_verified_token';
});

Given('I am logged in as an admin', async function () {
  this.testUser = { email: 'admin@test.com', tier: 'admin', id: 'user_admin' };
  this.authToken = 'test_admin_token';
});

Given('I am an anonymous user', function () {
  this.authToken = null;
  this.testUser = null;
});

Given('I am not authenticated', function () {
  this.authToken = null;
  this.testUser = null;
});

Given('I am logged in as a {string} user', async function (tier) {
  this.testUser = { email: `${tier}@test.com`, tier, id: `user_${tier}` };
  this.authToken = `test_${tier}_token`;
});

// ============================================
// Common Response Assertions
// ============================================

Then('I should receive a {int} unauthorized error', function (statusCode) {
  expect(this.response.status).to.equal(statusCode);
});

Then('I should receive a {int} bad request error', function (statusCode) {
  expect(this.response.status).to.equal(statusCode);
});

Then('I should receive a {int} forbidden error', function (statusCode) {
  expect(this.response.status).to.equal(statusCode);
});

Then('I should receive a {int} error', function (statusCode) {
  expect(this.response.status).to.equal(statusCode);
});

Then('I should receive a success response', function () {
  expect(this.response.ok).to.be.true;
});

Then('I should receive a validation error', function () {
  expect(this.response.status).to.be.oneOf([400, 422]);
});

Then('the error should mention {string}', function (text) {
  const message = this.responseData?.message || this.responseData?.error || '';
  expect(message.toLowerCase()).to.include(text.toLowerCase());
});

Then('the error message should mention {string}', function (text) {
  const message = this.responseData?.message || this.responseData?.error || '';
  expect(message.toLowerCase()).to.include(text.toLowerCase());
});
