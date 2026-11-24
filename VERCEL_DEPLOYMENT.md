# Vercel Deployment Guide

## Issues Fixed

1. **CORS Configuration**: Now supports Vercel's dynamic URLs
2. **API URL Resolution**: Client uses relative `/api` paths in production
3. **Environment Variables**: Auto-detects Vercel deployment

## Deployment Steps

### 1. **Server Deployment (Vercel)**

**Create `api/index.js` for serverless functions:**
```
server/
├── index.js (move to api/index.js or use as-is with vercel.json)
├── routes/
├── lib/
└── package.json
```

**Vercel Environment Variables (.env.production on Vercel):**
```
SUPABASE_URL=https://your-supabase.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=your_jwt_secret
QR_SECRET=your_qr_secret
NODE_ENV=production
```

**vercel.json:**
```json
{
  "buildCommand": "npm install",
  "outputDirectory": ".",
  "functions": {
    "index.js": {
      "memory": 512,
      "maxDuration": 60
    }
  }
}
```

### 2. **Client Deployment (Vercel)**

**Environment Variables for Client (.env.production):**
```
VITE_SUPABASE_URL=https://your-supabase.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_URL=/api
```

The `/api` path will be rewritten to your server URL.

### 3. **Configure Supabase**

Add Vercel domain to Supabase's authorized redirect URLs:
- Go to Supabase Console → Authentication → URL Configuration
- Add: `https://your-vercel-domain.vercel.app`

### 4. **Environment Setup on Vercel**

1. Connect your GitHub repo to Vercel
2. Go to Settings → Environment Variables
3. Add all variables from `.env` files
4. For Client: `VITE_API_URL=/api`
5. For Server: All Supabase keys + `NODE_ENV=production`

### 5. **Deploy**

```bash
# Server
cd server
vercel --prod

# Client
cd client
vercel --prod
```

## Troubleshooting

### Login fails with CORS error
- Check Vercel domain is added to Supabase
- Verify `CLIENT_URL` env var or `VERCEL_URL` is set
- Check browser console for exact error

### API calls return 404
- Ensure `/api` prefix is used in client
- Verify `vercel.json` rewrites are configured
- Check API routes exist and are properly exported

### Password reset emails not working
- Verify `redirectTo` URL in auth.js uses correct domain
- Add Vercel domain to Supabase email templates

## Verification

Test login at: `https://your-vercel-domain.vercel.app`
- Email: `teacher@college.com`
- Password: `teacher@1234`
