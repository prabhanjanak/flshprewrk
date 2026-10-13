const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:admin@localhost:5432/fellowship_db' });

client.connect().then(async () => {
    console.log('Connected to database. Attempting schema update...');
    try {
        await client.query('ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "mcq_score" text;');
        console.log('Successfully added mcq_score column to candidates');
    } catch (e) {
        console.error('Error adding mcq_score:', e.message);
    }
    
    try {
        await client.query('ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "psychometric_score" text;');
        console.log('Successfully added psychometric_score column to candidates');
    } catch (e) {
        console.error('Error adding psychometric_score:', e.message);
    }
    
    client.end();
}).catch(e => console.error('Connection failed:', e));
