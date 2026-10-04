import nodemailer from "nodemailer";
import { config } from "../config/config";
import fs from "fs/promises"
import path from "path"

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: parseInt(config.SMTP_PORT || "587"),
  secure: config.SMTP_SECURE === "true",
  auth: {
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
  },
});

transporter.verify().then(() => {
    console.log("SMTP server is ready to send emails");
}).catch((err) => {
    console.error("Error connecting to SMTP server:", err);
});


export async function loadTemplate(templateName:string, data:{[key:string]:string}) {
  const filePath = path.join(
    __dirname,
    "../templates",
    `${templateName}.html`
  );

  let html = await fs.readFile(filePath, "utf8");

  for (const [key, value] of Object.entries(data)) {
    html = html.replaceAll(`{{${key}}}`, value);
  }

  return html;
}

export async function sendMail(to: string, subject: string, text: string, html: string) {
    const mailOptions = {
        from: `"Sologix Energy" <${config.SMTP_USER}>`,
        to,
        subject,
        text,
        html
    };
    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error("Error sending email:", error);
        throw new Error("Failed to send email");
    }
}