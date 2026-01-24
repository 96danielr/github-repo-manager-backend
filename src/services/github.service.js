import axios from 'axios';

const GITHUB_API = 'https://api.github.com';
const GITHUB_OAUTH = 'https://github.com/login/oauth';

export const getGitHubAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_CALLBACK_URL,
    scope: 'read:user user:email repo',
    // Force fresh authorization by adding timestamp
    // This helps avoid cached authorizations
    state: Date.now().toString(),
  });

  return `${GITHUB_OAUTH}/authorize?${params.toString()}`;
};

// Revoke GitHub OAuth token (call when user disconnects)
export const revokeGitHubToken = async (accessToken) => {
  try {
    await axios.delete(
      `https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`,
      {
        auth: {
          username: process.env.GITHUB_CLIENT_ID,
          password: process.env.GITHUB_CLIENT_SECRET,
        },
        data: {
          access_token: accessToken,
        },
      }
    );
    return true;
  } catch (error) {
    // Token might already be revoked or invalid
    console.error('Failed to revoke GitHub token:', error.message);
    return false;
  }
};

export const exchangeCodeForToken = async (code) => {
  const response = await axios.post(
    `${GITHUB_OAUTH}/access_token`,
    {
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    },
    {
      headers: {
        Accept: 'application/json',
      },
    }
  );

  if (response.data.error) {
    throw new Error(response.data.error_description || 'Failed to exchange code for token');
  }

  return response.data.access_token;
};

export const getGitHubUser = async (accessToken) => {
  const response = await axios.get(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data;
};

export const getGitHubUserRepos = async (accessToken, options = {}) => {
  const { page = 1, perPage = 30, sort = 'updated', direction = 'desc' } = options;

  const response = await axios.get(`${GITHUB_API}/user/repos`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params: {
      page,
      per_page: perPage,
      sort,
      direction,
      affiliation: 'owner,collaborator,organization_member',
    },
  });

  return {
    repos: response.data,
    hasMore: response.data.length === perPage,
  };
};

export const searchGitHubRepos = async (accessToken, query, options = {}) => {
  const { page = 1, perPage = 30 } = options;

  const response = await axios.get(`${GITHUB_API}/search/repositories`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params: {
      q: `${query} user:@me`,
      page,
      per_page: perPage,
      sort: 'updated',
    },
  });

  return {
    repos: response.data.items,
    total: response.data.total_count,
    hasMore: response.data.items.length === perPage,
  };
};

export const getRepository = async (accessToken, owner, repo) => {
  const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data;
};

export const getRepositoryReadme = async (accessToken, owner, repo) => {
  try {
    // Get README content
    const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/readme`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.html+json',
      },
    });

    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null; // No README found
    }
    throw error;
  }
};

export const getRepositoryCommits = async (accessToken, owner, repo, options = {}) => {
  const { perPage = 10 } = options;

  const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/commits`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    params: {
      per_page: perPage,
    },
  });

  return response.data;
};

export const getRepositoryContributors = async (accessToken, owner, repo, options = {}) => {
  const { perPage = 20 } = options;

  try {
    const response = await axios.get(`${GITHUB_API}/repos/${owner}/${repo}/contributors`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      params: {
        per_page: perPage,
      },
    });

    return response.data;
  } catch (error) {
    if (error.response?.status === 204) {
      return []; // No contributors (empty repo)
    }
    throw error;
  }
};
