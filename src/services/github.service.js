import axios from 'axios';

const GITHUB_API = 'https://api.github.com';
const GITHUB_OAUTH = 'https://github.com/login/oauth';

export const getGitHubAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_CALLBACK_URL,
    scope: 'read:user user:email repo',
  });

  return `${GITHUB_OAUTH}/authorize?${params.toString()}`;
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
