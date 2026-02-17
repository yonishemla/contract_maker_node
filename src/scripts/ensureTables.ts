import { pool } from '../db';

const run = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS contracts (
      id CHAR(36) PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      creator_email VARCHAR(255) NULL,
      language ENUM('he','en') DEFAULT 'he',
      title VARCHAR(255) NOT NULL,
      contract_text LONGTEXT NOT NULL,
      status ENUM('draft','sent','completed') DEFAULT 'draft',
      final_pdf_data LONGTEXT NULL
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS signers (
      id CHAR(36) PRIMARY KEY,
      contract_id CHAR(36),
      signer_index INT,
      name VARCHAR(255),
      email VARCHAR(255),
      token VARCHAR(255) UNIQUE,
      signed_at DATETIME NULL,
      signature_data_url LONGTEXT NULL,
      signature_hash VARCHAR(255) NULL,
      FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
    )
  `);

  console.log('Tables ensured');
  await pool.end();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
