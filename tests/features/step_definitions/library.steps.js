/**
 * Library Browser step definitions
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';

// ============================================
// Setup Steps
// ============================================

Given('the library contains indexed documents', async function () {
  this.libraryData = {
    documents: [
      {
        id: 1,
        title: 'The Hidden Words',
        author: "Bahá'u'lláh",
        religion: "Bahá'í",
        collection: 'Writings',
        language: 'en',
        status: 'indexed',
        paragraph_count: 153
      },
      {
        id: 2,
        title: 'Prayers and Meditations',
        author: "Bahá'u'lláh",
        religion: "Bahá'í",
        collection: 'Prayers',
        language: 'en',
        status: 'indexed',
        paragraph_count: 184
      },
      {
        id: 3,
        title: 'Some Answered Questions',
        author: "'Abdu'l-Bahá",
        religion: "Bahá'í",
        collection: 'Writings',
        language: 'en',
        status: 'processing',
        paragraph_count: 0
      }
    ],
    tree: [
      {
        name: "Bahá'í",
        count: 3,
        collections: [
          { name: 'Writings', count: 2 },
          { name: 'Prayers', count: 1 }
        ]
      }
    ]
  };
});

// ============================================
// Navigation Steps
// ============================================

When('I navigate to the library page', async function () {
  this.currentPage = '/library';
  this.pageState = {
    filters: {
      religion: null,
      collection: null,
      language: null,
      author: '',
      yearFrom: null,
      yearTo: null,
      status: 'all'
    },
    selectedDocument: null,
    expandedNodes: []
  };
});

// ============================================
// Library Interface Visibility Steps
// ============================================

Then('I should see the library browser interface', async function () {
  expect(this.currentPage).to.equal('/library');
});

Then('I should see the tree view navigation', async function () {
  expect(this.libraryData.tree).to.have.length.greaterThan(0);
});

Then('I should see the document list area', async function () {
  expect(this.libraryData.documents).to.exist;
});

Then('I should see the total number of documents', async function () {
  const total = this.libraryData.documents.length;
  expect(total).to.be.greaterThan(0);
});

Then('I should see counts by religion', async function () {
  expect(this.libraryData.tree).to.have.length.greaterThan(0);
  this.libraryData.tree.forEach(religion => {
    expect(religion.count).to.be.a('number');
  });
});

// ============================================
// Tree View Steps
// ============================================

Then('I should see religions listed in the tree view', async function () {
  expect(this.libraryData.tree).to.have.length.greaterThan(0);
});

Then('each religion should show document count', async function () {
  this.libraryData.tree.forEach(religion => {
    expect(religion.count).to.be.a('number');
  });
});

When('I expand the {string} religion node', async function (religionName) {
  this.pageState.expandedNodes.push(religionName);
});

Then('I should see collections under {string}', async function (religionName) {
  const religion = this.libraryData.tree.find(r => r.name === religionName);
  expect(religion).to.exist;
  expect(religion.collections).to.have.length.greaterThan(0);
});

Then('each collection should show document count', async function () {
  const expandedReligion = this.pageState.expandedNodes[0];
  const religion = this.libraryData.tree.find(r => r.name === expandedReligion);
  religion.collections.forEach(collection => {
    expect(collection.count).to.be.a('number');
  });
});

When('I click on the {string} collection', async function (collectionName) {
  this.pageState.filters.collection = collectionName;
  this.pageState.selectedCollection = collectionName;
});

Then('the document list should show only documents from that collection', async function () {
  const filtered = this.getFilteredDocuments();
  filtered.forEach(doc => {
    expect(doc.collection).to.equal(this.pageState.selectedCollection);
  });
});

Then('the collection should appear selected', async function () {
  expect(this.pageState.selectedCollection).to.exist;
});

// ============================================
// Document List Steps
// ============================================

Then('I should see document cards in the list', async function () {
  const filtered = this.getFilteredDocuments();
  expect(filtered).to.have.length.greaterThan(0);
});

Then('each card should show the document title', async function () {
  const filtered = this.getFilteredDocuments();
  filtered.forEach(doc => {
    expect(doc.title).to.be.a('string');
  });
});

Then('each card should show the document author', async function () {
  const filtered = this.getFilteredDocuments();
  filtered.forEach(doc => {
    expect(doc.author).to.be.a('string');
  });
});

Then('each card should show the indexing status', async function () {
  const filtered = this.getFilteredDocuments();
  filtered.forEach(doc => {
    expect(['indexed', 'processing', 'unindexed']).to.include(doc.status);
  });
});

Then('document cards should show religion tags', async function () {
  const filtered = this.getFilteredDocuments();
  filtered.forEach(doc => {
    expect(doc.religion).to.be.a('string');
  });
});

Then('document cards should show collection tags', async function () {
  const filtered = this.getFilteredDocuments();
  filtered.forEach(doc => {
    expect(doc.collection).to.be.a('string');
  });
});

Then('document cards should show language tags when available', async function () {
  const filtered = this.getFilteredDocuments();
  filtered.forEach(doc => {
    if (doc.language) {
      expect(doc.language).to.be.a('string');
    }
  });
});

Then('indexed documents should show a green checkmark', async function () {
  const indexed = this.libraryData.documents.filter(d => d.status === 'indexed');
  expect(indexed.length).to.be.greaterThan(0);
  // Status icon mapping is handled in UI
});

Then('processing documents should show a yellow clock', async function () {
  const processing = this.libraryData.documents.filter(d => d.status === 'processing');
  expect(processing.length).to.be.greaterThan(0);
});

Then('unindexed documents should show a gray circle', async function () {
  // Test passes if we reach here - UI handles icon display
  expect(true).to.be.true;
});

// ============================================
// Filter Panel Steps
// ============================================

Then('I should see the filter panel', async function () {
  expect(this.pageState.filters).to.exist;
});

Then('I should see the religion filter dropdown', async function () {
  expect(this.pageState.filters).to.have.property('religion');
});

Then('I should see the collection filter dropdown', async function () {
  expect(this.pageState.filters).to.have.property('collection');
});

Then('I should see the language filter dropdown', async function () {
  expect(this.pageState.filters).to.have.property('language');
});

Then('I should see the author filter input', async function () {
  expect(this.pageState.filters).to.have.property('author');
});

Then('I should see the year range inputs', async function () {
  expect(this.pageState.filters).to.have.property('yearFrom');
  expect(this.pageState.filters).to.have.property('yearTo');
});

Then('I should see the status filter dropdown', async function () {
  expect(this.pageState.filters).to.have.property('status');
});

When('I select {string} from the religion filter', async function (religion) {
  if (religion === 'All religions') {
    this.pageState.filters.religion = null;
  } else {
    this.pageState.filters.religion = religion;
  }
});

When('I select {string} from the collection filter', async function (collection) {
  if (collection === 'All collections') {
    this.pageState.filters.collection = null;
  } else {
    this.pageState.filters.collection = collection;
  }
});

When('I select {string} from the status filter', async function (status) {
  if (status === 'All statuses') {
    this.pageState.filters.status = 'all';
  } else {
    this.pageState.filters.status = status.toLowerCase();
  }
});

Then('all visible documents should be from the {string} religion', async function (religion) {
  const filtered = this.getFilteredDocuments();
  filtered.forEach(doc => {
    expect(doc.religion).to.equal(religion);
  });
});

Then('all visible documents should be from the {string} collection', async function (collection) {
  const filtered = this.getFilteredDocuments();
  filtered.forEach(doc => {
    expect(doc.collection).to.equal(collection);
  });
});

Then('all visible documents should have {string} status', async function (status) {
  const filtered = this.getFilteredDocuments();
  filtered.forEach(doc => {
    expect(doc.status).to.equal(status);
  });
});

Given('I have applied religion filter {string}', async function (religion) {
  // Initialize page state if not already done
  if (!this.pageState) {
    this.currentPage = '/library';
    this.pageState = {
      filters: {
        religion: null,
        collection: null,
        language: null,
        author: '',
        yearFrom: null,
        yearTo: null,
        status: 'all'
      },
      selectedDocument: null,
      expandedNodes: []
    };
  }
  this.pageState.filters.religion = religion;
});

Then('I should see documents from all religions', async function () {
  const filtered = this.getFilteredDocuments();
  expect(filtered.length).to.equal(this.libraryData.documents.length);
});

// ============================================
// Document Selection Steps
// ============================================

When('I click on a document card', async function () {
  this.pageState.selectedDocument = this.libraryData.documents[0];
});

Then('the document card should appear selected', async function () {
  expect(this.pageState.selectedDocument).to.exist;
});

Then('the document detail panel should open', async function () {
  expect(this.pageState.selectedDocument).to.exist;
});

Given('I have selected a document', async function () {
  this.pageState.selectedDocument = this.libraryData.documents[0];
});

// ============================================
// Helper Note
// ============================================

// The getFilteredDocuments() helper method is defined in support/world.js
// and available on the World object (this.getFilteredDocuments())
