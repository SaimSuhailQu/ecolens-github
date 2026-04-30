declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.jpeg' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

declare module '*.gif' {
  const value: string;
  export default value;
}

declare namespace NodeJS {
  interface ProcessEnv {
    API_KEY: string;
    VITE_GEE_OAUTH_CLIENT_ID: string;
    [key: string]: string | undefined;
  }
}
