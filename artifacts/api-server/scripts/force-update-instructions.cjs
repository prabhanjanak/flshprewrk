const { Pool } = require('C:\\Users\\HP\\Desktop\\savprojectv2-version2\\savprojectv2-version2\\lib\\db\\node_modules\\pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:admin@localhost:5432/fellowship_db'
});

const NEW_TEXT = "<b>1. Multiple Sub-specialties:</b> Candidates can now apply for multiple Sub-specialties in a single application form. Separate fees apply for each specialization.<br/><br/><b>2. Required Documents:</b> Kindly carry your basic and post-graduate educational certificates, current valid medical registration license, and passport-size photograph.<br/><br/><b>3. Selection Process:</b> Selection involves a written test (MCQ pattern) and an interview.<br/><br/><b>4. Application Fee:</b> Rs.2750/- per specialization, payable only through online transfer to the HDFC Bank account.<br/><br/><b>5. Age Limit:</b> The age limit is 35 years; those beyond 35 years and those awaiting PG results are not eligible.<br/><br/><b>6. Government Bond:</b> Applicants under Government bond or Compulsory Rural Service must submit a 'No Objection Certificate' during the examination.<br/><br/><b>7. NOC Requirement:</b> Selected fellows must submit NOC from their State Medical Council during Fellowship induction.<br/><br/><b>8. Recommendation Letters:</b> Two Letters of Recommendation are required to be uploaded in the last page of this form.<br/><br/><b>9. Payment Proof:</b> The receipt of online payment (screenshot) must be enclosed to the application form.";

async function fix() {
  try {
    console.log("Updating all forms with full instruction list...");
    
    // Get all forms
    const formsRes = await pool.query("SELECT id, sections_config FROM application_forms");
    
    for (const form of formsRes.rows) {
      const config = form.sections_config || [];
      const instSection = config.find(s => s.id === "instructions");
      if (instSection && instSection.fields) {
        const introField = instSection.fields.find(f => f.id === "intro_text");
        if (introField) {
          introField.defaultValue = NEW_TEXT;
          introField.label = "Key Instructions";
          
          await pool.query("UPDATE application_forms SET sections_config = $1 WHERE id = $2", [JSON.stringify(config), form.id]);
          console.log(`Updated form ID ${form.id}`);
        }
      }
    }

  } catch (err) {
    console.error("Fix failed:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

fix();
