import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";
import { db, emailSettingsTable } from "@workspace/db";

async function getTransporter() {
  // 1. Try database email settings
  try {
    const [settings] = await db.select().from(emailSettingsTable).limit(1);
    if (settings && settings.enabled && settings.host && settings.user && settings.pass) {
      const port = Number(settings.port) || 587;
      return {
        transporter: nodemailer.createTransport({
          host: settings.host,
          port,
          secure: settings.useSsl || port === 465,
          auth: { user: settings.user, pass: settings.pass }
        }),
        from: settings.fromEmail || settings.user,
        fromName: settings.fromName || "Sankara Academy of Vision"
      };
    }
  } catch (e) {
    // Database query failed or table not found, fallback to process.env
  }

  // 2. Fallback to process.env
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  const fromName = process.env.SMTP_FROM_NAME || "Sankara Academy of Vision";

  if (host && user && pass && user !== "your-email@gmail.com") {
    return {
      transporter: nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass }
      }),
      from,
      fromName
    };
  }

  return null;
}

export async function sendMailSafely(transporter: nodemailer.Transporter, mailOptions: nodemailer.SendMailOptions, timeoutMs = 8000): Promise<boolean> {
  try {
    const sendPromise = transporter.sendMail(mailOptions);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("SMTP sendMail timed out")), timeoutMs)
    );
    await Promise.race([sendPromise, timeoutPromise]);
    return true;
  } catch (err: any) {
    console.error("[email-send-error]", err?.message || err);
    return false;
  }
}

export async function sendApplicationSubmissionConfirmationEmail(opts: {
  toEmail: string;
  toName: string;
  submissionId: number;
  programName: string;
  formTitle: string;
  specialization?: string | null;
  paymentId?: string | null;
  paymentMode?: string | null;
  paidAmount?: number | null;
}) {
  const cfg = await getTransporter();
  if (!cfg) {
    console.warn(`[email] SMTP not configured — logged submission confirmation email for ${opts.toEmail} (Payment ID: ${opts.paymentId}, Amount: ₹${opts.paidAmount})`);
    return;
  }

  let specFormatted = "General Fellowship";
  if (opts.specialization) {
    try {
      const parsed = typeof opts.specialization === "string" && opts.specialization.startsWith("[")
        ? JSON.parse(opts.specialization)
        : [opts.specialization];
      specFormatted = Array.isArray(parsed) ? parsed.join(", ") : String(opts.specialization);
    } catch (e) {
      specFormatted = String(opts.specialization);
    }
  }

  const amountDisplay = opts.paidAmount 
    ? `₹${Number(opts.paidAmount > 100000 ? opts.paidAmount / 100 : opts.paidAmount).toLocaleString("en-IN")}`
    : "—";

  await sendMailSafely(cfg.transporter, {
    from: `"${cfg.fromName}" <${cfg.from}>`,
    to: opts.toEmail,
    subject: `Application & Payment Confirmation — ${opts.programName}`,
    html: `
      <div style="font-family: 'Plus Jakarta Sans', Arial, sans-serif; max-width: 620px; margin: auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #ff7a00; font-size: 22px; font-weight: 800; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.5px;">Sankara Academy of Vision</h2>
          <p style="color: #64748b; font-size: 13px; margin: 0; font-weight: 600;">Fellowship Admissions & Examination System</p>
        </div>

        <div style="background-color: #f8fafc; border-left: 4px solid #ff7a00; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
          <p style="margin: 0; color: #1e293b; font-size: 15px;">Dear <strong>${opts.toName}</strong>,</p>
          <p style="margin: 8px 0 0; color: #475569; font-size: 14px; line-height: 1.5;">
            Thank you for applying for the <strong>${opts.programName}</strong>. We have successfully received your application submission and fee payment.
          </p>
        </div>

        <h3 style="color: #0f172a; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
          Application & Payment Summary
        </h3>

        <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-weight: 600; width: 40%;">Application ID:</td>
            <td style="padding: 8px 0; color: #0f172a; font-weight: 700; font-family: monospace; font-size: 14px;">#APP-${opts.submissionId}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Applied Specialization(s):</td>
            <td style="padding: 8px 0; color: #0f172a; font-weight: 700;">${specFormatted}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Payment Reference ID:</td>
            <td style="padding: 8px 0; color: #0f172a; font-weight: 700; font-family: monospace;">${opts.paymentId || "Direct Registration"}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Payment Mode:</td>
            <td style="padding: 8px 0; color: #0f172a; font-weight: 700;">${opts.paymentMode || "Online"}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-weight: 600;">Amount Paid:</td>
            <td style="padding: 8px 0; color: #16a34a; font-weight: 800; font-size: 15px;">${amountDisplay}</td>
          </tr>
        </table>

        <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 13px; color: #1e40af; font-weight: 600;">Next Steps:</p>
          <p style="margin: 4px 0 0; font-size: 12px; color: #1e3a8a; line-height: 1.4;">
            Your application is currently under administrative verification. Once approved, you will receive an official notification with your examination hall ticket and panel schedule details.
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
          Sankara Academy of Vision &bull; Sri Kanchi Kamakoti Medical Trust &bull; This is an automated email. Please do not reply directly.
        </p>
      </div>
    `,
  });
}

export async function sendApplicationApprovalEmail(opts: {
  toEmail: string; toName: string; candidateCode: string; programName: string; formTitle: string;
}) {
  const cfg = await getTransporter();
  if (!cfg) {
    console.warn("[email] SMTP not configured or disabled — skipping approval email to", opts.toEmail);
    return;
  }
  await cfg.transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.from}>`,
    to: opts.toEmail,
    subject: `Application Approved — ${opts.programName}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
        <img src="cid:logo" alt="Sankara Academy" style="height:50px;margin-bottom:16px" />
        <h2 style="color:#1d4ed8;margin:0 0 8px">Application Approved</h2>
        <p style="color:#374151">Dear <strong>${opts.toName}</strong>,</p>
        <p style="color:#374151">
          We are pleased to inform you that your application for the
          <strong>${opts.programName}</strong> fellowship has been reviewed and <strong>approved</strong>.
        </p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:16px;margin:20px 0">
          <p style="margin:0;font-size:14px;color:#166534">
            <strong>Your Candidate Code:</strong>&nbsp;
            <span style="font-family:monospace;font-size:16px;font-weight:bold">${opts.candidateCode}</span>
          </p>
          <p style="margin:6px 0 0;font-size:13px;color:#166534">
            Please keep this code safe — you will need it for the examination and interview process.
          </p>
        </div>
        <p style="color:#374151;font-size:14px">
          Further details regarding the examination schedule will be communicated to you shortly.
          Please ensure you are reachable on the email and phone number provided in your application.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="color:#9ca3af;font-size:12px;margin:0">
          Sankara Academy of Vision &bull; Sankara Eye Care Institutions &bull; This is an automated message, please do not reply.
        </p>
      </div>
    `,
  });
}

export async function sendStatusUpdateEmail(opts: {
  toEmail: string; toName: string; status: string; programName?: string;
}) {
  const cfg = await getTransporter();
  if (!cfg) return;

  const subjectMap: Record<string, string> = {
    rejected: "Application Status Update",
    interview_completed: "Interview Completed — Thank You",
    allocated: "Congratulations — Fellowship Seat Allocated",
  };

  const bodyMap: Record<string, string> = {
    rejected: `We regret to inform you that after careful review, your application could not be accepted at this time. We wish you the very best in your future endeavours.`,
    interview_completed: `Thank you for appearing for the interview. Your results will be communicated shortly.`,
    allocated: `Congratulations! You have been allocated a fellowship seat. Please report as per the schedule that will be sent to you.`,
  };

  const subject = subjectMap[opts.status];
  const body = bodyMap[opts.status];
  if (!subject || !body) return;

  await cfg.transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.from}>`,
    to: opts.toEmail,
    subject,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
        <h2 style="color:#1d4ed8;margin:0 0 8px">${subject}</h2>
        <p style="color:#374151">Dear <strong>${opts.toName}</strong>,</p>
        <p style="color:#374151">${body}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="color:#9ca3af;font-size:12px;margin:0">Sankara Academy of Vision &bull; This is an automated message.</p>
      </div>
    `,
  });
}

export async function sendOfferLetterEmail(opts: {
  toEmail: string; toName: string; candidateCode: string; specialization: string; unitName: string;
}) {
  const cfg = await getTransporter();
  if (!cfg) return;

  const publicDir = path.join(process.cwd(), "..", "fellowship-exam", "public");
  const hospitalLogoPath = path.join(publicDir, "sankara-logo.jpg");
  const academyLogoPath = path.join(publicDir, "logo.png");

  const attachments = [];
  if (fs.existsSync(hospitalLogoPath)) {
    attachments.push({ filename: 'sankara-logo.jpg', path: hospitalLogoPath, cid: 'hospitalLogo' });
  }
  if (fs.existsSync(academyLogoPath)) {
    attachments.push({ filename: 'logo.png', path: academyLogoPath, cid: 'academyLogo' });
  }

  await cfg.transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.from}>`,
    to: opts.toEmail,
    subject: `Admission Offer — Fellowship in ${opts.specialization}`,
    attachments,
    html: `
      <div style="font-family:'Times New Roman',serif;max-width:800px;margin:auto;padding:40px;border:1px solid #ddd;line-height:1.6;color:#333;background:#fff;">
        <table style="width:100%;border-bottom:2px solid #1d4ed8;padding-bottom:10px;margin-bottom:30px;">
          <tr>
            <td style="width:50%;text-align:left;vertical-align:middle;">
              <img src="cid:hospitalLogo" alt="Sankara Eye Hospital" style="height:70px;" />
            </td>
            <td style="width:50%;text-align:right;vertical-align:middle;">
              <img src="cid:academyLogo" alt="Academy of Vision" style="height:70px;" />
            </td>
          </tr>
        </table>

        <div style="text-align:right;margin-bottom:20px;font-size:14px;">
          <strong>Date:</strong> ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
        </div>

        <div style="margin-bottom:30px;font-size:15px;">
          <strong>To,</strong><br/>
          <strong>Dr. ${opts.toName}</strong><br/>
          Candidate Code: ${opts.candidateCode}
        </div>

        <h2 style="text-align:center;text-decoration:underline;color:#1d4ed8;margin-bottom:30px;font-size:22px;">OFFER OF FELLOWSHIP ADMISSION</h2>

        <p>Dear Dr. ${opts.toName},</p>

        <p>Based on your performance in the entrance examination and subsequent interview conducted for the <strong>JULY 2026</strong> intake, we are pleased to offer you admission to the Fellowship program at <strong>Sankara Academy of Vision</strong>.</p>

        <p>You have been selected for the following specialization:</p>
        
        <div style="background:#f8fafc;padding:20px;border:1px solid #e2e8f0;margin:20px 0;text-align:center;">
          <h3 style="margin:0;color:#0f172a;font-size:20px;">${opts.specialization}</h3>
        </div>

        <p>Your fellowship will be based at our <strong>${opts.unitName}</strong> unit. The duration of the fellowship is as per the standard norms of the academy.</p>

        <p>Please note that this offer is subject to the verification of your original documents and medical fitness. You are required to confirm your acceptance by replying to this email within 3 working days.</p>

        <p>Detailed joining instructions and the list of documents required at the time of reporting will be sent to you shortly.</p>

        <p>We look forward to welcoming you to the Sankara family.</p>

        <div style="margin-top:60px;font-size:15px;">
          <p>Yours Sincerely,</p>
          <br/><br/>
          <strong>Director,</strong><br/>
          Sankara Academy of Vision
        </div>

        <div style="margin-top:40px;border-top:1px solid #eee;padding-top:15px;font-size:11px;color:#666;text-align:center;">
          Sankara Eye Care Institutions, India &bull; www.sankaraeye.com &bull; This is an official document.
        </div>
      </div>
    `,
  });
}

export async function sendCallLetterWithAttachment(opts: {
  toEmail: string;
  toName: string;
  pdfBuffer: Buffer;
  fileName: string;
  interviewDate?: string;
  reportingTime?: string;
  venue?: string;
  specialization?: string;
}) {
  const cfg = await getTransporter();
  if (!cfg) {
    throw new Error(
      "SMTP server is not configured. Please configure your hospital SMTP server in Settings → Email Settings, or download the Call Letter PDF directly."
    );
  }

  const isRetina = opts.specialization ? (opts.specialization.toLowerCase().includes("retina") || opts.specialization.toLowerCase().includes("vitreo") || /\b(vr|mr)\b/i.test(opts.specialization)) : false;
  const defaultDate = isRetina ? "7th December 2026, Monday" : "8th December 2026, Tuesday";
  const dateStr = opts.interviewDate || defaultDate;
  const timeStr = opts.reportingTime || "8:00 AM Sharp";
  const venueStr = opts.venue || "Sankara Eye Hospital, Varthur Main Road, Kundalahalli Gate, Bangalore – 560037";

  const success = await sendMailSafely(cfg.transporter, {
    from: `"${cfg.fromName}" <${cfg.from}>`,
    to: opts.toEmail,
    subject: `Interview Call Letter — Sankara Academy of Vision Fellowship Program 2026`,
    attachments: [
      {
        filename: opts.fileName,
        content: opts.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #0b4a8f; margin: 0 0 6px; font-size: 20px;">SANKARA ACADEMY OF VISION</h2>
          <p style="color: #64748b; font-size: 13px; margin: 0;">Fellowship Admissions & Academic Board</p>
        </div>
        <div style="background-color: #f8fafc; border-left: 4px solid #0b4a8f; padding: 14px; border-radius: 6px; margin-bottom: 20px;">
          <p style="margin: 0; color: #1e293b; font-size: 14px;">Dear <strong>Dr. ${opts.toName}</strong>,</p>
          <p style="margin: 8px 0 0; color: #475569; font-size: 13.5px; line-height: 1.5;">
            Please find attached your official <strong>Interview Call Letter</strong> for the Fellowship Programme in <strong>${opts.specialization || "Ophthalmology"}</strong>.
          </p>
        </div>
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
          <p style="margin: 0 0 8px; font-size: 13px; color: #334155;"><strong>Date & Day:</strong> ${dateStr}</p>
          <p style="margin: 0 0 8px; font-size: 13px; color: #334155;"><strong>Reporting Time:</strong> ${timeStr}</p>
          <p style="margin: 0; font-size: 13px; color: #334155;"><strong>Venue:</strong> ${venueStr}</p>
        </div>
        <p style="font-size: 13px; color: #475569; line-height: 1.5;">
          Kindly print the attached Call Letter and carry all required original credentials and certificates for physical verification.
        </p>
        <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; margin: 16px 0; text-align: center;">
          <p style="margin: 0; font-size: 13px; color: #92400e; font-weight: bold;">
            For clarifications contact Radhika (Course Coordinator) on 9666677505.
          </p>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
          Sankara Academy of Vision &bull; Sri Kanchi Kamakoti Medical Trust &bull; Official Call Letter
        </p>
      </div>
    `,
  });

  if (!success) {
    throw new Error(`Failed to dispatch email to ${opts.toEmail} via SMTP. Please verify your SMTP credentials.`);
  }
}

export async function sendOfferLetterWithAttachment(opts: {
  toEmail: string;
  toName: string;
  pdfBuffer: Buffer;
  fileName: string;
  specialization?: string;
  unitName?: string;
  effectiveDate?: string;
}) {
  const cfg = await getTransporter();
  if (!cfg) {
    throw new Error(
      "SMTP server is not configured. Please configure your hospital SMTP server in Settings → Email Settings, or download the Offer Letter PDF directly."
    );
  }

  const success = await sendMailSafely(cfg.transporter, {
    from: `"${cfg.fromName}" <${cfg.from}>`,
    to: opts.toEmail,
    subject: `Admission Offer — Fellowship in ${opts.specialization || "Ophthalmology"}`,
    attachments: [
      {
        filename: opts.fileName,
        content: opts.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 620px; margin: auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #0b4a8f; margin: 0 0 6px; font-size: 20px;">SANKARA ACADEMY OF VISION</h2>
          <p style="color: #64748b; font-size: 13px; margin: 0;">Fellowship Admissions & Academic Board</p>
        </div>
        <div style="background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 14px; border-radius: 6px; margin-bottom: 20px;">
          <p style="margin: 0; color: #166534; font-size: 14px;">Dear <strong>Dr. ${opts.toName}</strong>,</p>
          <p style="margin: 8px 0 0; color: #166534; font-size: 13.5px; line-height: 1.5;">
            Congratulations! We are pleased to extend this formal <strong>Fellowship Offer</strong> in <strong>${opts.specialization || "Ophthalmology"}</strong>${opts.unitName ? ` at Sankara Eye Hospital – ${opts.unitName}` : ""}.
          </p>
        </div>
        <p style="font-size: 13px; color: #334155; line-height: 1.5;">
          Please find attached your formal Fellowship Offer Letter containing full appointment details, tenure, monthly stipend, and joining regulations.
        </p>
        <p style="font-size: 13px; color: #475569; line-height: 1.5;">
          Kindly review the document carefully and submit your acceptance within 3 working days by emailing <a href="mailto:radhika@sankaraeye.com">radhika@sankaraeye.com</a> or contacting <strong>Radhika (Course Coordinator) on 9666677505</strong>.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
          Sankara Academy of Vision &bull; Sri Kanchi Kamakoti Medical Trust &bull; Official Appointment Document
        </p>
      </div>
    `,
  });

  if (!success) {
    throw new Error(`Failed to dispatch email to ${opts.toEmail} via SMTP. Please verify your SMTP credentials.`);
  }
}



