/**
 * Search service for SifterSearch using Manticore Search
 */

// Default search parameters
const DEFAULT_LIMIT = 20;

/**
 * Performs a hybrid search using both BM25 and vector similarity
 */
export async function search(query, queryVector, options = {}) {
  const limit = options.limit || DEFAULT_LIMIT;
  const offset = options.offset || 0;
  const filters = options.filters || {};
  const bm25Weight = options.bm25Weight || 0.6;
  const vectorWeight = options.vectorWeight || 0.4;

  // Sanitize query
  const sanitizedQuery = query.replace(/['";]/g, ' ');
  
  // Build filter conditions
  let filterConditions = '';
  if (filters.collection_id) {
    filterConditions += ` AND collection_id = ${parseInt(filters.collection_id, 10)}`;
  }
  if (filters.language) {
    filterConditions += ` AND language = '${filters.language.replace(/['";]/g, '')}'`;
  }
  if (filters.date_from) {
    const timestamp = Math.floor(new Date(filters.date_from).getTime() / 1000);
    filterConditions += ` AND created_at >= ${timestamp}`;
  }
  if (filters.date_to) {
    const timestamp = Math.floor(new Date(filters.date_to).getTime() / 1000);
    filterConditions += ` AND created_at <= ${timestamp}`;
  }
  
  // SQL query for hybrid search
  const sql = `
    SELECT *,
           (${bm25Weight} * BM25A(1.2, 0.75) + 
            ${vectorWeight} * DOT(embeddings, [${queryVector.join(',')}])) AS score
    FROM siftersearch
    WHERE MATCH('${sanitizedQuery}') ${filterConditions}
    ORDER BY score DESC
    LIMIT ${offset}, ${limit}
  `;

  try {
    const response = await fetch(`${import.meta.env.PUBLIC_MANTICORE_URL}/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql })
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const result = await response.json();
    
    // Process results
    if (!result.data || !Array.isArray(result.data)) {
      return [];
    }

    return result.data.map(item => ({
      id: item.doc_id,
      title: item.title,
      content: item.content,
      description: item.description,
      url: item.url,
      language: item.language,
      tags: item.tags ? item.tags.split(',') : [],
      score: item.score,
      created_at: new Date(item.created_at * 1000),
      updated_at: new Date(item.updated_at * 1000)
    }));
  } catch (error) {
    console.error('Search error:', error);
    throw error;
  }
}

/**
 * Indexes a document in Manticore Search
 */
export async function indexDocument(document, embeddings) {
  const id = document.id;
  const title = document.title.replace(/['";]/g, '');
  const content = document.content.replace(/['";]/g, '');
  const description = (document.description || '').replace(/['";]/g, '');
  const url = document.url.replace(/['";]/g, '');
  const language = (document.language || 'en').replace(/['";]/g, '');
  const collection_id = document.collection_id || 1;
  const tags = (document.tags || []).join(',').replace(/['";]/g, '');
  const timestamp = Math.floor(Date.now() / 1000);
  
  const sql = `
    REPLACE INTO siftersearch (doc_id, collection_id, title, content, description, url, language, tags, created_at, updated_at, embeddings) 
    VALUES (
      ${id}, 
      ${collection_id}, 
      '${title}', 
      '${content}', 
      '${description}', 
      '${url}', 
      '${language}', 
      '${tags}', 
      ${timestamp}, 
      ${timestamp}, 
      [${embeddings.join(',')}]
    )
  `;

  try {
    const response = await fetch(`${import.meta.env.PUBLIC_MANTICORE_URL}/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql })
    });

    if (!response.ok) {
      throw new Error(`Indexing failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Indexing error:', error);
    throw error;
  }
}

/**
 * Deletes a document from the index
 */
export async function deleteDocument(docId) {
  const sql = `DELETE FROM siftersearch WHERE doc_id = ${docId}`;

  try {
    const response = await fetch(`${import.meta.env.PUBLIC_MANTICORE_URL}/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql })
    });

    if (!response.ok) {
      throw new Error(`Deletion failed: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Deletion error:', error);
    throw error;
  }
}
