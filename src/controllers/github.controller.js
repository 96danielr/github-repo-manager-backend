import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import {
  getGitHubAuthUrl,
  exchangeCodeForToken,
  getGitHubUser,
} from '../services/github.service.js';
import {
  generateAccessToken,
  generateRefreshToken,
  setTokenCookies,
} from '../utils/jwt.js';

export const initiateGitHubAuth = (req, res) => {
  const authUrl = getGitHubAuthUrl();
  res.json({
    success: true,
    data: { url: authUrl },
  });
};

export const handleGitHubCallback = async (req, res, next) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL}/profile?error=no_code`);
    }

    // Redirect to frontend with the code - frontend will handle the connection
    res.redirect(`${process.env.FRONTEND_URL}/auth/github/callback?code=${code}`);
  } catch (error) {
    console.error('GitHub OAuth error:', error.message);
    res.redirect(`${process.env.FRONTEND_URL}/profile?error=github_auth_failed`);
  }
};

export const connectGitHub = async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      return next(new AppError('GitHub authorization code is required', 400));
    }

    // Exchange code for access token
    const githubToken = await exchangeCodeForToken(code);

    // Get GitHub user info
    const githubUser = await getGitHubUser(githubToken);

    // Check if GitHub is already connected to another user
    const existingUser = await User.findOne({
      'github.id': githubUser.id.toString(),
      _id: { $ne: req.user._id },
    });

    if (existingUser) {
      return next(new AppError('This GitHub account is already connected to another user', 400));
    }

    // Connect GitHub to user
    req.user.github = {
      id: githubUser.id.toString(),
      username: githubUser.login,
      accessToken: githubToken,
      avatar: githubUser.avatar_url,
      profileUrl: githubUser.html_url,
      name: githubUser.name || githubUser.login,
      bio: githubUser.bio || '',
      publicRepos: githubUser.public_repos || 0,
      followers: githubUser.followers || 0,
      following: githubUser.following || 0,
      connectedAt: new Date(),
    };
    await req.user.save();

    res.json({
      success: true,
      message: 'GitHub connected successfully',
      data: {
        github: {
          id: githubUser.id.toString(),
          username: githubUser.login,
          avatar: githubUser.avatar_url,
          profileUrl: githubUser.html_url,
          name: githubUser.name || githubUser.login,
          bio: githubUser.bio || '',
          publicRepos: githubUser.public_repos || 0,
          followers: githubUser.followers || 0,
          following: githubUser.following || 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const disconnectGitHub = async (req, res, next) => {
  try {
    if (!req.user.github?.id) {
      return next(new AppError('GitHub account not connected', 400));
    }

    req.user.github = undefined;
    req.user.favorites = [];
    await req.user.save();

    res.json({
      success: true,
      message: 'GitHub disconnected successfully',
    });
  } catch (error) {
    next(error);
  }
};
