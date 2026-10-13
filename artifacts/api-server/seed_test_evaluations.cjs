const pg = require('pg');
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:admin@localhost:5432/fellowship_db"
});

async function main() {
  const client = await pool.connect();
  console.log("Connected to Fellowship DB local server successfully!");

  try {
    await client.query("BEGIN");

    // Enable mock_mode automatically so test candidates are displayed
    await client.query("UPDATE global_settings SET value = 'true' WHERE key = 'mock_mode'");
    console.log("Mock Mode auto-toggled to 'true' in global_settings.");

    // 1. Get Specialities from Database
    console.log("Fetching specializations...");
    const specsRes = await client.query("SELECT id, name, code FROM specialities");
    const specialities = specsRes.rows;
    console.log(`Found ${specialities.length} specialities:`, specialities.map(s => s.name));

    // Resolve specific speciality IDs or use fallback
    const glaucomaSpec = specialities.find(s => s.name.toLowerCase().includes('glaucoma')) || specialities[0];
    const retinaSpec = specialities.find(s => s.name.toLowerCase().includes('retina')) || specialities[1];
    const corneaSpec = specialities.find(s => s.name.toLowerCase().includes('cornea')) || specialities[2];

    if (!glaucomaSpec || !retinaSpec) {
      throw new Error("Could not find Glaucoma or Retina specialities in database. Please run migrations/setup first.");
    }

    // Clean up cascading entries first to prevent foreign key errors
    console.log("Cleaning up database tables cascadingly...");
    await client.query("DELETE FROM doctor_panel_status");
    await client.query("DELETE FROM interview_scores");
    await client.query("DELETE FROM panel_queue");
    await client.query("DELETE FROM doctor_assignments");
    await client.query("DELETE FROM interview_panel_members");
    await client.query("DELETE FROM interview_panels");
    await client.query("DELETE FROM users WHERE role = 'doctor' OR email LIKE '%@fellowship.org'");
    await client.query("DELETE FROM candidate_preferences");
    await client.query("DELETE FROM applications");
    await client.query("DELETE FROM batch_candidates");
    await client.query("DELETE FROM candidates WHERE email LIKE '%@mocktest.com'");
    await client.query("DELETE FROM application_submissions WHERE email LIKE '%@mocktest.com'");

    console.log("Inserting fresh South Indian mock doctor users...");
    const doctors = [];
    const mockDocs = [
      { name: "Dr. Prabhanjan K", email: "prabhanjan.k@fellowship.org" },
      { name: "Dr. Sankara Narayanan", email: "sankara.n@fellowship.org" },
      { name: "Dr. Vasudha Hariprasad", email: "vasudha.h@fellowship.org" },
      { name: "Dr. Anjali Menon", email: "anjali.m@fellowship.org" },
      { name: "Dr. Raghavendra Rao", email: "raghavendra.r@fellowship.org" },
      { name: "Dr. Srinivas Reddy", email: "srinivas.r@fellowship.org" }
    ];

    for (const md of mockDocs) {
      const insDoc = await client.query(
        "INSERT INTO users (full_name, email, password_hash, role, active, created_at, updated_at) VALUES ($1, $2, '$2b$10$xyz', 'doctor', true, NOW(), NOW()) RETURNING id, full_name, email",
        [md.name, md.email]
      );
      doctors.push(insDoc.rows[0]);
    }
    console.log(`Successfully created ${doctors.length} South Indian doctor evaluators.`);

    // 3. Insert or Re-create Mock Candidates
    console.log("Inserting mock candidates and submissions...");

    const mockCandidates = [
      {
        name: "Dr. Chinmayi Gowda",
        email: "chinmayi.gowda@mocktest.com",
        code: "SAV-GL-101",
        phone: "9876543210",
        college: "Minto Ophthalmic Hospital, Bengaluru (Karnataka)",
        qualification: "MS Ophthalmology",
        pgQual: "MS Ophthalmology, FICO",
        specId: glaucomaSpec.id,
        specName: glaucomaSpec.name,
        mcq: 44.5,
        psych: 8.5,
        prefCenters: {
          [glaucomaSpec.name]: ["Bengaluru", "Coimbatore"]
        }
      },
      {
        name: "Dr. Karthik Ramasamy",
        email: "karthik.r@mocktest.com",
        code: "SAV-RT-102",
        phone: "9876543211",
        college: "Madras Medical College, Chennai (Tamil Nadu)",
        qualification: "DNB Ophthalmology",
        pgQual: "DNB Ophthalmology, MNAMS",
        specId: retinaSpec.id,
        specName: retinaSpec.name,
        mcq: 41.0,
        psych: 9.0,
        prefCenters: {
          [retinaSpec.name]: ["Chennai", "Coimbatore"]
        }
      },
      {
        name: "Dr. Divya Nair",
        email: "divya.nair@mocktest.com",
        code: "SAV-CO-103",
        phone: "9876543212",
        college: "Amrita School of Medicine, Kochi (Kerala)",
        qualification: "MS Ophthalmology",
        pgQual: "MS Ophthalmology",
        specId: corneaSpec ? corneaSpec.id : glaucomaSpec.id,
        specName: corneaSpec ? corneaSpec.name : glaucomaSpec.name,
        mcq: 46.5,
        psych: 7.5,
        prefCenters: {
          [(corneaSpec ? corneaSpec.name : glaucomaSpec.name)]: ["Kochi", "Bengaluru"]
        }
      },
      {
        name: "Dr. Venkat Rao Chowdary",
        email: "venkat.rao@mocktest.com",
        code: "SAV-GL-104",
        phone: "9876543213",
        college: "Andhra Medical College, Visakhapatnam (Andhra Pradesh)",
        qualification: "DNB Ophthalmology",
        pgQual: "DNB Ophthalmology",
        specId: glaucomaSpec.id,
        specName: glaucomaSpec.name,
        mcq: 38.0,
        psych: 8.0,
        prefCenters: {
          [glaucomaSpec.name]: ["Vijayawada", "Chennai"]
        }
      },
      {
        name: "Dr. Sravani Yerramilli",
        email: "sravani.y@mocktest.com",
        code: "SAV-RT-105",
        phone: "9876543214",
        college: "Sarojini Devi Eye Hospital, Hyderabad (Telangana)",
        qualification: "MS Ophthalmology",
        pgQual: "MS Ophthalmology, FRCS Part 1",
        specId: retinaSpec.id,
        specName: retinaSpec.name,
        mcq: 43.5,
        psych: 9.5,
        prefCenters: {
          [retinaSpec.name]: ["Hyderabad", "Bengaluru"]
        }
      },
      // --- Unassigned Candidates for Manual Testing ---
      {
        name: "Dr. Shrikrishna Hegde",
        email: "shrikrishna.h@mocktest.com",
        code: "SAV-GL-106",
        phone: "9876543215",
        college: "Kasturba Medical College, Manipal (Karnataka)",
        qualification: "MS Ophthalmology",
        pgQual: "MS Ophthalmology",
        specId: glaucomaSpec.id,
        specName: glaucomaSpec.name,
        mcq: 45.0,
        psych: 8.0,
        prefCenters: {
          [glaucomaSpec.name]: ["Bengaluru"]
        },
        isUnassigned: true
      },
      {
        name: "Dr. Gokul Rajendran",
        email: "gokul.r@mocktest.com",
        code: "SAV-RT-107",
        phone: "9876543216",
        college: "Government Medical College, Thiruvananthapuram (Kerala)",
        qualification: "DNB Ophthalmology",
        pgQual: "DNB Ophthalmology",
        specId: retinaSpec.id,
        specName: retinaSpec.name,
        mcq: 42.5,
        psych: 7.0,
        prefCenters: {
          [retinaSpec.name]: ["Kochi"]
        },
        isUnassigned: true
      },
      {
        name: "Dr. Anusha Yellapragada",
        email: "anusha.y@mocktest.com",
        code: "SAV-GL-108",
        phone: "9876543217",
        college: "Guntur Medical College, Guntur (Andhra Pradesh)",
        qualification: "MS Ophthalmology",
        pgQual: "MS Ophthalmology",
        specId: glaucomaSpec.id,
        specName: glaucomaSpec.name,
        mcq: 41.5,
        psych: 8.5,
        prefCenters: {
          [glaucomaSpec.name]: ["Vijayawada"]
        },
        isUnassigned: true
      },
      {
        name: "Dr. Meera Krishnan",
        email: "meera.krishnan@mocktest.com",
        code: "SAV-RT-109",
        phone: "9876543218",
        college: "Aravind Eye Hospital, Madurai (Tamil Nadu)",
        qualification: "MS Ophthalmology",
        pgQual: "MS Ophthalmology",
        specId: retinaSpec.id,
        specName: retinaSpec.name,
        mcq: 44.0,
        psych: 9.0,
        prefCenters: {
          [retinaSpec.name]: ["Coimbatore"]
        },
        isUnassigned: true
      }
    ];

    // Fetch the active application form ID
    const formQueryRes = await client.query("SELECT id FROM application_forms LIMIT 1");
    const activeFormId = formQueryRes.rows[0]?.id || 1;

    console.log("Inserting mock candidates, submissions, preferences, and applications...");
    const candidatesDb = [];
    for (const mc of mockCandidates) {
      // a. Insert submission
      const subIns = await client.query(`
        INSERT INTO application_submissions 
          (form_id, full_name, email, phone, specialization, center_preference, status, form_data, submitted_at, is_mock, medical_college, pg_qualifications)
        VALUES 
          ($1, $2, $3, $4, $5, $6, 'approved', '{}', NOW(), true, $7, $8)
        RETURNING id
      `, [
        activeFormId,
        mc.name, 
        mc.email, 
        mc.phone, 
        JSON.stringify([mc.specName]), 
        JSON.stringify(mc.prefCenters), 
        mc.college, 
        mc.pgQual
      ]);
      const subId = subIns.rows[0].id;

      // b. Insert candidate
      const candIns = await client.query(`
        INSERT INTO candidates 
          (full_name, candidate_code, email, phone, status, mcq_score, psychometric_score, is_mock, qualification, college_name, created_at, updated_at)
        VALUES 
          ($1, $2, $3, $4, 'approved', $5, $6, true, $7, $8, NOW(), NOW())
        RETURNING id, full_name, candidate_code, email
      `, [
        mc.name, 
        mc.code, 
        mc.email, 
        mc.phone, 
        mc.mcq, 
        mc.psych, 
        mc.qualification, 
        mc.college
      ]);
      const cand = candIns.rows[0];
      cand.submissionId = subId;
      cand.specId = mc.specId;
      cand.specName = mc.specName;
      cand.mcq = mc.mcq;
      cand.psych = mc.psych;
      cand.isUnassigned = !!mc.isUnassigned;

      // c. Insert candidate preferences
      await client.query(`
        INSERT INTO candidate_preferences (candidate_id, speciality_id, preference_order)
        VALUES ($1, $2, 1)
        ON CONFLICT DO NOTHING
      `, [cand.id, mc.specId]);

      // d. Insert applications
      await client.query(`
        INSERT INTO applications (candidate_id, speciality_id, status)
        VALUES ($1, $2, 'applied')
        ON CONFLICT DO NOTHING
      `, [cand.id, mc.specId]);

      candidatesDb.push(cand);
    }
    console.log(`Successfully created ${candidatesDb.length} South Indian candidates!`);

    // 4. Create Mock Panels
    console.log("Setting up mock panels...");
    
    // Clean up previous mock panels
    await client.query("DELETE FROM interview_panels WHERE is_mock = true OR name LIKE 'Test%'");
    
    const panel1Ins = await client.query(`
      INSERT INTO interview_panels (name, room_number, is_active, speciality_id, is_mind_matter, is_mock, created_at)
      VALUES ('Test Glaucoma Panel', 'Room A-102', true, $1, false, true, NOW())
      RETURNING id
    `, [glaucomaSpec.id]);
    const glaucomaPanelId = panel1Ins.rows[0].id;

    const panel2Ins = await client.query(`
      INSERT INTO interview_panels (name, room_number, is_active, speciality_id, is_mind_matter, is_mock, created_at)
      VALUES ('Test Retina Panel', 'Room B-105', true, $1, false, true, NOW())
      RETURNING id
    `, [retinaSpec.id]);
    const retinaPanelId = panel2Ins.rows[0].id;

    const panel3Ins = await client.query(`
      INSERT INTO interview_panels (name, room_number, is_active, speciality_id, is_mind_matter, is_mock, created_at)
      VALUES ('Test Mind Matter Station', 'Counseling Room 2', true, null, true, true, NOW())
      RETURNING id
    `, []);
    const mindMatterPanelId = panel3Ins.rows[0].id;

    console.log("Mock panels created successfully! Mapped IDs:", { glaucomaPanelId, retinaPanelId, mindMatterPanelId });

    // 5. Assign Doctor Members to Panels
    console.log("Assigning doctors to panels...");
    // Assign Dr. Prabhanjan K & Dr. Vasudha Hariprasad to Glaucoma panel
    if (doctors[0]) {
      await client.query("INSERT INTO interview_panel_members (panel_id, doctor_id, is_main) VALUES ($1, $2, true)", [glaucomaPanelId, doctors[0].id]);
      console.log(`Assigned doctor ${doctors[0].full_name} to Glaucoma Panel.`);
    }
    if (doctors[2]) {
      await client.query("INSERT INTO interview_panel_members (panel_id, doctor_id, is_main) VALUES ($1, $2, false)", [glaucomaPanelId, doctors[2].id]);
      console.log(`Assigned doctor ${doctors[2].full_name} to Glaucoma Panel.`);
    }
    
    // Assign Dr. Sankara Narayanan & Dr. Anjali Menon to Retina Panel
    if (doctors[1]) {
      await client.query("INSERT INTO interview_panel_members (panel_id, doctor_id, is_main) VALUES ($1, $2, true)", [retinaPanelId, doctors[1].id]);
      console.log(`Assigned doctor ${doctors[1].full_name} to Retina Panel.`);
    }
    if (doctors[3]) {
      await client.query("INSERT INTO interview_panel_members (panel_id, doctor_id, is_main) VALUES ($1, $2, false)", [retinaPanelId, doctors[3].id]);
      console.log(`Assigned doctor ${doctors[3].full_name} to Retina Panel.`);
    }

    // Assign Dr. Raghavendra Rao & Dr. Srinivas Reddy to Mind Matter Station
    if (doctors[4]) {
      await client.query("INSERT INTO interview_panel_members (panel_id, doctor_id, is_main) VALUES ($1, $2, true)", [mindMatterPanelId, doctors[4].id]);
      console.log(`Assigned doctor ${doctors[4].full_name} to Mind Matter Station.`);
    }
    if (doctors[5]) {
      await client.query("INSERT INTO interview_panel_members (panel_id, doctor_id, is_main) VALUES ($1, $2, false)", [mindMatterPanelId, doctors[5].id]);
      console.log(`Assigned doctor ${doctors[5].full_name} to Mind Matter Station.`);
    }

    // 6. Insert Panel Queues & Mock Evaluations
    console.log("Queueing candidates and inserting mock grades...");
    
    const glaucomaCands = candidatesDb.filter(c => c.specId === glaucomaSpec.id && !c.isUnassigned);
    const retinaCands = candidatesDb.filter(c => c.specId === retinaSpec.id && !c.isUnassigned);

    // a. Glaucoma panel queue
    let queuePos = 1;
    for (const c of glaucomaCands) {
      const status = queuePos === 1 ? 'in_progress' : 'waiting';
      await client.query(`
        INSERT INTO panel_queue (panel_id, candidate_id, queue_position, status, called_at, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [glaucomaPanelId, c.id, queuePos, status, status === 'in_progress' ? new Date() : null]);
      
      if (doctors[0]) {
        await client.query("INSERT INTO doctor_assignments (doctor_id, candidate_id, status, speciality_id, scheduled_at) VALUES ($1, $2, $3, $4, NOW())", 
          [doctors[0].id, c.id, 'pending', glaucomaSpec.id]
        );
      }
      if (doctors[2]) {
        await client.query("INSERT INTO doctor_assignments (doctor_id, candidate_id, status, speciality_id, scheduled_at) VALUES ($1, $2, $3, $4, NOW())", 
          [doctors[2].id, c.id, 'pending', glaucomaSpec.id]
        );
      }

      // Pre-grade the second candidate
      if (queuePos > 1) {
        if (doctors[0]) {
          await client.query("INSERT INTO interview_scores (candidate_id, doctor_id, speciality_id, score, remarks, submitted_at) VALUES ($1, $2, $3, 44, 'Very good clinical visual field analysis knowledge.', NOW())",
            [c.id, doctors[0].id, glaucomaSpec.id]
          );
        }
        if (doctors[2]) {
          await client.query("INSERT INTO interview_scores (candidate_id, doctor_id, speciality_id, score, remarks, submitted_at) VALUES ($1, $2, $3, 48, 'Exceptional diagnostic skills.', NOW())",
            [c.id, doctors[2].id, glaucomaSpec.id]
          );
        }
        await client.query("UPDATE panel_queue SET status = 'done' WHERE panel_id = $1 AND candidate_id = $2", [glaucomaPanelId, c.id]);
      }
      queuePos++;
    }

    // b. Retina panel queue
    queuePos = 1;
    for (const c of retinaCands) {
      const status = queuePos === 1 ? 'in_progress' : 'waiting';
      await client.query(`
        INSERT INTO panel_queue (panel_id, candidate_id, queue_position, status, called_at, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [retinaPanelId, c.id, queuePos, status, status === 'in_progress' ? new Date() : null]);

      if (doctors[1]) {
        await client.query("INSERT INTO doctor_assignments (doctor_id, candidate_id, status, speciality_id, scheduled_at) VALUES ($1, $2, $3, $4, NOW())", 
          [doctors[1].id, c.id, 'pending', retinaSpec.id]
        );
      }
      if (doctors[3]) {
        await client.query("INSERT INTO doctor_assignments (doctor_id, candidate_id, status, speciality_id, scheduled_at) VALUES ($1, $2, $3, $4, NOW())", 
          [doctors[3].id, c.id, 'pending', retinaSpec.id]
        );
      }

      // Pre-grade the second candidate
      if (queuePos > 1) {
        if (doctors[1]) {
          await client.query("INSERT INTO interview_scores (candidate_id, doctor_id, speciality_id, score, remarks, submitted_at) VALUES ($1, $2, $3, 42, 'Good retina imaging skills.', NOW())",
            [c.id, doctors[1].id, retinaSpec.id]
          );
        }
        if (doctors[3]) {
          await client.query("INSERT INTO interview_scores (candidate_id, doctor_id, speciality_id, score, remarks, submitted_at) VALUES ($1, $2, $3, 45, 'Competent fundus analysis.', NOW())",
            [c.id, doctors[3].id, retinaSpec.id]
          );
        }
        await client.query("UPDATE panel_queue SET status = 'done' WHERE panel_id = $1 AND candidate_id = $2", [retinaPanelId, c.id]);
      }
      queuePos++;
    }

    // c. Mind Matter panel queue (receives ALL glaucoma and retina candidates, excluding unassigned ones)
    queuePos = 1;
    const docForMM = doctors[4] || doctors[0];
    const assistantForMM = doctors[5] || doctors[1];
    for (const c of candidatesDb.filter(x => !x.isUnassigned)) {
      const status = queuePos === 1 ? 'in_progress' : 'waiting';
      await client.query(`
        INSERT INTO panel_queue (panel_id, candidate_id, queue_position, status, called_at, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `, [mindMatterPanelId, c.id, queuePos, status, status === 'in_progress' ? new Date() : null]);

      if (docForMM) {
        await client.query("INSERT INTO doctor_assignments (doctor_id, candidate_id, status, speciality_id, scheduled_at) VALUES ($1, $2, $3, null, NOW())", 
          [docForMM.id, c.id, 'pending']
        );
      }
      if (assistantForMM) {
        await client.query("INSERT INTO doctor_assignments (doctor_id, candidate_id, status, speciality_id, scheduled_at) VALUES ($1, $2, $3, null, NOW())", 
          [assistantForMM.id, c.id, 'pending']
        );
      }

      // Pre-grade even positions
      if (queuePos % 2 === 0) {
        if (docForMM) {
          await client.query("INSERT INTO interview_scores (candidate_id, doctor_id, speciality_id, score, remarks, submitted_at) VALUES ($1, $2, null, 9.0, 'Strong empathetic attributes.', NOW())",
            [c.id, docForMM.id]
          );
        }
        if (assistantForMM) {
          await client.query("INSERT INTO interview_scores (candidate_id, doctor_id, speciality_id, score, remarks, submitted_at) VALUES ($1, $2, null, 8.5, 'Calm composure.', NOW())",
            [c.id, assistantForMM.id]
          );
        }
        await client.query("UPDATE panel_queue SET status = 'done' WHERE panel_id = $1 AND candidate_id = $2", [mindMatterPanelId, c.id]);
      }
      queuePos++;
    }

    console.log("Populated waitlists and scores successfully!");

    // 7. Insert values into batch_candidates for strict checks
    console.log("Linking candidates to batch parameters...");
    const activeBatchRes = await client.query("SELECT id FROM batches LIMIT 1");
    const activeBatchId = activeBatchRes.rows[0]?.id;
    if (activeBatchId) {
      for (const c of candidatesDb) {
        await client.query(`
          INSERT INTO batch_candidates (batch_id, candidate_id, speciality_id, mcq_score, psychometric_score, is_allocated)
          VALUES ($1, $2, $3, $4, $5, false)
          ON CONFLICT DO NOTHING
        `, [activeBatchId, c.id, c.specId, c.mcq, c.psych]);
      }
      console.log(`Successfully mapped all candidates to Batch ID: ${activeBatchId}`);
    }

    // Set first doctor of each panel as engaged to show a good initial state
    if (doctors[0]) {
      await client.query("INSERT INTO doctor_panel_status (doctor_id, is_engaged, current_candidate_id, updated_at) VALUES ($1, true, $2, NOW()) ON CONFLICT (doctor_id) DO UPDATE SET is_engaged = true, current_candidate_id = EXCLUDED.current_candidate_id", [doctors[0].id, glaucomaCands[0].id]);
    }
    if (doctors[1]) {
      await client.query("INSERT INTO doctor_panel_status (doctor_id, is_engaged, current_candidate_id, updated_at) VALUES ($1, true, $2, NOW()) ON CONFLICT (doctor_id) DO UPDATE SET is_engaged = true, current_candidate_id = EXCLUDED.current_candidate_id", [doctors[1].id, retinaCands[0].id]);
    }

    await client.query("COMMIT");
    console.log("\n🚀 SOUTH INDIAN DUMMY DATA SEEDING COMPLETED SUCCESSFULLY!");
    console.log("MAPPED REGIONS: Karnataka, Andhra Pradesh, Tamil Nadu, Kerala, and Telangana.");

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Fatal error during seeding: ", error);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
