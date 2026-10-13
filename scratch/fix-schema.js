const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:admin@localhost:5432/fellowship_db' });
client.connect().then(async () => {
    try {
        await client.query('ALTER TABLE "programs" ADD COLUMN "offer_letter_template_id" integer;');
        console.log('Added offer_letter_template_id to programs');
    } catch (e) { console.log(e.message); }
    try {
        await client.query('ALTER TABLE "application_submissions" ADD COLUMN "gender" text;');
        console.log('Added gender to application_submissions');
    } catch (e) { console.log(e.message); }
    client.end();
}).catch(e => console.error(e));
