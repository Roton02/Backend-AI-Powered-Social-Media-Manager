export const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
  status: true,
  isEmailVerified: true,
  createdAt: true,
};

export const verifyEmailHTML = (link: string) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Verify Your Email</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #fff8e1;
        margin: 0;
        padding: 0;
      }
      .email-container {
        max-width: 600px;
        margin: 30px auto;
        background-color: #ffffff;
        padding: 30px;
        border-radius: 12px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
        border: 2px solid #ffcc00;
      }
      .header {
        text-align: center;
        padding-bottom: 10px;
      }
      .header h1 {
        color: #f9a825;
        margin: 0;
      }
      .content {
        padding: 20px;
        text-align: center;
      }
      .content p {
        color: #444;
        line-height: 1.6;
        font-size: 16px;
      }
      .button {
        display: inline-block;
        padding: 12px 24px;
        margin: 25px 0;
        font-size: 16px;
        color: #ffffff;
        background-color: #fbc02d;
        text-decoration: none;
        border-radius: 8px;
        font-weight: bold;
        transition: background-color 0.3s ease;
      }
      .button:hover {
        background-color: #f9a825;
      }
      .footer {
        text-align: center;
        padding: 20px;
        font-size: 12px;
        color: #777;
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <h1>Welcome to iSuckAtRocket 🚀</h1>
      </div>
      <div class="content">
        <p>Hey there! 👋</p>
        <p>You're just one click away from unlocking a powerful platform where contractors and subcontractors collaborate smoothly.</p>
        <p>Please verify your email address by clicking the button below:</p>
        <a href="${link}" class="button">Verify Email Address</a>
        <p>If this wasn’t you, just ignore this message — no worries!</p>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} iSuckAtRocket. Built with ❤️ for builders.</p>
      </div>
    </div>
  </body>
  </html>
  `;
};

export const successEmailVerificationHTML = () => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Email Verified</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #fffde7;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
      }
      .container {
        text-align: center;
        background: #ffffff;
        padding: 2rem;
        border-radius: 10px;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.15);
        border: 2px solid #fbc02d;
      }
      h1 {
        color: #43a047;
        font-size: 2.5rem;
        margin-bottom: 1rem;
      }
      p {
        color: #333;
        font-size: 1.1rem;
      }
      .icon {
        font-size: 4rem;
        color: #43a047;
        margin-bottom: 1rem;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="icon">✔</div>
      <h1>Email Verified</h1>
      <p>Awesome! Your email has been successfully verified. You're ready to dive into iSuckAtRocket and get connected.</p>
    </div>
  </body>
  </html>
  `;
};

export const failedEmailVerificationHTML = (client_server: string) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Email Verification Failed</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #fff8e1;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
      }
      .container {
        text-align: center;
        background: white;
        padding: 2rem;
        border-radius: 10px;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
        width: 90%;
        max-width: 500px;
        border: 2px solid #ffcc00;
      }
      h1 {
        color: #d32f2f;
        font-size: 2.2rem;
        margin-bottom: 1rem;
      }
      p {
        color: #444;
        font-size: 1rem;
      }
      .icon {
        font-size: 4rem;
        color: #d32f2f;
        margin-bottom: 1rem;
      }
      button {
        background-color: #fbc02d;
        color: #000;
        padding: 1rem 2rem;
        font-size: 1.1rem;
        border: none;
        border-radius: 5px;
        cursor: pointer;
        transition: background-color 0.3s ease;
        margin-top: 1.2rem;
        font-weight: bold;
      }
      button:hover {
        background-color: #f9a825;
      }
      a {
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="icon">✖</div>
      <h1>Verification Failed</h1>
      <p>Oops! This verification link is invalid or may have expired.<br/>Please request a new one to continue using iSuckAtRocket.</p>
      <a href="${client_server}">
        <button>Return to Homepage</button>
      </a>
    </div>
  </body>
  </html>
  `;
};

export const subscribeNewsletterHTML = (email: string) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Newsletter Subscription</title>
    <style>
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #fff8e1;
        margin: 0;
        padding: 0;
      }
      .email-container {
        max-width: 600px;
        margin: 30px auto;
        background-color: #ffffff;
        padding: 30px;
        border-radius: 12px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
        border: 2px solid #ffcc00;
      }
      .header {
        text-align: center;
        padding-bottom: 10px;
      }
      .header h1 {
        color: #fb8c00;
        margin: 0;
      }
      .content {
        padding: 20px;
        text-align: center;
      }
      .content p {
        color: #444;
        line-height: 1.6;
        font-size: 16px;
      }
      .footer {
        text-align: center;
        padding: 20px;
        font-size: 12px;
        color: #777;
      }
      .highlight {
        color: #fb8c00;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <h1>You're Subscribed! 🧡</h1>
      </div>
      <div class="content">
        <p>Hey there 👋</p>
        <p>Thanks for subscribing to the <span class="highlight">iSuckAtRocket</span> newsletter!</p>
        <p>You’ll now receive the latest updates, contractor tools, and construction industry insights straight to your inbox at:</p>
        <p class="highlight">${email}</p>
        <p>have a good day .</p>
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} iSuckAtRocket. Built with ❤️ for builders.</p>
      </div>
    </div>
  </body>
  </html>
  `;
};

export const inviteSubcontractorEmailHTML = ({
  contractorName,
  contractorEmail,
  message,
  redirectUrl,
  platformName = "iSuckAtRocket",
}: {
  contractorName: string;
  contractorEmail: string;
  message: string;
  redirectUrl: string;
  platformName?: string;
}) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Subcontractor Invitation</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #f5f7fa;
        font-family: 'Segoe UI', Tahoma, sans-serif;
        color: #333;
      }
      .container {
        max-width: 600px;
        margin: 50px auto;
        background: #ffffff;
        padding: 2rem;
        border-radius: 10px;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.1);
        border-left: 5px solid #fb8c00;
      }
      .header {
        text-align: center;
        margin-bottom: 1.5rem;
      }
      .header h2 {
        margin: 0;
        font-size: 1.8rem;
        color: #fb8c00;
      }
      .message {
        background-color: #f1f8e9;
        padding: 1rem;
        border-left: 4px solid #cddc39;
        margin: 1.5rem 0;
        border-radius: 6px;
      }
      .cta {
        display: inline-block;
        margin-top: 1.5rem;
        padding: 12px 20px;
        background-color: #fb8c00;
        color: white;
        text-decoration: none;
        font-weight: bold;
        border-radius: 6px;
      }
      .footer {
        margin-top: 2rem;
        font-size: 0.9rem;
        color: #777;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h2>${contractorName} invites you to join ${platformName}</h2>
      </div>
      <p>Hi there,</p>
      <p>
        <strong>${contractorName}</strong> (<a href="mailto:${contractorEmail}">${contractorEmail}</a>) has invited you to join <strong>${platformName}</strong> as a <strong>Subcontractor</strong>.
      </p>
      <div class="message">
        <p><strong>Personal Message:</strong></p>
        <p>${message}</p>
      </div>
      <p>
        Join now to connect, collaborate, and grow with other professionals on ${platformName}.
      </p>
      <div style="text-align: center;">
        <a class="cta" href="${redirectUrl}">Join Now</a>
      </div>
      <div class="footer">
        <p>If you were not expecting this invitation, you can safely ignore this email.</p>
        <p>— The ${platformName} Team</p>
      </div>
    </div>
  </body>
  </html>
  `;
};


export const contactFormEmailHTML = ({
  userName,
  userEmail,
  userMessage,
  platformName = "iSuckAtRocket",
}: {
  userName: string;
  userEmail: string;
  userMessage: string;
  platformName?: string;
}) => {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>Contact Form Message</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #f9f9f9;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        color: #333;
      }
      .container {
        max-width: 600px;
        margin: 40px auto;
        background: #ffffff;
        padding: 2rem;
        border-radius: 10px;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
        border-left: 5px solid #3f51b5;
      }
      .header {
        text-align: center;
        margin-bottom: 1.5rem;
      }
      .header h2 {
        margin: 0;
        font-size: 1.6rem;
        color: #3f51b5;
      }
      .info {
        margin-top: 1rem;
      }
      .info p {
        margin: 0.5rem 0;
      }
      .message-box {
        margin-top: 1.5rem;
        padding: 1rem;
        background-color: #f1f1f1;
        border-left: 4px solid #3f51b5;
        border-radius: 6px;
        white-space: pre-wrap;
      }
      .footer {
        margin-top: 2rem;
        font-size: 0.9rem;
        color: #777;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h2>New Contact Message from ${platformName}</h2>
      </div>
      <div class="info">
        <p><strong>Name:</strong> ${userName}</p>
        <p><strong>Email:</strong> <a href="mailto:${userEmail}">${userEmail}</a></p>
      </div>
      <div class="message-box">
        <p><strong>Message:</strong></p>
        <p>${userMessage}</p>
      </div>
      <div class="footer">
        <p>This message was sent from the contact section of ${platformName}.</p>
      </div>
    </div>
  </body>
  </html>
  `;
};
