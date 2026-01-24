import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { getRepository } from '../services/github.service.js';

export const getFavorites = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    res.json({
      success: true,
      data: {
        favorites: user.favorites,
        count: user.favorites.length,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const addFavorite = async (req, res, next) => {
  try {
    const { repoId } = req.params;
    const { owner, repo } = req.body;

    if (!owner || !repo) {
      return next(new AppError('Owner and repo name are required', 400));
    }

    // Check if already favorite
    const alreadyFavorite = req.user.favorites.some(
      (f) => f.repoId === parseInt(repoId, 10)
    );

    if (alreadyFavorite) {
      return next(new AppError('Repository already in favorites', 400));
    }

    // Verify repository exists and get details
    const repository = await getRepository(
      req.user.github.accessToken,
      owner,
      repo
    );

    // Add to favorites
    req.user.favorites.push({
      repoId: repository.id,
      repoName: repository.name,
      repoFullName: repository.full_name,
      repoUrl: repository.html_url,
      description: repository.description,
      language: repository.language,
      stargazersCount: repository.stargazers_count,
      forksCount: repository.forks_count,
    });

    await req.user.save();

    res.status(201).json({
      success: true,
      message: 'Added to favorites',
      data: {
        favorite: req.user.favorites[req.user.favorites.length - 1],
      },
    });
  } catch (error) {
    if (error.response?.status === 404) {
      return next(new AppError('Repository not found', 404));
    }
    next(error);
  }
};

export const removeFavorite = async (req, res, next) => {
  try {
    const { repoId } = req.params;

    const favoriteIndex = req.user.favorites.findIndex(
      (f) => f.repoId === parseInt(repoId, 10)
    );

    if (favoriteIndex === -1) {
      return next(new AppError('Repository not in favorites', 404));
    }

    req.user.favorites.splice(favoriteIndex, 1);
    await req.user.save();

    res.json({
      success: true,
      message: 'Removed from favorites',
    });
  } catch (error) {
    next(error);
  }
};

export const checkFavorite = async (req, res, next) => {
  try {
    const { repoId } = req.params;

    const isFavorite = req.user.favorites.some(
      (f) => f.repoId === parseInt(repoId, 10)
    );

    res.json({
      success: true,
      data: { isFavorite },
    });
  } catch (error) {
    next(error);
  }
};
