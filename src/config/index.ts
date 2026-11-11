import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../../.env") });

export default {
  env: process.env.NODE_ENV,
  port: process.env.PORT,
  backend_base_url: process.env.BACKEND_BASE_URL,
  super_admin_password: process.env.SUPER_ADMIN_PASSWORD,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
  jwt: {
    jwt_secret: process.env.JWT_SECRET,
    gen_salt: process.env.GEN_SALT,
    expires_in: process.env.JWT_EXPIRES_IN,
    refresh_token_secret: process.env.REFRESH_TOKEN_SECRET,
    refresh_token_expires_in: process.env.REFRESH_TOKEN_EXPIRES_IN,
    reset_pass_secret: process.env.RESET_PASS_TOKEN,
    reset_pass_token_expires_in: process.env.RESET_PASS_TOKEN_EXPIRES_IN,
  },
  reset_pass_link: process.env.RESET_PASS_LINK,
  emailSender: {
    email: process.env.EMAIL,
    app_pass: process.env.APP_PASS,
  },
  stripe: {
    stripe_secret: process.env.STRIPE_SECRET_KEY ?? process.env.STRIPE_SK,
    webhook_secret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  cloudinary: {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  },
  app: {
    backendUrl: process.env.BACKEND_URL || process.env.BACKEND_BASE_URL,
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:3005",
  },
  social: {
    facebook_client_id: process.env.FACEBOOK_CLIENT_ID,
    facebook_client_secret: process.env.FACEBOOK_CLIENT_SECRET,
    google_client_id: process.env.GOOGLE_CLIENT_ID,
    google_client_secret: process.env.GOOGLE_CLIENT_SECRET,
    x_client_id: process.env.X_CLIENT_ID,
    x_client_secret: process.env.X_CLIENT_SECRET,
    tiktok_client_id: process.env.TIKTOK_CLIENT_ID,
    tiktok_client_secret: process.env.TIKTOK_CLIENT_SECRET,
    linkedin_client_id: process.env.LINKEDIN_CLIENT_ID,
    linkedin_client_secret: process.env.LINKEDIN_CLIENT_SECRET,
    // Separate LinkedIn app: the Community Management API (company Pages) must be the only product on its app.
    linkedin_pages_client_id: process.env.LINKEDIN_PAGES_CLIENT_ID,
    linkedin_pages_client_secret: process.env.LINKEDIN_PAGES_CLIENT_SECRET,
    // YouTube uses YOUTUBE_* when present, otherwise the (otherwise unused) GOOGLE_* OAuth client.
    youtube_client_id: process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    youtube_client_secret: process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
  },
};
