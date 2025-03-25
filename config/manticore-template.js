/**
 * Manticore Configuration Template Generator
 * 
 * This script generates a manticore.conf file based on environment variables.
 * It replaces hard-coded values with dynamic configuration from our config system.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PUBLIC } from './config.js';

// Get config value from PUBLIC environment variables
// No defaults to ensure missing values are detected
const getConfig = (key) => {
  const value = PUBLIC[`MANTICORE_${key}`];
  if (value === undefined) {
    console.error(`ERROR: Required Manticore configuration MANTICORE_${key} is not set.`);
  }
  return value;
};

// Generate the Manticore configuration
const generateManticoreConfig = () => {
  return `searchd {
    listen = ${getConfig('HTTP_PORT')}:http
    # MySQL protocol listener (enabled in production by default)
    listen = ${getConfig('SQL_PORT')}:mysql
    log = ${getConfig('LOG_PATH')}/searchd.log
    query_log = ${getConfig('LOG_PATH')}/query.log
    pid_file = ${getConfig('PID_PATH')}/searchd.pid
    binlog_path = ${getConfig('DATA_PATH')}
    
    # Production settings (some will be ignored in development)
    max_connections = ${getConfig('MAX_CONNECTIONS')}
    max_filters = ${getConfig('MAX_FILTERS')}
    max_filter_values = ${getConfig('MAX_FILTER_VALUES')}
    network_timeout = ${getConfig('NETWORK_TIMEOUT')}
    # workers = thread_pool  # Commented out as deprecated
    binlog_flush = 1
}

common {
    plugin_dir = ${getConfig('PLUGIN_DIR')}
}

table ${getConfig('TABLE_NAME')} {
    type = rt
    path = ${getConfig('DATA_PATH')}/data/${getConfig('TABLE_NAME')}
    
    rt_field = content
    rt_field = title
    rt_field = description
    rt_field = tags
    
    rt_attr_uint = doc_id
    rt_attr_uint = collection_id
    rt_attr_timestamp = created_at
    rt_attr_timestamp = updated_at
    rt_attr_string = url
    rt_attr_string = language
    rt_attr_float = embedding1
    rt_attr_float = embedding2
    # Add more embedding attributes as needed
    
    # Multilingual support
    charset_table = non_cjk, cjk
    min_infix_len = ${getConfig('MIN_INFIX_LEN')}
    ngram_len = ${getConfig('NGRAM_LEN')}
    ngram_chars = cjk
    
    # Compression settings
    # columnar_attrs = embeddings(zstd)  # Commented out as it depends on float_vector
    
    # Hybrid search settings
    # index_vec_dims = 1536  # Commented out as it depends on float_vector
    
    # Performance settings
    # ondisk_attrs = 1  # Commented out as it's a performance tuning option
}`;
};

// Function to write the configuration to a file
export const writeManticoreConfig = (outputPath) => {
  const config = generateManticoreConfig();
  fs.writeFileSync(outputPath, config);
  console.log(`Manticore configuration written to ${outputPath}`);
};

// Export the generator function
export default generateManticoreConfig;

// If this script is run directly, generate the config file
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputPath = process.argv[2] || path.join(process.cwd(), 'docker/manticore/manticore.conf');
  writeManticoreConfig(outputPath);
}
