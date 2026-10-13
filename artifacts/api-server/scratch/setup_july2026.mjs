
import { db, programsTable, applicationFormsTable, usersTable } from "./artifacts/api-server/src/lib/db.js";
import { eq } from "drizzle-orm";

async function setup() {
  try {
    console.log("Setting up new program and form...");

    // 1. Create Program
    const [program] = await db.insert(programsTable).values({
      name: "Fellowship Program - July 2026",
      description: "Sankara Academy of Vision Fellowship Program for July 2026 batch.",
      isActive: true,
    }).returning();

    console.log("Created Program ID:", program.id);

    // 2. Get a user ID for createdBy (fallback to 1)
    const [admin] = await db.select().from(usersTable).limit(1);
    const userId = admin?.id || 1;

    // 3. Define the 13 sections (copy from index.ts logic)
    const DEFAULT_SECTIONS = [
      {
        id: "instructions",
        title: "Key Instructions",
        description: "Please read the following instructions carefully before proceeding.",
        enabled: true,
        fields: [
          { id: "intro_text", type: "info", label: "Instructions", defaultValue: "1. More than one Sub specialty candidates are requested to fill up the application form again with the required application fees\n2. Kindly carry your basic and post-graduate educational certificates, current valid medical registration license and passport - size photograph\n3. Selection process for the fellowship involves a written test (MCQ pattern) and an interview\n4. Application fee of Rs.2750/- can be paid only through online transfer, the fee shall be credited to the corporate bank account no: 50100004642084 of \"Sankara Academy of Vision\" with the HDFC bank, Saravanampatti Branch, Coimbatore IFSC Code: HDFC0002231, through any online payment mode Google Pay/ Phonepe/Paytm/RTGS/NEFT \n5. The age limit of the applicant to apply for the fellowships is 35 years, those beyond 35 years and those awaiting for PG result are not eligible to apply\n6. Applicants who are under Government bond or Compulsory Rural Service will have to submit ‘No Objection Certificate’ during the time of examination\n7. All the selected fellows will need to submit NOC from their State Medical Council which is mandate for submitting during the Fellowship induction, without which the joining will not be agreeable\n8. Two Letters of Recommendation are required to be uploaded in the last page of the Application form\n9. The receipt of online payment i.e., screenshot should be enclosed to the application form at option enabled" }
        ]
      },
      {
        id: "subspecialty",
        title: "Subspecialty Selection",
        description: "Please select the option for which you are applying for (if you are looking at multiple applications you would need to fill another form)",
        enabled: true,
        fields: [
          { id: "specialization", type: "select", label: "Subspecialty", required: true, options: ["Cornea", "Glaucoma", "IOL", "Oculoplasty", "Pediatric Ophthalmology", "Phaco Refractive", "Medical Retina", "Vitreo Retina"], isStandard: true, mapping: "specialization" }
        ]
      },
      {
        id: "units",
        title: "Speciality : Units (Select the preferences)",
        description: "Choose the preferred center for each fellowship.",
        enabled: true,
        fields: [
          { id: "unit_cornea", type: "select", label: "Cornea Preferred Center", options: ["Bangalore", "Coimbatore", "Guntur", "Jaipur", "Shimoga", "Not Applicable"] },
          { id: "unit_glaucoma", type: "select", label: "Glaucoma Preferred Center", options: ["Bangalore", "Coimbatore", "Guntur", "Shimoga", "Not Applicable"] },
          { id: "unit_iol", type: "select", label: "IOL Preferred Center", options: ["Anand", "Bangalore", "Guntur", "Hyderabad", "Indore", "Jaipur", "Kanpur", "Krishnankoil", "Ludhiana", "Panvel", "Shimoga", "Varanasi", "Not Applicable"] },
          { id: "unit_medical_retina", type: "select", label: "Medical Retina Preferred Center", options: ["Bangalore", "Coimbatore", "Guntur", "Jaipur", "Shimoga", "Not Applicable"] },
          { id: "unit_oculoplasty", type: "select", label: "Oculoplasty Preferred Center", options: ["Bangalore", "Coimbatore", "Guntur", "Not Applicable"] },
          { id: "unit_pediatric", type: "select", label: "Pediatric Preferred Center", options: ["Bangalore", "Coimbatore", "Guntur", "Shimoga", "Not Applicable"] },
          { id: "unit_phaco", type: "select", label: "Phaco Refractive Preferred Center", options: ["Bangalore", "Not Applicable"] },
          { id: "unit_vitreo_retina", type: "select", label: "Vitreo Retina Preferred Center", options: ["Bangalore", "Coimbatore", "Guntur", "Shimoga", "Not Applicable"] },
          { id: "referralSource", type: "select", label: "Where did you hear about this Fellowship?", required: true, options: ["Sankara Website", "Word of Mouth", "Referred by any Faculty or exiting trainee at Sankara", "IJO Advertisement", "Social Media Platforms (Instagram/Facebook/Whatsapp/LinkedIn)"], isStandard: true, mapping: "referralSource" }
        ]
      },
      {
        id: "referral_info",
        title: "Referral Information",
        description: "Mention the name of referred Faculty/Existing Trainee from Sankara",
        enabled: true,
        fields: [
          { id: "referredByName", type: "text", label: "Referred By Name", required: true, isStandard: true, mapping: "referredByName" }
        ]
      },
      {
        id: "social_media",
        title: "Social Media",
        description: "Mention the Media Source",
        enabled: true,
        fields: [
          { id: "mediaSource", type: "text", label: "Media Source", required: true, isStandard: true, mapping: "mediaSource" }
        ]
      },
      {
        id: "personal_details",
        title: "Let us know you better",
        description: "This section would help us identify you for the evaluation & beyond. Please ensure accuracy of the information provided.",
        enabled: true,
        fields: [
          { id: "fullName", type: "text", label: "Name in Full (First Name, Middle Name, Last/Family Name)", required: true, isStandard: true, mapping: "fullName" },
          { id: "permanentAddress", type: "textarea", label: "Permanent Address (including postal pin code)", required: true, isStandard: true, mapping: "permanentAddress" },
          { id: "mailingAddress", type: "textarea", label: "Preferred Mailing Address (if different, else N/A)", required: true, isStandard: true, mapping: "mailingAddress" },
          { id: "phone", type: "text", label: "Mobile Number (only 10 digits)", required: true, isStandard: true, mapping: "phone" },
          { id: "email", type: "text", label: "E-mail (all communication will be shared on this ID)", required: true, isStandard: true, mapping: "email" },
          { id: "dateOfBirth", type: "date", label: "Date of Birth", required: true, isStandard: true, mapping: "dateOfBirth" },
          { id: "maritalStatus", type: "radio", label: "Marital Status", options: ["Married", "Unmarried"], required: true, isStandard: true, mapping: "maritalStatus" },
          { id: "spouseDetails", type: "text", label: "If Married Spouse Details(Name & Profession)", isStandard: true, mapping: "spouseDetails" }
        ]
      },
      {
        id: "previous_entrance",
        title: "SAV Fellowship entrance appeared earlier ?",
        description: "If you have responded yes, month & year",
        enabled: true,
        fields: [
          { id: "prev_appeared", type: "radio", label: "Appeared Earlier?", options: ["Yes", "No"] },
          { id: "previousApplicationMonthYear", type: "text", label: "Month & Year", isStandard: true, mapping: "previousApplicationMonthYear" }
        ]
      },
      {
        id: "medical_history",
        title: "Medical History",
        description: "Fellowship would warrant long working hours...",
        enabled: true,
        fields: [
          { id: "medicalConditions", type: "checkbox_group", label: "Kindly declare if you are suffering any of the following ailments and are on medications.", required: true, options: ["Asthma", "Hypertension", "Diabetes", "Skin Allergy", "Hearing Impairment", "Tuberculosis", "Post Covid", "None of the Above"], isStandard: true, mapping: "medicalConditions" }
        ]
      },
      {
        id: "educational_qual",
        title: "Educational Qualifications",
        description: "Degrees & Other Degrees/Honours/Fellowships (if any)",
        enabled: true,
        fields: [
          { id: "medicalCollege", type: "text", label: "Medical College Qualified From ( College, City , State, Country)", required: true, isStandard: true, mapping: "medicalCollege" },
          { id: "university", type: "text", label: "University from which MBBS Degree Awarded", required: true, isStandard: true, mapping: "university" },
          { id: "qualification_matrix", type: "qualification_matrix", label: "Postgraduate Qualifications", isStandard: true, mapping: "qualificationMatrix" },
          { id: "do_details", type: "text", label: "If DO then College & University Qualified from and year of Qualification", isStandard: true, mapping: "doDetails" },
          { id: "ms_md_details", type: "text", label: "If MS then College & University Qualified from and year of Qualification", isStandard: true, mapping: "msMdDetails" },
          { id: "dnb_details", type: "text", label: "If DNB then institution completed from and year of Qualification", isStandard: true, mapping: "dnbDetails" },
          { id: "otherTraining", type: "text", label: "Any Other Training / Certification undertaken", isStandard: true, mapping: "otherTraining" },
          { id: "medicalCouncilNumber", type: "text", label: "Medical Council Registration Number ( indicate complete number and state of registration)", required: true, isStandard: true, mapping: "medicalCouncilNumber" }
        ]
      },
      {
        id: "clinical_exp",
        title: "Clinical Experience",
        description: "This section is to document your experience.",
        enabled: true,
        fields: [
          { id: "diagnostic_skills", type: "skills_table", label: "Perform & Interpret Diagnostics (Classify as 1. Beginner 2. Intermittent 3.Expert)", options: ["Beginner", "Intermittent", "Expert"], rows: ["Slit Lamp", "Fundus Exam +90D", "Indirect Ophthalmoscopy", "Applanation Tonometry", "Gonioscopy", "Biometry (Keratometry, A Scan)", "Ultrasound B Scan", "Corneal Topgraphy", "Specular Microscopy", "Visual Fields (HFA)", "Fundus Flourescien Angiography (FFA)", "Ocular Coherence Tomography (OCT)", "Yag Capsulotomy /Iridotomy", "Argon LASER", "Hess Charting"], isStandard: true, mapping: "diagnosticSkills" },
          { id: "ecce_super", type: "number", label: "Approximate No of ECCE performed (Under Supervision)", required: true },
          { id: "ecce_indep", type: "number", label: "Approximate No of ECCE performed (Independently)", required: true },
          { id: "sics_super", type: "number", label: "Approximate No of SICS performed (Under Supervision)", required: true },
          { id: "sics_indep", type: "number", label: "Approximate No of SICS performed (Independently)", required: true },
          { id: "phaco_super", type: "number", label: "Approximate No of PHACO performed (Under Supervision)", required: true },
          { id: "phaco_indep", type: "number", label: "Approximate No of PHACO performed (Independently)", required: true },
          { id: "trab_super", type: "number", label: "Approximate No of TRABECULECTOMY performed (Under Supervision)", required: true },
          { id: "trab_indep", type: "number", label: "Approximate No of TRABECULECTOMY performed (Independently)", required: true },
          { id: "retina_super", type: "number", label: "Approximate No of RETINA LASERS performed (Under Supervision)", required: true },
          { id: "retina_indep", type: "number", label: "Approximate No of RETINA LASERS performed (Independently)", required: true },
          { id: "dcr_super", type: "number", label: "Approximate No of DCR performed (Under Supervision)", required: true },
          { id: "dcr_indep", type: "number", label: "Approximate No of DCR performed (Independently)", required: true },
          { id: "totalSurgeries", type: "text", label: "Total No of Surgeries performed till date", required: true, isStandard: true, mapping: "totalSurgeries" }
        ]
      },
      {
        id: "publications",
        title: "Publications & Presentation",
        description: "Information of academic presentations & publications",
        enabled: true,
        fields: [
          { id: "publications", type: "textarea", label: "Journal - List of all publications in the format of - Journal, Date, Title, Co - Authors", required: true, isStandard: true, mapping: "publications" },
          { id: "presentations", type: "textarea", label: "Presentations - List of presentations at Conferences in the format of - Journal, Date, Title, Co - Authors", required: true, isStandard: true, mapping: "presentations" }
        ]
      },
      {
        id: "lor",
        title: "LETTER OF RECOMMENDATION (LOR)",
        description: "We require you to provide 2 letters of recommendation from those who have supervised, trained you directly during your post-graduation...",
        enabled: true,
        fields: [
          { id: "lor1Url", type: "file", label: "LOR 1 PDF (Mandatory Issue Date & Signature)", required: true, isStandard: true, mapping: "lor1Url" },
          { id: "lor1RefName", type: "text", label: "Name & Designation of Reference 1", required: true, isStandard: true, mapping: "lor1RefName" },
          { id: "lor1RefContact", type: "text", label: "Contact number of Reference 1", required: true, isStandard: true, mapping: "lor1RefContact" },
          { id: "lor1RefEmail", type: "text", label: "Email ID of Reference 1", required: true, isStandard: true, mapping: "lor1RefEmail" },
          { id: "lor2Url", type: "file", label: "LOR 2 PDF (Mandatory Issue Date & Signature)", required: true, isStandard: true, mapping: "lor2Url" },
          { id: "lor2RefName", type: "text", label: "Name & Designation of Reference 2", required: true, isStandard: true, mapping: "lor2RefName" },
          { id: "lor2RefContact", type: "text", label: "Contact number of Reference 2", required: true, isStandard: true, mapping: "lor2RefContact" },
          { id: "lor2RefEmail", type: "text", label: "Email id of Reference 2", required: true, isStandard: true, mapping: "lor2RefEmail" }
        ]
      },
      {
        id: "final",
        title: "Is there anything more we should know?",
        description: "Declaration & Payment",
        enabled: true,
        fields: [
          { id: "otherInformation", type: "textarea", label: "If there is any other information you deem pertinent for us to consider", isStandard: true, mapping: "otherInformation" },
          { id: "declarationAccepted", type: "checkbox", label: "I declare that the information in the application is true... I acknowledge that, I will submit the NOC...", required: true, isStandard: true, mapping: "declarationAccepted" },
          { id: "paymentUrl", type: "file", label: "Upload the screenshot with Transaction ID/UTR details of the payment of Rs.2750/-", required: true, isStandard: true, mapping: "paymentUrl" },
          { id: "photoUrl", type: "file", label: "Please upload your latest passport size photograph", required: true, isStandard: true, mapping: "photoUrl" }
        ]
      }
    ];

    // 4. Create Application Form
    const [form] = await db.insert(applicationFormsTable).values({
      programId: program.id,
      title: "Fellowship Application Form in Ophthalmology-July 2026",
      token: Math.random().toString(36).substring(2, 10).toUpperCase(),
      description: "Sankara Academy of Vision Fellowship Application for July 2026 intake.",
      isActive: true,
      createdBy: userId,
      sectionsConfig: DEFAULT_SECTIONS,
    }).returning();

    console.log("Created Form ID:", form.id);
    console.log("Form Token:", form.token);
    console.log("Apply URL: /apply/" + form.token);

    process.exit(0);
  } catch (err) {
    console.error("Setup failed:", err);
    process.exit(1);
  }
}

setup();
