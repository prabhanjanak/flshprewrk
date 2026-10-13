const { Pool } = require('C:\\Users\\HP\\Desktop\\savprojectv2-version2\\savprojectv2-version2\\lib\\db\\node_modules\\pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:admin@localhost:5432/fellowship_db'
});

const SECTIONS = [
  {
    id: "instructions",
    title: "Key Instructions",
    description: "Please read the following instructions carefully before proceeding.",
    enabled: true,
    fields: [
      { id: "intro_text", type: "info", label: "Instructions", defaultValue: "1. Candidates can now apply for multiple Sub-specialties in a single application form.\n2. Kindly carry your basic and post-graduate educational certificates, current valid medical registration license and passport - size photograph\n3. Selection process for the fellowship involves a written test (MCQ pattern) and an interview\n4. Application fee is Rs.2750/- per specialization, payable only through online transfer...\n5. The age limit of the applicant to apply for the fellowships is 35 years..." }
    ]
  },
  {
    id: "subspecialty",
    title: "Subspecialty Selection",
    description: "Select the option(s) for which you are applying. You can select more than one.",
    enabled: true,
    fields: [
      { id: "specialization", type: "checkbox_group", label: "Subspecialties", required: true, options: ["Cornea", "Glaucoma", "IOL", "Oculoplasty", "Pediatric Ophthalmology", "Phaco Refractive", "Medical Retina", "Vitreo Retina"], isStandard: true, mapping: "specialization" }
    ]
  },
  {
    id: "units",
    title: "Speciality : Units (Select the preferences)",
    description: "Choose the preferred center for each fellowship.",
    enabled: true,
    fields: [
      { id: "unit_cornea", type: "checkbox_group", label: "Cornea Preferred Center", options: ["Bangalore", "Coimbatore", "Guntur", "Jaipur", "Shimoga", "Not Applicable"], visibleIf: { field: "specialization", contains: "Cornea" } },
      { id: "unit_glaucoma", type: "checkbox_group", label: "Glaucoma Preferred Center", options: ["Bangalore", "Coimbatore", "Guntur", "Shimoga", "Not Applicable"], visibleIf: { field: "specialization", contains: "Glaucoma" } },
      { id: "unit_iol", type: "checkbox_group", label: "IOL Preferred Center", options: ["Anand", "Bangalore", "Guntur", "Hyderabad", "Indore", "Jaipur", "Kanpur", "Krishnankoil", "Ludhiana", "Panvel", "Shimoga", "Varanasi", "Not Applicable"], visibleIf: { field: "specialization", contains: "IOL" } },
      { id: "unit_medical_retina", type: "checkbox_group", label: "Medical Retina Preferred Center", options: ["Bangalore", "Coimbatore", "Guntur", "Jaipur", "Shimoga", "Not Applicable"], visibleIf: { field: "specialization", contains: "Medical Retina" } },
      { id: "unit_oculoplasty", type: "checkbox_group", label: "Oculoplasty Preferred Center", options: ["Bangalore", "Coimbatore", "Guntur", "Not Applicable"], visibleIf: { field: "specialization", contains: "Oculoplasty" } },
      { id: "unit_pediatric", type: "checkbox_group", label: "Pediatric Preferred Center", options: ["Bangalore", "Coimbatore", "Guntur", "Shimoga", "Not Applicable"], visibleIf: { field: "specialization", contains: "Pediatric Ophthalmology" } },
      { id: "unit_phaco", type: "checkbox_group", label: "Phaco Refractive Preferred Center", options: ["Bangalore", "Not Applicable"], visibleIf: { field: "specialization", contains: "Phaco Refractive" } },
      { id: "unit_vitreo_retina", type: "checkbox_group", label: "Vitreo Retina Preferred Center", options: ["Bangalore", "Coimbatore", "Guntur", "Shimoga", "Not Applicable"], visibleIf: { field: "specialization", contains: "Vitreo Retina" } },
      { id: "referralSource", type: "select", label: "Where did you hear about this Fellowship?", required: true, options: ["Sankara Website", "Word of Mouth", "Referred by any Faculty or exiting trainee at Sankara", "IJO Advertisement", "Social Media Platforms (Instagram/Facebook/Whatsapp/LinkedIn)"], isStandard: true, mapping: "referralSource" }
    ]
  },
  {
    id: "referral_info",
    title: "Referral Information",
    description: "Details of the person who referred you.",
    enabled: true,
    fields: [
      { id: "referredByName", type: "text", label: "Name of referred Faculty/Existing Trainee", isStandard: true, mapping: "referredByName" }
    ]
  },
  {
    id: "social_media",
    title: "Social Media",
    description: "Specify the media source if applicable.",
    enabled: true,
    fields: [
      { id: "mediaSource", type: "text", label: "Media Source", isStandard: true, mapping: "mediaSource" }
    ]
  },
  {
    id: "personal_details",
    title: "Let us know you better",
    description: "Basic information to identify you.",
    enabled: true,
    fields: [
      { id: "fullName", type: "text", label: "Name in Full", required: true, isStandard: true, mapping: "fullName" },
      { id: "permanentAddress", type: "textarea", label: "Permanent Address", required: true, isStandard: true, mapping: "permanentAddress" },
      { id: "mailingAddress", type: "textarea", label: "Preferred Mailing Address (or N/A)", required: true, isStandard: true, mapping: "mailingAddress" },
      { id: "phone", type: "phone", label: "Mobile Number (10 digits)", required: true, isStandard: true, mapping: "phone" },
      { id: "email", type: "text", label: "E-mail ID", required: true, isStandard: true, mapping: "email" },
      { id: "dateOfBirth", type: "date", label: "Date of Birth", required: true, isStandard: true, mapping: "dateOfBirth" },
      { id: "maritalStatus", type: "radio", label: "Marital Status", options: ["Married", "Unmarried"], required: true, isStandard: true, mapping: "maritalStatus" },
      { id: "spouseDetails", type: "text", label: "If Married, Spouse Details (Name & Profession)", isStandard: true, mapping: "spouseDetails" }
    ]
  },
  {
    id: "previous_entrance",
    title: "Previous Entrance",
    description: "Did you appear for the entrance earlier?",
    enabled: true,
    fields: [
      { id: "prev_appeared", type: "radio", label: "Appeared Earlier?", options: ["Yes", "No"] },
      { id: "previousApplicationMonthYear", type: "text", label: "If Yes, Month & Year", isStandard: true, mapping: "previousApplicationMonthYear", visibleIf: { field: "prev_appeared", equals: "Yes" } }
    ]
  },
  {
    id: "medical_history",
    title: "Medical History",
    description: "Declare any ailments.",
    enabled: true,
    fields: [
      { id: "medicalConditions", type: "checkbox_group", label: "Ailments / Medications", options: ["Asthma", "Hypertension", "Diabetes", "Skin Allergy", "Hearing Impairment", "Tuberculosis", "Post Covid", "None of the Above"], isStandard: true, mapping: "medicalConditions" }
    ]
  },
  {
    id: "educational_qual",
    title: "Educational Qualifications",
    description: "Undergraduate and Postgraduate details.",
    enabled: true,
    fields: [
      { id: "medicalCollege", type: "text", label: "Medical College Qualified From", required: true, isStandard: true, mapping: "medicalCollege" },
      { id: "university", type: "text", label: "University (MBBS Awarded)", required: true, isStandard: true, mapping: "university" },
      { id: "qualification_matrix", type: "qualification_matrix", label: "Postgraduate Qualifications", isStandard: true, mapping: "qualificationMatrix" },
      { id: "do_details", type: "text", label: "If DO: College, University & Year", isStandard: true, mapping: "doDetails", visibleIf: { field: "qualification_matrix", key: "DO (Diploma Ophthlmology)", equals: "Yes" } },
      { id: "ms_md_details", type: "text", label: "If MS: College, University & Year", isStandard: true, mapping: "msMdDetails", visibleIf: { field: "qualification_matrix", key: "MS/MD ( Masters in Ophthalmology)", equals: "Yes" } },
      { id: "dnb_details", type: "text", label: "If DNB: Institution & Year", isStandard: true, mapping: "dnbDetails", visibleIf: { field: "qualification_matrix", key: "DNB", equals: "Yes" } },
      { id: "otherTraining", type: "text", label: "Any Other Training / Certification", isStandard: true, mapping: "otherTraining" },
      { id: "medicalCouncilNumber", type: "text", label: "Medical Council Registration Number", required: true, isStandard: true, mapping: "medicalCouncilNumber" }
    ]
  },
  {
    id: "clinical_exp",
    title: "Clinical Experience",
    description: "Document your diagnostic and surgical experience.",
    enabled: true,
    fields: [
      { id: "diagnostic_skills", type: "skills_table", label: "Diagnostic Skills", options: ["Beginner", "Intermittent", "Expert"], rows: ["Slit Lamp", "Fundus Exam +90D", "Indirect Ophthalmoscopy", "Applanation Tonometry", "Gonioscopy", "Biometry (Keratometry, A Scan)", "Ultrasound B Scan", "Corneal Topgraphy", "Specular Microscopy", "Visual Fields (HFA)", "Fundus Flourescien Angiography (FFA)", "Ocular Coherence Tomography (OCT)", "Yag Capsulotomy /Iridotomy", "Argon LASER", "Hess Charting"], isStandard: true, mapping: "diagnosticSkills" },
      { id: "surgery_experience", type: "surgery_table", label: "Surgical Experience", rows: ["ECCE", "SICS", "PHACO", "TRABECULECTOMY", "RETINA LASERS", "DCR"], isStandard: true, mapping: "surgicalExperience" },
      { id: "totalSurgeries", type: "number", label: "Total No. of Surgeries performed till date (Confirmation)", required: true, isStandard: true, mapping: "totalSurgeries" }
    ]
  },
  {
    id: "publications",
    title: "Publications & Presentation",
    description: "Academic presentations & publications.",
    enabled: true,
    fields: [
      { id: "publications", type: "textarea", label: "Journal Publications", required: true, isStandard: true, mapping: "publications" },
      { id: "presentations", type: "textarea", label: "Conference Presentations", required: true, isStandard: true, mapping: "presentations" }
    ]
  },
  {
    id: "lor",
    title: "LETTER OF RECOMMENDATION (LOR)",
    description: "Upload two LORs from the last 6 months (PDF).",
    enabled: true,
    fields: [
      { id: "lor1Url", type: "file", label: "LOR 1 PDF", required: true, isStandard: true, mapping: "lor1Url" },
      { id: "lor1RefName", type: "text", label: "Name & Designation of Reference 1", required: true, isStandard: true, mapping: "lor1RefName" },
      { id: "lor1RefContact", type: "text", label: "Contact number of Reference 1", required: true, isStandard: true, mapping: "lor1RefContact" },
      { id: "lor1RefEmail", type: "text", label: "Email ID of Reference 1", required: true, isStandard: true, mapping: "lor1RefEmail" },
      { id: "lor2Url", type: "file", label: "LOR 2 PDF", required: true, isStandard: true, mapping: "lor2Url" },
      { id: "lor2RefName", type: "text", label: "Name & Designation of Reference 2", required: true, isStandard: true, mapping: "lor2RefName" },
      { id: "lor2RefContact", type: "text", label: "Contact number of Reference 2", required: true, isStandard: true, mapping: "lor2RefContact" },
      { id: "lor2RefEmail", type: "text", label: "Email ID of Reference 2", required: true, isStandard: true, mapping: "lor2RefEmail" }
    ]
  },
  {
    id: "final",
    title: "Declaration & Payment",
    description: "Final information and documents.",
    enabled: true,
    fields: [
      { id: "photoUrl", type: "file", label: "Passport Size Photograph", required: true, isStandard: true, mapping: "photoUrl" },
      { id: "declarationAccepted", type: "checkbox", label: "I hereby declare that the information provided is true to the best of my knowledge.", required: true, isStandard: true, mapping: "declarationAccepted" }
    ]
  }
];

async function fix() {
  try {
    console.log("Setting up July 2026 program and form...");
    
    // 1. Ensure July 2026 Program
    let progId;
    const progRes = await pool.query("SELECT id FROM programs WHERE name LIKE '%July 2026%'");
    if (progRes.rows.length === 0) {
      const insProg = await pool.query(`
        INSERT INTO programs (name, code, academic_year, description) 
        VALUES ('Fellowship Program - July 2026', 'FP-JUL-2026', '2026-27', 'Sankara Academy of Vision Fellowship Program for July 2026 batch.')
        RETURNING id
      `);
      progId = insProg.rows[0].id;
      console.log("Created July 2026 program.");
    } else {
      progId = progRes.rows[0].id;
    }

    // 2. Create Application Form
    const token = Math.random().toString(36).substring(2, 10).toUpperCase();
    await pool.query(`
      INSERT INTO application_forms (program_id, title, description, is_active, token, sections_config)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      progId, 
      "Fellowship Program - July 2026", 
      "Sankara Academy of Vision Fellowship Program for July 2026 batch.",
      true,
      token,
      JSON.stringify(SECTIONS)
    ]);
    
    console.log(`Created July 2026 form with token: ${token}`);
    console.log(`Link: https://learn.sankaraeye.in/apply/${token}`);

  } catch (err) {
    console.error("Fix failed:", err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

fix();
