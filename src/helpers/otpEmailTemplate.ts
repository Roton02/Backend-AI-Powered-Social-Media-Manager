type OtpEmailPurpose = "verify" | "reset";

const BRAND = "Nirapod Sheba";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function otpBoxes(otp: string) {
  return otp
    .split("")
    .map(
      (digit) => `
        <td align="center" width="42" height="46" style="width: 42px; height: 46px; border: 1px solid #DEDEDE; border-radius: 10px; background: #FFFFFF; font-size: 18px; font-weight: 600; color: #1F202D;">
          ${escapeHtml(digit)}
        </td>
        <td width="8" style="width: 8px; font-size: 0;">&nbsp;</td>`,
    )
    .join("");
}

export function otpEmailTemplate(options: {
  userName: string;
  otp: string;
  purpose: OtpEmailPurpose;
}) {
  const name = escapeHtml(options.userName || "there");
  const isReset = options.purpose === "reset";
  const headline = isReset ? "Reset your password" : "Verify your account";
  const intro = isReset
    ? "Use this one-time code to set a new password for your Nirapod Sheba account."
    : "Use this one-time code to finish creating your Nirapod Sheba account.";
  const subject = isReset
    ? `${BRAND} — Reset your password`
    : `${BRAND} — Verify your account`;

  const html = `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #F7F7F7; font-family: Outfit, Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #F7F7F7; padding: 32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 520px; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 12px 32px -12px rgba(31, 32, 45, 0.18);">
            <tr>
              <td bgcolor="#139738" style="background: #139738; background-image: linear-gradient(90deg, #139738 0%, #0051A3 100%); padding: 28px 32px; text-align: center;">
                <p style="margin: 0; font-size: 22px; line-height: 28px; font-weight: 700; letter-spacing: 0.2px; color: #FFFFFF;">
                  ${BRAND}
                </p>
                <p style="margin: 6px 0 0; font-size: 13px; line-height: 18px; color: rgba(255,255,255,0.86);">
                  Trusted home services
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 32px 32px 8px;">
                <h1 style="margin: 0 0 12px; font-size: 20px; line-height: 28px; font-weight: 600; color: #1F202D;">
                  ${headline}
                </h1>
                <p style="margin: 0 0 8px; font-size: 15px; line-height: 22px; color: #44454C;">
                  Hi <strong>${name}</strong>,
                </p>
                <p style="margin: 0; font-size: 15px; line-height: 22px; color: #6B6B72;">
                  ${intro}
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding: 24px 32px;">
                <p style="margin: 0 0 12px; font-size: 13px; font-weight: 600; letter-spacing: 0.4px; text-transform: uppercase; color: #818181;">
                  Your OTP
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    ${otpBoxes(options.otp)}
                  </tr>
                </table>
                <p style="margin: 16px 0 0; font-size: 22px; line-height: 28px; font-weight: 700; letter-spacing: 8px; color: #139738;">
                  ${escapeHtml(options.otp)}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 0 32px 28px;">
                <p style="margin: 0; font-size: 14px; line-height: 20px; color: #6B6B72;">
                  This code is valid for <strong style="color: #1F202D;">5 minutes</strong>. If you did not request this, you can ignore this email.
                </p>
              </td>
            </tr>
            <tr>
              <td style="border-top: 1px solid #EDEDED; padding: 18px 32px 24px; text-align: center;">
                <p style="margin: 0; font-size: 13px; line-height: 18px; color: #818181;">
                  Thanks,<br />
                  <strong style="color: #139738;">${BRAND}</strong>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

  const text = `${BRAND}

Hi ${options.userName || "there"},

${intro}

Your OTP: ${options.otp}

This code is valid for 5 minutes. If you did not request this, you can ignore this email.

Thanks,
${BRAND}`;

  return { subject, html, text };
}
