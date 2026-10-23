import { db, applicationFormsTable, applicationSubmissionsTable, paymentSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import Razorpay from "razorpay";

async function main() {
  console.log("=================================================");
  console.log("   RAZORPAY AUTOMATIC PAYMENT RECOVERY TOOL      ");
  console.log("   Sankara Academy of Vision — Fellowship 2027   ");
  console.log("=================================================\n");

  // 1. Fetch active Razorpay settings
  const allSettings = await db.select().from(paymentSettingsTable).where(eq(paymentSettingsTable.isActive, true));
  const setting = allSettings[0];
  const keyId = setting?.razorpayKeyId || process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID;
  const keySecret = setting?.razorpayKeySecret || process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret || keyId.startsWith("rzp_test_sim")) {
    console.error("❌ Error: No active Razorpay live API credentials found in database or environment.");
    console.log("Please check payment_settings table or set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
    process.exit(1);
  }

  console.log(`🔑 Connected with Razorpay Key: ${keyId.substring(0, 8)}...`);

  // 2. Fetch active form
  let [form] = await db.select().from(applicationFormsTable).where(eq(applicationFormsTable.token, "JAN2027"));
  if (!form) {
    [form] = await db.select().from(applicationFormsTable).where(eq(applicationFormsTable.isActive, true)).limit(1);
  }
  if (!form) {
    console.error("❌ Error: No active application form found in database.");
    process.exit(1);
  }
  console.log(`📋 Target Form: "${form.title}" (Token: ${form.token}, ID: ${form.id})\n`);

  // 3. Query Razorpay for recent payments
  const instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  console.log("📡 Fetching last 100 payments from Razorpay API...");
  
  const paymentBatch = await (instance.payments as any).all({ count: 100 });
  const items = paymentBatch?.items || [];
  console.log(`Found ${items.length} total transactions on Razorpay.\n`);

  let recovered = 0;
  let alreadyPresent = 0;
  let otherStatus = 0;

  for (const item of items) {
    if (item.status !== "captured") {
      otherStatus++;
      continue;
    }

    const paymentId = item.id;
    const amountInRs = item.amount ? Math.round(item.amount / 100) : 2750;

    // Check if this payment already exists in database
    const [existing] = await db.select().from(applicationSubmissionsTable)
      .where(eq(applicationSubmissionsTable.paymentId, paymentId));

    if (existing) {
      console.log(`  ✓ Payment ${paymentId} (${amountInRs} INR) is ALREADY in database (Submission ID #${existing.id})`);
      alreadyPresent++;
      continue;
    }

    // Missing application found! Let's recover it!
    console.log(`  ⚡ RECOVERING STUCK APPLICATION FOR PAYMENT: ${paymentId}`);
    console.log(`     Amount: Rs. ${amountInRs} | Email: ${item.email || "N/A"} | Contact: ${item.contact || "N/A"}`);

    const payerEmail = item.email || `candidate_${paymentId.slice(-6)}@sankaraeye.com`;
    const payerContact = item.contact || null;
    const notes = (item.notes as any) || {};
    const payerName = notes.fullName || notes.name || payerEmail.split("@")[0].replace(/[._]/g, " ").toUpperCase();
    
    // Determine specializations from amount or notes
    let specialization = '["IOL"]';
    if (notes.specialization) {
      specialization = typeof notes.specialization === "string" ? notes.specialization : JSON.stringify(notes.specialization);
    } else if (amountInRs >= 5500) {
      specialization = '["Retina", "Anterior Segment"]';
    }

    const [created] = await db.insert(applicationSubmissionsTable).values({
      formId: form.id,
      status: "pending",
      fullName: payerName,
      email: payerEmail,
      phone: payerContact,
      specialization: specialization,
      paymentId: paymentId,
      paymentMode: "Razorpay (Auto-Recovered)",
      paidAmount: amountInRs,
      source: "reconciliation_tool",
      readyForReview: true,
      reviewNotes: `Recovered via automated Razorpay reconciliation. Original payment date: ${new Date(item.created_at * 1000).toISOString()}`,
      submittedAt: new Date(item.created_at * 1000),
    } as any).returning();

    console.log(`     ✅ Successfully created application submission #${created.id} for "${payerName}"!\n`);
    recovered++;
  }

  console.log("=================================================");
  console.log(`🎉 RECOVERY SUMMARY:`);
  console.log(`   - Stuck applications recovered: ${recovered}`);
  console.log(`   - Applications already in DB:   ${alreadyPresent}`);
  console.log(`   - Non-captured transactions:    ${otherStatus}`);
  console.log("=================================================\n");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
