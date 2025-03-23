/**
 * Initialize Manticore Search index
 * This script is run during container startup to ensure the index exists
 */

async function initializeManticoreIndex() {
  const MANTICORE_URL = process.env.PUBLIC_MANTICORE_URL || 'http://manticore:9308';
  const INDEX_NAME = process.env.PUBLIC_MANTICORE_INDEX || 'siftersearch';
  const VECTOR_SIZE = parseInt(process.env.PUBLIC_MANTICORE_VECTOR_SIZE || '768', 10);
  
  console.log('Initializing Manticore Search index...');
  
  try {
    // Check if index exists
    const checkResponse = await fetch(`${MANTICORE_URL}/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'SHOW TABLES' })
    });
    
    const checkResult = await checkResponse.json();
    const indexExists = checkResult.data && checkResult.data.some(table => table.Index === INDEX_NAME);
    
    if (indexExists) {
      console.log(`Index '${INDEX_NAME}' already exists.`);
      return;
    }
    
    // Create the index if it doesn't exist
    console.log(`Creating index '${INDEX_NAME}'...`);
    
    const createIndexQuery = `
      CREATE TABLE ${INDEX_NAME} (
        doc_id BIGINT,
        collection_id INTEGER,
        title TEXT,
        content TEXT,
        description TEXT,
        url STRING,
        language STRING,
        tags STRING,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        embeddings FLOAT_VECTOR(${VECTOR_SIZE})
      ) min_infix_len='1' charset_table='non_cjk, cjk' ngram_len='1' ngram_chars='cjk' html_strip='1'
    `;
    
    const createResponse = await fetch(`${MANTICORE_URL}/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: createIndexQuery })
    });
    
    const createResult = await createResponse.json();
    
    if (createResult.error) {
      throw new Error(`Failed to create index: ${createResult.error}`);
    }
    
    console.log(`Successfully created index '${INDEX_NAME}'`);
    
    // Create a hybrid search function
    const createFunctionQuery = `
      CREATE FUNCTION hybrid_score(bm25_weight FLOAT, vector_weight FLOAT) 
      RETURNS FLOAT AS 
      (bm25_weight * BM25A(1.2, 0.75) + vector_weight * DOT(embeddings, query_vector))
    `;
    
    const functionResponse = await fetch(`${MANTICORE_URL}/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: createFunctionQuery })
    });
    
    const functionResult = await functionResponse.json();
    
    if (functionResult.error) {
      console.warn(`Warning: Failed to create hybrid_score function: ${functionResult.error}`);
    } else {
      console.log('Successfully created hybrid_score function');
    }
    
  } catch (error) {
    console.error('Error initializing Manticore index:', error);
    process.exit(1);
  }
}

// Execute if run directly
if (import.meta.url === import.meta.main) {
  initializeManticoreIndex().catch(console.error);
}

export default initializeManticoreIndex;
