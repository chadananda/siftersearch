// src/routes/api/documents/+server.js
import { json } from '@sveltejs/kit';
import db from '$lib/server/db/index.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * @swagger
 * /api/documents:
 *   get:
 *     summary: Get documents
 *     description: Retrieves documents with optional filtering
 *     tags:
 *       - Documents
 *     parameters:
 *       - in: query
 *         name: collection_id
 *         schema:
 *           type: string
 *         description: Filter by collection ID
 *       - in: query
 *         name: category_id
 *         schema:
 *           type: string
 *         description: Filter by category ID
 *       - in: query
 *         name: author_id
 *         schema:
 *           type: string
 *         description: Filter by author ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, published, archived]
 *         description: Filter by status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of items to return
 *     responses:
 *       200:
 *         description: List of documents
 *       500:
 *         description: Internal Server Error
 */
export async function GET({ url }) {
  try {
    const collectionId = url.searchParams.get('collection_id');
    const categoryId = url.searchParams.get('category_id');
    const authorId = url.searchParams.get('author_id');
    const status = url.searchParams.get('status');
    const limit = parseInt(url.searchParams.get('limit') || '20');
    
    // Handle direct filters (collection_id, status)
    const filters = {};
    if (collectionId) {
      filters.collection_id = collectionId;
    }
    
    if (status) {
      filters.status = status;
    }
    
    const options = {
      limit,
      orderBy: 'created_at DESC'
    };
    
    let documents = [];
    
    // If filtering by category or author, we need to use special queries
    if (categoryId) {
      const client = await db.getClient();
      const result = await client.execute({
        sql: `
          SELECT d.* 
          FROM documents d
          JOIN document_categories dc ON d.id = dc.document_id
          WHERE dc.category_id = ?1
          ${status ? 'AND d.status = ?2' : ''}
          ${collectionId ? (status ? 'AND d.collection_id = ?3' : 'AND d.collection_id = ?2') : ''}
          ORDER BY d.created_at DESC
          LIMIT ?${status && collectionId ? 4 : (status || collectionId ? 3 : 2)}
        `,
        args: [
          categoryId,
          ...(status ? [status] : []),
          ...(collectionId ? [collectionId] : []),
          limit
        ]
      });
      documents = result.rows;
    } else if (authorId) {
      const client = await db.getClient();
      const result = await client.execute({
        sql: `
          SELECT d.* 
          FROM documents d
          JOIN document_authors da ON d.id = da.document_id
          WHERE da.author_id = ?1
          ${status ? 'AND d.status = ?2' : ''}
          ${collectionId ? (status ? 'AND d.collection_id = ?3' : 'AND d.collection_id = ?2') : ''}
          ORDER BY d.created_at DESC
          LIMIT ?${status && collectionId ? 4 : (status || collectionId ? 3 : 2)}
        `,
        args: [
          authorId,
          ...(status ? [status] : []),
          ...(collectionId ? [collectionId] : []),
          limit
        ]
      });
      documents = result.rows;
    } else {
      // Standard query
      documents = await db.queryRecords('documents', filters, options);
    }
    
    // Parse metadata for each document
    documents = documents.map(doc => {
      if (typeof doc.metadata === 'string') {
        try {
          doc.metadata = JSON.parse(doc.metadata);
        } catch (e) {
          doc.metadata = {};
        }
      }
      return doc;
    });
    
    return json({ documents });
  } catch (err) {
    console.error('Error fetching documents:', err);
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/documents:
 *   post:
 *     summary: Create a new document
 *     description: Creates a new document with optional content blocks
 *     tags:
 *       - Documents
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - created_by
 *             properties:
 *               title:
 *                 type: string
 *                 description: Document title
 *               collection_id:
 *                 type: string
 *                 description: Collection ID
 *               created_by:
 *                 type: string
 *                 description: User ID
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *                 default: draft
 *                 description: Document status
 *               src_type:
 *                 type: string
 *                 enum: [pdf, markdown, web, text]
 *                 default: text
 *                 description: Source type
 *               src_url:
 *                 type: string
 *                 description: Source URL
 *               pdf_url:
 *                 type: string
 *                 description: PDF URL
 *               md_url:
 *                 type: string
 *                 description: Markdown URL
 *               metadata:
 *                 type: object
 *                 description: Additional metadata
 *               categories:
 *                 type: array
 *                 description: Category IDs
 *                 items:
 *                   type: string
 *               authors:
 *                 type: array
 *                 description: Author IDs
 *                 items:
 *                   type: string
 *               content:
 *                 type: array
 *                 description: Content blocks
 *                 items:
 *                   type: object
 *                   required:
 *                     - block
 *                     - block_type
 *                   properties:
 *                     block:
 *                       type: string
 *                       description: Block content
 *                     block_type:
 *                       type: string
 *                       enum: [
 *                         'heading1', 'heading2', 'heading3', 'heading4', 'heading5', 'heading6',
 *                         'paragraph', 'blockquote', 'code', 'fenced_code',
 *                         'ordered_list', 'unordered_list', 'task_list', 'list_item',
 *                         'table', 'table_row', 'table_cell',
 *                         'horizontal_rule', 'image', 'link',
 *                         'html', 'footnote', 'definition', 'thematic_break', 'other'
 *                       ]
 *                       description: Block type
 *                     sequence:
 *                       type: integer
 *                       description: Block sequence
 *                     pdf_page:
 *                       type: integer
 *                       description: PDF page number
 *                     book_page:
 *                       type: string
 *                       description: Book page reference
 *                     context:
 *                       type: string
 *                       description: Additional context
 *                     is_duplicate:
 *                       type: boolean
 *                       description: Whether this content is a duplicate
 *     responses:
 *       201:
 *         description: Document created successfully
 *       400:
 *         description: Bad request
 *       500:
 *         description: Internal Server Error
 */
export async function POST({ request }) {
  try {
    const {
      title,
      collection_id,
      created_by,
      status = 'draft',
      src_type = 'text',
      src_url,
      pdf_url,
      md_url,
      metadata = {},
      categories = [],
      authors = [],
      content = []
    } = await request.json();
    
    if (!title) {
      return json({ error: 'Title is required' }, { status: 400 });
    }
    
    if (!created_by) {
      return json({ error: 'Created by is required' }, { status: 400 });
    }
    
    // Create document
    const documentData = {
      id: uuidv4(),
      title,
      collection_id,
      created_by,
      status,
      src_type,
      src_url,
      pdf_url,
      md_url,
      metadata,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const document = await db.createDocument(documentData);
    
    // Add categories
    const addedCategories = [];
    for (const categoryId of categories) {
      try {
        const category = await db.addCategoryToDocument(document.id, categoryId);
        addedCategories.push(category);
      } catch (error) {
        console.error(`Error adding category ${categoryId} to document:`, error);
      }
    }
    
    // Add authors
    const addedAuthors = [];
    for (const authorId of authors) {
      try {
        const author = await db.addAuthorToDocument(document.id, authorId);
        addedAuthors.push(author);
      } catch (error) {
        console.error(`Error adding author ${authorId} to document:`, error);
      }
    }
    
    // Create content blocks if provided
    const contentBlocks = [];
    if (content && content.length > 0) {
      for (let i = 0; i < content.length; i++) {
        const block = content[i];
        const contentData = {
          id: uuidv4(),
          document_id: document.id,
          block: block.block,
          block_type: block.block_type,
          sequence: block.sequence !== undefined ? block.sequence : i,
          pdf_page: block.pdf_page,
          book_page: block.book_page,
          context: block.context || block.block.substring(0, 255), // Use first 255 chars as context if not provided
          indexed: false,
          is_duplicate: block.is_duplicate || false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const contentBlock = await db.createContent(contentData);
        contentBlocks.push(contentBlock);
      }
    }
    
    return json({ 
      id: document.id,
      content: contentBlocks,
      categories: addedCategories,
      authors: addedAuthors,
      message: 'Document created successfully' 
    }, { status: 201 });
  } catch (err) {
    console.error('Error creating document:', err);
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/documents/{id}:
 *   put:
 *     summary: Update a document
 *     description: Updates a document's metadata
 *     tags:
 *       - Documents
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Document title
 *               collection_id:
 *                 type: string
 *                 description: Collection ID
 *               status:
 *                 type: string
 *                 enum: [draft, published, archived]
 *                 description: Document status
 *               src_type:
 *                 type: string
 *                 enum: [pdf, markdown, web, text]
 *                 description: Source type
 *               src_url:
 *                 type: string
 *                 description: Source URL
 *               pdf_url:
 *                 type: string
 *                 description: PDF URL
 *               md_url:
 *                 type: string
 *                 description: Markdown URL
 *               metadata:
 *                 type: object
 *                 description: Additional metadata
 *               categories:
 *                 type: array
 *                 description: Category IDs to set (replaces existing)
 *                 items:
 *                   type: string
 *               authors:
 *                 type: array
 *                 description: Author IDs to set (replaces existing)
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Document updated successfully
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal Server Error
 */
export async function PUT({ params, request }) {
  try {
    const { id } = params;
    const updates = await request.json();
    
    // Extract categories and authors from updates
    const { categories, authors, ...documentUpdates } = updates;
    
    const document = await db.getDocumentById(id);
    
    if (!document) {
      return json({ error: 'Document not found' }, { status: 404 });
    }
    
    // Update document
    documentUpdates.updated_at = new Date().toISOString();
    const updatedDocument = await db.updateDocument(id, documentUpdates);
    
    // Update categories if provided
    if (categories) {
      // Get existing categories
      const existingCategories = await db.getCategoriesForDocument(id);
      const existingCategoryIds = existingCategories.map(c => c.id);
      
      // Remove categories that are not in the new list
      for (const categoryId of existingCategoryIds) {
        if (!categories.includes(categoryId)) {
          await db.removeCategoryFromDocument(id, categoryId);
        }
      }
      
      // Add new categories
      for (const categoryId of categories) {
        if (!existingCategoryIds.includes(categoryId)) {
          await db.addCategoryToDocument(id, categoryId);
        }
      }
    }
    
    // Update authors if provided
    if (authors) {
      // Get existing authors
      const existingAuthors = await db.getAuthorsForDocument(id);
      const existingAuthorIds = existingAuthors.map(a => a.id);
      
      // Remove authors that are not in the new list
      for (const authorId of existingAuthorIds) {
        if (!authors.includes(authorId)) {
          await db.removeAuthorFromDocument(id, authorId);
        }
      }
      
      // Add new authors
      for (const authorId of authors) {
        if (!existingAuthorIds.includes(authorId)) {
          await db.addAuthorToDocument(id, authorId);
        }
      }
    }
    
    // Get updated categories and authors
    const updatedCategories = categories ? await db.getCategoriesForDocument(id) : undefined;
    const updatedAuthors = authors ? await db.getAuthorsForDocument(id) : undefined;
    
    return json({ 
      document: updatedDocument,
      ...(updatedCategories ? { categories: updatedCategories } : {}),
      ...(updatedAuthors ? { authors: updatedAuthors } : {}),
      message: 'Document updated successfully' 
    });
  } catch (err) {
    console.error('Error updating document:', err);
    return json({ error: err.message }, { status: 500 });
  }
}

/**
 * @swagger
 * /api/documents/{id}:
 *   delete:
 *     summary: Delete a document
 *     description: Deletes a document and its content blocks
 *     tags:
 *       - Documents
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document ID
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal Server Error
 */
export async function DELETE({ params }) {
  try {
    const { id } = params;
    
    const document = await db.getDocumentById(id);
    
    if (!document) {
      return json({ error: 'Document not found' }, { status: 404 });
    }
    
    // Delete document (will cascade to content blocks due to foreign key constraint)
    await db.deleteDocument(id);
    
    return json({ 
      message: 'Document deleted successfully' 
    });
  } catch (err) {
    console.error('Error deleting document:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
