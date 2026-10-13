import {
  db,
  candidatesTable,
  applicationSubmissionsTable,
  applicationsTable,
  unitsTable,
  eq
} from "@workspace/db";

async function main() {
  console.log("Seeding diverse candidate records for Call Letters and Offer Letters...");

  const candidatesData = [
    {
      code: "SAV-VR-201",
      name: "Dr. Aravind Swaminathan",
      email: "aravind.swaminathan@example.com",
      phone: "9840123456",
      dob: "1994-05-14",
      gender: "Male",
      qualification: "MS (Ophthalmology)",
      college: "Madras Medical College, Chennai",
      address: "No 45, 2nd Main Road, Anna Nagar, Chennai - 600040",
      specialty: "Vitreo Retina",
      unitId: 1, // Bangalore
      status: "approved",
      mcq: "88",
      psychometric: "92",
    },
    {
      code: "SAV-MR-202",
      name: "Dr. Sneha Bhattacharya",
      email: "sneha.bhatt@example.com",
      phone: "9830987654",
      dob: "1995-11-20",
      gender: "Female",
      qualification: "DNB (Ophthalmology)",
      college: "Regional Institute of Ophthalmology, Kolkata",
      address: "Flat 4B, Silver Oak Residency, Salt Lake Sector 2, Kolkata - 700091",
      specialty: "Medical Retina",
      unitId: 2, // Coimbatore
      status: "approved",
      mcq: "84",
      psychometric: "89",
    },
    {
      code: "SAV-CR-203",
      name: "Dr. Rohan Deshmukh",
      email: "rohan.deshmukh@example.com",
      phone: "9822114477",
      dob: "1993-08-09",
      gender: "Male",
      qualification: "MS (Ophthalmology)",
      college: "Grant Medical College & Sir JJ Group of Hospitals, Mumbai",
      address: "702, Skyline Towers, Shivaji Park, Dadar West, Mumbai - 400028",
      specialty: "Cornea & External Eye Diseases",
      unitId: 3, // Jaipur
      status: "approved",
      mcq: "91",
      psychometric: "94",
    },
    {
      code: "SAV-GL-204",
      name: "Dr. Pooja Venkataraman",
      email: "pooja.venkat@example.com",
      phone: "9845332211",
      dob: "1996-02-18",
      gender: "Female",
      qualification: "MS (Ophthalmology)",
      college: "Bangalore Medical College and Research Institute",
      address: "234, 5th Cross, Indiranagar 1st Stage, Bangalore - 560038",
      specialty: "Glaucoma",
      unitId: 1, // Bangalore
      status: "approved",
      mcq: "86",
      psychometric: "90",
    },
    {
      code: "SAV-IOL-205",
      name: "Dr. Aakanksha Bindal",
      email: "aakanksha.bindal@example.com",
      phone: "9414223344",
      dob: "1995-07-22",
      gender: "Female",
      qualification: "MS (Ophthalmology)",
      college: "SMS Medical College, Jaipur",
      address: "Hindi Vidhya Bhawan Ke Pass, Ward No 32, Sikar, Rajasthan - 332001",
      specialty: "Cataract & IOL",
      unitId: 3, // Jaipur
      status: "approved",
      mcq: "93",
      psychometric: "96",
    },
    {
      code: "SAV-PD-206",
      name: "Dr. Siddharth Mehrotra",
      email: "siddharth.m@example.com",
      phone: "9935112233",
      dob: "1994-09-30",
      gender: "Male",
      qualification: "DNB (Ophthalmology)",
      college: "King George Medical University, Lucknow",
      address: "14/112, Civil Lines, Kanpur, Uttar Pradesh - 208001",
      specialty: "Pediatric Ophthalmology & Strabismus",
      unitId: 4, // Kanpur
      status: "approved",
      mcq: "87",
      psychometric: "88",
    }
  ];

  for (const c of candidatesData) {
    // 1. Delete existing if any
    await db.delete(candidatesTable).where(eq(candidatesTable.email, c.email));
    await db.delete(applicationSubmissionsTable).where(eq(applicationSubmissionsTable.email, c.email));

    // 2. Insert Candidate
    const [cand] = await db.insert(candidatesTable).values({
      candidateCode: c.code,
      fullName: c.name,
      email: c.email,
      phone: c.phone,
      dateOfBirth: c.dob,
      gender: c.gender,
      qualification: c.qualification,
      collegeName: c.college,
      address: c.address,
      unitId: c.unitId,
      status: "approved",
      mcqScore: c.mcq,
      psychometricScore: c.psychometric,
    }).returning();

    // 3. Insert Application Submission
    await db.insert(applicationSubmissionsTable).values({
      fullName: c.name,
      email: c.email,
      phone: c.phone,
      dateOfBirth: c.dob,
      gender: c.gender,
      specialization: JSON.stringify([c.specialty]),
      unitPreferences: JSON.stringify(["Bangalore", "Jaipur", "Coimbatore"]),
      status: "approved",
      isApproved: true,
      paidAmount: 2680,
      paymentMode: "Online Razorpay",
      paymentStatus: "captured",
      reviewNotes: `Allocated to ${c.specialty} [${c.code}]`,
    });

    // 4. Insert Application link
    await db.insert(applicationsTable).values({
      candidateId: cand.id,
      programId: 3,
      status: "approved",
    });
  }

  const allCands = await db.select().from(candidatesTable);
  console.log(`✅ Successfully seeded ${candidatesData.length} diverse candidates! Total candidates now: ${allCands.length}`);
}

main().catch(console.error);
