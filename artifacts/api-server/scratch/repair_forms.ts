import { db, applicationFormsTable } from "@workspace/db";
import { eq, isNull, sql } from "drizzle-orm";

async function run() {
  const DEFAULT_SECTIONS = [
    {
      id: "instructions",
      label: "Section 1: Key Instructions",
      enabled: true,
      icon: "Info",
      fields: [
        { id: "inst_1", label: "Instruction 1: More than one Sub specialty candidates must fill again with fees.", type: "text", required: false, isStandard: false, placeholder: "Informational only" },
        { id: "inst_2", label: "Instruction 2: Carry basic/PG certificates, license, photo to interview.", type: "text", required: false, isStandard: false, placeholder: "Informational only" },
        { id: "inst_3", label: "Instruction 3: Selection involves written test (MCQ) and interview.", type: "text", required: false, isStandard: false, placeholder: "Informational only" },
        { id: "inst_4", label: "Instruction 4: Fee Rs. 2750/- via HDFC Sankara Academy Account.", type: "text", required: false, isStandard: false, placeholder: "Informational only" },
        { id: "inst_5", label: "Instruction 5: Age limit 35 years. PG result awaited not eligible.", type: "text", required: false, isStandard: false, placeholder: "Informational only" },
      ]
    },
    {
      id: "subspecialty",
      label: "Section 2: Subspecialty",
      enabled: true,
      icon: "Star",
      fields: [
        { id: "specialization", label: "Please select the option for which you are applying for", type: "select", required: true, options: ["Cornea", "Glaucoma", "IOL", "Oculoplasty", "Pediatric Ophthalmology", "Phaco Refractive", "Medical Retina", "Vitreo Retina"], isStandard: true, mapping: "specialization" },
      ]
    },
    {
      id: "unit_preferences",
      label: "Section 3: Speciality : Units (Select the preferences)",
      enabled: true,
      icon: "MapPin",
      fields: [
        { id: "pref_cornea", label: "Preferred center for Cornea Fellowship", type: "select", required: false, options: ["Bangalore", "Coimbatore", "Guntur", "Jaipur", "Shimoga", "Not Applicable"], isStandard: true, mapping: "centerPreference" },
        { id: "pref_glaucoma", label: "Preferred center for Glaucoma Fellowship", type: "select", required: false, options: ["Bangalore", "Coimbatore", "Guntur", "Shimoga", "Not Applicable"], isStandard: true, mapping: "centerPreference" },
        { id: "pref_iol", label: "Preferred center for IOL Fellowship", type: "select", required: false, options: ["Anand", "Bangalore", "Guntur", "Hyderabad", "Indore", "Jaipur", "Kanpur", "Krishnankoil", "Ludhiana", "Panvel", "Shimoga", "Varanasi", "Not Applicable"], isStandard: true, mapping: "centerPreference" },
        { id: "pref_retina", label: "Preferred center for Medical Retina Fellowship", type: "select", required: false, options: ["Bangalore", "Coimbatore", "Guntur", "Jaipur", "Shimoga", "Not Applicable"], isStandard: true, mapping: "centerPreference" },
        { id: "pref_oculo", label: "Preferred center for Oculoplasty Fellowship", type: "select", required: false, options: ["Bangalore", "Coimbatore", "Guntur", "Not Applicable"], isStandard: true, mapping: "centerPreference" },
        { id: "pref_peds", label: "Preferred center for Pediatric Fellowship", type: "select", required: false, options: ["Bangalore", "Coimbatore", "Guntur", "Shimoga", "Not Applicable"], isStandard: true, mapping: "centerPreference" },
        { id: "pref_phaco", label: "Preferred center for Phaco Refractive Fellowship", type: "select", required: false, options: ["Bangalore", "Not Applicable"], isStandard: true, mapping: "centerPreference" },
        { id: "pref_vr", label: "Preferred center for Vitreo Retina Fellowship", type: "select", required: false, options: ["Bangalore", "Coimbatore", "Guntur", "Shimoga", "Not Applicable"], isStandard: true, mapping: "centerPreference" },
        { id: "referralSource", label: "Where did you hear about this Fellowship?", type: "select", required: true, options: ["Sankara Website", "Word of Mouth", "Referred by any Faculty or exiting trainee at Sankara", "IJO Advertisement", "Social Media Platforms"], isStandard: true, mapping: "referralSource" },
      ]
    },
    {
      id: "referral_info",
      label: "Section 4: Referral Information",
      enabled: true,
      icon: "Users",
      fields: [
        { id: "referredByName", label: "Mention the name of referred Faculty/Existing Trainee from Sankara", type: "text", required: true, isStandard: true, mapping: "referredByName" },
      ]
    },
    {
      id: "social_media",
      label: "Section 5: Social Media",
      enabled: true,
      icon: "Share2",
      fields: [
        { id: "mediaSource", label: "Mention the Media Source", type: "text", required: true, isStandard: true, mapping: "mediaSource" },
      ]
    },
    {
      id: "personal_details",
      label: "Section 6: Let us know you better",
      enabled: true,
      icon: "User",
      fields: [
        { id: "fullName", label: "Name in Full (First Name, Middle Name, Last/Family Name)", type: "text", required: true, isStandard: true, mapping: "fullName" },
        { id: "permanentAddress", label: "Permanent Address (including postal pin code)", type: "textarea", required: true, isStandard: true, mapping: "permanentAddress" },
        { id: "mailingAddress", label: "Preferred Mailing Address", type: "textarea", required: true, isStandard: true, mapping: "mailingAddress" },
        { id: "phone", label: "Mobile Number (only 10 digits)", type: "text", required: true, isStandard: true, mapping: "phone" },
        { id: "email", label: "E-mail (for all communications)", type: "text", required: true, isStandard: true, mapping: "email" },
        { id: "dateOfBirth", label: "Date of Birth", type: "date", required: true, isStandard: true, mapping: "dateOfBirth" },
        { id: "maritalStatus", label: "Marital Status", type: "radio", required: true, options: ["Married", "Unmarried"], isStandard: true, mapping: "maritalStatus" },
        { id: "spouseDetails", label: "If Married Spouse Details (Name & Profession)", type: "text", required: false, isStandard: true, mapping: "spouseDetails" },
      ]
    },
    {
      id: "previous_app",
      label: "Section 7: SAV Fellowship entrance appeared earlier?",
      enabled: true,
      icon: "History",
      fields: [
        { id: "appearedEarlier", label: "Appeared for SAV Fellowship earlier?", type: "radio", required: true, options: ["Yes", "No"], isStandard: false },
        { id: "previousAppDate", label: "If yes, month & year", type: "text", required: false, isStandard: true, mapping: "previousApplicationMonthYear" },
      ]
    },
    {
      id: "medical_history",
      label: "Section 8: Medical History",
      enabled: true,
      icon: "Activity",
      fields: [
        { id: "medicalConditions", label: "Declare if you are suffering any of the following ailments", type: "checkbox", required: true, options: ["Asthma", "Hypertension", "Diabetes", "Skin Allergy", "Hearing Impairment", "Tuberculosis", "Post Covid", "None of the Above"], isStandard: true, mapping: "medicalConditions" },
      ]
    },
    {
      id: "education",
      label: "Section 9: Educational Qualifications",
      enabled: true,
      icon: "GraduationCap",
      fields: [
        { id: "degree", label: "Degree (Undergraduate)", type: "text", required: true, isStandard: true, mapping: "degree" },
        { id: "medicalCollege", label: "Medical College Qualified From (College, City, State, Country)", type: "text", required: true, isStandard: true, mapping: "medicalCollege" },
        { id: "university", label: "University from which MBBS Degree Awarded", type: "text", required: true, isStandard: true, mapping: "university" },
        { id: "pgQualifications", label: "Postgraduate Qualifications", type: "text", required: true, isStandard: true, mapping: "pgQualifications" },
        { id: "qualMatrix", label: "Qualification Details (DO, MS, DNB)", type: "textarea", required: true, isStandard: true, mapping: "qualificationMatrix", placeholder: "e.g. DO: College, Year; MS: College, Year" },
        { id: "otherTraining", label: "Any Other Training / Certification undertaken", type: "text", required: false, isStandard: true, mapping: "otherTraining" },
        { id: "councilNo", label: "Medical Council Registration Number", type: "text", required: true, isStandard: true, mapping: "medicalCouncilNumber" },
      ]
    },
    {
      id: "clinical_experience",
      label: "Section 10: Clinical Experience",
      enabled: true,
      icon: "Stethoscope",
      fields: [
        { id: "diagSkills", label: "Perform & Interpret Diagnostics (Slit Lamp, Fundus, OCT, etc. - specify level: Beginner/Intermittent/Expert)", type: "textarea", required: true, isStandard: true, mapping: "diagnosticSkills" },
        { id: "surg_ecce", label: "Approximate No of ECCE performed (Supervised / Independent)", type: "text", required: true, isStandard: false },
        { id: "surg_sics", label: "Approximate No of SICS performed (Supervised / Independent)", type: "text", required: true, isStandard: false },
        { id: "surg_phaco", label: "Approximate No of PHACO performed (Supervised / Independent)", type: "text", required: true, isStandard: false },
        { id: "surg_trab", label: "Approximate No of TRABECULECTOMY performed (Supervised / Independent)", type: "text", required: true, isStandard: false },
        { id: "surg_retina", label: "Approximate No of RETINA LASERS performed (Supervised / Independent)", type: "text", required: true, isStandard: false },
        { id: "surg_dcr", label: "Approximate No of DCR performed (Supervised / Independent)", type: "text", required: true, isStandard: false },
        { id: "totalSurgeries", label: "Total No of Surgeries performed till date", type: "text", required: true, isStandard: true, mapping: "totalSurgeries" },
      ]
    },
    {
      id: "academic",
      label: "Section 11: Publications & Presentation",
      enabled: true,
      icon: "BookOpen",
      fields: [
        { id: "publications", label: "Journal - List of all publications", type: "textarea", required: true, isStandard: true, mapping: "publications" },
        { id: "presentations", label: "Presentations - List of conference presentations", type: "textarea", required: true, isStandard: true, mapping: "presentations" },
      ]
    },
    {
      id: "lors",
      label: "Section 12: LETTER OF RECOMMENDATION (LOR)",
      enabled: true,
      icon: "Upload",
      fields: [
        { id: "lor1Url", label: "LOR 1 (PDF)", type: "file", required: true, isStandard: true, mapping: "lor1Url" },
        { id: "lor1Name", label: "Name & Designation of Reference 1", type: "text", required: true, isStandard: true, mapping: "lor1RefName" },
        { id: "lor1Contact", label: "Contact number of Reference 1", type: "text", required: true, isStandard: true, mapping: "lor1RefContact" },
        { id: "lor1Email", label: "Email ID of Reference 1", type: "text", required: true, isStandard: true, mapping: "lor1RefEmail" },
        { id: "lor2Url", label: "LOR 2 (PDF)", type: "file", required: true, isStandard: true, mapping: "lor2Url" },
        { id: "lor2Name", label: "Name & Designation of Reference 2", type: "text", required: true, isStandard: true, mapping: "lor2RefName" },
        { id: "lor2Contact", label: "Contact number of Reference 2", type: "text", required: true, isStandard: true, mapping: "lor2RefContact" },
        { id: "lor2Email", label: "Email id of Reference 2", type: "text", required: true, isStandard: true, mapping: "lor2RefEmail" },
      ]
    },
    {
      id: "final_decl",
      label: "Section 13: Is there anything more we should know?",
      enabled: true,
      icon: "CheckCircle",
      fields: [
        { id: "otherInfo", label: "Other pertinent information", type: "textarea", required: false, isStandard: true, mapping: "otherInformation" },
        { id: "declaration", label: "I declare information is true and will submit NOC failing which seat allocation would be cancelled.", type: "checkbox", required: true, options: ["Accept Declaration"], isStandard: true, mapping: "declarationAccepted" },
        { id: "paymentUrl", label: "Upload the screenshot with Transaction ID/UTR of Rs. 2750/-", type: "file", required: true, isStandard: true, mapping: "paymentUrl" },
        { id: "photoUrl", label: "Latest passport size photograph", type: "file", required: true, isStandard: true, mapping: "photoUrl" },
      ]
    }
  ];

  console.log("Fixing forms with missing configurations...");
  
  // Update forms where sections_config is null or empty array
  const result = await db.execute(sql`
    UPDATE application_forms 
    SET sections_config = ${JSON.stringify(DEFAULT_SECTIONS)}::jsonb
    WHERE sections_config IS NULL OR sections_config = '[]'::jsonb
  `);

  console.log("Repair complete!");
  process.exit(0);
}

run().catch(console.error);
