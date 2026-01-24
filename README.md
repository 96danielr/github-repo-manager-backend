# GitHub Repo Manager - Backend

RESTful API for the GitHub Repo Manager application. Handles authentication, GitHub OAuth, and repository management.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.18-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-6.0-47A248?logo=mongodb&logoColor=white)
![JWT](https://img.shields.io/badge/JWT-Auth-000000?logo=jsonwebtokens&logoColor=white)

## Features

- **JWT Authentication** - Access and refresh token system with HTTP-only cookies
- **GitHub OAuth** - Full OAuth flow with authorization management
- **User Management** - Registration, login, profile management
- **Repository API** - Proxy to GitHub API with caching
- **Favorites System** - Persistent favorites stored in MongoDB
- **Security** - CORS, rate limiting, input validation

## Tech Stack

- **Node.js** - Runtime environment
- **Express** - Web framework
- **MongoDB** - Database (with Mongoose ODM)
- **JWT** - Authentication tokens
- **bcrypt** - Password hashing
- **Axios** - HTTP client for GitHub API

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login user |
| POST | `/api/auth/logout` | Logout user |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/auth/refresh` | Refresh access token |

### GitHub

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/github/auth-url` | Get GitHub OAuth URL |
| GET | `/api/github/callback` | OAuth callback handler |
| GET | `/api/github/status` | Check GitHub connection |
| POST | `/api/github/disconnect` | Disconnect GitHub account |
| GET | `/api/github/repos` | Get user repositories |
| GET | `/api/github/repos/:owner/:repo` | Get repository details |
| GET | `/api/github/repos/:owner/:repo/readme` | Get repository README |
| GET | `/api/github/repos/:owner/:repo/commits` | Get repository commits |
| GET | `/api/github/repos/:owner/:repo/contributors` | Get contributors |

### Favorites

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/favorites` | Get user favorites |
| POST | `/api/favorites/:repoId` | Add to favorites |
| DELETE | `/api/favorites/:repoId` | Remove from favorites |

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)
- GitHub OAuth App credentials

### GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set Authorization callback URL to: `http://localhost:5000/api/github/callback`
4. Copy Client ID and Client Secret

### Installation

1. Clone the repository
```bash
git clone https://github.com/96danielr/github-repo-manager-backend.git
cd github-repo-manager-backend
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
PORT=5000
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/github-repo-manager

# JWT Secrets (generate random strings)
JWT_ACCESS_SECRET=your-access-secret-key
JWT_REFRESH_SECRET=your-refresh-secret-key
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# GitHub OAuth
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_CALLBACK_URL=http://localhost:5000/api/github/callback

# Frontend URL (for CORS and redirects)
FRONTEND_URL=http://localhost:5173
```

4. Start development server
```bash
npm run dev
```

The API will be available at `http://localhost:5000`

## Project Structure

```
src/
├── config/          # Database and app configuration
├── controllers/     # Route handlers
├── middleware/      # Express middleware (auth, error handling)
├── models/          # Mongoose models
├── routes/          # API routes
├── services/        # Business logic (GitHub API)
└── utils/           # Utility functions (JWT, AppError)
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 5000) |
| `NODE_ENV` | Environment (development/production) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET` | Secret for access tokens |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens |
| `JWT_ACCESS_EXPIRES` | Access token expiry (e.g., 15m) |
| `JWT_REFRESH_EXPIRES` | Refresh token expiry (e.g., 7d) |
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret |
| `GITHUB_CALLBACK_URL` | GitHub OAuth callback URL |
| `FRONTEND_URL` | Frontend URL for CORS |

## Deployment

### Render / Railway

1. Connect your GitHub repository
2. Set environment variables in dashboard
3. Deploy

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["node", "server.js"]
```

## License

MIT
