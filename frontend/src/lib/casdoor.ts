import CasdoorSDK from 'casdoor-js-sdk';

const config = {
  serverUrl: process.env.NEXT_PUBLIC_CASDOOR_URL || 'https://auth.komedia-ltd-co.com',
  clientId: process.env.NEXT_PUBLIC_CASDOOR_CLIENT_ID || '',
  organizationName: 'Komedia',
  appName: 'Nexus',
  redirectPath: '/callback',
};

export const casdoor = new CasdoorSDK(config);

export const getSigninUrl = () => {
  return casdoor.getSigninUrl();
};

export const getSignupUrl = () => {
  return casdoor.getSignupUrl();
};
