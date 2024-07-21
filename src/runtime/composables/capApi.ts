//#region Imports
import { ref } from 'vue'; // ref From Vue
// @ts-ignore
import CapModule from '#capModule'; // Import CapModule
import axios from "axios"; // Import axios for making HTTP requests
import { IndexDBGet,IndexDBClear } from "./indexedDB"; // Import function to get data from IndexedDB
//#endregion

// Function to use Cap API
export function useCapApi() {
  // Reactive references to store base URL and access token
  const base_url = ref<null | string | unknown>(null);
  const access_token = ref<null | string | unknown>(null);
  const access_token_expireAt = ref<null | string | unknown>(null);
  const refresh_token = ref<null | string | unknown>(null);
  const refresh_token_expireAt = ref<null | string | unknown>(null);
  const { refreshToken } = useCapAuth()

  // Function to create and configure an axios instance
  const useAPI = async (withAccessToken : boolean = true) => {
    //#region Set Base URL
    // Set the base URL based on the environment
    if (CapModule.environment === "Development")  base_url.value = CapModule.development.base_url;
    else base_url.value = CapModule.production.base_url;
    //#endregion

    //#region Create AXIOS API
    let axiosInstance : any = null;
    if (withAccessToken){
      //#region Get Access Token
      // Retrieve access & Refresh token from IndexedDB
      access_token.value = await IndexDBGet('config', 'Access-Token');
      access_token_expireAt.value = await IndexDBGet('config', 'Access-Token_expireAt');
      refresh_token.value = await IndexDBGet('config', 'Refresh-Token');
      refresh_token_expireAt.value = await IndexDBGet('config', 'Refresh-Token_expireAt');
      //#endregion

      //#region Check AccessToken
      // Check if access token is expired
      if (access_token.value) {
        let accessTokenExpired = isTokenExpired(access_token_expireAt.value);

        // Check if refresh token is expired (if needed)
        if (accessTokenExpired && refresh_token.value) {
          console.log('Expired')
          let refreshTokenExpired = isTokenExpired(refresh_token_expireAt.value);
          if (!refreshTokenExpired){
            const newAccessToken = await refreshToken();
            access_token.value = newAccessToken;
          }
        }
      }

      //#endregion

      //#region Create Axios Instance
      // Create and return an axios instance with the configured base URL and headers
      axiosInstance = axios.create({
        baseURL: base_url.value,
        withCredentials: true,
        headers: {
          Authorization: access_token.value ? `Bearer ${access_token.value}` : ''
        }
      });
      //#endregion
    }else {
      //#region Create Axios Instance
      axiosInstance = axios.create({
        baseURL: base_url.value,
        withCredentials: true,
      });
      //#endregion
    }

    //#Add a response interceptor
    axiosInstance.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config;

        // Handle User Authorization Error
        if (error.response && (error.response.status === 401 || error.response.status === 403) && !originalRequest._retry) {
          originalRequest._retry = true;
          try {
            const newAccessToken = await refreshToken();
            access_token.value = newAccessToken;
            originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
            return axiosInstance(originalRequest);
          } catch (refreshError) {
            // Handle token refresh failure
            return Promise.reject(refreshError);
          }
        }

        // Handle User Refresh Token
        else if (error.response && (error.response.status === 401 || error.response.status === 403) && originalRequest._retry) {
          try {
            // Handle token refresh failure
            logoutUser()
            return Promise.reject();
          }
          catch (refreshError) {
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );

    return axiosInstance;
    //#endregion
  };

  return {
    useAPI // Return the useAPI function
  };
}

//#region Internal Logout Functions
const logoutUser = () => {
      const tables = CapModule.database.tables_name; // DataBase Tables Name from CapModule
      const environment = CapModule.environment; // Current environment from CapModule
      const sso_site_url_production = CapModule.production.sso_site_url; // SSO site URL for production
      const sso_site_url_development = CapModule.development.sso_site_url; // SSO site URL for development

      // Remove tokens and user info from IndexedDB
      tables.forEach(async (table : string) => { await IndexDBClear(table); })
      window.location.href = `${environment == 'Production' ? sso_site_url_production : sso_site_url_development}/logout`;
}
//#endregion


//#region Function to check if token is expired
const isTokenExpired = (expireAt:any) => {
  // Get current time in milliseconds
  const currentTime = new Date().getTime();
  return currentTime > expireAt;
}
//#endregion
