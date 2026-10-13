const fs = require('fs');

const path = 'src/routes/application-forms.ts';
let code = fs.readFileSync(path, 'utf8');

const startMarker = "let imported = 0;";
const endMarker = "res.json({ success: true, imported, deleted: deletedCount, total: dataRows.length });";

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error("Markers not found:", startIndex, endIndex);
  process.exit(1);
}

// Find the beginning of the line for start index to keep indentation
let actualStartIndex = code.lastIndexOf('\n', startIndex);
if (actualStartIndex === -1) actualStartIndex = startIndex;

const replacement = `      let imported = 0;
      let merged = 0;

      // Group rows by normalized email
      const rowsByEmail = new Map();
      
      for (const row of dataRows) {
        const rowData = {};
        headers.forEach((header, index) => {
          rowData[header] = row[index] || "";
        });

        const timestamp = rowData["Timestamp"];
        const email = rowData["E-mail (this would be the ID all communication would be shared on)"] || rowData["E-mail"] || rowData["Email"] || "";
        const rowId = \`\${timestamp}_\${email}\`.toLowerCase().replace(/\\s+/g, "");
        spreadsheetRowIds.add(rowId);

        const key = email.toLowerCase().trim();
        if (!key) continue;
        
        if (!rowsByEmail.has(key)) {
           rowsByEmail.set(key, []);
        }
        rowsByEmail.get(key).push({ rowData, rowId, email });
      }

      const existingByEmailResult = await db.execute(sql\`
        SELECT id, email, google_sheets_row_id FROM application_submissions
        WHERE form_id = \${id} AND google_sheets_row_id IS NOT NULL
      \`);
      const existingByEmail = new Map();
      for (const r of existingByEmailResult.rows) {
         if (r.email) {
            existingByEmail.set(r.email.toLowerCase().trim(), r);
         }
      }

      for (const [emailKey, group] of rowsByEmail.entries()) {
        const mergedSubData = {};
        let combinedRowIds = [];
        let combinedSpecializations = [];

        for (const item of group) {
           const { rowData, rowId, email } = item;
           combinedRowIds.push(rowId);

           const specialization = rowData["Select 1 option from the dropbox"];
           if (specialization && !combinedSpecializations.includes(specialization)) {
              combinedSpecializations.push(specialization);
           }

           // Find center preference
           const centerPrefHeaders = [
             "Cornea", "Glaucoma", "IOL", "Medical Retina", "Oculoplasty", "Pediatric", "Phaco Refractive", "Vitreo Retina"
           ];
           let centerPreference = "";
           for (const h of headers) {
             if (centerPrefHeaders.some(cp => h.startsWith(cp)) && h.toLowerCase().includes("choose the preferred center")) {
               if (rowData[h] && rowData[h] !== "Not Applicable") {
                 centerPreference = rowData[h];
                 break;
               }
             }
           }

           const diagnosticSkills = {};
           headers.forEach((h) => {
             if (h.startsWith("Perform & Interpret Diagnostics")) {
               const match = h.match(/\\[(.*?)\\]/);
               if (match && match[1]) {
                 diagnosticSkills[match[1]] = rowData[h];
               }
             }
           });

           const surgicalExperience = {};
           const surgicalCategories = ["ECCE", "SICS", "PHACO", "TRABECULECTOMY", "RETINA LASERS", "DCR"];
           surgicalCategories.forEach(cat => {
             const supKey = headers.find(h => h.includes(\`Approximate No of \${cat}\`) && h.includes("(Under Supervision)"));
             const indKey = headers.find(h => h.includes(\`Approximate No of \${cat}\`) && h.includes("(Independently)"));
             surgicalExperience[cat] = {
               supervision: supKey ? rowData[supKey] : "0",
               independent: indKey ? rowData[indKey] : "0"
             };
           });

           const subData = {
             formId: id,
             status: "pending",
             source: "google_sheets",
             fullName: rowData["Name in Full (First Name, Middle Name, Last/Family Name)"] || rowData["Name in Full"] || "",
             email: email || "",
             phone: rowData["Mobile Number (only 10 digits)"] || rowData["Mobile Number"] || "",
             centerPreference,
             referralSource: rowData["Where did you hear about this Fellowship?"],
             referredByName: rowData["Mention the name of referred Faculty/Existing Trainee from Sankara"],
             mediaSource: rowData["Mention the Media Source"],
             permanentAddress: rowData["Permanent Address (including postal pin code)"],
             mailingAddress: rowData["Preferred Mailing Address (if different from the Permanent Address then fill if same as permanent put N/A)"],
             dateOfBirth: rowData["Date of Birth"] || rowData["Date of Birth "],
             maritalStatus: rowData["Marital Status"] || rowData["Marital Status "],
             spouseDetails: rowData["If Married Spouse Details(Name & Profession)"] || rowData["If Married Spouse Details(Name & Profession) "],
             previousApplicationMonthYear: rowData["If you have responded yes, month & year"],
             medicalConditions: rowData["Kindly declare if you are suffering any of the following ailments and are on medications."] || rowData["Kindly declare if you are suffering any of the following ailments and are on medications. "],
             degree: rowData["Degree"],
             medicalCollege: rowData["Medical College Qualified From ( College, City , State, Country)"],
             university: rowData["University from which MBBS Degree Awarded"],
             pgQualifications: rowData["Postgraduate Qualifications"] || rowData["Postgraduate Qualifications "],
             doQualification: rowData["Qualification [DO (Diploma Ophthlmology)]"] === "Yes",
             doDetails: rowData["If DO then College & University Qualified from and year of Qualification"] || rowData["If DO then College & University Qualified from and year of Qualification "],
             msMdQualification: rowData["Qualification [MS/MD ( Masters in Ophthalmology)]"] === "Yes",
             msMdDetails: rowData["If MS then College & University Qualified from and year of Qualification"],
             dnbQualification: rowData["Qualification [DNB]"] === "Yes",
             dnbDetails: rowData["If DNB then institution completed from and year of Qualification"],
             otherTraining: rowData["Any Other Training / Certification undertaken"] || rowData["Any Other Training / Certification undertaken "],
             medicalCouncilNumber: rowData["Medical Council Registration Number ( indicate complete number and state of registration)"],
             diagnosticSkills: JSON.stringify(diagnosticSkills),
             surgicalExperience: JSON.stringify(surgicalExperience),
             totalSurgeries: rowData["7. Total No of Surgeries performed till date"] || rowData["7. Total No of Surgeries performed till date "],
             publications: rowData["Journal - List of all publications in the format of - Journal, Date, Title, Co - Authors"],
             presentations: rowData["Presentations  - List of presentations at Conferences in the format of - Journal, Date, Title, Co - Authors"],
             lor1Url: rowData["LOR 1,  Issue Date and Signature are mandatory on the Letter"] || rowData["LOR 1,  Issue Date and Signature are mandatory on the Letter "],
             lor1RefName: rowData["Name & Designation of Reference:"],
             lor1RefContact: rowData["Contact number of Reference:"],
             lor1RefEmail: rowData["Email ID of Reference"],
             lor2Url: rowData["LOR 2,  Issue Date and Signature are mandatory on the Letter"],
             lor2RefName: rowData["Name & Designation of Reference"],
             lor2RefContact: rowData["Contact number of Reference:"],
             lor2RefEmail: rowData["Email id of Reference:"],
             otherInformation: rowData["If there is any other information you deem pertinent for us to consider as part of your application please share that here."],
             declarationAccepted: rowData["Declaration"] === "Yes" || rowData["Declaration"] === "I Accept",
             paymentUrl: rowData["Upload the screenshot with Transaction ID/UTR details of the payment of Rs.2750/-  (Fee including Tax)"] || rowData["Upload the screenshot with Transaction ID/UTR details of the payment of Rs.2750/-  (Fee including Tax) "],
             photoUrl: rowData["Please upload your latest passport size photograph"] || rowData["Please upload your latest passport size photograph "],
             customAnswers: {},
           };

           // Merge fields
           for (const [k, v] of Object.entries(subData)) {
              if (v !== undefined && v !== null && v !== "" && v !== "{}" && 
                  v !== '{"ECCE":{"supervision":"0","independent":"0"},"SICS":{"supervision":"0","independent":"0"},"PHACO":{"supervision":"0","independent":"0"},"TRABECULECTOMY":{"supervision":"0","independent":"0"},"RETINA LASERS":{"supervision":"0","independent":"0"},"DCR":{"supervision":"0","independent":"0"}}') {
                 if (!mergedSubData[k] || mergedSubData[k] === "{}" || 
                     (typeof mergedSubData[k] === 'string' && mergedSubData[k].startsWith('{"ECCE"'))) {
                    mergedSubData[k] = v;
                 }
              }
           }
        }

        mergedSubData.specialization = combinedSpecializations;
        mergedSubData.googleSheetsRowId = combinedRowIds.join(",");
        
        // Inline completeness check (to avoid checkCompleteness dependency issues)
        const isComplete = Boolean(
          mergedSubData.fullName && mergedSubData.email && mergedSubData.phone && 
          mergedSubData.specialization && mergedSubData.specialization.length > 0
        );
        mergedSubData.readyForReview = isComplete;

        const existing = existingByEmail.get(emailKey);
        if (existing) {
           if (existing.google_sheets_row_id !== mergedSubData.googleSheetsRowId) {
              await db.update(applicationSubmissionsTable)
                .set(mergedSubData)
                .where(eq(applicationSubmissionsTable.id, existing.id));
              merged++;
           }
        } else {
           await db.insert(applicationSubmissionsTable).values(mergedSubData);
           imported++;
        }
      }

      let deletedCount = 0;
      const idsToDelete = [];
      const emailsToDelete = [];

      for (const rowId of existingIds) {
        const subIds = rowId.split(',');
        const anyExist = subIds.some(id => spreadsheetRowIds.has(id));
        if (!anyExist) {
          const [sub] = await db.select().from(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.googleSheetsRowId, rowId));
          if (sub) {
            idsToDelete.push(rowId);
            emailsToDelete.push(sub.email);
          }
        }
      }

      if (idsToDelete.length > 0) {
        for (const email of emailsToDelete) {
          await db.delete(candidatesTable).where(eq(candidatesTable.email, email));
        }
        await db.delete(applicationSubmissionsTable)
          .where(and(
            eq(applicationSubmissionsTable.formId, id),
            inArray(applicationSubmissionsTable.googleSheetsRowId, idsToDelete)
          ));
        deletedCount = idsToDelete.length;
      }

      `;

const newCode = code.substring(0, actualStartIndex + 1) + replacement + code.substring(endIndex);
fs.writeFileSync(path, newCode, 'utf8');
console.log("Patched successfully");
