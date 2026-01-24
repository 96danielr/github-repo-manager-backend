import AppError from '../utils/AppError.js';
import {
  getGitHubUserRepos,
  searchGitHubRepos,
  getRepository,
  getRepositoryReadme,
  getRepositoryCommits,
  getRepositoryContributors,
} from '../services/github.service.js';

export const getRepositories = async (req, res, next) => {
  try {
    const { page = 1, perPage = 30, sort = 'updated' } = req.query;

    const { repos, hasMore } = await getGitHubUserRepos(
      req.user.github.accessToken,
      {
        page: parseInt(page, 10),
        perPage: parseInt(perPage, 10),
        sort,
      }
    );

    // Mark favorites
    const favoriteIds = req.user.favorites.map((f) => f.repoId);
    const reposWithFavorites = repos.map((repo) => ({
      ...repo,
      isFavorite: favoriteIds.includes(repo.id),
    }));

    res.json({
      success: true,
      data: {
        repositories: reposWithFavorites,
        pagination: {
          page: parseInt(page, 10),
          perPage: parseInt(perPage, 10),
          hasMore,
        },
      },
    });
  } catch (error) {
    if (error.response?.status === 401) {
      return next(new AppError('GitHub token expired, please reconnect', 401));
    }
    next(error);
  }
};

export const searchRepositories = async (req, res, next) => {
  try {
    const { q, page = 1, perPage = 30 } = req.query;

    if (!q || q.trim().length < 2) {
      return next(new AppError('Search query must be at least 2 characters', 400));
    }

    const { repos, total, hasMore } = await searchGitHubRepos(
      req.user.github.accessToken,
      q.trim(),
      {
        page: parseInt(page, 10),
        perPage: parseInt(perPage, 10),
      }
    );

    // Mark favorites
    const favoriteIds = req.user.favorites.map((f) => f.repoId);
    const reposWithFavorites = repos.map((repo) => ({
      ...repo,
      isFavorite: favoriteIds.includes(repo.id),
    }));

    res.json({
      success: true,
      data: {
        repositories: reposWithFavorites,
        pagination: {
          page: parseInt(page, 10),
          perPage: parseInt(perPage, 10),
          total,
          hasMore,
        },
      },
    });
  } catch (error) {
    if (error.response?.status === 401) {
      return next(new AppError('GitHub token expired, please reconnect', 401));
    }
    next(error);
  }
};

export const getRepositoryDetails = async (req, res, next) => {
  try {
    const { owner, repo } = req.params;

    const repository = await getRepository(
      req.user.github.accessToken,
      owner,
      repo
    );

    const isFavorite = req.user.favorites.some((f) => f.repoId === repository.id);

    res.json({
      success: true,
      data: {
        repository: {
          ...repository,
          isFavorite,
        },
      },
    });
  } catch (error) {
    if (error.response?.status === 404) {
      return next(new AppError('Repository not found', 404));
    }
    if (error.response?.status === 401) {
      return next(new AppError('GitHub token expired, please reconnect', 401));
    }
    next(error);
  }
};

export const getRepoReadme = async (req, res, next) => {
  try {
    const { owner, repo } = req.params;

    const readme = await getRepositoryReadme(
      req.user.github.accessToken,
      owner,
      repo
    );

    res.json({
      success: true,
      data: {
        content: readme,
      },
    });
  } catch (error) {
    if (error.response?.status === 404) {
      return res.json({
        success: true,
        data: { content: null },
      });
    }
    if (error.response?.status === 401) {
      return next(new AppError('GitHub token expired, please reconnect', 401));
    }
    next(error);
  }
};

export const getRepoCommits = async (req, res, next) => {
  try {
    const { owner, repo } = req.params;
    const { perPage = 10 } = req.query;

    const commits = await getRepositoryCommits(
      req.user.github.accessToken,
      owner,
      repo,
      { perPage: parseInt(perPage, 10) }
    );

    res.json({
      success: true,
      data: {
        commits,
      },
    });
  } catch (error) {
    if (error.response?.status === 404) {
      return next(new AppError('Repository not found', 404));
    }
    if (error.response?.status === 401) {
      return next(new AppError('GitHub token expired, please reconnect', 401));
    }
    next(error);
  }
};

export const getRepoContributors = async (req, res, next) => {
  try {
    const { owner, repo } = req.params;
    const { perPage = 20 } = req.query;

    const contributors = await getRepositoryContributors(
      req.user.github.accessToken,
      owner,
      repo,
      { perPage: parseInt(perPage, 10) }
    );

    res.json({
      success: true,
      data: {
        contributors,
      },
    });
  } catch (error) {
    if (error.response?.status === 404) {
      return next(new AppError('Repository not found', 404));
    }
    if (error.response?.status === 401) {
      return next(new AppError('GitHub token expired, please reconnect', 401));
    }
    next(error);
  }
};
