/**
 * Test Manticore Search connectivity
 * This script verifies that Manticore Search is running and accessible
 */

async function testManticoreConnection() {
  const MANTICORE_URL = process.env.PUBLIC_MANTICORE_URL || 'http://manticore:9308';
  
  console.log(`Testing connection to Manticore at ${MANTICORE_URL}...`);
  
  try {
    // Try to execute a simple query
    const response = await fetch(`${MANTICORE_URL}/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'SHOW STATUS' })
    });
    
    if (!response.ok) {
      throw new Error(`Failed with status: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.error) {
      throw new Error(`Manticore error: ${result.error}`);
    }
    
    console.log('✅ Manticore Search is running and accessible');
    return true;
  } catch (error) {
    console.error('❌ Manticore Search connection test failed:', error.message);
    return false;
  }
}

// Execute if run directly
if (import.meta.url === import.meta.main) {
  const result = await testManticoreConnection();
  process.exit(result ? 0 : 1);
}

export default testManticoreConnection;
