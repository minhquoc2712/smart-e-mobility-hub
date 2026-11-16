const REQUIRED_VARS = ['JWT_SECRET'];

for (const key of REQUIRED_VARS) {
  if (!process.env[key]) {
    throw new Error(`[Auth config] Thiếu biến môi trường ${key}. Hãy kiểm tra backend/.env`);
  }
}

module.exports = {
  googleClientId:
    process.env.GOOGLE_CLIENT_ID || 'your-google-oauth-client-id.apps.googleusercontent.com',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
};
