import axios from 'axios';

/** 所有 API 请求都从本地存储读取 JWT，并在登录失效时回到登录页。 */
const http = axios.create({ baseURL: '/api', timeout: 10000 });
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    // Axios 在不同版本中可能使用普通对象或 AxiosHeaders，统一通过 set/对象写入认证头。
    if (typeof config.headers?.set === 'function') {
      config.headers.set('Authorization', `Bearer ${token}`);
    } else {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});
http.interceptors.response.use((response) => response, (error) => { if (error.response?.status === 401) { localStorage.removeItem('access_token'); window.location.href = '/login'; } return Promise.reject(error); });
export default http;
